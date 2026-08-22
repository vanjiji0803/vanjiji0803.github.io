---
title: "Reranking in RAG: Why the Second-Stage Model Often Matters More Than the Vector DB"
description: "A practical look at why reranking can beat vector search alone, with concrete examples, tradeoffs, and implementation tips."
date: 2026-08-22
tags: ["rag", "reranking", "vector-search", "llm"]
draft: false
---

When I first started building RAG systems, I assumed the vector database was the star of the show. I spent days tuning embedding models, fiddling with chunk sizes, and comparing HNSW parameters. Then I added a reranker to the pipeline, and the quality jump was bigger than any vector DB tweak I'd made. Over time, I've come to believe that in many RAG setups, the reranker is the unsung hero. Here's why, and how to use it effectively.

### The Problem with Vector Search Alone

Vector search is a fast, approximate nearest-neighbor lookup. It's great at finding candidates that are semantically similar to the query, but it has a fundamental limitation: it operates in a fixed embedding space. The embedding model has already compressed the text into a vector, losing fine-grained details. Two chunks can have similar vectors but very different relevance to a specific query.

For example, consider a query like "How do I adjust the temperature on a Nest thermostat?" A chunk about "setting the desired temperature" might embed close to the query, but a chunk about "troubleshooting temperature sensor errors" could be more relevant in context. The embedding model doesn't know which one is better for the user's intent.

Moreover, the top-k retrieval is often noisy. In my experience, the recall of the top-5 from a vector DB might be 70-80% for a well-tuned system. That means 20-30% of the time, the relevant chunk isn't in the top-5 at all. Reranking can't fix that—it can only reorder what's retrieved. So the first rule is: retrieve enough candidates. I usually retrieve 20-50 chunks per query, then rerank down to the top 3-5. This increases the chance that the relevant chunk is in the candidate set.

### What Reranking Actually Does

A reranker is a cross-encoder model that takes a query and a document (or chunk) and outputs a relevance score. Unlike a bi-encoder (which embeds query and document separately), a cross-encoder processes them together, allowing deep interaction between tokens. This is much more accurate, but also much slower. That's why we use it as a second stage: we only run it on a small candidate set.

In practice, I've used models like `cross-encoder/ms-marco-MiniLM-L-6-v2` for speed and `BAAI/bge-reranker-large` for quality. The tradeoff is latency: a small cross-encoder might take 10-20ms per pair on a CPU, while a large one could take 100ms+ on a GPU. For a candidate set of 50, that's 0.5-5 seconds—too slow for real-time. So you need to balance candidate count, model size, and hardware.

### Why It Often Matters More Than the Vector DB

The vector DB's job is to get you a good candidate set. The reranker's job is to pick the best from that set. If your retrieval recall is decent, the reranker can dramatically improve precision. In my experiments, precision@3 (the fraction of the top-3 that are relevant) often jumps from 60% to 90% after reranking. That directly translates to better answers from the LLM, because the LLM is given more relevant context.

Another reason reranking matters: it can compensate for a weak embedding model. If you're using a generic embedding like `all-MiniLM-L6-v2` (which is fast but not great for domain-specific text), a reranker can still pull out the right chunks. I've seen cases where a domain-adapted embedding model improved recall by 5%, but adding a reranker improved precision by 30%.

### Implementation Details and Tradeoffs

Here's a typical pipeline I use:

1. **Query expansion**: Optionally, expand the query with synonyms or a generated sub-queries (e.g., using an LLM) to improve recall.
2. **Vector retrieval**: Get top-50 chunks from the vector DB.
3. **Reranking**: Score each chunk with the cross-encoder.
4. **Top-k selection**: Take the top 3-5 chunks.
5. **LLM generation**: Feed the chunks as context.

A key tradeoff is the candidate count. Too few (e.g., 10) and you risk missing relevant chunks; too many (e.g., 100) and reranking latency becomes a problem. I usually start with 50 and tune based on latency and quality.

Another consideration is whether to rerank all candidates or use a two-stage approach (e.g., first a fast bi-encoder reranker, then a slow cross-encoder). I haven't tried this yet, but it could be a good compromise for very large candidate sets.

### Evaluation: Don't Trust Your Gut

To know if reranking helps, you need to measure. I use a small labeled set of queries and relevant chunks (e.g., 50-100 queries). Then I compare metrics like recall@k, precision@k, and MRR (Mean Reciprocal Rank) with and without reranking. I also measure end-to-end answer quality using LLM-as-a-judge, but that's subjective. The key is to see if the reranker consistently improves the ranking metrics.

One failure mode I've hit: reranking can hurt if the candidate set is too small. If the relevant chunk isn't in the top-10, the reranker can't save you. So always check recall@k before reranking. If recall@50 is below 90%, improve retrieval first.

### Final Thoughts

Reranking is a cheap way to get a big quality boost in RAG. It's not a silver bullet—it won't fix a broken chunking strategy or a bad embedding model—but it often gives you more bang for the buck than upgrading your vector DB. If you're building a RAG system and haven't added a reranker yet, try it. You might be surprised at how much it helps.

I'm still exploring how to make reranking more efficient for edge deployment (e.g., on NVIDIA Jetson), where model size and latency are critical. If you've had experience with that, I'd love to hear about it.
