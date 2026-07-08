---
title: "Planning Algorithms for Agents: ReAct, Plan-and-Execute, State Machines, and Where Each Breaks"
description: "A practical breakdown of ReAct, plan-and-execute, and state machines for LLM agents, with failure modes and deployment lessons."
date: 2026-07-08
tags: ["agents", "planning", "llm", "state-machines"]
draft: false
---

When building LLM agents, the planning algorithm is the backbone. I've spent the last year experimenting with three main approaches: ReAct, plan-and-execute, and state machines. Each has strengths, but also sharp edges that only show up in production. Here's what I've learned.

## ReAct: Simple but Fragile

ReAct (Reasoning + Acting) interleaves thought, action, and observation in a single loop. The agent outputs a thought, then an action (e.g., a tool call), then observes the result, and repeats. It's elegant and easy to implement—just a prompt and a while loop.

**Where it works:** Simple QA, single-tool tasks. For example, "What's the weather in Tokyo?" → thought → call weather API → observation → answer.

**Where it breaks:**
- **Token overflow:** Long chains can exceed context windows. I've seen agents loop 15+ steps, blowing past 8K tokens. A 32K context helps, but cost spikes.
- **No backtracking:** If the agent picks a wrong tool early, it rarely recovers. It just keeps digging. I've watched it call a search API 10 times for the same query.
- **Hallucination in thoughts:** The "reasoning" can be post-hoc rationalization. The agent might claim it's checking a database when it's actually guessing.

**Mitigation:** Set a max step limit (e.g., 5), use a cheap fast model for the loop and a stronger model for final answer synthesis.

## Plan-and-Execute: Structured but Brittle

This splits planning from execution. First, the LLM generates a multi-step plan (e.g., "1. Search patient history, 2. Extract medications, 3. Check interactions"). Then a separate executor runs each step, often with a DAG or sequential runner.

**Where it works:** Complex multi-tool workflows, like our Surg-Agent: plan a surgical step sequence, then execute each with vision tools.

**Where it breaks:**
- **Plan hallucination:** The LLM invents steps that don't exist. I've seen plans like "Use the MRI segmentation tool" when no such tool is available. The executor fails silently or crashes.
- **No dynamic replanning:** If a step fails (e.g., API down), the plan is stuck. You need a replan trigger, but that adds complexity.
- **Chunking issues:** Long plans exceed context. We chunk plans into sub-plans, but then lose global coherence.

**Mitigation:** Validate the plan against a schema before execution. Use a retry loop with exponential backoff. For replanning, detect failures and call the planner again with the current state.

## State Machines: Robust but Rigid

Define explicit states (e.g., IDLE, TOOL_CALL, WAITING, ERROR) and transitions. The agent moves between states based on conditions. This is common in production systems but rare in LLM agent research.

**Where it works:** High-reliability systems like surgical agents. We use a state machine for Surg-Agent: IDLE → PLANNING → TOOL_CALL → OBSERVING → DECIDING → IDLE. Each state has a specific prompt and allowed actions.

**Where it breaks:**
- **State explosion:** Complex tasks need many states. I've seen state machines with 50+ states that are impossible to maintain.
- **No creativity:** The LLM is constrained to predefined transitions. It can't handle truly novel situations. For example, if a tool returns unexpected data, the state machine might not have a transition for it.
- **Hard to design:** You need to anticipate all failure modes upfront. In practice, you discover new ones in production.

**Mitigation:** Use a hybrid: a state machine for high-level flow, but let the LLM decide within each state. For example, in TOOL_CALL state, the LLM chooses which tool to call.

## Where Each Breaks: A Comparison

| Approach | Failure Mode | Example |
|----------|--------------|---------|
| ReAct | Token explosion, no recovery | Agent loops on same tool call |
| Plan-and-execute | Plan hallucination, no replan | Agent plans to use nonexistent tool |
| State machine | State explosion, rigid | Agent can't handle unexpected tool output |

## Practical Advice

1. **Start with ReAct** for simple agents (≤3 tools). Add a step limit and a fallback answer.
2. **Move to plan-and-execute** when you have >5 tools or multi-step workflows. Add plan validation and a replan trigger.
3. **Use state machines** only for critical systems where you can enumerate all states. Consider a hybrid with LLM freedom inside states.

I haven't tried hierarchical planning (e.g., LLM generates a high-level plan, then sub-agents execute). It seems promising but adds latency. Also, observability is key—log every thought, action, and state transition. Without it, debugging is impossible.

What's your experience? I'm still learning where planning breaks in edge cases. Let me know if you've found a better approach.
