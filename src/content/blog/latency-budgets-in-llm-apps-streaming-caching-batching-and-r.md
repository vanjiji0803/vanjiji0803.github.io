---
title: "Latency Budgets in LLM Apps: Streaming, Caching, Batching, and Routing"
description: "A practical look at managing LLM latency via streaming, caching, batching, and model routing, with tradeoffs and implementation details."
date: 2026-08-03
tags: ["llm", "latency", "optimization", "systems"]
draft: false
---

When I'm building an LLM-powered feature, the first question I ask isn't 'which model?' but 'what's my latency budget?' The budget dictates everything downstream: model choice, serving architecture, and even prompt design. In this post, I'll walk through the levers I've pulled in production—streaming, caching, batching, and model routing—and the tradeoffs that don't show up in benchmark tables.

## Streaming: The Illusion of Speed

Streaming is the easiest win. Instead of waiting for the full completion, you send tokens as they're generated. Perceived latency drops from 'time to last token' to 'time to first token' (TTFT). For a 500-token response, that can be the difference between 10 seconds of staring at a spinner and reading the first words in under a second.

But streaming has a hidden cost: it couples your client to your model's tokenizer. If you stream into a UI that expects markdown, you need to handle partial markdown—unclosed code fences, incomplete lists. I've seen apps break because they tried to render a table before the header row arrived. Also, streaming complicates caching. If you cache the full response, you still need to stream it out to the client, which is fine, but you lose the ability to stream from the model if you're doing speculative decoding or other tricks.

## Caching: The First Token Is Free

Caching is the most underrated latency lever. For RAG systems, the same question often gets asked repeatedly—especially in customer support. A semantic cache (embedding the query and comparing against recent ones) can serve a response in 50ms instead of 2 seconds. But you need to be careful: semantic similarity isn't exact. Two queries might be semantically close but require different answers (e.g., 'how to reset password' vs. 'how to reset 2FA').

A simpler, often overlooked cache is the prefix cache. Many LLM APIs (and open-source servers like vLLM) support automatic prefix caching: if you reuse the same system prompt or few-shot examples, the KV cache is reused. This cuts TTFT dramatically. In my surgical agent, the system prompt is hundreds of tokens, and reusing it across turns saves maybe 200ms per call. Not huge, but it adds up.

## Batching: The Server's Best Friend

If you're serving multiple users, batching is non-negotiable. GPUs are most efficient when processing sequences in parallel. But batching isn't free—it increases TTFT for the first request in the batch because the server waits to accumulate more requests. There's a classic tradeoff: batch size vs. latency. If you have a strict 500ms TTFT budget, you can't wait 400ms to fill a batch.

Dynamic batching (as in vLLM) mitigates this by continuously adding requests to the running batch. But you still face the 'tail latency' problem: the longest request in the batch determines when the GPU frees up. If one user asks for a 2000-token response and another for 50, the short one might wait behind the long one. I've seen this in practice—a single long generation can cause a spike in p99 latency.

One trick: separate endpoints for long and short generations. Use one model (or a different batch queue) for chat completions (short) and another for long-form summarization. This isolates the latency domains.

## Model Routing: The Right Tool for the Job

Not every request needs the 70B model. A huge latency win is to route easy queries to a smaller, faster model. But how do you decide 'easy'? A common approach is a classifier: train a tiny model (or use a set of heuristics) to predict whether the small model's answer will be good. Or you can use the small model itself and then have the large model verify—but that doubles latency.

I've experimented with a cascade: try the small model, compute a confidence score (e.g., the probability of the first token, or a self-consistency check), and if it's below a threshold, fall back to the large model. The tradeoff is that you sometimes pay the small model's latency for nothing. In my RAG system, I found that about 60% of queries could be answered by a 7B model with high confidence, cutting average latency by half. But the threshold tuning was painful—too low, and you get garbage; too high, and you lose the benefit.

Another routing dimension is context length. If the user's query requires a 10k-token context, a model with a 4k window can't handle it. Routing based on input length is trivial and often overlooked.

## Putting It Together: A Latency Budget Example

Let's say I'm building a customer support bot. My budget: TTFT < 500ms, total response < 5s. I'd start with a small model (e.g., 7B) served on a GPU with dynamic batching. I'd add a semantic cache in front—if the query matches a previous one, serve from cache. For queries that don't cache, I route based on a classifier: if the query is simple (like 'what's your return policy?'), the small model handles it. If not, I escalate to a larger model, but I stream the response so the user sees progress.

In practice, I'd also add a fallback: if the small model's confidence is low, I'd stream a placeholder like 'Let me check that for you' while the large model generates. This hides the latency.

## The Open Questions

I haven't yet figured out how to optimally balance cache hit rate with freshness. If your data changes, a cached response might be stale. For a surgical agent, that's a safety issue. Also, I'm curious about using speculative decoding to reduce latency further—but it requires a draft model, which adds complexity.

Ultimately, latency budgets force you to think about the user experience, not just the model. The best model is useless if it makes the user wait. Start with a budget, then choose your levers.

*What's your latency budget? How do you enforce it? I'd love to hear in the comments.*
