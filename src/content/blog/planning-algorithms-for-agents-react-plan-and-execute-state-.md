---
title: "Planning Algorithms for Agents: ReAct, Plan-and-Execute, State Machines, and Their Failure Modes"
description: "A practical breakdown of agent planning approaches with concrete failure examples from real implementations."
date: 2026-07-30
tags: ["agents", "planning", "react", "state-machines"]
draft: false
---

When building LLM-powered agents, planning is the core that determines whether your agent wanders aimlessly or accomplishes tasks. I've implemented and debugged three common approaches: ReAct, plan-and-execute, and state machines. Each has distinct failure modes that aren't obvious from blog posts.

## ReAct: The Default Choice

ReAct interleaves reasoning and acting in a single loop. The LLM gets a prompt like "Think step by step, then act." It outputs a thought, then a tool call, then observes the result, and repeats.

**Where it works:** Simple QA with few tool calls (e.g., "What's the weather in Tokyo?"). The LLM can handle 2-3 steps reliably.

**Where it breaks:**
- **Token budget blowup:** Each thought+action+observation adds hundreds of tokens. After 10 steps, the context window is full of old reasoning. I've seen agents repeat the same failed action because earlier thoughts are lost.
- **No backtracking:** Once a thought is committed, the agent rarely revisits it. If the LLM decides "I need to search for X" but X doesn't exist, it keeps searching with synonyms instead of questioning the premise.
- **Latency:** Each step requires a full LLM call. On a surgical agent with 5 tools, a 10-step plan takes 20+ seconds with GPT-4.

**Example failure:** An agent asked "Find the latest paper on CRISPR in Nature." It called search('CRISPR Nature'), got a list, then called get_abstract for each result, then called search again because it forgot it already had the list. 15 steps, 12k tokens, no final answer.

## Plan-and-Execute: Two-Stage Decomposition

This separates planning from execution. First, the LLM generates a plan as a list of steps. Then, an executor runs each step, possibly with sub-agents.

**Where it works:** Multi-step tasks with clear dependencies (e.g., "Book a flight, then a hotel, then send itinerary").

**Where it breaks:**
- **Plan hallucination:** The plan might include steps that are impossible given available tools. For example, a plan step "Search for hotel reviews" when the agent only has a booking API. The executor fails silently or tries to call a nonexistent function.
- **No dynamic replanning:** If step 2 fails (e.g., flight not available), the entire plan collapses. Some implementations replan from scratch, but that wastes tokens and time.
- **Step granularity:** Too coarse ("Plan trip") leaves too much to the executor; too fine ("Open browser, type URL, click search") makes the plan fragile.

**Example failure:** A plan-and-execute agent for data analysis produced: 1. Load CSV, 2. Compute mean, 3. Plot. Step 2 returned a number, step 3 tried to plot but the executor had no plotting tool. The agent looped on "retry plotting" until timeout.

## State Machines: Explicit Control Flow

A state machine defines states (e.g., SEARCHING, READING, ANSWERING) and transitions. The LLM is only called within states to make decisions, but the overall flow is hardcoded.

**Where it works:** Well-defined domains like customer support (Greeting -> Question -> Resolution -> Feedback).

**Where it breaks:**
- **Rigidity:** Adding a new state requires code changes. For a research assistant that needs to handle arbitrary web searches, the state graph becomes a spiderweb.
- **State explosion:** Every combination of context (e.g., "user asked for comparison after seeing results") needs a transition. I've seen state machines with 40+ states that still miss edge cases.
- **LLM misuse:** The LLM is often used only for natural language parsing, not reasoning. This defeats the purpose of using an LLM.

**Example failure:** A state machine for a cooking agent had states: GET_RECIPE, SHOW_STEPS, CHECK_INGREDIENTS. User said "I don't have eggs, what can I substitute?" The machine had no transition from SHOW_STEPS to a substitution state, so it replied "I can't help with that."

## Where Each Breaks: Summary

| Approach | Breaks when | Mitigation |
|----------|-------------|------------|
| ReAct | Long chains, no backtracking, token limits | Use sliding window or summarization; add explicit "rethink" action |
| Plan-and-execute | Dynamic failures, plan hallucination | Add error recovery: on failure, replan only from current step; validate plan against tool list before execution |
| State machine | Unforeseen user inputs, combinatorial states | Hybrid: use state machine for high-level flow, LLM for within-state reasoning; add fallback state |

## Practical Recommendations

For most production agents, I'd start with a hybrid: a lightweight state machine for the outer loop (e.g., observe -> think -> act -> observe), but let the LLM decide the next state dynamically. This gives you observability (you know which state the agent is in) and flexibility. ReAct is great for prototypes but needs careful token management. Plan-and-execute works only if you can guarantee tool availability.

I haven't tried hierarchical planning (planner + sub-planners) yet, but it seems promising for complex tasks. The open question is: how do you prevent the planner from generating sub-goals that are still too complex for the executor?

What planning approaches have you tried? I'd love to hear about your failure modes.
