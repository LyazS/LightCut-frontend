---
license: mit
tags:
- onnx
- music-structure-analysis
- beat-tracking
- source-separation
- webgpu
---

# LightCut Music Analysis Models

ONNX inference weights used by LightCut's browser-local music structure analysis.
All audio decoding, source separation, feature extraction, and inference run in the user's browser.

## Files

- `htdemucs-core.onnx`: four-stem HTDemucs source-separation core.
- `harmonix-fold0.onnx` through `harmonix-fold7.onnx`: eight-fold All-In-One music-structure-analysis ensemble.

## Intended Use

These files are packaged for inference. They predict tempo, beats, downbeats, section boundaries, and section labels for music audio. The LightCut integration supports audio-bearing media between 76 and 660 seconds.

## Provenance and Attribution

- All-In-One Music Structure Analyzer, Taejun Kim and Juhan Nam, WASPAA 2023. Source: https://github.com/mir-aidj/all-in-one
- Hybrid Transformer Demucs, Alexandre Defossez, 2022. Source: https://github.com/facebookresearch/demucs

The files in this repository are ONNX conversions for browser inference. They are not newly trained model weights. Please retain this attribution when redistributing derived packages.

## Version

`v1` is pinned by the consuming source repository to a full Hugging Face commit SHA and validates every download against its SHA-256 digest.
