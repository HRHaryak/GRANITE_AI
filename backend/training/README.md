# GraniteMeasure AI — Granite Detection, Defect & Variety Training Pipeline

This directory contains the documented schema, dataset structure, and training pipeline specifications for training proprietary domain models for quarry granite inspection.

## 1. Dataset Directory Layout

```
training/
├── dataset/
│   ├── images/
│   │   ├── train/          # Training quarry images (JPG/PNG)
│   │   ├── val/            # Validation quarry images
│   │   └── test/           # Test holdout images
│   └── annotations/
│       ├── train/          # YOLO/COCO format polygon annotations
│       ├── val/
│       └── test/
├── models/                 # Checkpoints and exported ONNX/PyTorch weights
├── configs/                # Hyperparameter configurations
└── scripts/                # Data preparation, augmentation, and training scripts
```

## 2. Documented Label Classes

### A. Granite Detection & Instance Segmentation (YOLO11-Seg / SAM 2)
- `0: GRANITE_BLOCK` — Outer irregular physical boundary of the quarried stone.
- `1: BACKGROUND` — Quarry bench, ground dirt, sky, vehicles, workers.

### B. Surface Defects & Irregularities (Defect Detection Model)
- `0: CRACK` — Structural fracture through stone body.
- `1: FISSURE` — Hairline surface separation.
- `2: CAVITY` — Internal/surface void or hole.
- `3: SURFACE_DEPRESSION` — Weathered hollow or blast indentation.
- `4: BROKEN_EDGE` — Impact fracture along edge.
- `5: CHIP` — Spalled corner or localized missing material.
- `6: BLAST_DAMAGE` — Micro-fractures from explosive extraction.
- `7: NATURAL_IRREGULARITY` — Geological vein, quartz streak, non-structural color variation.

### C. Commercial Variety Classification (ConvNeXt-V2 / ViT)
- `0: TAN_BROWN` — Karimnagar / Telangana Tan Brown Granite.
- `1: KHAMMAM_BLACK` — Khammam Jet Black Granite.
- `2: STEEL_GREY` — Prakasham / Warangal Steel Grey Granite.
- `3: BLACK_GALAXY` — Chimakurthy Star Galaxy Granite.
- `4: VISCON_WHITE` — Madanapalle Viscon White Granite.
- `5: KASHMIR_WHITE` — Melur Kashmir White Granite.
- `6: UNKNOWN` — Unclassified commercial variety.

## 3. Training Execution & Environment

To configure trained model weights in production, set the following environment variables:
```bash
GRANITE_DETECTION_MODEL_PATH=/path/to/granite_detect_yolo11.pt
GRANITE_SEGMENTATION_MODEL_PATH=/path/to/granite_seg_yolo11.pt
DEFECT_DETECTION_MODEL_PATH=/path/to/granite_defects_yolo11.pt
GRANITE_CLASSIFICATION_MODEL_PATH=/path/to/granite_variety_convnext.pt
DEPTH_ANYTHING_MODEL_PATH=depth-anything/Depth-Anything-V2-Small-hf
```
When weights are not installed, the system honestly reports `NOT_CONFIGURED` or `MODEL_NOT_CONFIGURED` without fabricating predictions.
