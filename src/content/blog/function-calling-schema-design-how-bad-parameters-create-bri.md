---
title: "Function Calling Schema Design: How Bad Parameters Create Brittle Agents"
description: "Exploring how poorly designed function schemas cause agent failures and how to fix them with practical examples."
date: 2026-09-07
tags: ["function-calling", "agent-design", "llm", "schema"]
draft: false
---

Function calling is the backbone of many LLM-based agents. It's how the model turns natural language into structured actions. But I've seen countless agents break not because of the model, but because of the schema. A poorly designed parameter list is a silent killer. Let's talk about why.

## The Problem: Ambiguity and Overload

Consider a simple function for a weather agent:

```json
{
  "name": "get_weather",
  "parameters": {
    "type": "object",
    "properties": {
      "location": {"type": "string"},
      "date": {"type": "string"}
    }
  }
}
```

Looks fine, right? But what does `location` mean? A city name? A zip code? Coordinates? The LLM might guess. And `date` – is it "today", "tomorrow", or an ISO string? The model will often output something like "next Monday" because it's natural. Then your parser fails, or worse, the API returns nonsense.

The core issue is that LLMs are probabilistic. They don't read your schema like a compiler. They infer from descriptions and examples. If your schema is ambiguous, the model will fill the gaps with its own assumptions, leading to inconsistent calls.

## Concrete Failure Modes

I've seen three common failure modes:

1. **Enum misuse**: You define `unit` as a string, but the valid values are `celsius` and `fahrenheit`. The model outputs `C` or `F`. Your code rejects it, and the agent crashes. Fix: use `enum` in the schema, and provide examples.

2. **Overly complex nested objects**: You have a `filter` parameter that takes an object with multiple nested fields. The model often produces malformed JSON or misses required subfields. Fix: flatten the schema or provide a clear template.

3. **No defaults**: If a parameter is optional but the model omits it, your code might use a default. But if you don't specify defaults, the model might invent one. For example, a `limit` parameter without a default – the model might output `limit: 1000` when you only support 10.

## The Role of Descriptions and Examples

Your schema is a prompt. The `description` field is not just documentation – it's guidance. I've found that writing descriptions as if I'm instructing a junior engineer helps. For instance:

```json
{
  "name": "search_products",
  "parameters": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Search query. Use keywords, not natural language. For example, 'red shoes' not 'I want red shoes'."
      },
      "category": {
        "type": "string",
        "enum": ["shoes", "apparel", "accessories"],
        "description": "Product category. Optional. If omitted, search all categories."
      },
      "max_results": {
        "type": "integer",
        "minimum": 1,
        "maximum": 20,
        "default": 10,
        "description": "Maximum number of results to return. Defaults to 10."
      }
    },
    "required": ["query"]
  }
}
```

Notice the explicit defaults, ranges, and examples. This reduces the model's freedom to guess.

## Validation and Retry: The Safety Net

Even with a perfect schema, the model will occasionally output invalid parameters. That's why you need a validation layer. I use Pydantic for this. If validation fails, I don't just crash – I feed the error back to the model and ask it to correct itself.

For example, if the model outputs `unit: "C"` and validation fails, I send back:

```
The 'unit' parameter must be one of 'celsius' or 'fahrenheit'. You provided 'C'. Please correct.
```

This often fixes the issue in one retry. But be careful: too many retries can cause loops. Set a max retry count (I use 2) and then fall back to a safe default.

## Evaluation: Test with Realistic Prompts

You can't just test with one prompt. I create a test set of 50-100 realistic user queries that cover edge cases. For each, I check:

- Does the model call the correct function?
- Are the parameters valid per the schema?
- Does the function execute successfully?

I also measure the retry rate. If more than 10% of queries need a retry, my schema is too ambiguous. I then refine descriptions or add constraints.

One thing I haven't tried yet is using a separate LLM to evaluate the quality of the schema itself. That's an open question – can we automate schema design? Maybe.

## Trade-offs and Open Questions

There's a tension between giving the model flexibility and constraining it. Too many constraints might make the model fail to map user intent to parameters. For example, if you require a `date` in ISO format, the model might not recognize "tomorrow" as a valid input. You could add a preprocessing step to convert relative dates, but that adds complexity.

Another trade-off is between one big function with many optional parameters versus many small functions. I've found that many small functions are easier to validate and debug, but they increase the chance of the model choosing the wrong one.

Finally, consider the context window. Each function schema consumes tokens. If you have 10 functions with detailed descriptions, that's a lot of overhead. You need to balance schema richness with the model's attention span.

## Conclusion

Function calling schemas are not just API definitions – they are part of your prompt engineering. A brittle schema leads to brittle agents. Invest time in writing clear descriptions, using enums and defaults, and validating output. Your agent will thank you.

If you've faced similar issues, I'd love to hear how you solved them. Let's make agents less brittle, one schema at a time.
