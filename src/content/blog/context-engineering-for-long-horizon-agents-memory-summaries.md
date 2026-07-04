---
title: "Context Engineering for Long-Horizon Agents: Memory, Summaries, and State Compression"
description: "Practical techniques for managing agent context: sliding windows, summarization, and structured state compression with tradeoffs."
date: 2026-07-04
tags: ["agents", "context-engineering", "memory", "compression"]
draft: false
---

When building long-horizon agents—think multi-step RAG pipelines, surgical workflow assistants, or autonomous coding agents—the context window is both a blessing and a curse. You can stuff in history, but you’ll pay in latency, hallucination risk, and token cost. This post covers three practical approaches I’ve used in production: sliding window, summarization, and structured state compression.

## Sliding Window: Simple but Lossy
The most straightforward method: keep the last N turns of conversation. For a surgical agent tracking tool usage, I set N=20 (about 4k tokens). Pros: trivial to implement, low overhead. Cons: you lose early context. If the agent needs to recall a decision made 50 steps ago, it’s gone. This fails for tasks requiring long-range dependencies.

## Summarization: Recursive Compression
Instead of dropping old context, summarize it. Every K steps (I use K=5), feed the last K turns into a summarizer prompt and store the summary in a compressed memory buffer. At step 30, the buffer might hold 6 summaries (each ~200 tokens) plus the last 5 raw turns. Total: ~2k tokens vs 12k raw. The tradeoff: summarization adds latency (~1-2s per compression) and can lose details. I’ve seen agents forget specific numerical thresholds because the summary said "adjusted parameters" without the values. Mitigation: include critical data fields in a structured section (see below).

## Structured State Compression
For agents that operate on a well-defined state (e.g., a surgical phase, tool location, patient vitals), encode the state as a compact JSON schema. Instead of "The surgeon switched from scissors to forceps 3 minutes ago," store: `{"current_tool": "forceps", "phase": "dissection", "tool_duration_s": 180}`. This compresses 50 tokens into 30 and is lossless for the schema. The agent reads the state object each step. Failure mode: schema drift—if the state space evolves (new tool added), the schema must be updated. I use a versioned schema and a migration prompt.

## Hybrid Approach
In practice, I combine all three: sliding window for recent raw context, recursive summaries for older history, and a structured state object for critical variables. The agent’s system prompt instructs it to prioritize the structured state, then summaries, then raw turns. This keeps context under 8k tokens even after 100+ steps. Evaluation: I measure task completion rate and token cost per task. For a surgical QA agent, hybrid reduced token cost by 40% vs full history, with 95% task completion (vs 92% for full).

## Open Questions
- How to automatically detect which details are critical for summarization? I’m experimenting with attention-based salience scoring.
- When does structured compression become too rigid? For open-ended agents, a fixed schema may miss emergent state.
- What’s the optimal compression ratio vs accuracy tradeoff? I haven’t found a universal answer yet.

Context engineering is more art than science right now. Start simple, measure, and iterate. Your agent’s memory is only as good as your compression strategy.
