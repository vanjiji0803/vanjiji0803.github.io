---
title: "Evaluating LLM agents beyond pass/fail: traces, recovery, and tool-use quality"
description: "How to evaluate LLM agents beyond pass/fail: trace analysis, recovery, and tool-use quality."
date: 2026-09-08
tags: ["llm-agents", "evaluation", "tool-use", "trace-analysis"]
draft: false
---

When I started building Surg-Agent, a RAG-based assistant for the operating room, my first instinct was to evaluate it like a QA dataset: give it a query, compare the answer to a gold reference, and report accuracy. That worked for simple Q&A, but the moment I added function calling and a planning loop, pass/fail became almost meaningless. A run could end in the right final answer through a completely broken path – or fail a task while executing every step flawlessly. So I've been forced to think about evaluation at three levels: the trace, the recovery, and the tool-use quality. Here's what I've learned so far, with concrete examples from my own work.

## Why pass/fail is not enough

Consider a travel-booking agent. The task: "Book a flight from Beijing to Shanghai for tomorrow." A pass/fail evaluation would only check if the agent successfully booked a flight. But what if it booked the wrong date, or used a credit card without authorization, or spent 20 API calls when 3 would have sufficed? Those are all failures in a real system, but they'd be invisible in a binary score.

For surgical agents, the stakes are higher. A wrong tool call could mean pulling up the wrong patient's history or suggesting a contraindicated medication. So I need to know not just whether the final answer was correct, but whether the agent's internal reasoning and tool usage were sound.

## Trace-level evaluation

A trace is the full sequence of observations, thoughts, and actions an agent takes. Instead of a single score, I evaluate the trace against a set of criteria:

- **Correctness of each step**: Did the agent call the right tool with the right arguments at the right time?
- **Efficiency**: Did it make redundant calls or loop unnecessarily?
- **Ordering**: Did it retrieve information before making decisions that depend on it?
- **Hallucination in intermediate steps**: Did it invent tool outputs or assume facts without verification?

For example, in a RAG-based agent, I might expect it to first retrieve relevant documents, then call a calculator to compute a dosage, then call a database to check allergies. If it calls the calculator before retrieval, that's a trace-level error, even if the final answer happens to be correct.

To implement this, I define a set of "trace assertions" – rules that the sequence must satisfy. For instance:

- The agent must call `retrieve` before `calc_dose`.
- The agent must not call `book_flight` more than twice.
- The agent must never call `send_email` without user confirmation.

I then run a suite of test tasks and check these assertions programmatically. This catches many issues that pass/fail misses.

## Recovery evaluation

Agents will make mistakes. The question is: can they recover? For example, if a tool call fails because the API returned an error, does the agent retry with a corrected argument? If it retrieves irrelevant documents, does it rephrase the query?

I evaluate recovery by injecting failures into the environment:

- **Tool failures**: Make a tool return an error once, then succeed on retry.
- **Unexpected outputs**: Return a malformed JSON from a tool.
- **Missing information**: Have a tool return empty results.

Then I measure:

- **Recovery rate**: How often does the agent eventually complete the task despite the injected failure?
- **Steps to recover**: How many extra actions does it take?
- **Quality of recovery**: Does it retry with a sensible modification, or does it flail?

For example, in one test, I made the `get_weather` tool return an error for a specific city. A well-designed agent should catch the error and try a different city code or ask for clarification. A poorly designed one might hallucinate a weather forecast. Recovery evaluation exposes that.

## Tool-use quality

Tool use is not just about calling the right tool; it's about calling it well. I look at:

- **Argument quality**: Are the arguments semantically correct? For instance, if the agent needs to search for a drug, does it use the generic name or a misspelled brand name?
- **Tool selection**: Does it choose the most appropriate tool for the task, or does it overuse a generic search tool when a specialized one exists?
- **Output handling**: Does it correctly parse and use the tool's output? Does it ignore relevant fields?
- **Error handling**: When a tool returns an error, does it understand the error and respond appropriately?

To evaluate this, I annotate each tool call in the trace with a quality label (good, acceptable, poor) based on these criteria. Then I compute a tool-use quality score per task. This gives a more granular view than just "did it finish."

## Putting it together: a practical evaluation framework

In my projects, I now use a three-tier evaluation:

1. **Task success**: Binary pass/fail on the final outcome.
2. **Trace correctness**: A set of assertions on the sequence of actions.
3. **Recovery and tool-use quality**: Measured on a subset of tasks with injected failures and manual annotation.

I run this on a small set of 50-100 tasks per iteration, which is enough to catch regressions. For each task, I store the full trace in a structured format (JSON lines) and compute metrics like:

- Task success rate
- Average trace length (for efficiency)
- Percentage of tasks that violate a trace assertion
- Recovery rate on failure-injected tasks
- Average tool-use quality score

This gives me a dashboard that helps me decide whether a new prompt or model change is actually improving the agent.

## Open questions

I'm still figuring out how to automate trace assertion checking without hand-writing rules for every possible scenario. Maybe using a secondary LLM to judge traces? But then you have the problem of evaluating the judge. I haven't tried that yet, but it's on my list.

Another open question: how to weight these metrics when comparing agents. Is a 10% drop in task success worth a 20% improvement in recovery? That depends on the domain. For surgical agents, recovery might be more important than raw success.

Evaluating agents is a moving target. But moving beyond pass/fail has made my agents more robust and, frankly, easier to debug. I hope sharing my approach helps you in your own agent projects.
