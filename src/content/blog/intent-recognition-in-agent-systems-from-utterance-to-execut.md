---
title: "Intent Recognition in Agent Systems: From Utterance to Executable Task State"
description: "A deep dive into intent recognition for AI agents: classification, slot-filling, state machines, and edge cases."
date: 2026-07-22
tags: ["agents", "intent-recognition", "llm", "state-machine"]
draft: false
---

Intent recognition is the first and arguably most critical step in any agent system. It determines what the user actually wants and translates that into a structured representation the agent can act on. In this post, I'll walk through common approaches, tradeoffs, and failure modes I've encountered while building surgical and RAG-based agents.

## The Pipeline

A typical intent recognition pipeline looks like:

1. **Utterance** → 2. **Intent Classification** → 3. **Slot Filling** → 4. **Task State Mapping**

### Intent Classification

You have two main options: a dedicated classifier (e.g., BERT-based) or an LLM prompt. The classifier is faster and cheaper but requires labeled data and retraining for new intents. The LLM approach is more flexible but adds latency and cost. In my surgical agent, I used a hybrid: a lightweight BERT classifier for common intents (e.g., "start recording", "show instrument") and an LLM fallback for ambiguous or novel queries.

**Tradeoff**: Classifiers are deterministic and fast (~10ms), while LLMs can handle zero-shot intents but take 200-500ms. For real-time edge deployment (NVIDIA IGX), classifier latency matters.

### Slot Filling

Once intent is known, we need to extract parameters: e.g., for "show me the left upper quadrant", intent = `display_region`, slots = {region: "left upper quadrant"}. Rule-based regex works for limited domains; for open-ended, I use an LLM with a structured output schema (JSON mode).

**Edge case**: Ambiguous slots. "Show the camera" could mean move the camera or display camera feed. I handle this by adding a disambiguation step: if slot confidence is low, the agent asks a clarifying question.

### Task State Mapping

This is where the rubber meets the road. The recognized intent + slots must map to an executable task state in a state machine. For example, a `start_recording` intent transitions from `IDLE` to `RECORDING`. But what if the system is already recording? The state machine should either reject or queue the intent.

**Failure mode**: Intent mismatch. The user says "stop" but the system is in a state where stopping is not allowed (e.g., during critical surgery phase). The agent must have a policy to handle such cases: either ignore, warn, or escalate.

## Evaluation

I evaluate intent recognition on three axes:

- **Accuracy**: Correct intent classification.
- **Slot F1**: Precision/recall on slot values.
- **State Transition Success**: Percentage of recognized intents that lead to correct state transitions.

A common pitfall is over-reliance on confidence thresholds. Setting too high causes many rejections; too low causes false positives. I tune thresholds per intent using a held-out validation set.

## Implementation Details

For a RAG-based agent, I embed the user utterance and retrieve relevant examples from a vector DB to few-shot prompt the LLM. This improves accuracy for rare intents. The prompt includes:

- System message with intent definitions
- Retrieved examples (top-3)
- Current state context
- Output schema (JSON)

**Token budget**: Each example ~100 tokens, so 3 examples + utterance + system prompt ~600 tokens. With a 4k context window, that leaves plenty for reasoning.

## Open Questions

How do you handle intent drift over time? I haven't tried online learning for intent classifiers yet. Also, what's the best way to handle multi-intent utterances? For now, I split on conjunctions and process sequentially.

Intent recognition is far from solved, but with careful engineering—state machines, hybrid classifiers, and robust slot filling—you can build agents that understand users reliably.
