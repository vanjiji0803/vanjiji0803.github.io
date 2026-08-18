---
title: "Evaluating LLM agents beyond pass/fail: traces, recovery, and tool-use quality"
description: "How to evaluate LLM agents with trace analysis, recovery metrics, and tool-use quality, not just pass/fail."
date: 2026-08-18
tags: ["llm-agents", "evaluation", "tool-use", "observability"]
draft: false
---

When I started building Surg-Agent, a RAG-based surgical assistant, I fell into the classic trap: measuring success by "did it answer correctly?" Pass/fail. But agents are not classifiers. They take actions, call tools, recover from errors, and leave traces. A binary score hides everything that matters.

In this post, I'll share how I evaluate agents beyond pass/fail, focusing on three dimensions: trace analysis, recovery quality, and tool-use quality. These are practical, implementable, and have caught bugs that accuracy metrics missed.

## Why pass/fail is not enough

Consider an agent that needs to retrieve patient history, check drug interactions, and then answer. A pass/fail test might say "correct answer" even if the agent:

- Called the retrieval tool 20 times in a loop, wasting tokens and latency.
- Retrieved irrelevant chunks but still stumbled on the right answer.
- Failed to call a necessary tool and hallucinated the interaction.

All these are failures in agent behavior, but pass/fail sees only the final answer. In production, these inefficiencies compound: higher cost, slower response, and unpredictable behavior.

## Trace analysis: the agent's decision path

Every agent run produces a trace: the sequence of tool calls, arguments, outputs, and internal reasoning. I treat traces as first-class data. For each run, I record:

- Tool call order and timestamps.
- Input/output token counts per step.
- Whether each tool call succeeded or failed.
- The agent's final answer and confidence.

With traces, I can compute metrics like:

- **Tool call efficiency**: average number of calls per task. A well-designed agent should call only necessary tools. If I see >5 calls for a simple lookup, something is off.
- **Redundant calls**: repeated identical calls with same arguments. Often due to poor state management.
- **Latency breakdown**: time spent in reasoning vs. tool execution. If reasoning dominates, the prompt might be too vague.

For example, in Surg-Agent, I noticed the agent sometimes called the vector search twice with the same query. The trace showed it was because the agent didn't remember the previous result. I fixed this by adding a short-term memory buffer, cutting calls by 30%.

## Recovery: how agents handle errors

Agents will fail. Tools time out, APIs return errors, or the agent misformats a function call. The key is recovery. I evaluate recovery with two metrics:

- **Error rate**: percentage of tool calls that fail.
- **Recovery rate**: percentage of failed calls that the agent successfully retries or works around, leading to a valid final answer.

But recovery isn't binary. I also look at the recovery path:

- Does the agent retry with the same arguments (bad) or modify them (good)?
- Does it fall back to a different tool or ask for clarification?
- How many extra steps does recovery take?

For instance, my agent sometimes calls a drug interaction API that returns 404 for unknown drugs. A good recovery would be to check the drug name against a local list. A bad recovery would retry the same call three times. I now include a "recovery quality" score: 0 for no recovery, 1 for retry with modification, 2 for fallback tool, 3 for graceful degradation (e.g., "I couldn't find interaction data, but here's general advice").

## Tool-use quality: not just if, but how

Tool-use quality is about whether the agent uses tools appropriately. I evaluate:

- **Relevance**: Are the tools called relevant to the task? An agent that calls a patient lookup tool when asked about drug dosage is a failure.
- **Argument correctness**: Are the arguments well-formed and semantically correct? For example, passing a patient ID instead of a drug ID.
- **Timing**: Does the agent call tools at the right time? For multi-step tasks, calling a tool too early or too late can degrade performance.
- **Information extraction**: Does the agent extract the right pieces from tool outputs? I've seen agents ignore a crucial field in a JSON response.

I use a rubric-based evaluation, where human annotators score each tool call on these dimensions. It's expensive, but I sample a subset of runs for deep analysis. For automated checks, I write unit tests with mocked tool outputs to verify the agent's decision logic.

## Putting it together: an evaluation harness

I built a small evaluation harness that runs a suite of test cases, records traces, and computes the metrics above. It outputs a JSON report per run, and I aggregate across runs. I also log traces to a database for post-hoc analysis. This has been invaluable for debugging: when a user reports a weird behavior, I can replay the trace and see exactly where it went wrong.

One open question I have: how to automatically detect "recovery quality" without manual annotation? I'm experimenting with using the final answer's correctness and the number of steps as a proxy, but it's noisy. If you have ideas, I'd love to hear.

## Conclusion

Evaluating agents is not about a single number. By analyzing traces, measuring recovery, and scoring tool-use quality, I've found issues that pass/fail would have missed. It's more work, but for production agents, it's worth it. Start by logging traces, then compute simple metrics, and iterate. Your agent will thank you.
