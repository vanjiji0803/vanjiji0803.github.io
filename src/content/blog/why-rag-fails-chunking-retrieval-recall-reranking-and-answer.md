---
title: "Why RAG Fails: Chunking, Retrieval Recall, Reranking, and Answer Grounding"
description: "A deep dive into four failure modes in RAG systems with concrete examples and engineering tradeoffs."
date: 2026-07-02
tags: ["rag", "retrieval", "chunking", "grounding"]
draft: false
---

RAG (Retrieval-Augmented Generation) has become the default architecture for grounding LLMs in external knowledge. But in production, RAG systems fail in predictable ways. Let's walk through four common failure modes I've encountered, with concrete examples and engineering tradeoffs.

## 1. Chunking: The Semantic Breakup Problem

Chunking seems trivial—split text into pieces, embed them, retrieve. But naive chunking breaks semantic units. Consider a medical document: "The patient was prescribed 5mg of warfarin daily. INR should be monitored weekly." If you split after the first sentence, the second chunk loses context about which drug. The first chunk has no monitoring instruction.

**Tradeoffs:**
- **Fixed-size chunks** (e.g., 256 tokens) are simple but often cut through sentences or paragraphs.
- **Semantic chunking** (using embeddings or NLP to detect boundaries) preserves meaning but adds latency and complexity.
- **Overlapping chunks** (e.g., 50-token overlap) reduce information loss but increase storage and retrieval cost.

**Edge case:** A chunk boundary lands right before a critical negation ("... did not show signs of infection."). The retrieved chunk might say "show signs of infection," leading to hallucination.

**What I've tried:** Recursive character splitting with overlap, then sliding window retrieval with re-ranking. Still, no silver bullet.

## 2. Retrieval Recall: The Embedding Gap

Even with perfect chunks, retrieval can miss relevant content. Embeddings capture semantic similarity but fail on lexical specificity. For example, query "What is the half-life of metformin?" might retrieve a chunk about "metformin pharmacokinetics" but miss one that says "Metformin is eliminated with a half-life of 6.2 hours" if the embedding model didn't learn the phrase "eliminated with a half-life."

**Failure modes:**
- **Query-document mismatch:** User asks a short, keyword-sparse question; documents use different terminology.
- **Multi-hop reasoning:** The answer requires combining information from two chunks. Top-k retrieval often returns only one relevant chunk.
- **Dense vs. sparse:** Dense retrieval (embedding cosine similarity) captures semantics but ignores exact matches. Sparse retrieval (BM25) does the opposite. Hybrid approaches help but double latency.

**Evaluation metric:** Recall@k. In production, I've seen recall@10 drop below 60% for domain-specific queries.

## 3. Reranking: The False Positive Filter

Reranking is supposed to fix retrieval failures by scoring retrieved chunks with a cross-encoder. But rerankers have their own biases.

**Concrete example:** A reranker might give high scores to chunks that contain the query's keywords but are contextually wrong. For "What is the dose for children?", a chunk saying "Adults: 500mg. Children: not recommended." might be ranked lower than a chunk saying "Children's dose is 10mg/kg" from a different drug.

**Tradeoffs:**
- **Cross-encoder rerankers** are more accurate but ~100x slower than embedding similarity. For 100 retrieved chunks, reranking adds ~1 second latency.
- **Two-stage reranking** (fast filter then slow reranker) can reduce latency but risks discarding relevant chunks in the first stage.

**Open question:** How to make reranking robust to out-of-domain queries? I haven't found a good solution yet.

## 4. Answer Grounding: The Generation Gap

Even with perfect retrieval, the LLM can ignore or misinterpret the context. This is the most insidious failure mode.

**Failure mechanisms:**
- **Position bias:** LLMs pay more attention to the beginning and end of the context. If the answer is in the middle, it may be overlooked.
- **Instruction override:** The system prompt says "Answer based on context only," but the LLM's pre-training knowledge overrides. For example, it might answer a question about a rare disease using general medical knowledge instead of the provided context.
- **Hallucination from ambiguity:** If the context contains conflicting information (e.g., two studies with different outcomes), the LLM may hallucinate a third answer.

**Mitigation strategies:**
- **Explicit citation:** Force the LLM to output source chunk IDs. Then verify that the answer is actually supported.
- **Decomposition:** Break the question into sub-questions, retrieve for each, and answer step-by-step. This reduces the chance of missing information.
- **Confidence threshold:** If the LLM's probability for the answer is low, fall back to "I don't know."

**My experience:** Grounding is the hardest. Even with chunk-level citation, the LLM can cite a chunk that doesn't support the claim. You need to check the actual text, not just the citation.

## Conclusion

RAG is not a solved problem. Each stage—chunking, retrieval, reranking, generation—has its own failure modes. The key is to measure each stage independently: chunk coverage, recall@k, reranker precision, and answer faithfulness. Only then can you debug and improve.

What's your biggest RAG failure? I'd love to hear.
