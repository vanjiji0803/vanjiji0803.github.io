---
title: "Embedding Models and Vector Search: What Similarity Scores Do and Do Not Mean"
description: "A practical look at embedding similarity scores, their limitations, and how to use them in RAG systems without over-relying on thresholds."
date: 2026-08-21
tags: ["embeddings", "vector-search", "rag", "similarity"]
draft: false
---

In RAG systems, the embedding model plus vector search is the retrieval backbone. We stuff documents into a vector store, embed a query, and get back the top-k chunks by cosine similarity. The scores look like probabilities—0.82, 0.91—but they are not probabilities. They are uncalibrated, model-specific, and often misleading if you treat them as absolute measures of relevance.

## What the score actually is

Cosine similarity measures the cosine of the angle between two vectors. It ranges from -1 to 1, but in practice, for embeddings from models like `text-embedding-3-small` or `bge-large-en`, scores cluster in a narrow band, often 0.3 to 0.8. The distribution depends heavily on the model and the domain. I've seen scores of 0.7 for completely unrelated texts in a medical corpus, and 0.6 for highly relevant ones. The score is relative, not absolute.

## Why thresholds are dangerous

A common mistake is to set a fixed threshold, say 0.75, and discard anything below. But the optimal threshold varies with the query, the corpus, and the embedding model. For a narrow domain like surgical notes, the average similarity might be higher because the vocabulary is consistent. For a general corpus, it might be lower. Also, the same query rephrased can yield different score distributions. I've had cases where a query about "postoperative bleeding" returned 0.82 for a relevant chunk, but the same chunk scored 0.71 when the query was "bleeding after surgery". A threshold of 0.75 would have missed it.

## What the score does not capture

Embeddings are trained to capture semantic similarity in a high-dimensional space, but they miss:

- **Negation and nuance**: "The patient is not bleeding" vs. "The patient is bleeding"—the vectors are close because they share words, but the meaning is opposite.
- **Temporal or causal logic**: "Drug A causes side effect B" vs. "Drug B causes side effect A"—the embeddings may be similar if the words overlap.
- **Domain-specific context**: In clinical notes, "cold" might mean temperature or a common cold; the embedding might not disambiguate without fine-tuning.

## How to use scores in practice

Instead of a hard threshold, use the score as a relative ranking signal. Retrieve top-k (e.g., 20) and then apply a reranker, like a cross-encoder, to refine. The reranker gives a more calibrated relevance score, but it's also not absolute—it's trained on pairwise data. The final decision should be based on the downstream task: if the LLM can handle noise, you can afford to retrieve more; if not, you need stricter filtering.

One technique I've used is to normalize scores per query: compute the mean and standard deviation of the top-100 scores, then z-score them. This gives a relative measure that is more comparable across queries. But even then, it's not a guarantee.

## Failure modes and evaluation

If you rely on similarity scores to filter, you'll inevitably have false positives and false negatives. The only way to know is to evaluate on your own data. Build a small test set of queries with known relevant chunks, measure recall@k and precision@k, and see how the scores behave. I've seen teams spend weeks tuning thresholds when the real issue was a poor embedding model or chunking strategy.

## Open questions

I haven't yet explored using learned similarity thresholds per domain, or calibrating scores with a logistic regression on human-labeled data. That could be a next step. Also, with the rise of hybrid search (BM25 + vectors), the similarity score becomes even less interpretable.

In the end, treat similarity scores as a hint, not a verdict. They tell you which chunks are in the same neighborhood, not which are correct. Build your RAG pipeline with that in mind.
