---
title: "Context Engineering for Long-Horizon Agents: Memory, Summaries, and State Compression"
description: "Practical techniques to manage context windows in agents that operate over many turns, with tradeoffs and failure modes."
date: 2026-07-27
tags: ["llm-agents", "context-engineering", "state-compression", "memory-management"]
draft: false
---

When building agents that operate over dozens or hundreds of turns—like a surgical assistant that tracks a procedure from incision to closure—the context window quickly becomes the bottleneck. I've been working on a RAG-based surgical agent (Surg-Agent) that runs on NVIDIA IGX with Holoscan, and managing context for long-horizon tasks forced me to think beyond naive retrieval.

## The Core Problem

A typical agent loop: observe -> think -> act. Each turn appends the observation, thought, and action to the context. After 50 turns, you've easily consumed 10k+ tokens. With a 128k context window, you might think you're safe, but latency and cost scale linearly with input length. Worse, models tend to lose focus on early information—the "lost in the middle" effect is real.

## Three Strategies I've Tried

### 1. Sliding Window with Summarization

Keep only the last N turns verbatim, and summarize everything before that into a compressed "memory" block. For Surg-Agent, I use a separate LLM call every 10 turns to produce a structured summary: current phase of surgery, instruments used, anomalies detected, and pending actions. The summary is prepended to the current window.

**Failure mode:** Summaries lose nuance. If the agent needs to recall a specific instrument position from 30 turns ago, the summary might not contain that detail. Mitigation: keep a separate key-value store for critical facts (e.g., "clip applied to cystic duct at turn 23").

### 2. Hierarchical Memory

Inspired by MemGPT, I maintain three tiers: working memory (last 5 turns), episodic memory (compressed summaries of recent chunks), and semantic memory (long-term facts extracted via a separate extraction pipeline). The agent can query each tier explicitly.

**Tradeoff:** More LLM calls for extraction and retrieval. On edge hardware (IGX Orin), this adds 200-500ms per turn. Worth it for tasks where accuracy matters more than speed.

### 3. State Machine Compression

For well-defined workflows (e.g., surgical phases), encode the entire history as a state machine. Instead of dumping raw text, the agent maintains a structured state: `{phase: "dissection", elapsed: 120s, last_action: "cauterize", tool_in_hand: "hook_cautery"}`. The LLM only sees the current state plus the last observation.

**Edge case:** What if the workflow deviates? The state machine must handle unexpected transitions. I use a fallback to raw history when confidence drops below a threshold.

## Evaluation Metrics

I measure three things:
- **Task success rate**: Does the agent complete the procedure correctly?
- **Context token budget**: Average tokens per turn. Sliding window with summarization cut it from 12k to 3k tokens per turn after 100 turns.
- **Recall accuracy**: Can the agent answer a question about something that happened 50 turns ago? Hierarchical memory scored 92% vs 68% for sliding window.

## Open Questions

- How to dynamically choose compression strategy based on task complexity? I haven't tried learned policies yet.
- For multi-agent systems, should each agent compress independently or share a common memory store? 

Context engineering is still more art than science. Start with the simplest approach (sliding window + summary), measure where it fails, then layer in structured memory. Your agent's context is its only view of the world—make every token count.
