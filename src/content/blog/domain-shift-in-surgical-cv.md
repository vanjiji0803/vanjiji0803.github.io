---
title: "Why a near-perfect bleeding detector still misfires in the OR"
description: "Offline accuracy and intraoperative reliability are not the same metric. Notes on domain shift in surgical computer vision."
date: 2026-06-22
tags: ["computer vision", "evaluation", "surgical AI"]
draft: false
---

A bleeding-detection model can clear a held-out test set at 98% accuracy and still misfire constantly the first time it sees a real procedure. The gap isn't model capacity — it's domain shift that the held-out set never represented in the first place: surgical smoke partially occluding the field, lighting that shifts hard between cauterization and irrigation, an instrument silhouette the training set under-sampled.

This is a placeholder seed post used to verify the blog pipeline (content collection schema, list page, post page, styling) before the automated weekly draft workflow starts producing real posts.
