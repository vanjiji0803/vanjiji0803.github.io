---
title: "Function Calling Schema设计：参数如何让Agent变脆"
description: "从类型、枚举、嵌套结构到错误处理，拆解函数调用schema中那些让Agent一碰就碎的参数设计。"
date: 2026-09-27
tags: ["function calling", "agent", "schema", "llm"]
draft: false
---

最近在调一个手术Agent，需要调用工具查询患者信息、检索指南、执行计算。模型本身没问题，但Agent行为极其脆弱：有时把`patient_id`传成整数，有时把`options`数组塞成JSON字符串，有时干脆漏掉必填参数。排查后发现，问题不在模型，而在我们定义的function calling schema。

## 参数类型：别用`string`偷懒

最典型的坏味道是把所有参数都定义成`string`。比如`age`用字符串，模型可能传`"35"`，也可能传`"三十五"`。后端解析时要么崩溃，要么静默失败。正确做法是显式声明`integer`、`number`、`boolean`。如果字段允许空值，用`nullable: true`（OpenAI）或类型联合`["string", "null"]`（JSON Schema），而不是让模型自己猜。

另一个坑是`object`嵌套过深。三层以上的嵌套结构，模型在生成时容易丢层级或错位。如果确实需要复杂结构，考虑拆成多个扁平函数，或者用`array`+`items`明确元素类型。

## 枚举：把开放世界收窄

`status`字段如果只允许`pending`、`approved`、`rejected`，一定要用`enum`。否则模型可能编出`"processing"`或`"done"`。枚举值本身也要注意：避免大小写混用，避免同义词（`"yes"`和`"true"`并存）。如果枚举值超过10个，考虑用描述性`description`引导，或者拆成两级参数。

## 必填与默认值：别让模型做填空题

`required`数组要精确。漏掉必填参数，模型可能随机补一个，或者直接不调用。对于可选参数，在`description`里写清楚默认行为，比如“不传则返回全部字段”。但别依赖模型记住默认值——后端必须实现默认逻辑，schema只是文档。

## 描述：给模型看的文档

`description`不是注释，是prompt的一部分。要写清楚：参数含义、格式约束、取值示例、边界情况。比如`date`参数，写“ISO 8601格式，如2024-01-15”，比写“日期”强十倍。但描述别太长，否则挤占上下文，模型反而忽略关键约束。

## 错误处理：让失败可恢复

即使schema完美，模型仍可能传错。后端要返回结构化错误，比如`{"error": "invalid_type", "param": "age", "expected": "integer"}`，而不是抛异常。Agent拿到错误后可以重试或修正。如果错误信息是自然语言，模型可能理解偏差；结构化错误更利于自动修复。

## 一个具体案例

我们有个`search_guidelines`函数，参数`query`是字符串，`top_k`是整数。最初`top_k`没设`minimum`，模型传了`-1`，检索直接报错。加上`minimum: 1, maximum: 20`后，模型再没越界。另一个函数`calculate_bsa`需要`height_cm`和`weight_kg`，我们一开始用`number`，模型传了`"170"`字符串。改成`number`并在描述里强调“不带单位”，问题消失。

## 评估与迭代

Schema设计不是一劳永逸。建议记录每次调用的参数，统计类型错误率、缺失率、越界率。用这些数据反向优化schema：高频错误参数加约束，模糊参数加枚举，复杂参数拆函数。也可以写单元测试，用历史错误样本验证schema的鲁棒性。

## 开放问题

目前JSON Schema对`oneOf`、`anyOf`的支持，不同模型表现差异很大。我还没系统测试过：在嵌套`oneOf`场景下，哪个模型最稳定？另外，当函数数量超过50个时，schema本身占用的token是否值得用检索来动态筛选？这些坑，欢迎交流。
