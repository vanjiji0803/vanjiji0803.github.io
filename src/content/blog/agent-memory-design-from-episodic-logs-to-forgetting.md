---
title: "Agent Memory Design: From Episodic Logs to Forgetting"
description: "A practical guide to designing memory systems for LLM agents, covering episodic, semantic, and working memory, with a focus on implementation tradeoffs and failure modes."
date: 2026-08-05
tags: ["llm-agents", "memory", "rag", "state-machines"]
draft: false
---

When I started building Surg-Agent, a RAG-based assistant for the operating room, I thought the hard part was retrieval. I spent weeks tuning chunk sizes, embedding models, and rerankers. Then I realized the real bottleneck was memory: how to remember what happened during a surgery, what the surgeon prefers, and what to forget when the context window fills up.

Memory in agents isn't a single thing. It's a stack of systems with different lifetimes and access patterns. Let me break down how I think about it, and where I've seen things fail.

## Working Memory: The Context Window

Working memory is the current context: the system prompt, recent conversation turns, tool outputs, and retrieved chunks. It's fast, but limited. For a typical LLM, that's 8k to 200k tokens. The problem is that tokens are not created equal. A 2k-token surgical report might be critical, while a 10k-token retrieved paper might be noise.

I've learned to budget tokens explicitly. For a multi-step task, I allocate: 20% for system prompt and instructions, 30% for the current plan and state, 30% for relevant episodic logs, and 20% for retrieved semantic knowledge. This forces me to be selective. If the plan grows too long, I summarize it. If the episodic logs are too verbose, I compress them into bullet points.

A common failure mode: stuffing too much into working memory, causing the model to lose focus or hallucinate. I've seen agents that include 50 retrieved chunks and then fail to follow simple instructions. The fix is to cap retrieval count and rely on reranking to keep only the top 3-5 chunks.

## Episodic Memory: Logs of What Happened

Episodic memory stores specific events: "At 14:32, the surgeon asked for a different suture." These are time-stamped, immutable logs. In a surgical context, these are critical for post-op review and for understanding the current state.

Implementation: I use a simple append-only log in a database, with each entry having a timestamp, a type (e.g., user_query, tool_call, observation), and a payload. The key is to structure the payload so it can be queried later. For example, I store tool calls as JSON with input and output, and I tag them with the task ID.

Tradeoff: storing everything is cheap, but retrieving the right episodes is hard. I use a combination of time-based filters (last 5 minutes) and semantic search (embedding the episode text). However, embeddings for short episodes are noisy. I've found it better to summarize a batch of events into a daily digest, then embed that.

Failure mode: if you don't have a forgetting mechanism, the log grows unbounded, and retrieval latency increases. Also, if you store raw tool outputs that are huge (e.g., a full image), you'll blow up storage. So I store summaries or references, not full blobs.

## Semantic Memory: Extracted Knowledge

Semantic memory is the distilled knowledge: facts about the domain, user preferences, and general rules. For example, "Dr. Chen prefers absorbable sutures for skin closure." This is derived from episodic logs via a summarization step.

I run a periodic job that takes recent episodic logs and asks an LLM to extract salient facts. These are stored in a vector database for retrieval. The challenge is avoiding contradictions. If the surgeon changes preference, the old fact must be updated or deprecated.

I use a versioning approach: each fact has a confidence score and a last-seen timestamp. When a new fact conflicts, I don't delete the old one; I mark it as superseded. This allows the agent to handle changes gracefully.

Tradeoff: extraction is expensive and can introduce hallucinations. I've seen LLMs invent facts that weren't in the logs. So I only extract facts that appear in at least two episodes, and I include the source IDs for auditability.

## Forgetting: The Art of Letting Go

Forgetting is not just about saving storage; it's about improving accuracy. Old, irrelevant memories can confuse the agent. I use a combination of decay and importance scoring.

Each memory (episodic or semantic) has a last-access timestamp and a frequency count. A decay function reduces the importance score over time. When the score drops below a threshold, the memory is archived or deleted. For episodic logs, I also summarize older logs into weekly summaries, then delete the raw entries.

I haven't tried this yet, but I'm considering a learned forgetting policy: train a small model to predict which memories are likely to be useful based on the current task. That would be more adaptive than a fixed decay.

## Putting It Together: A State Machine

In Surg-Agent, I model the agent as a state machine. Each state has a specific memory focus. For example, in the "pre-op planning" state, working memory is loaded with patient history and preferences. In "intra-op" state, it's loaded with recent actions and tool outputs. This prevents irrelevant memories from flooding the context.

Observability is crucial. I log every memory read and write, so I can trace why the agent made a decision. This is invaluable for debugging.

## Open Questions

I'm still wrestling with: How to handle memory across sessions? Should we persist semantic memory between different patients? Probably not, but a hospital-wide knowledge base might be useful. Also, how to evaluate memory quality? I don't have a good metric yet. I've been using task success rate, but that's indirect.

Memory design is not glamorous, but it's the difference between an agent that feels smart and one that feels forgetful. Start simple: a log, a summarizer, and a retrieval function. Then iterate.
