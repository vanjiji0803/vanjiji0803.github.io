---
title: "Embedding models and vector search: what similarity scores do and do not mean"
description: "A technical deep dive into the meaning and pitfalls of cosine similarity in vector search for RAG systems."
date: 2026-07-10
tags: ["rag", "embedding", "vector-search", "similarity"]
draft: false
---

When building a RAG system, the typical pipeline is: chunk documents, embed each chunk into a vector, store in a vector database, then at query time embed the query and retrieve the top-k chunks by cosine similarity. The similarity score is often treated as a measure of relevance or confidence. But is it?

## What cosine similarity actually measures

Cosine similarity between two vectors **u** and **v** is defined as **u·v / (||u|| ||v||)**. It measures the cosine of the angle between them, ignoring magnitude. In embedding space, this captures directional alignment. For sentence-BERT models fine-tuned with contrastive loss, similar texts are mapped to nearby directions. So a high cosine similarity (close to 1) means the vectors point in roughly the same direction.

But here's the catch: the absolute value of the similarity is not calibrated. A score of 0.8 in one embedding model may correspond to very different semantic similarity than 0.8 in another. Even within the same model, the distribution of scores depends on the data domain. For example, in a medical corpus, two paragraphs about "hypertension" might score 0.9, while two paragraphs about "machine learning" might score only 0.7 for equally close semantic relationships. The model's training data skews the score distribution.

## Failure modes of threshold-based retrieval

A common mistake is to set a fixed similarity threshold (e.g., 0.7) and discard all chunks below it. This fails because:

1. **Domain shift**: The threshold that works for general web text may be too high for specialized scientific text where embeddings are more spread out.
2. **Query ambiguity**: A vague query like "tell me about AI" may have many chunks with moderate scores (0.6-0.7), while a specific query like "explain attention is all you need" may have one chunk at 0.85 and the rest below 0.3. A fixed threshold would either miss the relevant chunk or include too many irrelevant ones.
3. **Chunk length variation**: Longer chunks tend to have higher norm and may produce slightly different score distributions. Some embedding models normalize vectors, but the issue of score scale remains.

## What about other similarity metrics?

Inner product (dot product) is another common metric. It is unbounded and heavily influenced by vector magnitude. In practice, many vector databases normalize embeddings to unit length, making cosine similarity equivalent to inner product. So the same caveats apply.

Euclidean distance is also used. For normalized vectors, it is monotonically related to cosine similarity (d² = 2 - 2 cos θ). So again, no free lunch.

## Practical recommendations

1. **Don't use absolute scores as confidence**: Instead, use relative ranking. The top-3 chunks are likely more relevant than the bottom-3, but a score of 0.9 doesn't mean "very confident".
2. **Use reranking**: After retrieving top-k by embedding similarity, apply a cross-encoder reranker. Cross-encoders produce more calibrated relevance scores (often in [0,1]) and can better distinguish fine-grained relevance.
3. **Consider hybrid search**: Combine vector similarity with keyword (BM25) or other signals. This helps when the embedding model fails on rare terms or out-of-domain queries.
4. **Evaluate on your data**: Build a small test set of query-chunk relevance judgments. Measure recall@k and precision@k. Don't rely on model leaderboard numbers.

## Open questions

I haven't experimented with score normalization techniques like Platt scaling or isotonic regression for embedding scores. Could we calibrate cosine similarity to be more interpretable? Possibly, but the calibration would be dataset-dependent and might not generalize.

Another question: for multi-vector retrieval (e.g., ColBERT), the similarity is computed as a sum of max similarities over token-level embeddings. Does that produce more meaningful scores? Early evidence suggests yes, but at higher storage and compute cost.

In summary, treat cosine similarity as a ranking signal, not an absolute measure of relevance. Your RAG system's quality depends more on chunking strategy, retrieval diversity, and reranking than on the exact similarity threshold.
