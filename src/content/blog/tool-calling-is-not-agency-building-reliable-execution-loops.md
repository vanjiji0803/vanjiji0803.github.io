---
title: "Tool calling is not agency: building reliable execution loops for LLM agents"
description: "Why tool use alone doesn't make an agent autonomous, and how to design robust execution loops with state machines, retries, and observability."
date: 2026-07-03
tags: ["llm-agents", "function-calling", "execution-loops", "state-machines"]
draft: false
---

## Tool calling is not agency

I've seen many demos where an LLM calls a function, and the presenter says "Look, it's an agent!" But tool calling is just a structured output. True agency requires reliable execution loops that handle failures, maintain state, and recover gracefully.

## The naive loop

A typical first attempt looks like:

```python
while True:
    response = llm.chat(messages, tools=tool_defs)
    if response.tool_call:
        result = execute_tool(response.tool_call)
        messages.append(result)
    else:
        break
```

This fails in practice: the LLM hallucinates tool arguments, tools time out, or the loop never terminates. I've seen agents stuck calling the same tool with slightly different parameters because the error message wasn't informative enough.

## State machines for execution control

Instead of a free-form loop, I now use a finite state machine (FSM) with explicit states: `THINK`, `TOOL_CALL`, `TOOL_RESULT`, `FINAL`, `ERROR`. Each state has guards and transitions. For example:

- **THINK**: LLM decides next action. If no tool call, go to FINAL. If tool call, go to TOOL_CALL.
- **TOOL_CALL**: Execute the tool with a timeout (e.g., 10s). On success, go to TOOL_RESULT. On timeout or error, go to ERROR.
- **TOOL_RESULT**: Append result to messages. If max turns reached (e.g., 10), go to FINAL. Else go to THINK.
- **ERROR**: Log the error, optionally retry with exponential backoff (max 3 retries), then go to THINK with an error message.
- **FINAL**: Return the final answer.

This approach prevents infinite loops and makes failure modes explicit.

## Token budget and context window management

Agents accumulate messages quickly. I set a hard limit on total tokens (e.g., 8K out of 16K context) and truncate or summarize older messages when exceeded. For example, after 5 tool calls, I summarize the conversation history into a single system message and discard the raw history.

## Observability and debugging

Without logs, agent failures are black boxes. I log every state transition, tool call duration, token usage, and error. Tools like LangSmith or custom dashboards help. One key metric: tool call success rate vs. retry rate. If retry rate > 20%, the tool definitions or error messages need improvement.

## Concrete example: Surg-Agent

In my surgical video agent, we have a tool for "detect_surgical_instrument" that takes a video frame and returns bounding boxes. The naive loop would sometimes call it with a non-existent frame index. Our FSM catches that error, informs the LLM, and the LLM corrects the argument. Without the state machine, the agent would either crash or hallucinate a result.

## Open questions

- How do you handle tools with side effects (e.g., sending an email) when the agent might call them multiple times due to retries? Idempotency keys?
- What's the optimal retry strategy for LLM-based agents? Exponential backoff works for APIs, but LLM errors are often semantic, not transient.

I haven't tried using a separate smaller LLM to validate tool calls before execution, but it might reduce hallucinated invocations. Would love to hear others' experiences.

## Conclusion

Tool calling is a necessary but insufficient condition for agency. Reliable execution loops require state machines, token budgets, observability, and explicit error handling. The next time you see an agent demo, ask: what happens when the tool fails?
