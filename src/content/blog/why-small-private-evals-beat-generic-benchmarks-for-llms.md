---
title: "Why Small Private Evals Beat Generic Benchmarks for LLMs"
description: "Generic benchmarks often misalign with real tasks; small private evals offer targeted, cost-effective signal."
date: 2026-07-19
tags: ["llm", "evaluation", "benchmarks", "practical"]
draft: false
---

When I started working with LLMs in production—first for surgical agents, then for RAG pipelines—I quickly learned that public benchmarks like MMLU, HellaSwag, or HumanEval are poor proxies for real-world performance. A model that scores 90% on MMLU can still hallucinate anatomy facts in a surgical context or fail to follow a multi-step retrieval plan. The disconnect is so common that many teams now maintain small, private evaluation sets that cost a fraction of the compute but yield far more actionable signal.

## Why Public Benchmarks Fall Short

Public benchmarks are designed for general capability measurement. They test broad knowledge, reasoning, or coding skill, but they don't capture the specific failure modes of your application. For example, a surgical agent needs to understand temporal ordering of steps, handle missing sensor data, and refuse unsafe actions. MMLU has no such examples. Moreover, benchmarks are often contaminated: models may have seen the exact questions during training, inflating scores. Finally, they are static—once a model saturates a benchmark, the metric loses discriminative power.

## The Case for Small Private Evals

A private evaluation set of 100–500 carefully curated examples, aligned with your task distribution, can detect regressions and nuances that generic benchmarks miss. I've seen a 5% drop on a private set of 200 surgical Q&A pairs that correlated perfectly with a 15% increase in user-reported errors in a pilot study, while MMLU showed no change. The key is to design examples that cover edge cases: ambiguous queries, out-of-distribution inputs, multi-hop reasoning chains, and adversarial prompts. This is cheap—labeling 200 examples with a domain expert costs ~$200–$500 and takes a day. Running inference on them costs pennies.

## How to Build One

Start by logging real user queries and failure cases from your system. Cluster them by pattern (e.g., "model ignores temporal constraint", "model invents drug interaction"). For each cluster, write 10–20 examples that isolate the failure mode. Include both positive (expected to pass) and negative (expected to fail) examples. Use a rubric with binary or Likert-scale scoring. Automate evaluation by comparing model outputs to reference answers or using a judge LLM (e.g., GPT-4) with a strict prompt. Track pass rates per cluster over time.

## Tradeoffs and Pitfalls

Small evals can overfit to your current data distribution. If you only test on surgical queries, you might miss a regression in general instruction following. Mitigate this by maintaining a small "diversity set" of 50 generic but hard examples (e.g., from adversarial public benchmarks). Also, small sets have higher variance: a single fluke failure can swing metrics by 5%. Run multiple seeds or use bootstrap confidence intervals. Finally, avoid leaking private eval examples into training data—hash them and check against training corpora.

## Evaluation in Practice

At my current project, we run a nightly eval on 300 private examples across five categories: factual accuracy, instruction following, safety, retrieval quality, and planning coherence. The entire pipeline takes under 10 minutes and costs <$0.50. We catch regressions within hours of a model update. In contrast, running the full MMLU suite (14k questions) costs ~$5 and gives us no actionable signal for our domain. The ratio of signal to cost is orders of magnitude better with the private set.

## Open Questions

I haven't yet solved how to automatically expand a private eval set as new failure modes emerge without manual curation. Some teams use adversarial generation with a strong LLM to propose new examples, but quality control remains manual. Another open problem: how to weight different clusters when the real-world distribution shifts over time. For now, I treat private evals as a living document, updated monthly with input from domain experts and user feedback.

If you're deploying an LLM for a specific task, invest in a small private eval. It's the most cost-effective way to know if your model is actually getting better—or just memorizing the leaderboard.
