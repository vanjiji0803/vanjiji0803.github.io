---
title: "Tool calling is not agency: building reliable execution loops for LLM agents"
description: "Why giving LLMs tools isn't enough, and how to build robust execution loops with state machines, retries, and observability."
date: 2026-09-05
tags: ["agents", "tool-calling", "state-machines", "llm-engineering"]
draft: false
---

When I first started building LLM agents, I thought the hard part was getting the model to call tools correctly. After all, GPT-4 and Claude can output structured JSON with function calls, and frameworks like LangChain make it trivial to bind tools and execute them. But after shipping a few agents into production—including a surgical RAG agent that queries a knowledge base and calls a YOLO-based detection API—I realized that tool calling is the easy 20%. The other 80% is building an execution loop that doesn't fall apart when the model misbehaves, the API times out, or the user asks something ambiguous.

The core issue is that a single LLM call with tool definitions is not an agent. It's a function. An agent needs a loop: it perceives, decides, acts, and observes the result, then repeats until the task is done. The loop is where reliability lives. If you just chain calls with a `while` loop and a max iterations counter, you'll get something that works in demos but fails in the real world. Let me walk through the failure modes and the patterns I've found useful.

## The naive loop and its failure modes

A typical naive loop looks like this:

```python
while not done and steps < max_steps:
    response = llm.chat(messages, tools=tools)
    if response.tool_calls:
        for call in response.tool_calls:
            result = execute_tool(call)
            messages.append(result)
    else:
        done = True
```

This works when the model is perfect, the tools are deterministic, and the task is simple. But in practice, you hit these issues:

- **Infinite loops**: The model keeps calling the same tool with slightly different arguments, never converging. You need a step limit, but that's a blunt instrument.
- **Stuck in a sub-task**: The model decides it needs to search the web, but the search returns nothing useful, and it retries forever with different queries.
- **Tool errors**: The API returns a 500 or a malformed response. The model sees the error string and tries to "fix" it by calling again, but the error persists.
- **Context explosion**: Each tool result gets appended to the messages. After 10 calls, you've blown past the context window, and the model starts hallucinating or losing track.
- **No way to recover**: If the model makes a wrong decision (e.g., calls a destructive tool), there's no rollback.

## State machines over free-form loops

The fix is to impose structure on the loop. Instead of letting the LLM decide everything, you define a finite set of states and transitions. For example, for my surgical agent, I have states like `INIT`, `QUERY_KB`, `RUN_DETECTION`, `FORMULATE_RESPONSE`, and `DONE`. The LLM can only choose actions within the current state, and certain transitions are only allowed if certain conditions hold.

This is a hybrid approach: the LLM is the decision-maker within a state, but the state machine controls the flow. For instance, in `QUERY_KB`, the LLM can call a retrieval tool, but it can't jump to `RUN_DETECTION` until it has actually retrieved something and the result is in context. This prevents the model from skipping steps or looping arbitrarily.

I've found that representing the state machine as a simple Python class with explicit transitions is clearer than using a graph library. You can also encode invariants: e.g., "if the tool returns an error, move to a `RETRY` state with a counter; after 3 retries, move to `FAIL` and apologize to the user."

## Retries with exponential backoff and jitter

Tool calls are not reliable. APIs time out, rate limits hit, and sometimes the tool returns garbage. The naive approach is to let the LLM see the error and decide what to do. That's a bad idea because the LLM might interpret a 500 error as "the user asked for something wrong" and start apologizing. Instead, you should handle retries at the infrastructure level, not the LLM level.

Implement a wrapper around each tool that does retry with exponential backoff and jitter. For example, for a detection API that might be slow, I set a timeout of 10 seconds, and retry up to 3 times with backoff factors 1, 2, 4. If it still fails, I return a structured error object that the LLM can use to decide whether to try an alternative tool or give up.

One subtlety: if the tool is non-idempotent (e.g., sends an email), you must be careful with retries. You might end up sending two emails. In that case, you need to make the tool idempotent by passing a unique request ID and having the server deduplicate.

## Token and context management

Every tool result you append to the conversation consumes tokens. After a few iterations, you might have 20k tokens of history, and the model's attention degrades. I've seen agents forget the original user request because they're drowning in tool outputs.

A practical solution is to summarize or prune old tool results. For example, after each step, you can keep the last N messages and compress older ones into a summary. But summarization itself costs tokens and can lose information. Another approach is to design tools to return concise results. For instance, instead of returning the full YOLO detection output (which can be hundreds of boxes), I have the tool return only the top 5 detections with confidence scores, and the full list is available via a separate query if needed.

Also, be mindful of the context window. If you're using a 128k model, you might think you have plenty of room, but tool outputs can be huge. Set a budget: for each tool call, limit the result to, say, 2000 tokens. If the result is longer, truncate it and include a note that there's more available.

## Evaluation and observability

How do you know if your agent is reliable? You need to test it systematically. I've built a small evaluation harness that runs a suite of tasks and checks for success criteria. For each task, I record the trace: the sequence of tool calls, the latencies, and the final response. I then look for common failure patterns: loops, repeated tool calls, or premature termination.

Observability is crucial. Every step in the loop should log the state, the decision, the tool call, and the result. I use structured logging with a trace ID so I can reconstruct a single run. This is invaluable when debugging a specific failure.

One metric I track is the "tool call efficiency": the number of tool calls per successful task. If it's high, the agent is thrashing. I also track the percentage of runs that hit the max steps limit—that's a sign the loop is not converging.

## Open questions

There are still open problems. For example, how to handle tasks that require a long sequence of dependent steps, where the model must remember intermediate results without exceeding the context? I've experimented with memory modules that store key-value facts, but it's tricky to know what to store. Also, how to make the agent robust to ambiguous user requests? I've found that asking a clarifying question is often better than guessing, but the model doesn't always know when to ask.

I haven't yet tried reinforcement learning to optimize the loop policy; that seems like a natural next step, but it's a big investment. For now, the state machine plus retries and observability has been enough to make my agents reliable in practice.

In summary, tool calling is a feature, but agency is a system. You need to design the loop with explicit states, handle failures at the infrastructure level, manage context, and measure everything. It's not glamorous, but it's what separates a demo from a deployed agent.
