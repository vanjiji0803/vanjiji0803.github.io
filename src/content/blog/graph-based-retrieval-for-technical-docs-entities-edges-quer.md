---
title: "Graph-based retrieval for technical docs: entities, edges, query planning"
description: "A practical look at building a knowledge graph for RAG: chunking, entity extraction, edge types, and query planning with tradeoffs."
date: 2026-08-29
tags: ["rag", "knowledge-graph", "retrieval", "llm"]
draft: false
---

Most RAG systems I've seen treat documents as a flat pile of chunks. You embed them, build a vector index, and hope the top-k hits contain the answer. That works fine for FAQ-style queries, but technical documentation is different: it's full of entities (APIs, configs, error codes) and relationships ("depends on", "overrides", "causes"). A flat vector search often misses the connection between two chunks that are semantically distant but structurally linked.

I've been experimenting with a hybrid approach: build a lightweight knowledge graph on top of the chunks, then use the graph to guide retrieval. The idea isn't new, but the engineering details matter. Here's what I've learned.

## Chunking with entity anchors

The first step is still chunking, but instead of fixed-size windows, I anchor chunks around entity mentions. I run a lightweight NER model (or even a regex-based extractor for code identifiers) to find entities like function names, class names, error codes, and config keys. Then I split the document so that each chunk contains a coherent set of entities and their surrounding context. This creates chunks that are semantically dense but also graph-friendly: each chunk becomes a node, and entities become properties or separate nodes.

For example, in a Kubernetes doc, a chunk might contain the Deployment spec and reference the `replicas` field, the `RollingUpdate` strategy, and the `maxSurge` parameter. These entities can be linked to other chunks that explain them in detail.

## Edge types: more than just "related"

A naive graph would connect chunks with a generic "related" edge. That's not very useful for query planning. I've found it worth the effort to extract typed edges. Some examples:

- **depends_on**: Chunk A references a component that is defined in Chunk B.
- **overrides**: Chunk A describes a default value that Chunk B overrides in a specific scenario.
- **causes**: Chunk A describes an error condition that leads to Chunk B's troubleshooting steps.
- **part_of**: Chunk A is a subsection of a larger concept in Chunk B.

Extracting these edges automatically is hard. I've used LLMs to classify relationships between entity pairs, but it's expensive and error-prone. A cheaper approach is to use syntactic patterns: "X depends on Y", "X overrides Y", "X causes Y". For code, you can parse import statements, function calls, and config inheritance. It's not perfect, but it gets you a decent graph without breaking the bank.

## Query planning: from natural language to graph traversal

Once you have the graph, the retrieval problem becomes: given a query, which nodes should I retrieve? I use a two-step process:

1. **Entity linking**: Extract entities from the query (again using NER or LLM) and map them to graph nodes.
2. **Graph expansion**: Start from those seed nodes and traverse edges to find neighboring chunks. The traversal can be weighted by edge type and distance.

For example, a query like "Why does my Deployment hang when I set maxSurge to 0?" would extract `Deployment`, `maxSurge`, and maybe `hang`. The graph might have a `causes` edge from a chunk about `maxSurge=0` to a troubleshooting chunk. That's exactly what you want.

But there's a tradeoff: graph traversal can explode. If you traverse too many hops, you retrieve irrelevant chunks. I limit expansion to 2 hops and only follow edges that have a high confidence score (if you have one).

## Evaluation: it's not just about recall

I've evaluated this approach on a small set of technical docs (about 500 pages) with 50 queries. I compared three retrieval methods: pure vector, vector + reranker, and graph-guided (vector + graph expansion). The graph-guided approach improved recall@5 by about 15% over vector-only, but the bigger win was in answer quality: the LLM generated fewer hallucinations because it had the right context.

However, there's a failure mode: if the entity extraction or edge classification is wrong, the graph can mislead the retrieval. I've seen cases where a spurious `causes` edge pulled in a completely irrelevant chunk. So I always combine graph retrieval with a vector fallback: retrieve top-k from both and merge, then rerank.

## Implementation details

I use Neo4j for the graph (it's easy to query with Cypher), but you could use a simpler in-memory graph if your docs are small. For entity extraction, I've tried both spaCy and a fine-tuned BERT; spaCy is fast but misses domain-specific terms. I ended up using a hybrid: spaCy for general entities, plus a regex list for code identifiers.

For the LLM call to classify edges, I batch pairs and use a low temperature. It costs about 0.1 cents per pair, which is acceptable for a one-time build.

## Open questions

I haven't yet figured out how to update the graph incrementally when docs change. Rebuilding the whole graph is expensive. Also, the query planning is still quite naive—I'd like to use a small LLM to generate a Cypher query directly, but I'm worried about reliability. If you've tried that, I'd love to hear.

Graph-based retrieval isn't a silver bullet, but for technical docs with clear entities and relationships, it's a valuable addition to the RAG stack. The key is to keep it simple: start with a few edge types, limit traversal depth, and always have a vector fallback.
