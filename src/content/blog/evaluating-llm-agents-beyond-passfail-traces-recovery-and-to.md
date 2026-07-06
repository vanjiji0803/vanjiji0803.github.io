---
title: "Evaluating LLM agents beyond pass/fail: traces, recovery, and tool-use quality"
description: "A practical guide to evaluating agent behavior using traces, recovery patterns, and tool-use quality metrics."
date: 2026-07-06
tags: ["llm-agents", "evaluation", "tool-use", "trace-analysis"]
draft: false
---

Most LLM agent evaluations still rely on binary pass/fail — did the agent complete the task? But in production, an agent that fails gracefully and recovers is often more valuable than one that succeeds once but crashes on edge cases. Over the past few months, I've been building and evaluating surgical agents (like Surg-Agent) and general-purpose RAG agents. Here's what I've learned about going beyond pass/fail.

## Traces: The Raw Material

An agent trace is a structured log of every step: the input, the LLM call (including raw prompt and completion), tool invocations (with arguments and outputs), and any errors. I store traces as JSON lines, one per step. A minimal schema:

```json
{
  "step_id": 3,
  "type": "tool_call",
  "tool_name": "retrieve",
  "input": {"query": "surgical site infection rate"},
  "output": "...",
  "latency_ms": 450,
  "error": null
}
```

Traces let you compute metrics like:
- **Tool call success rate**: fraction of tool calls that returned without error.
- **Recovery rate**: after an error, how often does the next step succeed?
- **Loop detection**: repeated identical tool calls (e.g., same query, same arguments) often indicate hallucination or stuck reasoning.

I use a simple heuristic: if the same tool with the same arguments appears more than twice consecutively, flag it as a loop. In our surgical agent, loops often happen when the LLM keeps calling `get_patient_data` with the same ID because it doesn't integrate the result into its context.

## Recovery Patterns

Not all failures are equal. I categorize recovery into:
- **Self-correction**: agent notices an error (e.g., tool returned empty) and rephrases the query.
- **Fallback**: agent switches to a simpler tool or asks for clarification.
- **Crash**: agent repeats the same failing action until max steps.

To measure recovery quality, I compute a **recovery score**:

```
recovery_score = (number of successful steps after error) / (total steps after first error)
```

A score near 1 means the agent recovered well; near 0 means it spiraled. For example, an agent that calls `retrieve` with an empty query, gets an error, then correctly adds keywords gets a high score. One that keeps calling with the same empty query gets a low score.

## Tool-Use Quality

Pass/fail doesn't capture whether the agent used tools appropriately. I track:
- **Tool diversity**: how many different tools were used. An agent that only calls one tool (e.g., always `search`) may be underutilizing capabilities.
- **Argument quality**: for each tool, I check if the arguments are well-formed. For a `retrieve` tool, is the query too short (<5 chars) or too long (>500 chars)? For a `calculator` tool, is the expression syntactically valid?
- **Redundant calls**: if the agent calls `get_weather` for the same city twice in a row, that's inefficient. I count redundant calls per session.

I built a small evaluation harness that replays traces and computes these metrics. For each test case, I produce a report:

```
Task: "Find the latest guidelines for antibiotic prophylaxis"
Success: true
Steps: 8
Tool calls: 5 (retrieve:3, summarize:1, verify:1)
Tool success rate: 4/5 (80%)
Recovery score: 0.75 (recovered after 1 error)
Redundant calls: 1 (retrieve with same query twice)
```

## Practical Tips

- **Instrument your agent early**: add trace logging from day one. It's painful to retrofit.
- **Normalize latencies**: tool call latency varies; track p50/p95 separately.
- **Human review samples**: metrics are noisy. I manually review 20% of traces to catch false positives (e.g., a loop that's actually a valid repeated check).

One open question: how do you evaluate multi-step reasoning where the agent must chain tools? I've experimented with a "plan adherence" metric — comparing the agent's actual tool sequence to a gold-standard plan — but plans are hard to define for open-ended tasks.

For now, I rely on trace analysis + recovery scoring + tool-use quality. It's not perfect, but it's far more informative than pass/fail.
