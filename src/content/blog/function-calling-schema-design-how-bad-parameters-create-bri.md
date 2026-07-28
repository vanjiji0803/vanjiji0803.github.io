---
title: "Function Calling Schema Design: How Bad Parameters Create Brittle Agents"
description: "Why sloppy function schemas break agents, and how to design robust parameters."
date: 2026-07-28
tags: ["function-calling", "agents", "llm", "schema-design"]
draft: false
---

Function calling is the backbone of modern LLM agents. It lets the model interact with APIs, databases, and tools. But a poorly designed function schema is like a house of cards: one bad parameter, and the whole agent collapses.

## The Problem: Brittle Agents

A brittle agent fails on edge cases, hallucinates tool calls, or gets stuck in loops. The root cause is often the function schema itself. If parameters are ambiguous, have overlapping semantics, or are missing constraints, the LLM will produce invalid or unexpected arguments.

Consider a simple weather function:
```json
{
  "name": "get_weather",
  "parameters": {
    "type": "object",
    "properties": {
      "location": { "type": "string" },
      "unit": { "type": "string" }
    },
    "required": ["location"]
  }
}
```
The LLM might pass `"unit": "celcius"` (typo) or `"location": "Paris, France, Europe"` (too verbose). Without validation, the agent crashes or returns nonsense.

## Concrete Failure Modes

### 1. Missing Enums and Constraints

If `unit` isn't constrained, the LLM may invent values. Always use `enum` for closed sets:
```json
"unit": { "type": "string", "enum": ["celsius", "fahrenheit"] }
```

### 2. Overly Permissive Strings

A `"location"` string can be anything. Use patterns or format hints. For example, `"pattern": "^[A-Za-z ]+$"` or `"description": "City name, e.g., 'Beijing'"`.

### 3. Ambiguous Boolean Parameters

A boolean `"send_email"` might be misinterpreted. Use explicit strings with enums: `"email_notification": { "type": "string", "enum": ["yes", "no"] }`.

### 4. Too Many Optional Parameters

Each optional parameter increases the chance of a hallucinated argument. Keep the parameter count low. If you need many, group them into a single object parameter with nested properties.

## Design Principles

### Be Explicit About Defaults

If a parameter has a default, state it in the description: `"description": "Temperature unit, defaults to celsius"`. The LLM can then omit it when not needed.

### Use Descriptions Wisely

Descriptions are not just for humans. They guide the LLM. Write clear, concise descriptions that disambiguate similar parameters. For example:
```json
"start_date": { "type": "string", "description": "ISO 8601 date, e.g., 2024-01-01" },
"end_date": { "type": "string", "description": "ISO 8601 date, must be after start_date" }
```

### Validate on the Backend

Even with perfect schemas, LLMs make mistakes. Always validate parameters server-side. Return clear error messages that the agent can parse and retry. For instance, return `{"error": "Invalid unit, must be celsius or fahrenheit"}`.

## Evaluation of Schema Quality

How do you know your schema is good? Test with adversarial prompts. Ask the LLM to call the function with missing required fields, extra fields, or edge cases. Measure:
- **Validity rate**: % of calls that pass validation.
- **Retry count**: how many attempts before success.
- **Hallucination rate**: % of calls with invented parameters.

A good schema should achieve >95% validity on first try with a capable model like GPT-4 or Claude 3.5.

## Edge Cases to Consider

- **Empty strings**: Should `"location": ""` be allowed? Probably not. Use `minLength: 1`.
- **Null vs. omitted**: Some models send `"unit": null` instead of omitting it. Decide if null is valid.
- **Array parameters**: If a parameter is an array, define `minItems` and `maxItems` to prevent huge lists.

## A Practical Example: RAG Agent

In my Surg-Agent project, I have a function `search_knowledge_base`:
```json
{
  "name": "search_knowledge_base",
  "parameters": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "Search query, 1-5 words", "minLength": 1, "maxLength": 100 },
      "top_k": { "type": "integer", "description": "Number of results to return", "default": 5, "minimum": 1, "maximum": 20 }
    },
    "required": ["query"]
  }
}
```
This schema prevents overly long queries (which waste tokens) and caps the result count (avoiding context overflow).

## Conclusion

Function schema design is an engineering discipline. Treat it with the same rigor as API design. A well-crafted schema reduces agent failures, lowers latency (fewer retries), and improves user trust. Next time you build an agent, spend an extra hour on the schema—it will save you days of debugging.

I'm still exploring how to dynamically generate schemas from user intent. If you have experience with that, I'd love to hear about it.
