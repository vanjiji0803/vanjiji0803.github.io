---
title: "Context Engineering for Long-Horizon Agents: Memory, Summaries, and State Compression"
description: "A practical guide to managing context windows in long-running agents, covering memory architectures, summarization strategies, and state compression tradeoffs."
date: 2026-09-06
tags: ["agents", "context", "memory", "llm"]
draft: false
---

When I started building Surg-Agent, a RAG-based assistant for surgical workflows, I assumed the hardest part would be making the model understand domain-specific tools. It wasn't. It was keeping the agent coherent over a 30-minute surgery simulation without blowing the context window or losing track of what happened five steps ago.

Long-horizon agents—whether they're controlling a robot, running a multi-step research task, or monitoring a clinical workflow—face a fundamental problem: the context window is finite, but the task history is not. Every token you keep costs you space, and every token you drop costs you memory. This post is about the engineering choices I've made (and some I'm still wrestling with) to manage that tradeoff.

## The Naive Approach: Stuff Everything In

The simplest design is to append every observation and action to a running transcript. This works until it doesn't. With a 128k-token window, you might get through 50-100 steps before hitting the limit. Then you either truncate (losing early context) or fail. I've seen agents that start fine but degrade into repeating the same action because they've forgotten their own earlier steps.

Truncation is a trap. If you just drop the oldest tokens, you lose the initial goal specification, the constraints, the user's preferences. The agent becomes a goldfish. I've had agents that, after 20 minutes, forgot they were supposed to avoid damaging certain tissue types—because that instruction was in the first 2k tokens.

## Memory Architectures: Not All Tokens Are Equal

The fix is to separate memory into layers, each with different retention policies. I've settled on a three-tier design:

1. **Core context**: The system prompt, goal, and immutable constraints. This stays in every request.
2. **Working memory**: Recent observations and actions, typically the last 10-20 steps. This is what the model sees as 'current state'.
3. **Long-term memory**: Summaries and extracted facts from older steps, stored externally and retrieved on demand.

This is essentially a cache hierarchy for LLMs. The key insight is that you don't need every raw detail in the prompt—you need enough to make the right decision at each step.

## Summarization: Lossy Compression with Purpose

Summarization is the most common compression technique, but it's easy to do badly. A naive approach—'summarize the entire conversation so far'—produces a bland blob that loses critical specifics. I've found it more effective to summarize into structured fields:

- **Goal state**: What are we trying to achieve? Has it changed?
- **Progress**: What major milestones have been completed?
- **Current obstacles**: What's blocking us right now?
- **Decisions made**: What choices did we make and why?
- **User preferences**: What did the user correct or emphasize?

For Surg-Agent, I use a template like:

```
Surgical context summary:
- Current phase: tumor resection
- Completed: incision, exposure
- Obstacles: bleeding at site A, low visibility
- Decisions: switched to bipolar forceps due to smoke
- Patient constraints: avoid right recurrent laryngeal nerve
```

This is far more useful than a paragraph. The model can quickly reconstruct the state without reading 50k tokens of raw logs.

But summarization introduces a failure mode: the summary is only as good as the summarizer. If the summarization prompt is too vague, it might drop a critical detail. I've had summaries that omitted the fact that a tool was malfunctioning, causing the agent to retry it repeatedly. Mitigation: include a 'critical alerts' field that is never summarized away, and always append recent raw events alongside the summary.

## State Compression: Beyond Text

Sometimes you don't need text at all. If your agent is tracking numeric state (e.g., instrument position, patient vitals), you can store that as structured data and inject it as a compact JSON blob. For example, instead of writing "the trocar is at x=10, y=20, z=30" in natural language, you keep a state dictionary:

```json
{"tool": "grasper", "pos": [10, 20, 30], "grip": 0.8}
```

This is both token-efficient and less error-prone. The model can read the JSON at a glance, and you avoid the ambiguity of natural language.

For even longer horizons, consider a vector store of past states. When the agent needs to recall a specific event, you retrieve by similarity. This is what I'm exploring now: instead of a linear summary, keep a vector index of step embeddings, and at each step, retrieve the top-k most relevant past steps to inject into the prompt. This is essentially RAG applied to the agent's own history.

The tradeoff is latency and complexity. Each retrieval adds 10-50ms, and you need to decide what 'relevance' means. I've had mixed results: sometimes the retrieval pulls in a step that's semantically similar but not causally important. A hybrid approach—summary for the big picture, retrieval for specific details—seems more robust.

## Token Budgets: A Practical Heuristic

I've developed a simple budget for a 128k window:

- System prompt + goal: 2k tokens
- Working memory (last 10 steps): 10k tokens
- Long-term summary: 5k tokens
- Retrieved memories: 5k tokens
- Tool definitions: 10k tokens (if many functions)
- Scratchpad for reasoning: 10k tokens

That leaves about 86k tokens for the current step's input and output. In practice, I rarely use that much, but it's good headroom. If you find yourself exceeding the budget, it's a sign you're not compressing enough.

## Evaluation: How Do You Know It Works?

I've learned the hard way that you can't just eyeball an agent's behavior. You need a suite of tests that probe memory. I use three types:

1. **Recall tests**: After N steps, ask the agent to state the original goal or a specific constraint. Does it still know?
2. **Distractor tests**: Insert irrelevant events, then ask the agent to ignore them and continue the main task. Does it get derailed?
3. **Long-horizon consistency**: Run the same task twice, once with a naive context, once with your memory system. Compare task completion rates and error patterns.

For Surg-Agent, I built a simulated surgical environment where I can inject events (e.g., unexpected bleeding) and check if the agent responds appropriately 50 steps later. This is more reliable than reading logs.

## Open Questions

I'm still wrestling with a few things:

- **When to summarize vs. retrieve?** I have a heuristic (summarize every 20 steps, retrieve on demand), but I don't have a principled answer.
- **How to handle conflicting memories?** If the summary says X but a retrieved raw step says Y, which wins?
- **Is there a theoretical limit to how much an agent can remember?** Even with perfect compression, there's a bound on the information you can carry forward. I suspect it's lower than we think.

## Conclusion

Context engineering is the new prompt engineering. For long-horizon agents, it's not about writing the perfect prompt—it's about designing a memory system that decides what to keep, what to compress, and what to retrieve. The tradeoffs are real: summarization loses detail, retrieval adds latency, and both can fail silently. But with a structured approach and rigorous evaluation, you can build agents that remember their goals, learn from their mistakes, and stay coherent over hundreds of steps.

I haven't tried all of this in production yet—some of it is still in the lab. But if you're building a long-horizon agent, I hope these notes save you some of the pain I went through. And if you've solved the conflicting-memory problem, please write a blog post about it.
