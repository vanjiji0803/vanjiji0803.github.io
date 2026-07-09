---
title: "Hallucination control in production LLM systems: constraints, retrieval, verification, and refusal"
description: "Practical techniques for reducing LLM hallucinations in production: prompt constraints, RAG, verification loops, and graceful refusal."
date: 2026-07-09
tags: ["hallucination", "rag", "llm", "production"]
draft: false
---

Hallucination remains the single biggest barrier to deploying LLMs in production. After building several systems — from a RAG-based surgical agent to a clinical trial matching pipeline — I've distilled four practical layers of defense: constraints, retrieval, verification, and refusal. None is a silver bullet, but together they form a robust safety net.

## 1. Constraints: Shrink the output space

The easiest way to reduce hallucinations is to limit what the model can say. For structured outputs, use JSON mode with a strict schema. For example, in our surgical agent, we define a Pydantic model for tool calls and parse with `model.with_structured_output()` in LangChain or a constrained decoding library like Outlines. This prevents the model from inventing tool names or arguments.

For free-text, use system prompts with explicit boundaries: "You are a QA bot. If the answer is not in the provided context, say 'I don't know'." But beware — models often ignore such instructions under pressure. A stronger approach is to set a token budget per fact: if the model starts rambling beyond 3 sentences, truncate and append a refusal. We've seen a 40% reduction in hallucination rate with this simple trick.

## 2. Retrieval: Ground every claim

RAG is the standard, but implementation details matter. Chunk size and overlap are critical: too large chunks (e.g., 2000 tokens) dilute relevance; too small (e.g., 100 tokens) lose context. I typically use 512 tokens with 128 overlap for clinical text, and 256 tokens for code. Embedding model choice also matters: for domain-specific content, fine-tune a BERT variant on your corpus. We saw a 15% improvement in recall for surgical instrument names after fine-tuning on OR transcripts.

Reranking is non-negotiable. A cross-encoder (e.g., Cohere rerank or BAAI/bge-reranker-v2) boosts top-1 accuracy from 70% to 90% in our tests. But reranking adds latency (50–100ms per query). For real-time systems, cache reranking results or use a smaller model.

## 3. Verification: Check before you trust

Even with good retrieval, the model may ignore the context. A verification step can catch this. One approach: after generation, ask a separate LLM (or the same one) to extract claims and check each against the retrieved chunks. This is expensive — we use a small 1B parameter model for verification, adding ~200ms per response. Another approach: use a factuality classifier (e.g., a fine-tuned RoBERTa) to score each sentence. We deployed this for a medical Q&A system, reducing hallucination from 12% to 3%.

For numeric or factual claims, use a rule-based verifier. For example, if the model says "the success rate is 85%", verify against a database of known values. If the database says 82%, flag it. This catches obvious hallucinations but misses subtle ones.

## 4. Refusal: Know when to say no

The most underused technique is graceful refusal. Many systems force the model to answer, leading to hallucination. Instead, implement a confidence threshold. If the retrieval score is below a threshold (e.g., 0.6 cosine similarity), refuse: "I don't have enough information to answer." We also use a semantic entropy metric: if the model's token probabilities are flat (high entropy), it's guessing — refuse.

Refusal can be frustrating for users, so provide alternatives: "Would you like to search the web?" or "Here are related topics." In our surgical agent, refusal triggered a human-in-the-loop escalation, which improved trust.

## Putting it together

In production, we combine all four: constraints for tool calls, RAG with reranking for knowledge, a verification LLM for fact-checking, and a refusal gate based on retrieval score and entropy. The total pipeline adds ~500ms latency but cuts hallucination from 20% to under 2%. Is it perfect? No. Edge cases like conflicting sources or outdated retrieval still cause errors. But it's a pragmatic trade-off.

One open question: how to handle temporal hallucinations (e.g., claiming a drug is approved when it's not yet)? We're experimenting with a timestamp-aware retrieval that filters chunks older than a cutoff. Early results are promising.

What techniques have you found effective? I'd love to hear about your failure modes — they're often the most educational.
