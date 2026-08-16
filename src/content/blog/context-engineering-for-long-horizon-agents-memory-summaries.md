---
title: "Context Engineering for Long-Horizon Agents: Memory, Summaries, and State Compression"
description: "Practical techniques for managing context windows in long-running agents: memory types, summarization tradeoffs, and state compression."
date: 2026-08-16
tags: ["llm-agents", "context-engineering", "memory", "state-compression"]
draft: false
---

When I first built a surgical agent (Surg-Agent) that needed to track a multi-step procedure, I hit a wall: the context window. Even with 128k tokens, a long-horizon task—like a 2-hour surgery or a complex data pipeline—quickly fills up. The naive approach of stuffing everything into the prompt leads to two failure modes: (1) the model loses early critical details (the 'lost in the middle' effect), and (2) token costs explode. This post is about engineering the context, not just prompting.

## The Three-Layer Memory Model

I've found it useful to separate memory into three layers:

- **Working memory**: the immediate context (last few steps, current state). This is what you put in the prompt directly.
- **Episodic memory**: a compressed summary of past events, updated incrementally.
- **Semantic memory**: a knowledge base (e.g., RAG over manuals, past cases) that is retrieved on demand.

For a long-horizon agent, the key is to decide what goes into working memory and what gets offloaded to summaries or retrieval.

## Summarization: The Tradeoff

Summarization is the most common compression technique, but it's lossy. I've used two approaches:

1. **Rolling summary**: after every N steps, ask the LLM to summarize the current summary plus the last N steps. This is simple but suffers from 'summary drift'—errors accumulate, and early details get lost. I've seen agents forget the patient's allergy after 50 steps because the summary didn't propagate it.

2. **Hierarchical summarization**: keep a tree of summaries—leaf nodes are raw steps, internal nodes are summaries of children. When you need a detail, you can traverse the tree. This is more robust but requires a retrieval step to find the relevant leaf. I haven't fully implemented this yet, but it's promising.

**Concrete numbers**: For a 100-step task, a rolling summary with a 500-token budget per summary and 10 steps per update yields about 10 summaries, each 500 tokens = 5k tokens, plus the last 10 raw steps (say 2k tokens) = 7k tokens total. That's far better than 100 steps × 500 tokens = 50k tokens. But you must test what compression ratio preserves accuracy. In my experience, a 10:1 compression is safe, 20:1 starts to lose critical details.

## State Compression: Beyond Summaries

Sometimes you don't need a natural-language summary; you need a structured state. For example, in a surgical agent, the state might be: current phase, instruments in hand, patient vitals, and a checklist of completed steps. This can be represented as a JSON object that is updated after each step. The LLM can output a state update, and you overwrite the previous state. This is lossless for the structured parts, but you lose the narrative of how you got there.

**Tradeoff**: structured state is precise but rigid. If the task requires reasoning about past events (e.g., 'why did we choose this incision?'), you need episodic memory. So I combine both: a structured state for the current status, and a rolling summary for the reasoning trail.

## Retrieval-Augmented Memory

Instead of summarizing everything, you can retrieve relevant past steps on demand. This is like RAG but over the agent's own history. I've experimented with embedding each step and storing in a vector DB. When the agent needs to recall something, it queries with the current context. This works well but adds latency (embedding + search). For real-time agents (like surgical), latency is critical—I aim for <200ms total, so retrieval must be fast. I've used lightweight embeddings (e.g., 384-dim) and a simple cosine similarity search; it's acceptable.

**Failure mode**: retrieval might miss a critical step if the query isn't well-formed. I mitigate by always including the structured state, which acts as a fallback.

## Evaluation: The Hard Part

How do you know if your context engineering is working? I use two metrics:

- **Task success rate**: does the agent complete the task correctly? This is the ultimate test.
- **Recall of critical facts**: after the task, I query the agent for specific facts (e.g., 'What was the patient's blood pressure at step 40?') and measure accuracy. This directly tests memory.

I've found that a 90% recall of critical facts is necessary for a reliable agent. Below that, the agent makes mistakes that are hard to debug.

## Open Questions

- How to automatically decide when to summarize vs. retrieve? I've used heuristics (e.g., if the state is large, summarize), but a learned policy would be better.
- Can we compress state without losing reasoning ability? I suspect a combination of structured state + a 'reasoning trace' that is selectively summarized works best, but it's an art.

Context engineering is the new prompt engineering. It's not about writing better prompts; it's about designing a memory system that fits the task. Start with a simple rolling summary, measure recall, and iterate. That's what I did, and it transformed my agent from a toy to something that can actually run a full procedure.
