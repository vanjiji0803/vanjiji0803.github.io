---
title: "Why RAG Fails: Chunking, Retrieval Recall, Reranking, and Answer Grounding"
description: "A deep dive into common RAG failure points and how to debug them with concrete examples."
date: 2026-09-04
tags: ["rag", "retrieval", "chunking", "reranking"]
draft: false
---

RAG (Retrieval-Augmented Generation) is often sold as a silver bullet for grounding LLMs in proprietary knowledge. But in practice, it fails more often than we'd like. The failure modes are not mysterious—they cluster around four stages: chunking, retrieval recall, reranking, and answer grounding. Let's dissect each with concrete examples and tradeoffs.

## 1. Chunking: The Foundation is Leaky

Chunking is the first place things go wrong. If chunks are too small, context is fragmented; too large, noise creeps in. I've seen teams default to 512 tokens with 50% overlap, but that's a one-size-fits-all that ignores content structure.

**Example:** In a clinical guideline document, a contraindication might be mentioned in one section and the rationale in another. If you split by fixed token count, you can sever that connection. The retriever might fetch the contraindication chunk but miss the rationale, leading to a shallow answer.

**Tradeoff:** Smaller chunks improve precision but hurt recall because the answer might span multiple chunks. Larger chunks improve recall but dilute relevance. A better approach is structure-aware chunking: split by headings, paragraphs, or semantic boundaries. For code, split by functions; for medical texts, by sections.

**Edge case:** Tables and lists. A table chunked naively becomes garbled text. I've had to write custom splitters that preserve table structure as markdown. Also, chunk overlap is a hack—it helps but doesn't solve the fragmentation problem.

## 2. Retrieval Recall: The Top-K Illusion

Even with perfect chunks, retrieval can fail. The classic issue is that top-k retrieval is biased toward lexical or vector similarity, not semantic relevance. In a benchmark I ran on a surgical Q&A dataset, recall@5 was only 0.62. That means 38% of the time, the correct chunk wasn't in the top 5.

**Why?** Embedding models are trained on general corpora. Domain-specific terms (e.g., "laparoscopic cholecystectomy") might be embedded in a way that doesn't capture the nuance. Also, the query might be phrased differently than the source text. For example, asking "What are the risks of surgery?" vs. the document saying "Potential complications include..."—the vector distance can be large.

**Mitigation:** Use hybrid search combining BM25 and dense vectors. BM25 excels at exact term matching, dense at semantic. In my experience, hybrid improves recall by 10-15% over dense alone. But it adds latency and complexity.

**Another failure:** Metadata filtering. If you don't filter by relevant metadata (e.g., document type, date, section), the retriever might pull chunks from irrelevant sources. I've seen a RAG system answer a question about drug interactions using a patient education brochure instead of the clinical guideline because both had similar keywords.

## 3. Reranking: Not a Silver Bullet

Reranking is supposed to fix recall by taking the top 50 retrieved chunks and selecting the best 5. But rerankers have their own issues.

**Failure mode:** Rerankers are trained on pairs (query, document) and output a relevance score. They can be biased toward longer documents or those with more keyword overlap. In a test, a cross-encoder reranker gave a high score to a chunk that mentioned the query term but was actually about a different topic.

**Tradeoff:** Cross-encoders are more accurate than bi-encoders but slower. For a RAG pipeline, you can't rerank 1000 chunks in real-time. So you need a two-stage approach: recall with a fast retriever, then rerank a candidate set. But the candidate set size is a hyperparameter. Too small, you miss good chunks; too large, latency suffers.

**Edge case:** Reranking is a pointwise operation—it scores each chunk independently. It doesn't consider the diversity of the final set. You might get 5 chunks that all say the same thing, missing a crucial different perspective. I've had to implement a simple diversity penalty: subtract a similarity score between the chunk and already selected ones.

## 4. Answer Grounding: The Final Frontier

Even with perfect retrieval, the LLM can hallucinate or ignore the context. The problem is that LLMs are trained to be helpful, not to strictly follow context. If the context doesn't contain the answer, the model might make something up.

**Example:** In a RAG system for drug-drug interactions, the retrieved chunks might mention that drug A and drug B are both metabolized by CYP3A4, but not explicitly state there's an interaction. The LLM might infer an interaction and say "there is a potential interaction" when the source doesn't confirm it.

**Mitigation:** Use a two-step approach: first, ask the LLM to extract relevant snippets from the context, then answer based on those snippets. Or, instruct the LLM to say "I don't know" if the context is insufficient. But this is brittle—LLMs don't always follow instructions.

**Better:** Use an entailment model to check if the answer is supported by the context. This adds a verification step. I've experimented with a small NLI model that checks whether the generated answer is entailed by the retrieved chunks. It catches hallucinations but adds latency and can have false negatives.

**Another trick:** Prompt the LLM to provide citations. But citations are often hallucinated. I've seen a system cite a chunk that didn't contain the claimed information. So, you need to verify the citations by checking if the answer's key phrases appear in the cited chunk.

## Evaluation: You Can't Improve What You Can't Measure

RAG systems are notoriously hard to evaluate. You need to measure retrieval quality (recall@k, MRR) and generation quality (faithfulness, answer relevance). But manual evaluation is slow. I've built a small evaluation harness that uses a set of golden Q&A pairs and computes metrics like:

- **Retrieval Recall@5:** Was the correct chunk in the top 5?
- **Answer Exact Match:** Does the generated answer match the golden answer?
- **Faithfulness:** Is every claim in the answer supported by the retrieved chunks? (Using an NLI model)

This gives you a baseline. But beware of overfitting to the eval set. I've seen teams tune chunk size to their eval set and then fail in production.

## Open Questions

I haven't yet figured out how to handle queries that require synthesizing information from multiple documents. For example, "Compare the efficacy of drug A vs. drug B for condition X"—the answer might require chunks from different trials. Current RAG pipelines retrieve chunks independently and then concatenate them, but the LLM might not properly compare them. I'm exploring graph-based retrieval or multi-hop reasoning.

Another open question: how to dynamically adjust chunk size based on query complexity. A simple query might need a small chunk, but a complex one needs a larger context. Static chunking is a compromise.

## Conclusion

RAG fails for concrete, fixable reasons. Start by auditing your chunking strategy—are you preserving semantic units? Then measure recall@k and see if you're missing chunks. If so, try hybrid search or better embeddings. Reranking helps but isn't magic. Finally, ground your answers with verification. And always, always evaluate with a realistic set of queries.

RAG is a pipeline, and like any pipeline, it's only as strong as its weakest link. Find your weakest link and fix it.
