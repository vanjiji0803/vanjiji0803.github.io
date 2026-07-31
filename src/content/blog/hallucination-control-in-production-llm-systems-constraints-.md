---
title: "Hallucination control in production LLM systems: constraints, retrieval, verification, and refusal"
description: "A practical guide to reducing LLM hallucinations using constraints, retrieval, verification, and refusal strategies."
date: 2026-07-31
tags: ["llm", "hallucination", "rag", "production"]
draft: false
---

In production LLM systems, hallucinations are not just a nuisance; they can be dangerous. I've spent the last year building surgical agents and RAG pipelines, and I've learned that controlling hallucinations requires a multi-layered approach. Here's what works for me, and what doesn't.

## 1. Constrain the output space

The first line of defense is to limit what the model can say. If you're building a system that extracts structured data, use JSON mode or function calling. For example, in our surgical agent, we use a state machine with predefined transitions. The model can only choose from a set of actions (e.g., 'ask_question', 'retrieve_info', 'proceed'), and each action has a schema. This reduces the chance of the model inventing a new procedure.

But constraints aren't bulletproof. The model can still fill in wrong values within a schema. That's where retrieval and verification come in.

## 2. Ground with retrieval (RAG)

RAG is the most common way to ground the model. But naive RAG fails. In my experience, chunking is critical. For medical documents, I use a hierarchical chunking strategy: first split by headings, then by paragraphs, and keep chunks around 500 tokens with overlap. This preserves context while allowing retrieval.

Retrieval quality matters more than the model's size. I've seen a 7B model with good retrieval outperform a 70B model with bad retrieval. Use hybrid search (BM25 + dense) and a reranker. But beware: rerankers can be overconfident. I've had cases where the reranker's top result was wrong, and the model confidently cited it.

## 3. Verify before you trust

Retrieval gives you evidence, but you need to verify that the model's claims are actually supported. I've implemented a simple verification step: after the model generates an answer, I extract the key claims and check them against the retrieved passages using a textual entailment model. If the entailment score is low, I flag the answer as 'unsupported'.

This adds latency, so I only verify high-stakes claims. For example, in a medical agent, drug interactions are verified; general questions are not.

## 4. Teach the model to refuse

Sometimes the best answer is 'I don't know'. I fine-tune my models to refuse when the evidence is insufficient. This is tricky because you need to balance refusal with helpfulness. I use a threshold: if the retrieval confidence is below a certain value, the model is instructed to say 'I'm not sure' and suggest alternatives.

But refusal can be gamed. The model might refuse too often, making the system useless. I've found that calibrating the threshold on a validation set helps. Also, you can add a 'confidence' field to the output, letting the downstream system decide.

## 5. Observability and evaluation

You can't fix what you can't measure. I log every generation with the retrieved chunks, the final answer, and a human rating. For evaluation, I use a combination of automatic metrics (faithfulness, answer relevance) and human review. I've built a small dashboard that shows hallucination rates per query type.

One open question: how do you evaluate hallucinations in free-form dialogue? I haven't found a perfect solution yet. For now, I rely on human evaluation for those cases.

## 6. Failure modes and edge cases

Even with all this, hallucinations slip through. Common failure modes:

- **Retrieval misses the relevant chunk**: The model then has no evidence, but it still answers. I mitigate this by adding a 'no evidence' condition that triggers refusal.
- **Conflicting evidence**: Two chunks say different things. The model picks one, but it might be the wrong one. I'm experimenting with showing both and asking the model to present the conflict.
- **Over-verification**: The entailment model rejects valid answers. This is a precision-recall tradeoff. I tune the threshold to minimize high-risk errors.

## 7. Practical tips

- **Token budget**: Always reserve tokens for the verification step. If you're using a 4K context, use 3K for input and 1K for output, leaving room for verification prompts.
- **Model selection**: For high-stakes tasks, use a larger model (e.g., GPT-4 or Claude) even if it's slower. For low-stakes, a smaller model with good retrieval is fine.
- **Latency**: Verification adds 200-500ms. If that's too slow, consider a cascaded approach: fast model first, and only if confidence is low, do a slower verification.

## 8. Open questions

I'm still exploring how to handle hallucinations in multi-turn conversations. The context grows, and the model might carry over a hallucination from a previous turn. I'm thinking of a 'memory check' that verifies facts across turns.

Another question: can we use reinforcement learning to reduce hallucinations? I've seen some papers, but I haven't tried it yet. It seems promising but complex.

In summary, hallucination control is not a single trick but a system design. Constraints, retrieval, verification, and refusal work together. Start with constraints and retrieval, add verification for high-stakes, and always have a refusal fallback. And measure everything.

If you have experience with these methods, I'd love to hear what works for you. I'm especially interested in how you handle the tradeoff between helpfulness and refusal.
