---
title: "Graph-Based Retrieval for Technical Docs: Entities, Edges, and Query Planning"
description: "How to build a graph RAG system for technical documents, covering entity extraction, edge construction, and query planning with concrete tradeoffs."
date: 2026-07-18
tags: ["rag", "graph", "retrieval", "technical-docs"]
draft: false
---

## Why Graph Retrieval for Technical Docs?

Standard RAG with dense embeddings struggles on technical documents: APIs, configuration files, or hardware specs have dense cross-references (e.g., a function calling a struct, a config key depending on a version). A flat chunk retrieval loses these relations. Graph-based retrieval explicitly models entities (functions, parameters, error codes) and edges (calls, extends, requires) to enable multi-hop reasoning.

## Entity Extraction: Precision vs. Recall

We need to decide: what counts as an entity? For a CUDA doc, entities might be kernel names, launch parameters, error codes. For a surgical robot API, they could be commands, sensor IDs, safety thresholds.

**Approach 1: Regex + grammar** – Fast, deterministic. Works for well-structured docs (e.g., Python function signatures). But fails on free-form descriptions.

**Approach 2: LLM-based extraction** – More flexible. Prompt: "Extract all technical entities (function names, parameters, error codes, version strings) from the following text." Then deduplicate with fuzzy matching (Levenshtein). Cost: ~0.5¢ per doc page (GPT-4o). Latency: 2-3s per page.

**Tradeoff**: Regex is 10x cheaper but misses ~20% of entities in my tests on NVIDIA docs. LLM catches >95% but introduces hallucination risk (e.g., inventing a parameter name). Mitigation: cross-check extracted entities against a known dictionary (e.g., API spec).

## Edge Construction: Which Relations Matter?

Edges define the graph structure. Common types:
- **depends_on**: A function calls another function.
- **inherits**: Class A extends class B.
- **configures**: A parameter sets a value for a module.
- **version_of**: API v2 supersedes v1.

**Extraction**: Use LLM to identify relation triplets: (entity1, relation, entity2). For example: ("cudaMalloc", "depends_on", "cudaError_t").

**Edge weighting**: Not all edges are equal. A "depends_on" edge in a critical code path should have higher weight than a "mentions" edge. We assign a weight based on frequency in the doc or manual curation.

**Failure mode**: Overly dense edges create a noisy graph. For a 100-page doc, we may get 5000 edges. Filter by weight (keep top 30%) or relation type (e.g., only "depends_on" and "inherits").

## Query Planning: From Natural Language to Graph Traversal

Given a user query like "How to handle memory allocation failure in CUDA?", we need to:
1. **Entity linking**: Extract query entities ("memory allocation", "CUDA", "failure"). Map to graph nodes (e.g., "cudaMalloc", "cudaErrorMemoryAllocation").
2. **Subgraph selection**: Start from matched nodes, expand via edges (e.g., from "cudaMalloc" to "cudaError_t" via "returns" edge).
3. **Multi-hop expansion**: Use BFS with depth limit (e.g., 2 hops). For each node, retrieve its chunk text.

**Implementation detail**: Use a graph DB (Neo4j) or an adjacency list in memory. For a doc with <10K nodes, in-memory is fine. Query latency: entity linking (LLM call ~1s) + graph traversal (~10ms) + chunk retrieval (~50ms). Total ~1.1s.

**Token budget**: Each hop adds ~500 tokens of context. With 3 hops, we get ~1500 tokens. Combine with original query: ~2000 tokens. That fits most LLM context windows.

## Evaluation: How to Know It Works?

We need a test set of queries that require multi-hop reasoning. For example:
- Q: "What error does cudaMalloc return on insufficient memory?" A: "cudaErrorMemoryAllocation" (1 hop: entity -> edge).
- Q: "How to gracefully handle cudaErrorMemoryAllocation in a loop?" A: Requires retrieving error handling pattern (2 hops: error code -> pattern).

**Metrics**:
- **Hit rate**: % of queries where answer is in top-3 retrieved chunks. Compare to dense retrieval (e.g., BGE-M3). Expect +15-20% for multi-hop queries.
- **Latency**: Graph retrieval adds ~200ms vs dense retrieval. Acceptable for interactive use.

**Failure analysis**: If a query fails, check if entity linking missed a synonym (e.g., "memory alloc failure" vs "cudaMalloc error"). Add synonym dictionary.

## Edge Cases and Practical Tips

- **Versioned docs**: Entities like "API v2" vs "API v3" should be separate nodes with "supersedes" edge. Query planning must respect version context.
- **Ambiguous entities**: "error" could be a parameter name or an error code. Disambiguate with type tagging (e.g., "param:error" vs "code:error").
- **Graph size**: For a 500-page technical manual, expect ~2000 entities and ~8000 edges. Neo4j handles it easily, but for edge deployment (NVIDIA IGX), use in-memory adjacency list with numpy arrays.

I haven't tried graph retrieval for surgical agent (Surg-Agent) yet, but it seems promising for instrument tracking commands (e.g., "move arm to position X" requires knowing coordinate system, safety limits, and error states). The same principles apply.

## Open Question

How to automatically determine optimal hop depth per query? Fixed depth (e.g., 2) works for most, but some queries need 3 hops. Maybe use a classifier: if query contains "error handling" or "workflow", increase depth to 3. Let me know if you have tried adaptive depth.
