---
title: "Embedding models and vector search: what similarity scores do and do not mean"
description: "A practical look at how embedding similarity behaves, why scores are not probabilities, and how to avoid common pitfalls in RAG."
date: 2026-08-01
tags: ["embeddings", "vector-search", "rag", "similarity"]
draft: false
---

When I first started building RAG systems, I treated the cosine similarity score from a vector search as a confidence level. If it was 0.92, I assumed the chunk was highly relevant. If it was 0.45, I assumed it was irrelevant. But after debugging several failed retrievals, I realized that similarity scores are far more nuanced. They don't mean what you think they mean.

## What similarity scores actually measure

Embedding models map text to a high-dimensional vector space. The cosine similarity between two vectors measures the cosine of the angle between them. It's a geometric measure, not a semantic one. Two chunks can have high cosine similarity because they share surface-level vocabulary, not because they share meaning. For example, "The cat sat on the mat" and "The dog sat on the rug" might have a high similarity because of the overlapping words "sat" and "on", even though they are about different animals.

Moreover, the absolute value of the score depends heavily on the embedding model and the normalization used. Some models produce scores that cluster around 0.7-0.9 for unrelated texts, while others produce a wider range. I've seen models where random pairs of sentences have a cosine similarity of 0.8. In that case, a score of 0.85 is barely above random, not a strong signal.

## Why scores are not probabilities

A common mistake is to interpret a similarity score as the probability that the chunk is relevant. That's wrong for several reasons:

1. **No calibration**: The score is not calibrated to any ground truth. There's no guarantee that a score of 0.9 corresponds to a 90% chance of relevance.
2. **Relative vs absolute**: The score is only meaningful relative to other scores in the same collection. A score of 0.7 might be the best match for one query but the worst for another.
3. **Dimensionality collapse**: In high-dimensional spaces, distances become less discriminative. The curse of dimensionality means that for any given query, many chunks may have similar scores, making the top-1 not much better than random.

## Practical implications for RAG

In a RAG pipeline, you often retrieve the top-k chunks and feed them to the LLM. If you rely on a score threshold to decide whether to include a chunk, you'll likely make mistakes. Instead, I've found it more reliable to:

- **Use relative ranking**: Always retrieve a fixed number of chunks (e.g., top-5) and let the LLM decide which are relevant. The LLM can handle noisy context better than a hard threshold.
- **Evaluate retrieval quality separately**: Use metrics like recall@k, precision@k, and MRR (Mean Reciprocal Rank) on a labeled dataset. This tells you how well your retrieval is working, independent of the LLM.
- **Calibrate if needed**: If you really need a threshold, you can calibrate it empirically. Collect a set of queries with known relevant chunks, compute similarity scores, and find a threshold that maximizes F1. But remember, this threshold is specific to your domain and model.

## Failure modes and edge cases

One failure mode I encountered was with domain-specific vocabulary. My surgical agent uses embeddings trained on general text, so medical terms like "cholecystectomy" and "laparoscopic" might be embedded close to each other, but not necessarily in the way a surgeon would expect. This can cause false positives.

Another edge case is when the query is very short. A query like "pain" will have high similarity to many chunks about pain, but the most relevant one might be buried. In such cases, query expansion (e.g., adding synonyms or context) can help.

Also, beware of the embedding model's token limit. If your chunks are longer than the model's max length, truncation can lose important information, making the embedding less representative. I usually chunk documents into 300-500 tokens, which fits most models.

## What to do instead

Instead of relying on raw scores, I now use a two-stage retrieval: first, vector search to get a candidate set, then a reranker (like a cross-encoder) to refine the order. The reranker gives a more reliable relevance score, but it's slower, so I only apply it to the top-50 candidates.

For evaluation, I build a small test set with queries and relevant document IDs. I compute recall@k and see how often the correct chunk appears in the top-k. This gives me a concrete number to optimize. I also monitor the distribution of similarity scores for my corpus to understand the baseline.

## Open questions

I'm still exploring how to make similarity scores more interpretable. One idea is to train a calibration model that maps scores to probabilities using a logistic regression on labeled data. But I haven't tried it yet. Another question is whether we can use the score distribution to detect out-of-domain queries. If a query's top score is much lower than the typical top scores, it might be out-of-domain. But this is heuristic and not robust.

In summary, treat similarity scores as a rough ranking signal, not a measure of truth. Use them to retrieve candidates, but always validate with downstream tasks. And when in doubt, evaluate, evaluate, evaluate.
