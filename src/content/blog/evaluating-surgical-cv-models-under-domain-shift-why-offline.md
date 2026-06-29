---
title: "Evaluating Surgical CV Models Under Domain Shift: Why Offline Accuracy Lies"
description: "Why offline metrics fail to predict real-world performance in surgical computer vision, with concrete examples from YOLOv8 deployment."
date: 2026-06-29
tags: ["domain shift", "surgical cv", "deployment", "evaluation"]
draft: true
---

When I first deployed a YOLOv8m instrument detection model on a da Vinci Xi system in a new OR, the FPS was fine but the mAP dropped from 0.92 (offline test set) to 0.67. The model kept missing suction irrigators and confusing monopolar scissors with hook cautery. The offline numbers had lied.

## The Problem: Static Test Sets vs. Dynamic OR

Our offline test set contained 2,000 labeled frames from two da Vinci Si systems, with controlled lighting and consistent instrument appearances. In the real OR, we encountered:
- **Lighting shifts**: Overhead OR lights moved, creating specular reflections on instruments that looked like smoke artifacts.
- **Instrument variation**: Slightly different shaft angles, new sterile drapes covering parts of the tool shaft, and different camera white balance.
- **Background clutter**: Surgical gauze, sponges, and blood on the lens—none of which were in the training set.
- **Motion blur**: Rapid instrument swaps during suturing created blur that our offline set (mostly static frames) didn't represent.

## Why Offline Metrics Fail

Offline evaluation typically uses a held-out set from the same distribution as training. This measures *memorization* more than *generalization*. Key failure modes:

1. **Covariate shift**: The input distribution changes (lighting, camera model, endoscope angle). Our YOLOv8 model's feature extractor (CSPDarknet) is sensitive to low-frequency changes like overall brightness. A 20% drop in average brightness caused a 15% mAP drop on instruments, even though the instruments were perfectly visible to a human.

2. **Label shift**: The relative frequency of instrument classes changes. In training, we had 40% Maryland bipolar, 30% scissors, 20% needle driver, 10% other. In the new OR, the surgeon used a Prograsp forceps (not in training) 30% of the time. The model confidently predicted Maryland bipolar on Prograsp images.

3. **Concept shift**: The definition of a class changes. "Smoke" in training was mostly from cautery; in deployment, we saw haze from insufflation and condensation on the lens. The model's smoke detector fired on clean lens condensation.

## Practical Mitigations We've Tried (With Mixed Results)

### 1. Test-Time Augmentation (TTA)
We applied brightness, contrast, and blur augmentations at inference (5 crops + flips). This recovered ~5% mAP but added 3x latency (from 8ms to 24ms on AGX Orin). Not acceptable for real-time (30 FPS target).

### 2. Domain Adaptation via Style Transfer
We used a lightweight CycleGAN to adapt source images to target domain appearance. Training on 500 unlabeled target frames improved mAP by 8%, but the GAN added artifacts (false positives on gauze). We abandoned it.

### 3. Online Fine-Tuning with Pseudo-Labels
We run a slow, high-threshold model (YOLOv8x with NMS threshold 0.9) in the background to generate pseudo-labels on live video, then fine-tune the deployed model every 10 minutes. This is risky: if the high-threshold model is wrong, it reinforces errors. We saw a 2% mAP improvement but occasional catastrophic forgetting of rare instruments.

### 4. Hardware-In-The-Loop Validation
We now run a parallel validation pipeline: every 100 frames, we log the model's predictions alongside raw video. A human reviews a random 1% sample weekly. This catches drift but doesn't fix it.

## What I Wish I Knew Earlier

- **Measure calibration error, not just mAP**. A model that predicts 0.9 confidence on everything will have decent mAP but be useless for downstream tasks (e.g., autonomous camera control). We now track Expected Calibration Error (ECE) on each domain shift.
- **Build a small, diverse offline test set** that includes at least 100 frames from each expected variation (different OR lights, camera models, instrument wear). This is boring but catches most failures before deployment.
- **Don't trust offline accuracy above 0.90**. If your offline mAP is 0.95, you're probably overfitting to spurious correlations (e.g., background color of the OR table). We deliberately reduce training set quality to force the model to learn robust features.

## Open Questions

- How can we do online domain adaptation without a ground-truth label stream? Self-supervised methods (contrastive learning on video) are promising but we haven't made them work in real-time.
- Is there a principled way to estimate deployment mAP from offline metrics alone? Probably not, but a Bayesian approach with prior knowledge of expected shifts might help.

For now, the only reliable evaluation is deployment in the actual OR with real video. Offline numbers are a starting point, not a guarantee.
