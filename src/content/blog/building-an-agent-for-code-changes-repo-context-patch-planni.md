---
title: "Building an Agent for Code Changes: Repo Context, Patch Planning, Tests, Rollback"
description: "Engineering lessons from building a code-change agent: context, patch planning, test gates, and rollback."
date: 2026-08-11
tags: ["ai-agents", "code-generation", "llm", "devtools"]
draft: false
---

I've spent the last few months building an agent that takes a GitHub issue, reads the repo, plans a patch, writes code, runs tests, and – if things go wrong – rolls back. It's harder than it looks. Here are the engineering decisions that mattered, and the ones that bit me.

## Repository Context: Don't Stuff Everything into the Prompt

At first, I tried to feed the entire repo into the context window. Bad idea. Even with a 200k-token context, you blow the budget, and the model gets lost in irrelevant files. Instead, I built a retrieval layer:

- **Index**: Use `tree-sitter` to parse the repo into a graph of symbols (functions, classes, imports). Store in a vector DB (e.g., Chroma) with embeddings per symbol, plus metadata like file path and line numbers.
- **Query**: Given the issue text, retrieve the top-k symbols by cosine similarity, then expand to include their dependencies (imports, callers). For a typical repo, that's about 50-100 symbols, which fits in ~20k tokens.
- **Chunking**: For each symbol, store the function signature and docstring as the embedding source, but include the full body when retrieved. This keeps retrieval precise and the prompt compact.

**Tradeoff**: Retrieval quality is only as good as the embedding model. CodeBERT or `text-embedding-3-small` work okay, but they miss semantic matches like "user authentication" vs. a function named `login_user`. I added a keyword fallback (BM25) and a reranker (cross-encoder) to improve precision. It's not perfect – still miss things when the issue uses domain jargon not in the code.

## Patch Planning: Think in Diffs, Not Code

Instead of asking the model to output the final file, I ask it to plan a sequence of diffs. Each diff is a structured edit: `file`, `old_snippet`, `new_snippet`. This forces the model to reason about changes incrementally and makes it easier to validate.

For the planning step, I use a separate LLM call with a prompt that includes the issue, the retrieved context, and a template for the plan. The plan is a list of steps: "Add a new function `validate_email` in `utils.py`", "Modify `User.signup` to call it", etc. Then I generate each diff one at a time, feeding the previous diffs back as context.

**Why diffs?** Because you can apply them to the repo, run tests, and if a test fails, you can revert just that diff. Whole-file generation is a black box – you can't isolate the breaking change.

**Failure mode**: The model sometimes generates diffs that don't apply cleanly (whitespace, context mismatch). I use a fuzzy matching algorithm (Levenshtein-based) to find the best location, but it still fails ~10% of the time. I've learned to treat the patch application as a separate step with its own error handling: if it fails, retry with a more specific context or ask the model to regenerate.

## Test Gates: The Safety Net

Before applying any patch, I run the existing test suite. Then after each diff, I run a targeted subset: tests that touch the modified files or symbols. I use `pytest` with `-k` to filter by file or test name. This is the gate: if tests fail, I either roll back that diff or ask the model to fix it (with the test failure message in the prompt).

**Latency**: Running the full suite on a large repo can take minutes. I made it configurable: for quick iteration, run only unit tests; for final validation, run the full suite. Also, I cache test results per commit hash to avoid rerunning unchanged tests.

**Tradeoff**: Tests are only as good as they are comprehensive. If the repo has sparse tests, the gate is weak. I've considered adding property-based tests or mutation testing, but that's a rabbit hole. For now, I rely on the existing tests and a final human review.

## Rollback: Git is Your Friend

Every patch is applied on a branch. After the agent finishes, it creates a PR. If the PR fails CI or the human reviewer rejects it, we simply close the PR – no rollback needed. But for local iteration, I use `git stash` or `git checkout` to revert changes. The key is to commit after each successful diff, so you can `git revert` a specific commit if a later change breaks something.

**Edge case**: If the agent modifies files that are not tracked (e.g., generated files), `git checkout` won't revert them. I explicitly add those to `.gitignore` or handle them separately.

**Failure mode**: The agent might delete a file or rename it, and the diff application fails because the old snippet is gone. I've added a pre-check: before applying a diff, verify the old snippet exists in the current file. If not, abort and ask the model to regenerate.

## Model Selection and Cost

I use GPT-4o for planning and diff generation, and GPT-4o-mini for retrieval and summarization. The cost per task is roughly $0.50-$2.00, depending on repo size. For large repos, I've experimented with Claude 3.5 Sonnet, which seems better at long-context reasoning, but it's slower. I haven't tried local models yet – the quality gap is still too big for production use.

## Open Questions

- **How to handle multi-file refactors?** The diff approach works for local changes, but a refactor that touches 20 files with cross-cutting concerns often fails because the model loses track. I'm exploring a graph-based planner that reasons about dependencies.
- **How to evaluate the agent?** I'm building a benchmark of real GitHub issues with known patches, but it's hard to avoid overfitting. I'd love to hear how others evaluate code agents.
- **Should the agent write tests?** Right now it only runs existing tests. I've tried asking it to write new tests, but they're often trivial or wrong. Maybe a separate test-generation step is needed.

Building this agent taught me that the hard part isn't the LLM – it's the engineering around it: context management, patch validation, and safety nets. The LLM is just a component; the system is what makes it reliable.
