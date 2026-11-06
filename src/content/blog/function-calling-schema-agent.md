---
title: "Function calling Schema 设计：坏参数如何让 Agent 变脆"
description: "从参数粒度、枚举、可空字段到错误语义，拆解 function calling schema 的常见坑，以及它们如何让 Agent 在边界条件下崩掉。"
date: 2026-11-06
tags: ["function-calling", "agent", "schema", "llm"]
draft: false
---

做 RAG 或 Agent 时，最容易被低估的工程细节是 function calling 的 schema。模型不是编译器，它靠 token 概率去“猜”参数；schema 里任何一个模糊点，都会在长链路里被放大成重试、幻觉或死循环。下面按我踩过的坑聊几个具体机制。

**参数粒度：别把结构塞进字符串**

最常见的坏味道是 `query: string` 里塞 JSON，或者 `filter: string` 让模型自由发挥。模型对自由文本的约束力远低于对 JSON Schema 的约束力。比如检索工具写成 `search(query, filter)`，filter 是 `"price>100 AND category=book"`，模型会编出不存在的字段，解析层再抛异常。改成 `filter: {price_min: number, category: enum}` 后，非法字段在 schema 层就被挡住。代价是工具数量变多、prompt 变长，但换来的是可预测性。我的经验：一个参数如果内部有结构，就展开成 object；如果取值有限，就用 enum。

**enum 与 oneOf：给模型“选择题”而不是“填空题”**

`action: string` 是另一个高频坑。模型会输出 `"delete"`、`"remove"`、`"DeleteRecord"` 三种写法。用 `enum: ["create","update","delete"]` 后，解码器在 constrained decoding 下几乎不会越界。但 enum 也有边界：取值超过 20 个时，模型对长列表的召回会下降，且 schema token 成本上升。这时用 `oneOf` 按场景拆分工具，比一个巨型 enum 更稳。

**可空与默认值：模型分不清“没给”和“给 null”**

`optional` 字段在 JSON Schema 里是“可以不存在”，但很多模型会显式输出 `null`。如果你的后端把 `null` 当值处理，就会覆盖默认值。我现在的做法是：所有可选参数在 description 里写明“省略表示使用默认值，不要传 null”，并在服务端做一次 `null -> 缺失` 的归一化。另一个坑是 `additionalProperties: false`：它能挡住多余字段，但部分模型在 strict 模式下会因此拒绝生成，需要确认所用 API 的支持情况。

**错误语义：工具返回什么，决定 Agent 会不会自愈**

schema 不只约束入参，也约束出参。工具失败时返回 `{"error": "failed"}`，模型只能瞎猜；返回 `{"error_code": "RATE_LIMIT", "retry_after_ms": 2000, "hint": "reduce page_size"}`，模型才有机会调整参数重试。我习惯把错误也定义成 enum，并在 description 里写清“遇到 RATE_LIMIT 应减小 page_size 后重试，最多一次”。这本质上是把重试策略编码进 schema，而不是指望模型自己推理。

**长链路里的参数漂移**

多步 Agent 里，上一步的输出会作为下一步的输入。如果第一步返回 `id: "123"`（字符串），第二步 schema 要求 `id: integer`，模型可能直接传 `"123"` 导致校验失败，也可能自作主张转成 `123`。两种都不稳定。我的做法是：跨工具传递的 ID 统一用 string，并在 description 里注明“原样传递，不要转换”。这听起来很笨，但比让模型做类型推断可靠得多。

**评估：用非法参数率而不是准确率**

评估 function calling 时，除了看“选对工具”的比例，我还会统计两个指标：schema 校验失败率、以及失败后的自愈率（重试一次内成功）。前者高说明 schema 约束不够，后者低说明错误信息不够可操作。构造测试集时，故意给模糊指令（“把那个删了”），看模型是反问、还是猜一个 id 直接调用——后者在删除类工具上是灾难。

**还没想清楚的问题**

当工具数量到几十个时，把所有 schema 塞进 context 会挤占预算。我在试“两阶段”：先用一个轻量分类器选工具组，再注入该组的 schema。但这引入了分类错误，且分类器和主模型对工具的理解可能不一致。另一个开放问题是 constrained decoding 对推理型模型的影响——强制 JSON 输出会不会损害思维链质量，我目前只有零散观察，没有系统结论。

一句话总结：schema 是 Agent 和真实世界之间的契约，参数设计得越像“给模型的选择题”，Agent 就越不容易在边界上碎掉。
