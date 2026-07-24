---
title: "Tool Calling Is Not Agency: Building Reliable Execution Loops for LLM Agents"
description: "Why tool-use alone doesn't make an agent, and how to design robust execution loops with observability and error recovery."
date: 2026-07-24
tags: ["llm agents", "tool calling", "execution loop", "reliability"]
draft: false
---

I've spent the last year building surgical AI agents that must not fail. When your agent controls a surgical video stream or retrieves critical patient data, a single hallucinated tool call can be catastrophic. The industry talks a lot about "agentic" systems, but most demos are just tool calling wrapped in a loop. Tool calling is not agency. Let me explain why, and how to build execution loops that actually work.

## The Problem with Naive Tool Calling

A typical agent framework gives the LLM a list of tools, lets it decide which to call, and feeds the result back. This works for simple Q&A, but fails in production for three reasons:

1. **Hallucinated arguments**: The model invents parameters that don't exist. For example, calling `search_patient(id=123)` when the schema expects `patient_id` as a string.
2. **Infinite loops**: The model keeps calling tools without making progress, burning tokens and latency.
3. **Missing error recovery**: A tool fails (network timeout, invalid input), and the agent crashes or repeats the same mistake.

## Building a Reliable Execution Loop

In our surgical agent "Surg-Agent", we use a state machine with explicit phases: **Plan → Execute → Observe → Reflect → Act**. The loop is not a free-form chat; it's a controlled pipeline.

### 1. Plan: Token Budget and Context Window

Before any tool call, we allocate a token budget for the planning step. The model outputs a structured plan (JSON) listing the tools and expected outputs. If the plan exceeds the context window (e.g., 8K tokens), we reject it and ask for a shorter plan. This prevents the agent from forgetting earlier context.

### 2. Execute: Parameter Validation and Retry

We wrap every tool call with a validation layer. For example, if the tool expects a `patient_id` (string, length <= 10), we validate the model's output against the schema. If invalid, we return a structured error message: `{"error": "Invalid parameter: patient_id must be a string of max 10 chars"}`. The model then corrects itself. We allow up to 3 retries per step; after that, we escalate to a fallback (e.g., ask user).

### 3. Observe: Reranking and Hallucination Detection

After the tool returns, we don't just feed raw output. We use a smaller, cheaper model (e.g., a 7B parameter model) to check the result for consistency. For example, if the tool returns a patient's blood pressure, the checker verifies it's within plausible range (e.g., 40-300 mmHg). If not, we flag it as a potential hallucination and re-run the tool.

### 4. Reflect: State Machine Transitions

The agent maintains a state variable: `WAITING`, `PROCESSING`, `ERROR`, `DONE`. After each tool call, the model must output an `intent` field: either `continue` (call another tool) or `finalize` (return answer). If the model outputs `continue` but the next tool call fails repeatedly, the state machine forces a transition to `ERROR` and asks the user for help. This avoids infinite loops.

### 5. Act: Observable Logging

Every step is logged with timestamps, token counts, and latency. We use OpenTelemetry to trace the full execution. If the agent takes more than 30 seconds, we timeout and return a partial result. This is critical for real-time surgical video analysis.

## Edge Cases and Failure Modes

- **Tool returns empty**: The model might panic and hallucinate data. We explicitly train the model to output "No results found" and stop.
- **Multiple tools in parallel**: Some frameworks allow parallel tool calls. We avoid this because it increases hallucination risk. Sequential calls with validation are safer.
- **Model switching**: For complex reasoning, we use GPT-4; for simple tool calls, we use a smaller model to reduce cost. The state machine routes accordingly.

## Evaluation: Beyond Accuracy

We evaluate our loop on three metrics:
- **Task completion rate**: Percentage of tasks finished without human intervention.
- **Average number of tool calls per task**: Lower is better.
- **Error recovery rate**: Percentage of failed tool calls that are successfully retried.

In our surgical video retrieval agent, we achieved 94% task completion with an average of 2.3 tool calls per task, and 89% error recovery rate. Without the state machine, the same model looped infinitely on 12% of tasks.

## Open Questions

I haven't tried dynamic token budgeting yet—adjusting the plan's token limit based on task complexity. Also, how do you handle tools that have side effects (e.g., database writes)? Our current approach logs all writes and requires user confirmation, but that breaks the autonomy illusion. I'd love to hear how others handle this.

Tool calling is a feature; agency is a system property. Build the loop, not just the function list.
