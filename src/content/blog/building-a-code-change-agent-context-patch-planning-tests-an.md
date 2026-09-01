---
title: "Building a Code-Change Agent: Context, Patch Planning, Tests, and Rollback"
description: "Engineering insights into an agent that plans patches, runs tests, and rolls back safely."
date: 2026-09-01
tags: ["ai-agents", "code-change", "patch-planning", "rollback"]
draft: false
---

When I set out to build an agent that could autonomously make code changes, I quickly realized that the hard part wasn't generating a diff—it was everything around it: understanding the repository, planning a minimal patch, verifying it with tests, and rolling back if something broke. This post walks through the architecture I landed on, the tradeoffs I made, and the failure modes I've hit.

## Repository Context: The Token Budget Problem

The first challenge is giving the agent enough context about the codebase without blowing up the context window. A typical repo has thousands of files, and you can't stuff them all into a prompt. I tried several approaches:

- **Naive file listing**: Just list all files and let the agent pick. This fails for large repos because the agent has no idea what's inside each file.
- **AST-based summarization**: Parse the repo into a tree of classes, functions, and signatures. This gives a map but misses implementation details.
- **Retrieval-augmented generation (RAG)**: Embed file contents and retrieve relevant chunks based on the user's query. This works well, but chunking matters. I settled on chunk size of 512 tokens with 128 overlap, using a code-specific embedding model. For retrieval, I used a hybrid of BM25 and dense vectors, and reranked with a cross-encoder. This gave me a decent recall of relevant files.

But even with RAG, you need to be careful about the token budget. For a typical task, I allocate:
- System prompt: 500 tokens (instructions, tool definitions)
- User query: 200 tokens
- Retrieved context: 3000 tokens (about 6 chunks)
- Planning scratchpad: 1000 tokens
- Total: ~4700 tokens, leaving room for the model's response. If the context exceeds 8K, I start truncating and risk missing critical details.

## Patch Planning: From Natural Language to a Concrete Diff

Once the agent has context, it needs to propose a change. I found that asking the model to output a full diff directly is error-prone—it often produces syntactically invalid code or misses edge cases. Instead, I use a two-step approach:

1. **Plan**: The model outputs a structured plan: a list of files to modify, with a description of the change per file.
2. **Patch**: For each file, the model generates a unified diff. I validate the diff by applying it to a temporary copy of the repo and checking for conflicts.

A key insight: the model should be allowed to read the exact line ranges it plans to change. So after the plan, I feed back the relevant code snippets (from the retrieved context) and ask for the diff. This reduces hallucination.

I also enforce a "minimal change" rule: the agent must explain why each change is necessary. If it can't, I reject the plan. This prevents the agent from refactoring unrelated code.

## Tests: The Safety Net

Before applying the patch to the main branch, I run the existing test suite. But running the full suite is slow. So I use a two-tier approach:
- **Focused tests**: The agent suggests which tests are likely affected. I run those first. This is fast but risky—the agent might miss tests that break.
- **Full suite**: For critical changes, I run the entire suite. In CI, this is acceptable, but for local iteration, it's a bottleneck.

I've also experimented with generating new tests for the change. The agent can propose test cases, but I've found that generated tests often pass even when the code is broken because they mirror the implementation. So I rely more on existing tests and manual review.

## Rollback: The Last Line of Defense

Even with tests, things slip through. That's why I built a rollback mechanism. The agent works on a branch. After applying the patch and running tests, it commits. If the user reports a regression, the agent can revert to the previous commit. But reverting a commit isn't enough if there are multiple changes. So I track a "patch state"—a snapshot of the repo before the change. The rollback simply restores that snapshot.

A critical detail: the snapshot must include the dependency lock file and any generated files. I once forgot to snapshot a generated protobuf file, and the rollback left the repo in an inconsistent state.

## Failure Modes and Open Questions

I've observed several failure modes:
- **Context mismatch**: The retrieved context is about a different part of the code than what the user intended. This happens when the query is ambiguous. I mitigate by asking the user to clarify, but it's not perfect.
- **Patch conflicts**: The model generates a diff that doesn't apply cleanly because the base file has changed. I handle this by re-reading the file and asking the model to regenerate.
- **Test flakiness**: A test fails due to timing, not the change. This wastes time. I've started marking flaky tests and skipping them.

An open question: how to handle multi-file changes that require coordinated edits. My agent often proposes changes to one file at a time, but real changes span multiple files. I'm exploring a graph-based approach where the agent plans across files, but it's still early.

Another question: how to evaluate the agent's performance. I've been using a small benchmark of real GitHub issues, but it's not comprehensive. I'd love to hear how others evaluate code-change agents.

Building this agent taught me that the core value isn't the LLM's ability to write code—it's the engineering around it: context management, validation, and safety. The agent is only as good as its ability to understand the repo and recover from mistakes.
