---
title: "Reranking in RAG: Why the Second-Stage Model Often Matters More Than the Vector DB"
description: "Explaining why reranking, not vector search, is the bottleneck in RAG quality, with concrete tradeoffs and implementation tips."
date: 2026-07-11
tags: ["rag", "reranking", "retrieval", "llm"]
draft: false
---

## The Reranking Bottleneck

In RAG pipelines, we obsess over embedding models, vector DBs, and chunking strategies. But in my experience, the reranking stage is where the real quality leverage lies. A good reranker can salvage mediocre retrieval; a bad one can sink excellent retrieval.

## Why Reranking Matters More

Vector search is fundamentally a nearest-neighbor problem in embedding space. It's fast, but it suffers from the "curse of dimensionality" and the fact that cosine similarity doesn't always align with relevance. The top-1 result might be semantically close but contextually wrong.

A reranker, typically a cross-encoder, jointly encodes the query and each candidate document. This allows it to capture nuanced relevance signals that are invisible to a bi-encoder (embedding) model. For example, a query "side effects of ibuprofen" and a document about "ibuprofen contraindications" might have high cosine similarity, but a reranker can distinguish between side effects and contraindications.

## Concrete Tradeoffs

**Latency vs. Quality**: Adding a reranker increases latency linearly with the number of candidates. If you retrieve 100 documents and rerank all of them, expect 100-500ms extra (depending on model size). A common trick: retrieve more candidates (e.g., 200) but only rerank the top 50. This gives the reranker more raw material while keeping latency manageable.

**Model Selection**: Small cross-encoders like `ms-marco-MiniLM-L-2-v2` are fast (10ms per pair) but less accurate. Larger ones like `BAAI/bge-reranker-v2-m3` are slower (50ms per pair) but significantly better. For production, I often use a two-tier approach: a fast reranker to prune from 100 to 20, then a heavy reranker for the final top-5.

**Chunking Interaction**: Reranking is sensitive to chunk granularity. If chunks are too small (e.g., 128 tokens), the reranker lacks context. If too large (e.g., 1024 tokens), the model's attention dilutes. I've found 256-512 tokens works best for most domains.

## Failure Modes

1. **Position Bias**: Rerankers can over-rely on the position of relevant text within the chunk. If the answer is in the middle, it might be missed. Mitigation: use sliding windows or multi-query expansion.

2. **Overconfidence**: Rerankers produce a relevance score, but the distribution can be sharp. A score of 0.9 vs 0.89 might not be meaningful. I normalize scores across the candidate set and use a threshold (e.g., 0.5) to discard low-scoring documents.

3. **Domain Mismatch**: A reranker trained on MS MARCO (web search) may perform poorly on biomedical or code documents. Fine-tuning on domain-specific data (even 1000 examples) can yield dramatic improvements.

## Evaluation

Standard retrieval metrics like Recall@k and MRR are useful but don't capture end-to-end quality. I prefer to measure:
- **Answer Faithfulness**: Does the generated answer rely on the top reranked documents? (using NLI models)
- **Context Relevancy**: Are the reranked documents actually relevant to the query? (human eval or LLM-as-judge)
- **Latency P95**: Reranking is often the latency bottleneck.

## Implementation Tips

- **Batching**: Rerank candidates in batches (e.g., 8 at a time) to utilize GPU efficiently.
- **Caching**: Cache reranking results for repeated queries (common in conversational RAG).
- **Fallback**: If reranker crashes (OOM, timeout), fall back to vector search results.

## Open Questions

I haven't yet explored using a small LLM (e.g., Llama 3.2 3B) as a reranker via prompting. The idea is to ask the LLM to rate relevance on a scale of 1-5. The latency might be high, but the contextual understanding could be superior. Has anyone tried this?

Another open question: Can we train a single reranker that works across multiple domains without fine-tuning? I suspect not, but a mixture-of-experts approach might help.

## Bottom Line

Don't underestimate the reranker. It's often the highest-impact component you can tune. Start with a fast cross-encoder, measure your recall@k before and after reranking, and iterate. The vector DB is important, but the reranker is where the magic happens.
