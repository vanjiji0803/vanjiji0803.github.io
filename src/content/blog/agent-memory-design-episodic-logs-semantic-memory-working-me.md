---
title: "Agent Memory Design: Episodic Logs, Semantic Memory, Working Memory, and Forgetting"
description: "A practical guide to designing agent memory systems, covering episodic logs, semantic memory, working memory, and forgetting strategies."
date: 2026-08-25
tags: ["agents", "memory", "LLM", "design"]
draft: false
---

When I first started building agents, I treated memory as a simple `history` list. It worked for demos, but fell apart in production: context windows overflowed, the agent repeated itself, and it couldn't recall what it did yesterday. This post is about the memory architecture I've converged on after several iterations, and the tradeoffs I've hit along the way.

## The Three Memory Types

I divide agent memory into three types, borrowing from cognitive science but adapting for engineering:

- **Working memory**: the current context window, what the agent is actively processing.
- **Episodic memory**: a log of past interactions, events, and outcomes.
- **Semantic memory**: distilled knowledge extracted from episodes, stored in a retrievable form (usually embeddings).

Each serves a different purpose and has different cost characteristics.

## Working Memory: The Context Window

Working memory is the most expensive resource. With a 128k token context, you might think you can fit a lot, but in practice, you need to reserve space for:

- System prompt and tool definitions: ~2k tokens
- Current user query: ~1k
- Intermediate reasoning and tool calls: ~5-10k
- Retrieved memories: ~2-5k

That leaves maybe 100k for actual conversation, but if you fill it up, you'll hit performance degradation (lost-in-the-middle) and increased latency. I've found that keeping working memory under 50% of the context window is a good rule of thumb.

**Implementation**: I use a `MessageBuffer` that trims old messages when the token count exceeds a threshold. But trimming naively loses important context. Instead, I summarize the oldest messages into a running summary (a compressed representation) and keep the last N messages verbatim. This is a classic technique, but the summary must be updated incrementally to avoid re-summarizing the whole history each time.

## Episodic Memory: The Log

Episodic memory is a structured log of what happened. I store it as JSON records with fields like:

```json
{
  "timestamp": "2025-01-15T10:30:00Z",
  "type": "user_query",
  "content": "What's the status of the deployment?",
  "outcome": "success",
  "metadata": {"session_id": "abc123"}
}
```

This log is append-only and cheap to write. It's the raw material for semantic memory. I've learned to log everything: not just user messages, but also tool calls, errors, and intermediate thoughts. You never know what will be useful later.

**Forgetting**: Episodic logs can grow indefinitely. I use a retention policy: keep everything for 30 days, then aggregate older logs into daily summaries. This is a form of forgetting that preserves high-level patterns without storing every detail.

## Semantic Memory: The Distilled Knowledge

Semantic memory is what the agent actually retrieves to inform future decisions. I build it by periodically processing episodic logs and extracting key facts, user preferences, and task outcomes. These are stored as embeddings in a vector database.

**Extraction**: I use an LLM to generate concise statements from episodes. For example, from a conversation about deployment, I might extract:

- "User prefers blue-green deployments over rolling updates."
- "The staging server is flaky; always check health before deploy."

These statements are then embedded and stored with metadata (timestamp, source episode).

**Retrieval**: At query time, I embed the current conversation and retrieve top-k relevant memories. I use a hybrid approach: keyword search (BM25) + vector search, then rerank with a cross-encoder. This improves precision, especially for domain-specific terms.

**Tradeoff**: Semantic memory is lossy. The extraction process might miss nuances. I mitigate this by keeping the original episode ID in the memory record, so the agent can fall back to the full log if needed.

## Forgetting: The Uncomfortable Necessity

Forgetting isn't just about storage limits; it's about relevance. Old memories can mislead. I've implemented several forgetting mechanisms:

- **Temporal decay**: Memories older than X days get lower retrieval scores.
- **Importance weighting**: Memories tagged as 'critical' (e.g., security constraints) are never forgotten.
- **Conflict resolution**: If a new memory contradicts an old one, the old one is deprecated.

I've also experimented with active forgetting: when the agent fails a task, it can explicitly mark related memories as 'unreliable'.

## Evaluation: How Do You Know It Works?

I evaluate memory systems with three metrics:

- **Recall accuracy**: Can the agent retrieve the right memory for a given query? I build a test set of queries and expected memories.
- **Task performance**: Does the agent complete tasks better with memory than without? I use a set of multi-turn tasks.
- **Latency overhead**: How much time does memory retrieval add? I aim for <200ms for retrieval and reranking.

One open question: how to measure the quality of memory summarization? I haven't found a good automated metric, so I rely on human evaluation.

## Implementation Notes

- Use a dedicated vector DB (I use Qdrant) and keep the index in memory for speed.
- For episodic logs, I use a simple append-only file or a time-series DB.
- The summarization process runs asynchronously to avoid blocking the main loop.

## Conclusion

Designing agent memory is a balancing act between completeness and relevance. Start with a simple log, add semantic extraction when you hit context limits, and implement forgetting to keep the system agile. It's not perfect, but it's a pragmatic approach that works for my surgical agent and RAG systems.

I'm still exploring how to make memory more adaptive—for example, learning what to remember based on task outcomes. If you have ideas, I'd love to hear them.
