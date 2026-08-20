---
title: "Hallucination Control in Production LLM Systems: Constraints, Retrieval, Verification, and Refusal"
description: "Practical techniques to reduce LLM hallucinations in production: constraints, retrieval, verification, and refusal, with tradeoffs and implementation notes."
date: 2026-08-20
tags: ["llm", "hallucination", "rag", "production"]
draft: false
---

Hallucination control is a top concern when deploying LLMs in production. Over the past year, I've worked on RAG-based surgical agents and other systems where a wrong answer can be costly. Here's a practical rundown of four complementary layers: constraints, retrieval, verification, and refusal. Each has its own tradeoffs and failure modes.

## Constraints: bounding the output space

The simplest way to prevent hallucination is to restrict what the model can say. For structured outputs, use constrained decoding: JSON schema, regex, or grammar. For classification, use logit bias to force a valid label. For example, in a surgical agent that needs to output a step from a fixed checklist, we can mask logits to only those tokens. This eliminates out-of-vocabulary hallucinations entirely.

But constraints have limits. They don't help with free-text generation where the answer is open-ended. Also, they can degrade quality if the schema is too rigid, forcing the model to produce awkward phrasing. I've seen systems where constrained decoding caused the model to 'cheat' by putting extra info in a comment field. So, design your schema carefully.

## Retrieval: grounding in external knowledge

RAG is the standard approach for grounding. The key is chunking and retrieval quality. I've found that chunk size matters: too small (e.g., 100 tokens) loses context, too large (e.g., 2000) dilutes relevance. A sweet spot is 300-500 tokens, with overlap. For retrieval, hybrid search (BM25 + dense) often beats pure vector search, especially for domain-specific terms. Reranking is essential: a cross-encoder can boost precision significantly. In our surgical agent, we used a two-stage retriever: first retrieve top 20, then rerank to top 5.

But retrieval introduces its own failure modes: if the corpus is incomplete or outdated, the model will confidently cite irrelevant passages. Also, retrieval latency adds up. In edge deployment, we had to optimize embedding inference to keep end-to-end under 200ms.

## Verification: checking the output

Verification is about checking the model's output against external facts. For factual claims, you can use a separate model to extract claims and then verify each against retrieved evidence. For example, in a medical Q&A, we extract entities and check them against a knowledge base. This is compute-intensive but catches many hallucinations.

Another approach is self-consistency: generate multiple samples (e.g., 5) and check agreement. If they diverge, it's a sign of uncertainty. I've used this for open-ended questions where retrieval is weak. But it multiplies cost and latency.

## Refusal: knowing when to say 'I don't know'

Sometimes the best answer is to refuse. This requires the model to estimate its own uncertainty. You can prompt it to say 'I don't know' when evidence is insufficient, but that's unreliable. Better: use a threshold on retrieval scores. If the top retrieved passage has a similarity score below a threshold, refuse. In our system, we set a threshold based on a calibration set. This reduced hallucination rate significantly, but it also increased the refusal rate on borderline cases. You need to tune the threshold to balance precision and recall.

## Putting it together

In production, you need a pipeline: first, try constraints; if the output is structured, that's enough. For free-text, use retrieval with reranking, and set a refusal threshold. For high-stakes domains, add verification. Each layer adds latency and cost, so it's a tradeoff.

One open question: how to evaluate hallucination control? We used a human-annotated set of 200 questions, measuring factual accuracy and refusal precision. But it's not scalable. I'm exploring automated metrics like FactScore, but they have their own biases.

Overall, there's no silver bullet. You need a combination, and you need to tune it for your domain. If you have experience with verification in production, I'd love to hear about it.
