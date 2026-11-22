---
title: "LLM Agent 可观测性：从 Trace 到失败分类的工程实践"
description: "拆解 LLM Agent 的可观测性：如何设计 trace/span 结构，记录 prompt 与工具输出，并建立可操作的失败分类体系。"
date: 2026-11-22
tags: ["observability", "llm-agent", "tracing", "failure-taxonomy"]
draft: false
---

## 为什么 Agent 的可观测性比普通服务难

普通微服务的 trace 是树状调用链：请求进来，经过若干 RPC，返回。Agent 的 trace 是**带状态的循环**：LLM 生成计划 → 调用工具 → 观察结果 → 再生成，直到满足终止条件。每一轮都可能改变后续所有轮次的输入。更麻烦的是，prompt 是动态拼接的，工具输出是非结构化的，失败往往不是异常，而是「看起来成功但结果不对」。

我做过一个外科手术视频分析 Agent（Surg-Agent），用 RAG 检索术式知识、调用 YOLO 检测器、再让 LLM 汇总。上线初期最痛苦的不是模型效果，而是**出了问题不知道从哪查**。后来我们把可观测性当成一等公民来设计，才把调试时间从小时级压到分钟级。

## Trace 与 Span 的结构设计

核心原则：**一次用户请求 = 一个 trace，一次 LLM 调用 / 一次工具调用 = 一个 span**。

```
trace_id: req_20240521_001
├── span: plan_step_1 (llm.generate, 1.2s, 3200 tokens)
├── span: tool.retrieve (0.3s, top_k=5)
├── span: tool.detect (0.8s, 12 objects)
├── span: plan_step_2 (llm.generate, 2.1s, 4100 tokens)
└── span: final_answer (llm.generate, 0.9s)
```

每个 span 至少记录：`span_id`、`parent_id`、`type`（llm/tool/retrieval）、`start/end`、`status`、`input_hash`、`output_summary`、`token_usage`、`model`、`temperature`。

关键细节：**不要把完整 prompt 和完整工具输出直接塞进 trace 存储**。一个 8k token 的 prompt 乘以 10 轮，单条 trace 就上百 KB，成本爆炸。我们的做法是分层：

- **热存储**：最近 7 天的完整 payload，用于即时调试。
- **冷存储**：只存 hash + 摘要 + 采样后的完整内容（比如 1% 采样）。
- **可重放**：记录所有非确定性输入（随机种子、温度、工具返回），保证能复现。

## Prompt 与工具输出的记录策略

Prompt 记录要解决两个问题：**归因**和**回归**。

归因：当最终答案错了，要能定位是哪一轮的哪个片段导致的。我们把 prompt 按模板切块，每块打上 `block_id`（system / retrieved_doc_1 / tool_result_2 / history_turn_3），span 里存 block 的 hash 和长度。这样对比两次失败时，能快速看出是检索块变了还是工具输出变了。

回归：每次改 prompt 模板，需要跑一批固定 case。我们维护一个 golden set（约 200 条），记录每条 case 的完整 trace。改完之后 diff 新旧 trace 的 span 序列，看工具调用次数、token 消耗、终止轮次是否异常漂移。

工具输出记录有个坑：**大输出要截断但保留结构**。比如检测器返回 500 个框，全存没意义。我们存 `{count: 500, top5: [...], schema_version: 2}`，同时保留原始输出的 hash，需要时从对象存储拉。

## 失败分类：从「报错」到「可行动」

Agent 的失败很少抛异常。我们按**发生位置**和**可修复性**建了一个分类表：

| 类别 | 典型表现 | 排查入口 |
|------|---------|---------|
| 规划失败 | 循环调用同一工具、提前终止 | plan_step 的 span 序列 |
| 检索失败 | 召回无关文档、漏召回 | retrieval span 的 score 分布 |
| 工具失败 | 参数 schema 错误、超时 | tool span 的 error + input |
| 幻觉 | 编造工具未返回的事实 | final_answer 与 tool output 的 entailment |
| 上下文溢出 | 截断导致早期指令丢失 | token_usage 曲线 |
| 格式失败 | JSON 解析失败、字段缺失 | 解析器 error log |

每类失败对应一个**可计算的信号**。比如规划失败，我们监控「同一工具连续调用次数 > 3」；幻觉，用一个小模型做 NLI 判断最终答案是否被工具输出支持（成本可控，只对采样 trace 跑）。

## 落地建议

1. **先埋点，再优化**。没有 trace 就不要调 prompt，否则是在盲改。
2. **span 粒度宁细勿粗**。一次 LLM 调用里如果包含多个逻辑步骤（比如先总结再决策），拆成两个 span。
3. **失败分类要能自动打标**。人工看 trace 不可扩展，至少把「工具报错」「JSON 解析失败」「超 token」做成自动标签。
4. **成本也是可观测性指标**。按 trace 聚合 token 成本，能发现某类请求在悄悄烧钱。

我还没解决好的问题：如何自动区分「规划失败」和「检索失败」——两者在 trace 上经常纠缠在一起，目前只能靠人工标注一小批再训分类器。另一个开放问题是跨 trace 的因果分析：同一个用户会话里，前一次失败是否影响了后一次。这些可能要靠更强的 session 级建模。

可观测性不是加个 dashboard 就完事，它决定了你能不能把 Agent 从 demo 推到生产。先把 trace 结构定对，后面的一切才有支点。
