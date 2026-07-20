---
title: "Building a Code-Change Agent: Context, Planning, Tests, Rollback"
description: "Engineering an AI agent that modifies codebases: repository context, patch planning, test validation, and safe rollback."
date: 2026-07-20
tags: ["ai-agent", "code-generation", "software-engineering"]
draft: false
---

I recently built a prototype agent that takes a natural language change request and produces a tested, reviewed code patch. The goal is not to replace developers but to automate routine refactors, dependency bumps, and bug fixes. This post covers the key components: repository context ingestion, patch planning, test execution, and rollback safety.

## Repository Context Ingestion

An agent can't edit code without understanding the codebase. I use a two-level approach:

- **Static analysis**: Parse the AST (using tree-sitter) to extract function signatures, class definitions, imports, and call graphs. This gives a structural map without running the code.
- **Retrieval**: For a given change request, retrieve relevant code snippets using embedding similarity (code-bert) over function bodies and docstrings. I chunk at function level (not file level) to keep context precise.

**Token budget**: The agent's context window (e.g., 8K tokens for GPT-4) must hold the change request, retrieved snippets, and the planning output. I limit retrieved snippets to 3-5 functions (~2K tokens) to leave room for reasoning.

**Failure mode**: If retrieval misses a key function, the patch may break imports or call signatures. I mitigate by also retrieving the file's import section and top-level declarations.

## Patch Planning

The agent outputs a structured plan before writing code:

```
Plan:
1. Update function `calculate_total` in `billing.py` to include tax parameter.
2. Modify call sites in `order.py` and `invoice.py` to pass the new argument.
3. Update unit tests in `test_billing.py`.
```

This plan is fed back into the LLM to generate the actual diff. I use a diff format (unified diff) rather than full file replacement to minimize token usage and reduce hallucination risk.

**State machine**: The agent runs in a loop: plan -> generate diff -> validate syntax -> run tests -> if fail, analyze error and regenerate. The loop has a max of 3 iterations to avoid infinite loops.

**Edge case**: When the plan is wrong (e.g., missing a call site), the agent must detect test failures and adjust. I've found that providing the full test output (not just pass/fail) helps the LLM debug.

## Test Execution and Validation

Tests are run in a sandboxed Docker container. The agent receives stdout/stderr and exit code. Common failures:

- **Syntax errors**: The agent forgot to close a parenthesis. I catch this with a quick `ast.parse` before running tests.
- **Import errors**: The agent renamed a function but missed an import. The error traceback pinpoints the line.
- **Logic errors**: The agent changed behavior unintentionally. Unit tests should catch these, but if coverage is low, the agent may introduce subtle bugs.

**Evaluation**: I measure success rate on a benchmark of 50 small GitHub issues (e.g., "rename method X to Y", "add parameter Z"). Current success rate is ~70% after 3 attempts. Failures are mostly due to missing context or complex multi-file changes.

## Rollback Safety

Before applying any change, the agent creates a git stash or branch. If tests fail after all retries, it automatically reverts. The user can also manually rollback via a command.

**Observability**: Every step (plan, diff, test output) is logged to a file. I use a simple JSON log that can be replayed to debug failures.

## Open Questions

- How to handle large refactors that touch 10+ files? Token limits become a bottleneck.
- Should the agent propose multiple alternative patches and let the user choose? That adds complexity but may improve quality.
- How to incorporate code review feedback? I'm experimenting with a second agent that reviews the diff and suggests improvements before finalization.

I haven't tried integrating with CI/CD pipelines yet, but that's the next step. The goal is to make the agent a reliable pair programmer for repetitive code changes.
