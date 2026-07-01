---
title: "Intent Recognition in Agent Systems: From Utterance to Task State"
description: "A technical deep-dive into intent recognition pipelines, state machine design, and failure modes for LLM-based agents."
date: 2026-07-01
tags: ["intent-recognition", "ai-agents", "state-machines", "llm"]
draft: false
---

Intent recognition is the first critical step in any agent system. The user says something like "Book a meeting with Alice tomorrow at 3pm" and the agent must map that to an executable task state. Get this wrong and the whole pipeline fails.

## The Pipeline

A typical pipeline looks like:
1. **Utterance → Intent + Slots**: Classify intent (e.g., `create_meeting`) and extract slots (date, time, participants).
2. **Intent → Task State**: Map to a state in a state machine (e.g., `AWAITING_CONFIRMATION`).
3. **State → Action**: Execute the action (e.g., call calendar API).

## Intent Classification Approaches

### 1. Rule-based (Regex + Heuristics)
Simple, fast, but brittle. Example: if utterance contains "book" and "meeting", classify as `create_meeting`. Works for limited domains but fails on paraphrases.

### 2. Few-shot LLM Prompting
Use a prompt like:
```
Classify the user intent into one of: [create_meeting, cancel_meeting, reschedule, query_calendar].
User: "I need to set up a call with John tomorrow"
Intent:
```
This is flexible but adds latency (200-500ms for a small model like GPT-3.5-turbo) and cost. Also, you need to handle out-of-domain intents gracefully.

### 3. Fine-tuned Classifier
Train a small BERT-like model on your domain. Fast (10-50ms), cheap at inference, but requires labeled data. I've used this for surgical command recognition in Surg-Agent.

## Slot Filling
Once intent is known, extract parameters. Again, you can use regex, LLM (e.g., "extract the date and participants"), or a sequence tagger (e.g., BERT + CRF).

**Edge case**: Implicit slots. "Remind me to call mom" — no time given. The agent must either assume a default (e.g., now) or enter a `ASKING_TIME` state.

## State Machine Design

A finite state machine (FSM) is the backbone. Example for a meeting booking agent:

- `IDLE`: waiting for command
- `AWAITING_DETAILS`: need more slots (e.g., missing time)
- `AWAITING_CONFIRMATION`: all slots filled, ask user to confirm
- `EXECUTING`: calling API
- `DONE` or `ERROR`

Transitions are triggered by intent + slot completeness. If the user says "Yes, go ahead" during `AWAITING_CONFIRMATION`, the intent `confirm` triggers transition to `EXECUTING`.

**Failure mode**: What if the user changes their mind mid-conversation? "Actually, cancel that and book a dinner instead." The state machine must handle interruption — reset to `IDLE` or `AWAITING_DETAILS`.

## Evaluation

Offline: collect a test set of utterances with ground truth intent and slots. Measure accuracy, precision, recall. Also measure slot F1.

Online: track user satisfaction, task completion rate, average number of turns. A high number of turns often indicates poor intent recognition leading to clarification loops.

## Implementation Details

For Surg-Agent, we used a hybrid approach: a lightweight intent classifier (DistilBERT) for the top-5 frequent intents, and an LLM fallback for rare or ambiguous cases. This balances latency and coverage.

**Token budget**: For LLM-based classification, keep the prompt under 512 tokens. Include only relevant context (current state, last user utterance).

**Observability**: Log every intent classification with confidence scores. If confidence < 0.7, flag for human review. This helps debug failures.

## Open Questions

- How to handle multi-intent utterances? "Book a meeting and send an email" — should the agent handle sequentially or in parallel?
- When to use a hierarchical state machine vs. a flat one? For complex domains, hierarchical (e.g., booking sub-states vs. email sub-states) reduces complexity.

I haven't tried using a single LLM to both classify and fill slots in one pass — the output is harder to parse reliably. Structured output (JSON mode) helps but still has formatting issues.

In summary, intent recognition is not just about classification; it's about integrating with a state machine that handles partial information, interruptions, and errors. The best approach depends on your latency, cost, and data constraints.
