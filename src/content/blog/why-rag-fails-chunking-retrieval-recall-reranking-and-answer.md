---
title: "Why RAG Fails: Chunking, Retrieval Recall, Reranking, and Answer Grounding"
description: "A deep dive into common failure modes in RAG pipelines and how to fix them."
date: 2026-07-23
tags: ["rag", "retrieval", "chunking", "grounding"]
draft: false
---

RAG (Retrieval-Augmented Generation) is the go-to pattern for grounding LLMs in external knowledge. But in production, RAG pipelines break in predictable ways. I've spent the past year building a surgical RAG agent (Surg-Agent) and debugging these issues. Here's what I've learned.

## 1. Chunking: The First Bottleneck

Chunking isn't just splitting text. If you use fixed-size chunks (e.g., 512 tokens), you'll sever sentences, tables, or code blocks. The retriever then returns incomplete context, and the LLM hallucinates the missing parts.

**Better approach:** Use semantic chunking—split on paragraph boundaries, section headers, or using an embedding similarity threshold (e.g., split when cosine similarity between consecutive sentences drops below 0.5). For structured docs (e.g., medical guidelines), keep tables and lists intact.

**Tradeoff:** Semantic chunking is slower and may produce uneven chunk sizes. But retrieval recall improves significantly because each chunk is self-contained.

## 2. Retrieval Recall: The Embedding Gap

Even with perfect chunks, retrieval can miss relevant context. Why? Embedding models are biased toward semantic similarity, not factual correctness. A query like "What is the survival rate for pancreatic cancer?" might retrieve chunks about "pancreatic cancer symptoms" because they share more vocabulary.

**Fix:** Use hybrid search (dense + sparse). Sparse retrieval (BM25) captures exact keyword matches, while dense embeddings capture semantics. Weight them (e.g., 0.3 BM25 + 0.7 dense) and tune on your domain.

**Edge case:** In clinical RAG, abbreviations cause trouble. "MI" could mean myocardial infarction or mitral insufficiency. A domain-specific embedding model (fine-tuned on medical text) helps, but I've found that adding a query expansion step (LLM generates synonyms) is more practical.

## 3. Reranking: Precision vs. Latency

After retrieval, you often have 10-20 chunks. Reranking with a cross-encoder (e.g., Cohere rerank) boosts precision but adds 50-200ms per chunk. For a surgical agent, that latency is unacceptable.

**My approach:** Use a two-stage reranker. First, a lightweight bi-encoder (e.g., sentence-transformers) to filter top-5 from top-20. Then, a cross-encoder on only those 5. This cuts latency by 60% while keeping recall high.

**Failure mode:** Rerankers can overfit to query-chunk similarity and ignore answerability. A chunk might be relevant but lack the specific answer. I've seen rerankers rank a chunk about "treatment" higher than one containing the exact survival rate. Solution: Include a "does this chunk contain the answer?" classification step, or use an LLM to verify after reranking.

## 4. Answer Grounding: The Hallucination Trap

Even with the right chunks, the LLM may ignore them and hallucinate. This is especially common with small LLMs (7B-13B) that are instruction-finetuned to be creative.

**Grounding techniques:**
- **Prompt engineering:** Explicitly instruct the LLM to only use the provided context. Add a penalty for extra information.
- **Citation generation:** Force the LLM to output citations (e.g., [1][2]) and then verify each claim against the retrieved chunks. If a claim has no citation, reject it.
- **Self-consistency:** Generate multiple answers with different temperature and check for agreement. If answers diverge, retrieval likely failed.

**Observation:** In Surg-Agent, we use a state machine that checks whether the LLM's output is fully grounded before returning. If not, we re-retrieve with an expanded query. This adds 1-2 seconds but reduces hallucination rate from 15% to 3%.

## 5. Evaluation: The Missing Piece

Most RAG systems are deployed without rigorous evaluation. You need three metrics:
- **Retrieval recall:** % of ground-truth chunks in top-k.
- **Answer correctness:** Exact match or semantic similarity to gold answer.
- **Grounding score:** % of claims that can be traced back to retrieved chunks.

**Tooling:** Use RAGAS or build a custom eval set with 200-500 examples. I've found that manual evaluation of 50 cases catches more bugs than automated metrics.

## Open Questions

- How do you handle multi-hop questions where the answer requires combining information from multiple chunks? Current rerankers don't model this.
- For streaming RAG (e.g., real-time surgical video), chunking and retrieval must happen in <100ms. Is approximate nearest neighbor (HNSW) enough, or do we need learned indices?

RAG is not a solved problem. Each component—chunking, retrieval, reranking, grounding—has failure modes that compound. The key is to measure, iterate, and accept that no pipeline is perfect. But with careful engineering, you can get to 95%+ reliability.

---

*Fan Zhang builds AI agents for surgery at Peking University. Previously worked on pharmacogenomics GWAS and edge AI with NVIDIA Holoscan.*
