---
title: "Observability for LLM Agents: Traces, Spans, Prompts, Tool Outputs, and Failure Taxonomy"
description: "A practical guide to instrumenting LLM agents with traces, spans, prompt logging, tool outputs, and a failure taxonomy for debugging."
date: 2026-07-21
tags: ["observability", "llm-agents", "debugging", "tracing"]
draft: false
---

When building LLM agents, the hardest part isn't getting them to work once—it's understanding why they fail in production. Unlike traditional software, where a stack trace tells you exactly where an exception occurred, an agent's failure can stem from a bad prompt, a hallucinated tool call, a retrieval chunk that misled the reasoning, or a planning loop that never terminates. Without proper observability, debugging becomes guesswork.

## Traces and Spans

Treat each agent invocation as a **trace**, and every LLM call, tool execution, retrieval step, or internal decision as a **span**. This maps naturally to OpenTelemetry semantics. For example, a single user query might produce:

- **Root span**: Agent execution (user query → final answer)
- **Child span 1**: LLM call for planning (prompt, tokens, latency)
- **Child span 2**: Tool call `search_knowledge_base(query="...")` (input, output, status)
- **Child span 3**: LLM call for response generation (prompt, context, tokens)

Each span should carry:
- **Start/end timestamps** for latency breakdown
- **Attributes**: model name, token count, temperature, tool name, error flag
- **Status**: OK / ERROR / TIMEOUT

I use a simple decorator pattern: `@trace_span("llm_call", attributes={"model": model_name})` that wraps the call and records inputs/outputs. For streaming, capture the first chunk latency and total generation time separately.

## Prompt Logging

Always log the **exact prompt** sent to the model, including system prompt, few-shot examples, and retrieved context. This is crucial for post-hoc analysis. Store prompts in a structured format (e.g., JSON with keys `system`, `messages`, `tools`). I've found that 80% of agent failures trace back to a poorly worded instruction or missing context in the prompt. Without logging, you can't reproduce the issue.

Be careful with PII: redact sensitive fields before logging. Use a configurable redactor that matches patterns like emails, phone numbers, or custom regex.

## Tool Outputs

Tool outputs are the agent's ground truth. Log the raw output (truncated to a max length, say 10k chars) and a hash for deduplication. Also log the tool's **execution metadata**: duration, error code, retry count. For RAG tools, log the retrieved chunk IDs and their relevance scores—this helps debug retrieval failures.

One pattern I use: wrap each tool in a `ToolExecutor` that captures input, output, and duration, then emits a span. If the tool throws an exception, the span is marked as ERROR and the exception message is stored as an attribute.

## Failure Taxonomy

Not all failures are equal. I classify agent errors into:

1. **Prompting failure**: The LLM misinterprets the instruction. Symptoms: irrelevant tool calls, refusal to answer, or hallucinated reasoning. Fix: improve prompt clarity, add constraints.
2. **Tool failure**: The tool returns an error or unexpected output. Symptoms: tool call fails, returns empty, or returns malformed data. Fix: add retries, validate tool outputs, improve error handling.
3. **Planning failure**: The agent loops, diverges, or never reaches a terminal state. Symptoms: excessive tool calls, token budget exceeded, or infinite loop. Fix: limit max steps, add a timeout, or use a state machine to constrain the plan.
4. **Retrieval failure**: The retrieved context is irrelevant or insufficient. Symptoms: answer lacks grounding, contradicts retrieved info. Fix: improve chunking strategy, reranking, or add a verification step.
5. **Hallucination**: The model generates factually incorrect content despite correct tools. Symptoms: confident false statements. Fix: add a fact-checking tool, lower temperature, or use a more capable model.

Tag each trace with a failure category. Over time, you'll see which category dominates your system, guiding where to invest engineering effort.

## Implementation Notes

- Use OpenTelemetry for distributed tracing; it's vendor-neutral and supports async contexts.
- Store spans in a backend like Jaeger or Grafana Tempo for visualization.
- For prompt logging, consider a separate database (e.g., Postgres with JSONB) to avoid polluting the trace store.
- Set up alerting on error spans: if a tool call fails more than 5% of the time, page the team.
- One open question: how to handle streaming spans? I currently record the final output, but I'd like to capture intermediate token-by-token latency. Haven't found a clean solution yet.

Observability isn't just about debugging—it's about building trust in your agent. When you can replay a trace and see exactly where it went wrong, you can iterate quickly. Start simple: log prompts, tool outputs, and error flags. Then layer on spans and taxonomy as you grow.

*What failure modes have you encountered in your agents? I'd love to hear about them.*
