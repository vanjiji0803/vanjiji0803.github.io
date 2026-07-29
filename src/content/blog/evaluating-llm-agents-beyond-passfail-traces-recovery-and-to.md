---
title: "Evaluating LLM agents beyond pass/fail: traces, recovery, and tool-use quality"
description: "A practical guide to evaluating agent behavior using traces, recovery patterns, and tool-use quality metrics."
date: 2026-07-29
tags: ["llm-agents", "evaluation", "tool-use", "observability"]
draft: false
---

When we evaluate LLM agents, most teams default to a simple pass/fail on the final output. But in production, an agent that fails gracefully can be more valuable than one that succeeds by luck. I've been thinking about three axes that go beyond binary success: trace quality, recovery behavior, and tool-use quality.

## Trace Quality

A trace is the complete record of an agent's reasoning steps, tool calls, and intermediate outputs. Instead of just checking the final answer, we can evaluate the trace itself. For example, does the agent decompose a complex query into sensible sub-tasks? Are the tool calls logically ordered? One metric is "step relevance": for each tool call, we can compute the cosine similarity between the tool's input and the current context. A low similarity might indicate hallucination or off-track reasoning.

Another metric is "information flow": does the agent reuse outputs from earlier steps? You can measure the overlap between the output of step N and the input of step N+1. If there's no overlap, the agent might be ignoring its own previous work.

## Recovery Behavior

Agents will make mistakes. The question is how they recover. I categorize recovery into three levels:

1. **No recovery**: The agent fails and stops, or produces a wrong answer.
2. **Retry with same approach**: The agent re-calls the same tool with slightly different parameters (e.g., changing a search query). This is basic.
3. **Strategy shift**: The agent recognizes the failure (e.g., tool returns empty) and switches to a different tool or approach. This is much harder.

To evaluate recovery, you can inject controlled errors into the environment. For example, make a search tool return no results for a known query, or make an API return an error code. Then measure: does the agent detect the error? Does it try an alternative? How many steps does it waste?

## Tool-Use Quality

Tool-use quality is about efficiency and correctness. I track:

- **Tool selection accuracy**: Did the agent call the right tool for the task? For a math problem, calling a calculator is correct; calling a web search is wasteful.
- **Parameter quality**: Are the tool inputs well-formed? For a SQL tool, are the queries syntactically correct? For a search tool, are the keywords specific enough?
- **Redundancy**: How many tool calls are redundant? If the agent calls the same tool with the same parameters twice, that's a failure.
- **Latency impact**: Each tool call adds latency. We can compute a "cost per successful step" by dividing total latency by the number of useful steps.

## Putting It Together

I've been experimenting with a simple evaluation framework that combines these metrics. For each agent run, we collect a trace, then compute a composite score:

```
composite_score = (trace_quality * w1) + (recovery_score * w2) + (tool_quality * w3)
```

Where weights are tuned per domain. For a customer support agent, recovery might be weighted higher. For a data analysis agent, tool quality matters more.

One open question: how to automate recovery scoring? Currently I use a mix of rule-based checks (e.g., did the agent call a different tool after an error?) and LLM-as-judge to evaluate the strategy shift. The LLM judge is expensive but gives more nuanced feedback.

Another challenge: traces can be very long. For a 10-step agent, the trace might be 10k tokens. Summarizing the trace for evaluation is itself a research problem. I've tried using a smaller model (e.g., Llama 3.2 3B) to produce a structured summary of the trace, then evaluate that summary.

## Final Thoughts

Pass/fail evaluation hides the agent's behavior. By looking at traces, recovery patterns, and tool-use quality, we can identify specific failure modes: is the agent bad at detecting errors? Does it overuse a particular tool? Does it forget context? These insights drive targeted improvements.

I haven't yet explored multi-agent scenarios where traces become even more complex. That's next on my list.
