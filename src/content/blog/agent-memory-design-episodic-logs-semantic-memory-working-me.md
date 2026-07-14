---
title: "Agent Memory Design: Episodic Logs, Semantic Memory, Working Memory, and Forgetting"
description: "Exploring memory structures for LLM agents: episodic logs, semantic memory, working memory, and forgetting mechanisms."
date: 2026-07-14
tags: ["agent", "memory", "llm", "design"]
draft: false
---

When building LLM-based agents, one of the trickiest parts is memory. Without it, agents are amnesiacs — they can't recall past interactions, learn from mistakes, or maintain context. But memory isn't just a big log. In cognitive science, memory is split into sensory, working, short-term, and long-term. For agents, I find a three-part model useful: **episodic logs**, **semantic memory**, and **working memory**. And crucially, you need **forgetting**.

## Episodic Logs
Episodic memory stores specific experiences: "At 10:32, user asked about X, I retrieved Y and responded Z." In agents, this is often a raw log of events — each turn, each tool call, each retrieval. I store these as structured JSON in a database (PostgreSQL or MongoDB), with timestamps and metadata. The key tradeoff: granularity vs. storage. Storing every token is wasteful; storing only summaries loses detail. I usually store the full user message, agent response, and a short summary of internal steps (e.g., "retrieved 3 chunks from doc A, scores >0.8").

Episodic logs are used for **reflection** and **debugging**. When an agent hallucinates, I trace back through logs to see what context it had. They also feed into semantic memory via summarization.

## Semantic Memory
Semantic memory is general knowledge extracted from experience. For agents, this means facts, patterns, and rules learned over time. I implement this as a vector store (FAISS or pgvector) where I store embeddings of important facts. For example, after an agent successfully resolves a user's billing issue, it might store: "User X has subscription plan Y, discount code Z applied." This is not a raw log — it's a distilled fact.

The challenge is deciding what to store. I use a two-step process: after each episode, an LLM extracts "facts" (e.g., user preferences, system states) and stores them with a timestamp and confidence score. Then, during retrieval, I query these facts with a recency-weighted similarity. This avoids cluttering memory with trivial details.

## Working Memory
Working memory is the agent's scratchpad for the current task. It's limited and volatile. In practice, I use the LLM's context window as working memory, but that's finite (e.g., 128k tokens). I structure it as a JSON object containing: current goal, recent actions, intermediate results, and a pointer to relevant episodic/semantic memories. I update this after each step.

The key design decision: what to keep in working memory vs. offload to long-term? I keep the last N turns (N=10-20) and any retrieved memory chunks that are directly relevant. Everything else is summarized or dropped. This is where **forgetting** comes in.

## Forgetting
Forgetting is not a bug; it's a feature. Without it, memory grows unbounded, retrieval becomes slow, and irrelevant information pollutes the context. I implement forgetting at multiple levels:

- **Episodic logs**: I keep them for a fixed period (e.g., 30 days) or up to a size limit (e.g., 10k entries). Older logs are archived or deleted. For critical tasks, I keep a summary.
- **Semantic memory**: Each fact has a decay factor. If a fact isn't accessed for a while, its score drops. When score < threshold, it's removed. This is similar to Ebbinghaus forgetting curve.
- **Working memory**: Explicitly cleared at the start of a new task. I also use a sliding window: if the context exceeds a token budget (e.g., 4k tokens), I summarize the oldest turns into a brief note.

## Implementation Tips
- Use separate collections/tables for each memory type. Don't mix raw logs with distilled facts.
- For episodic logs, index by user_id and timestamp for fast retrieval.
- For semantic memory, use a small embedding model (e.g., all-MiniLM-L6-v2) to keep costs low.
- When summarizing episodes, use a separate LLM call with a structured prompt: "Extract up to 5 key facts from this conversation."
- Monitor memory usage: log the number of entries, average retrieval time, and hit rate. If hit rate drops, adjust decay or summarization.

## Open Questions
I haven't fully solved **memory consolidation** — how to merge similar facts or detect contradictions. Also, how often should you run forgetting? Real-time or batch? I lean towards batch (e.g., nightly) to avoid overhead.

Memory design is still an art. Start simple, measure, and iterate. Your agent will thank you.
