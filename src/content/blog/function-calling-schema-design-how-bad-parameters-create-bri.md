---
title: "Function Calling Schema Design: How Bad Parameters Create Brittle Agents"
description: "A deep dive into how poorly designed function schemas break LLM agents, with concrete examples and mitigation strategies."
date: 2026-07-05
tags: ["function-calling", "agent-design", "llm-engineering"]
draft: false
---

Function calling is the backbone of LLM agents. Give an agent a well-typed schema, and it can query databases, control devices, or book flights. Give it a sloppy schema, and you get hallucinated parameters, infinite retries, and an agent that collapses under edge cases.

I've spent the last few months building a surgical RAG agent (Surg-Agent) that calls tools like video analysis, patient record retrieval, and instrument tracking. Every time I saw the agent fail, it traced back to one root cause: **bad function schema design**. Here's what I learned.

## The Problem: Overly Permissive Parameters

Consider this naive schema for a "search_patient" function:

```json
{
  "name": "search_patient",
  "parameters": {
    "type": "object",
    "properties": {
      "query": { "type": "string" }
    },
    "required": ["query"]
  }
}
```

The LLM will happily pass `"find the last surgery video"` as the query, which your backend doesn't support. The agent retries, fails again, and eventually times out.

**The fix:** constrain parameters to enumerations or structured types.

```json
{
  "name": "search_patient",
  "parameters": {
    "type": "object",
    "properties": {
      "patient_id": { "type": "string", "pattern": "^[0-9]{6}$" },
      "search_type": { "type": "string", "enum": ["demographics", "medications", "procedures"] }
    },
    "required": ["patient_id", "search_type"]
  }
}
```

Now the agent must produce a valid patient ID and pick from a small set. Hallucination drops sharply.

## Token Budget and Schema Size

Every schema token eats into the context window. If your function list has 20 functions, each with 10 parameters and descriptions, that's easily 2000+ tokens. The agent's reasoning capacity shrinks.

**Tradeoff:** More detailed descriptions reduce hallucination but increase latency and cost. I've found that keeping description length under 50 tokens per parameter and using `required` sparingly (only truly mandatory fields) balances accuracy and efficiency.

## Parameter Types and Validation

LLMs are surprisingly good at generating valid JSON, but they struggle with implicit constraints. For example:

- **Date ranges:** `"start_date": "2024-01-01"` – the LLM might output `"2024-1-1"`. Use `format: date` and enforce ISO 8601.
- **Nested objects:** Deeply nested parameters increase the chance of the LLM skipping intermediate fields. Flatten where possible.
- **Optional vs required:** Marking a parameter as optional when it's actually required leads to silent failures. Always validate server-side.

## Failure Modes in Practice

In Surg-Agent, we had a function `analyze_video_segment(video_id, start_time, end_time)`. The LLM would sometimes omit `end_time`, assuming it defaults to the video length. Our backend threw an error, the agent retried, and the user waited 10 seconds for a failure.

**Solution:** Make `end_time` required, or provide a default in the schema description. Better yet, split into two functions: `get_video_duration` and `analyze_video_segment` with explicit bounds.

## Evaluation Metrics

How do you measure schema quality? I track:

- **Parameter hallucination rate:** % of calls with invalid parameter values (e.g., enum mismatch, out-of-range numbers).
- **Retry count per function call:** High retries indicate ambiguous schemas.
- **First-call success rate:** % of function calls that succeed on the first attempt.

A good schema should achieve >95% first-call success. If you're below 80%, your schema is the bottleneck.

## Implementation Tips

1. **Use JSON Schema draft-07** – most LLM providers (OpenAI, Anthropic) support it. Leverage `pattern`, `minimum`, `maximum`, `enum`.
2. **Test with adversarial prompts** – ask the LLM to call functions with missing or malformed parameters. See if your schema guides it correctly.
3. **Log all function call attempts** – capture the raw JSON the LLM produced. Analyze failures to refine schemas.
4. **Keep it flat** – avoid arrays of objects unless necessary. Each nesting level increases cognitive load for the LLM.

## Open Questions

I haven't yet explored dynamic schema generation (e.g., generating schemas on-the-fly based on user intent). Does that improve accuracy or just add complexity? Also, how do you handle schema versioning when the LLM is trained on old data? These are active areas of research.

## Conclusion

Your agent is only as good as its function schemas. Invest time in parameter constraints, validation, and token efficiency. A brittle schema makes a brittle agent – and in production, that means broken workflows and angry users.

Next time your agent fails, check the schema first. 9 times out of 10, that's where the bug lives.
