---
title: "Latency Budgets for LLM Applications: Streaming, Caching, Batching, and Model Routing"
description: "How to design latency budgets for LLM apps using streaming, caching, batching, and model routing with concrete tradeoffs."
date: 2026-07-12
tags: ["llm", "latency", "engineering"]
draft: false
---

When building LLM applications, latency is often the silent killer. A single GPT-4 call can take 5–15 seconds, and that's before any retrieval, reranking, or function calling. If your app chains multiple LLM calls (e.g., plan-then-execute), the total latency can easily exceed 30 seconds. Users won't wait that long. So how do you design a latency budget?

## Define the Budget

First, decide your target: for a chatbot, <2s is good; for a coding assistant, <5s is acceptable. Break the budget into components: network, retrieval, LLM inference, post-processing. For a typical RAG pipeline:
- Network: 100–300ms
- Embedding + retrieval: 200–500ms
- Reranking: 50–200ms
- LLM inference: 1–10s (depends on model, prompt length, output tokens)
- Post-processing: 50–200ms

The LLM inference dominates. So you have two levers: reduce inference time or hide it.

## Streaming: Hide Latency

Streaming is the cheapest way to improve perceived latency. By sending tokens as they are generated, the user sees the first token in ~500ms (time-to-first-token, TTFT) instead of waiting for the full response. But TTFT still depends on prompt processing. For long prompts (>4000 tokens), TTFT can be >2s even with streaming. Use prefix caching (e.g., vLLM's automatic prefix caching) to reduce TTFT for repeated prefixes.

## Caching: Eliminate Redundant Work

Cache LLM responses for identical or similar requests. Semantic caching (embedding-based) works well for Q&A: store (query_embedding, response, model, temperature). On a new query, compute embedding, search cache with cosine similarity >0.95. Hit rate can be 20–40% for production apps. But beware: cached responses may become stale for time-sensitive data. Use TTL or invalidation hooks.

## Batching: Throughput vs Latency

Batching improves throughput but hurts latency for individual requests. If you batch 4 requests together, the batch waits for all to arrive before processing. For a 2s inference, the first request waits up to 2s (if it arrived first) plus 2s processing = 4s total. That's unacceptable for real-time. Use dynamic batching: wait for a max batch size or a max delay (e.g., 500ms). For latency-sensitive apps, keep batch size small (1–2) or use continuous batching (vLLM-style) where tokens are processed as they come.

## Model Routing: Pick the Right Tool

Not all queries need GPT-4. Use a classifier (small LLM or ML model) to route simple queries to a cheap, fast model (e.g., GPT-4o-mini, Llama 3 8B) and complex ones to a powerful model. For example, a router can check query length, presence of domain keywords, or confidence of a fast model. This can cut average latency by 50–70% while maintaining quality. But routing introduces its own latency (20–50ms) and classification errors. Evaluate false negatives: routing a hard question to a weak model produces poor answers.

## Putting It Together

For a real-time RAG agent, I use:
- Router (fast LLM, 30ms) → if simple, use GPT-4o-mini (1s); if complex, use GPT-4o (3s with streaming).
- Cache: semantic cache for common questions (hit rate ~30%).
- Retrieval: embedding + reranking, total 400ms.
- Streaming: always on.

Total budget: 100ms (network) + 400ms (retrieval) + 30ms (router) + (1s or 3s LLM) = ~1.5s or ~3.5s. With caching, many responses come back in <1s.

## Open Questions

I haven't experimented with speculative decoding for latency reduction yet. It promises 2x speedup but adds complexity. Also, how do you budget for multi-step agents (e.g., ReAct) where each step adds latency? State machines with timeouts per step might help.

What's your latency budget? Have you tried model cascades or early exit strategies? Let me know.
