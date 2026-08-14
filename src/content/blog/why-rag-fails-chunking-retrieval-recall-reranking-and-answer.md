---
title: "Why RAG fails: chunking, retrieval recall, reranking, and answer grounding"
description: "A practical breakdown of RAG failure modes—chunking, recall, reranking, grounding—with concrete fixes and evaluation tips."
date: 2026-08-14
tags: ["rag", "retrieval", "reranking", "grounding"]
draft: false
---

RAG (Retrieval-Augmented Generation) has become the default architecture for grounding LLMs in private or domain-specific data. But if you've deployed one in production, you know it fails in predictable ways. The failures aren't random—they cluster around four stages: chunking, retrieval recall, reranking, and answer grounding. Let's dissect each, with concrete examples and tradeoffs.

## 1. Chunking: The Silent Killer

Chunking is the first place things go wrong. Most tutorials suggest fixed-size chunks (e.g., 512 tokens). But fixed sizes ignore semantic boundaries. A chunk that splits a table or a code block becomes garbage for retrieval.

**My experience:** I once built a RAG for clinical guidelines. Chunking by 256 characters split dosage tables mid-row. The retriever returned fragments that looked plausible but were contextually wrong. The fix? Use recursive character splitting with separators like `\n\n`, `\n`, and `.`. For structured content, consider structure-aware splitting (e.g., by Markdown headers or HTML sections).

**Tradeoff:** Smaller chunks increase retrieval precision but lose context. Larger chunks preserve context but dilute relevance. A common heuristic: aim for 300-500 tokens, but always test with your data.

## 2. Retrieval Recall: Top-k is a Gamble

Retrieval recall is the probability that the relevant passage is in your top-k. If it's not, the LLM has no chance. I've seen recall rates as low as 60% with dense embeddings on domain-specific jargon.

**Why it fails:** Embedding models are trained on general text. Medical or legal terms often map to nearby but wrong vectors. For example, "myocardial infarction" might retrieve "heart attack" paragraphs, but the exact treatment protocol might be missed.

**Mitigations:**
- **Hybrid search:** Combine dense embeddings with BM25 (lexical). BM25 catches exact terms; embeddings catch semantics. Weight them (e.g., 0.7/0.3) and tune on your data.
- **Query expansion:** Generate multiple queries from the original using an LLM (e.g., "What is the dose for myocardial infarction?" → "MI treatment", "heart attack medication"). This boosts recall at the cost of latency.
- **Fine-tune embeddings:** If you have labeled pairs, fine-tune a model like `bge-large` on your domain. I've seen recall jump from 70% to 90% with a few thousand examples.

**Evaluation:** Don't rely on intuition. Build a golden set of 100-200 queries with known relevant chunks. Measure recall@k (e.g., recall@10). If it's below 80%, your RAG will hallucinate.

## 3. Reranking: The Overlooked Step

Many RAG pipelines skip reranking, assuming top-k from retrieval is good enough. That's a mistake. Dense retrieval returns semantically similar but not necessarily relevant results. Rerankers (cross-encoders) score query-passage pairs jointly, capturing nuance.

**Example:** Query: "What is the contraindication for aspirin in children?" A dense retriever might return a passage about aspirin's mechanism. A reranker would rank the passage about Reye's syndrome higher.

**Tradeoff:** Rerankers are slow (e.g., `cross-encoder/ms-marco-MiniLM-L-6-v2` takes ~10ms per pair on CPU). For 100 candidates, that's 1 second—too slow for real-time. Solutions:
- Rerank only top-20 or top-50, not all.
- Use a lightweight reranker, or distill a large reranker into a smaller one.
- Cache reranking scores for frequent queries.

**My take:** Reranking is worth the latency if you need accuracy. For a surgical agent, I'd rather wait 200ms more than give a wrong answer.

## 4. Answer Grounding: The Final Frontier

Even with perfect retrieval, the LLM might ignore the context and hallucinate. Why? Because the model is trained to be helpful, not to be faithful to context. Grounding failures happen when:
- The context is contradictory or incomplete.
- The LLM's parametric knowledge overrides the context (e.g., it "knows" the answer from training).
- The prompt doesn't enforce grounding.

**Mitigations:**
- **Prompt engineering:** Explicitly say: "Answer only based on the provided context. If the context doesn't contain the answer, say 'I don't know'." This helps but isn't foolproof.
- **Structured output:** Ask the LLM to output a JSON with `answer` and `citations` (chunk IDs). Then verify that each claim in the answer is supported by the cited chunks. This is called **attribution**.
- **Post-hoc validation:** Use an NLI model (e.g., `facebook/bart-large-mnli`) to check if the answer is entailed by the context. If not, flag it.

**Failure mode:** Even with grounding, the LLM might cite a chunk that doesn't support the claim. I've seen models cite a chunk about drug interactions when answering a dosing question. The fix is to evaluate grounding accuracy, not just answer correctness.

## Evaluation: The Missing Piece

Most teams don't evaluate RAG properly. They test with a few hand-crafted queries and call it done. That's insufficient. You need a systematic evaluation:
- **Retrieval:** Recall@k, MRR.
- **Generation:** Faithfulness (is the answer supported by context?), answer relevance, and correctness (against a golden answer).

Tools like `RAGAS` or `TruLens` can automate this. But beware: synthetic evaluation datasets can be biased. Build your own from real user queries.

## Open Questions

I haven't yet tried adaptive chunking (e.g., using an LLM to decide chunk boundaries). It sounds promising but expensive. Also, reranking with LLMs (using the LLM itself to rank) is too slow for production, but maybe with distillation it could work.

RAG is not a solved problem. It's a pipeline of fragile components. But if you understand where it fails and measure each stage, you can make it robust enough for production. Start by instrumenting your pipeline: log retrieval scores, rerank scores, and grounding checks. You'll be surprised how many silent failures you catch.
