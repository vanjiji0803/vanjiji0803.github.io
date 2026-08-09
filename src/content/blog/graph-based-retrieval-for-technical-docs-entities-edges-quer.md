---
title: "Graph-based retrieval for technical docs: entities, edges, query planning"
description: "Exploring graph RAG for technical docs: entity extraction, edge building, query planning, and tradeoffs."
date: 2026-08-09
tags: ["graph-rag", "retrieval", "knowledge-graph", "query-planning"]
draft: false
---

When I moved from surgical computer vision to building RAG systems for technical documentation, I quickly hit the limits of vanilla vector search. Chunking a 200-page API reference into 512-token pieces and embedding them works for simple Q&A, but fails when a question spans multiple sections: "How does the authentication middleware interact with the rate limiter?" The answer lives in two different chunks, and a dense retriever often returns one and misses the other. That's why I started experimenting with graph-based retrieval.

## Why graphs for technical docs?

Technical documents are inherently relational. Entities (APIs, modules, configs, protocols) have explicit links: function A calls function B, config X overrides default Y, error code Z is thrown by service W. A knowledge graph captures these relationships explicitly, whereas a vector index captures them only implicitly (and often poorly).

But building a graph is not free. You need to extract entities and relations from text, which is noisy and expensive. The key is to decide what level of granularity: fine-grained (every function, every parameter) is overkill; coarse-grained (module, service, concept) might miss critical details. I've found a middle ground: extract entities at the level of "concepts" (e.g., authentication, rate limiter, middleware) and relations as "verbs" (e.g., uses, overrides, throws).

## Entity and edge extraction: practical notes

I've tried two approaches: LLM-based extraction and rule-based extraction. LLM-based is more flexible but has a failure mode: it hallucinates relations that don't exist. For example, it might infer "rate limiter uses Redis" when the document only mentions Redis in passing. To mitigate, I use a two-pass approach: first, extract candidate triples with a low-temperature LLM; second, validate each triple against the source text using a simple entailment check (another LLM call or a regex-based check for explicit mentions). This cuts false positives significantly.

Rule-based extraction works well for structured docs like OpenAPI specs or protobuf definitions, where relations are explicit (e.g., `imports`, `defines`, `implements`). For prose, it's less reliable. I've had success with a hybrid: rules for structured parts, LLM for prose, then merge.

## Query planning: from natural language to graph traversal

Once you have a graph, retrieval becomes a planning problem. A naive approach is to embed the query, find the most similar entities, and then do a 1-hop or 2-hop expansion. But that often misses the relational context. Better is to parse the query into a graph pattern. For example, "How does authentication interact with rate limiting?" becomes a pattern: (auth)-[?]->(rate_limiter). Then you can search for paths of length 1-3 between these entities.

I've implemented a simple planner that uses an LLM to extract the key entities and the intended relation from the query. It outputs a structured query like `{entities: ["authentication", "rate_limiter"], relation: "interact"}`. Then I translate that into a Cypher query if using Neo4j, or a custom traversal over an in-memory graph. The tradeoff: LLM-based planning adds latency (2-3 seconds per query) and can fail on ambiguous queries. For a fallback, I keep a keyword-based planner that just extracts entities via a small NER model.

## Retrieval and reranking: combining graph and vector

Pure graph retrieval can miss documents that are relevant but not directly connected. So I combine: first, retrieve candidate chunks via vector similarity; second, expand with graph neighbors of the entities found in those chunks; third, rerank the union using a cross-encoder. This hybrid approach improved my hit rate on a set of 50 technical queries from 60% to 85% (measured by manual relevance judgment). The cost is more retrieval latency: vector search (~50ms) + graph expansion (~200ms) + reranking (~500ms) = ~750ms, which is acceptable for an internal tool.

## Evaluation: what to measure

I don't trust end-to-end answer accuracy alone, because it conflates retrieval with generation. I evaluate retrieval in isolation using a set of queries with known relevant chunks. Metrics: recall@k (does the answer appear in the top k?), and mean reciprocal rank (MRR). For graph-specific evaluation, I check whether the graph traversal finds the correct path. I've built a small eval set of 30 queries that require multi-hop reasoning, and I track how often the planner extracts the right entities and relations.

## Failure modes and open questions

Graph retrieval has its own failure modes. One is over-expansion: if you do 2-hop expansion on a densely connected graph, you might retrieve half the corpus. I mitigate with a max node limit and edge weight thresholds. Another is stale graphs: documents change, and the graph becomes outdated. I haven't solved incremental updates yet; I rebuild the graph nightly, which is fine for static docs but not for live wikis.

An open question: how to handle queries that don't map to any entity? For example, "What are the best practices for error handling?" — that's a concept, not an entity. I've found that falling back to pure vector search works, but it's not ideal. I'm experimenting with adding a "topic" node type that clusters related entities, but it's early days.

## Implementation details

For the graph store, I've used both Neo4j and an in-memory NetworkX graph. Neo4j is robust but adds infrastructure overhead; for a small corpus (<10k nodes), in-memory is faster and simpler. For entity extraction, I use a fine-tuned BERT-based NER model for technical terms, plus an LLM for relation extraction. The LLM calls are batched to reduce cost.

One concrete tip: when chunking documents for the vector index, I include the entity names as metadata, so I can map chunks to graph nodes. This makes the graph-vector bridge trivial.

Graph-based retrieval is not a silver bullet. It adds complexity and maintenance burden. But for technical docs where relationships matter, it's a significant improvement over pure vector search. I'm still exploring how to make the planner more robust and the graph more self-updating. If you've tackled similar problems, I'd love to hear how you handled query planning and graph maintenance.
