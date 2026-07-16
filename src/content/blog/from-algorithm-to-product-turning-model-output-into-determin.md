---
title: "From algorithm to product: turning model output into deterministic user-facing behavior"
description: "How to constrain LLM outputs into reliable, deterministic behavior for production systems."
date: 2026-07-16
tags: ["llm", "production", "deterministic", "state-machine"]
draft: false
---

We often hear that LLMs are stochastic by nature — same prompt, different output. But when you're building a product, users expect consistent, predictable behavior. How do we bridge the gap between a probabilistic model and a deterministic product?

## The core tension

LLMs generate tokens by sampling from a probability distribution. Even with temperature=0, floating-point non-determinism and beam search variations can produce different outputs across runs. For a chatbot, this might be acceptable. For a surgical agent that must follow a strict protocol, it's not.

## Approaches to enforce determinism

### 1. Output parsing with structured generation

Instead of asking the LLM to "return a JSON", use constrained decoding libraries like `outlines`, `lm-format-enforcer`, or `guidance`. These force the model to generate tokens that match a predefined schema. For example, if your schema expects `{"action": "move_left"}`, the decoder masks out any token that doesn't lead to a valid JSON. This eliminates malformed outputs but doesn't guarantee semantic correctness.

**Tradeoff**: Constrained decoding adds latency (5-20% overhead) and may reduce output quality if the schema is too restrictive.

### 2. State machine + LLM as a function

Treat the LLM as a pure function that maps (state, user_input) -> action. The state machine handles control flow; the LLM only fills in the blanks. For example, in our surgical agent "Surg-Agent", we define states like `INIT`, `ANALYZE_FRAME`, `QUERY_KNOWLEDGE_BASE`, `EXECUTE_ACTION`. Transitions are hardcoded. The LLM is only called in `ANALYZE_FRAME` to output a structured action. This makes the overall system deterministic even if the LLM output varies slightly.

**Failure mode**: If the LLM outputs an action outside the allowed set, the state machine must handle it gracefully — e.g., fall back to a default safe action or re-prompt.

### 3. Prompt engineering with few-shot examples

Provide 3-5 examples of exact input-output pairs. Use a consistent format and delimiters. For instance:
```
Input: "What's the next step?"
Output: {"action": "query_kb", "params": {"query": "step after incision"}}
```
This biases the model toward the desired output structure, but doesn't guarantee it.

**Evaluation**: We measure the exact match rate of the parsed output against expected schema. In production, we aim for >99.5% valid outputs after retries.

### 4. Multiple calls with majority voting

For critical decisions, call the LLM N times (e.g., 3) with the same input (temperature=0). If at least 2 agree on the action, use it. Otherwise, fall back to a default. This increases latency by Nx but improves reliability.

**Edge case**: What if all 3 disagree? We log the disagreement and use the most conservative action (e.g., "pause and alert human").

### 5. Guardrails and post-processing

Use a rules-based validator after the LLM output. For example, if the action is "move_left" but the current state doesn't allow left movement, override to "stay". This is simple but effective.

## Observability is key

You can't fix what you can't see. Log every LLM call: prompt, raw output, parsed output, validation result, latency. Monitor the rate of invalid outputs, retries, and fallbacks. Set up alerts if the invalid rate exceeds 1%.

## A concrete example: Surg-Agent

In our surgical video analysis agent, the pipeline is:
1. User uploads a video.
2. State machine transitions to `ANALYZE`.
3. LLM receives frame + context + instruction to output a JSON with fields: `instrument`, `phase`, `action`.
4. Output is parsed with `pydantic` and validated against allowed values.
5. If invalid, retry once with a stricter prompt. If still invalid, log error and return a safe default.

This gives us 99.8% valid outputs in production, with an average latency of 1.2s per call (including parsing and validation).

## Open questions

- How to handle long-running tasks where the LLM's output must be consistent across multiple calls (e.g., multi-step planning)? We're experimenting with deterministic IDs and caching.
- Is there a way to make constrained decoding faster without sacrificing quality? We haven't tried speculative decoding yet.

## Conclusion

Turning LLM output into deterministic behavior is a system engineering challenge, not a modeling one. Combine structured generation, state machines, validation, and observability. Accept that 100% determinism is impossible — aim for 99.9% and handle the rest gracefully.
