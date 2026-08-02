---
title: "Reranking in RAG: Why the Second-Stage Model Often Matters More Than the Vector DB"
description: "Exploring why reranking can outperform vector search, with practical tips on implementation and evaluation."
date: 2026-08-02
tags: ["rag", "reranking", "retrieval", "llm"]
draft: false
---

In RAG pipelines, we often obsess over the vector database: choosing the right embedding model, tuning index parameters, and optimizing HNSW graphs. But in my experience, the single biggest retrieval quality lever is often the reranker—a second-stage model that re-scores the top-k candidates from the vector search. Here's why, and how to implement it effectively.

## Why Reranking Matters

Vector search is a fast but lossy pre-filter. Embeddings capture semantic similarity, but they compress meaning into a fixed vector, losing nuance like negation, temporal constraints, or specific entity relationships. A reranker, typically a cross-encoder, takes the query and a document together and outputs a relevance score. This interaction allows it to capture fine-grained signals that bi-encoders miss.

For example, query: "Which drug inhibits CYP3A4?" A bi-encoder might rank a document about CYP3A4 metabolism higher than one explicitly listing inhibitors, because the embedding is dominated by the enzyme name. A cross-encoder can see the query's intent and penalize the irrelevant doc.

## The Two-Stage Retrieval Pattern

A typical pipeline:
1. **Bi-encoder recall**: Embed query, retrieve top-100 (or top-50) from vector DB.
2. **Cross-encoder rerank**: Score each candidate, take top-5 or top-10.

Why not just use the reranker on the whole corpus? Because cross-encoders are O(N) per query—too slow for large corpora. The vector DB narrows the candidate set to a manageable size.

## Model Selection and Tradeoffs

Rerankers come in various sizes and speeds. Popular choices: `cross-encoder/ms-marco-MiniLM-L-6-v2` (fast, ~10ms on CPU), `BAAI/bge-reranker-base` (better quality, ~50ms), or `bge-reranker-large` (~200ms). For production, latency matters. I've used small models on CPU for low-traffic internal tools, and larger ones on GPU with batching for high-QPS services.

Key tradeoff: quality vs. latency. A small reranker might only improve nDCG by 5%, while a large one gives 15%, but at 10x latency. Measure your own data.

## Implementation Details

- **Candidate count**: Too few (e.g., 10) risks missing relevant docs; too many (e.g., 200) slows reranking. Start with 50-100.
- **Batching**: Rerankers are more efficient when scoring in batches. Use `model.encode` with a batch size of 32 or 64.
- **Normalization**: Scores are not probabilities. Use them for ranking, not for thresholds. If you need a threshold, calibrate on a validation set.
- **Hybrid retrieval**: Combine vector search with BM25 (keyword) to improve recall, then rerank the union. This is often better than either alone.

## Evaluation: Don't Trust Your Gut

You need a labeled dataset. Create a set of (query, relevant_doc_ids) from your domain. Then compute metrics:
- **Recall@k**: How often the relevant doc is in the top-k after reranking.
- **MRR** or **nDCG**: For ranking quality.

Compare: vector-only vs. vector+rerank. I've seen reranking boost nDCG@10 from 0.6 to 0.85 on medical QA data. But it's not guaranteed—test on your own.

## Failure Modes and Edge Cases

- **Reranker bias**: If your reranker was trained on general web data, it may misrank domain-specific queries. Fine-tune on your data if possible.
- **Short vs. long documents**: Cross-encoders truncate long texts. Truncation can lose key info. Consider chunking documents and reranking chunks, then aggregating.
- **Latency spikes**: Reranking adds latency. If your vector search takes 20ms, a 100ms reranker makes the total 120ms. Ensure your SLO allows it.

## Open Questions

I haven't yet tried using a reranker as a reward model for RLHF, but it's an interesting idea. Also, can we distill a large reranker into a smaller one? I'd love to hear others' experiences.

In summary, don't underestimate the reranker. It's often the cheapest win for retrieval quality. Start with a small model, evaluate, and scale up if needed.
