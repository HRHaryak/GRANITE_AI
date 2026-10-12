from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

from app.ai.providers.base import model_file_exists
from app.core.config import get_settings


@dataclass
class ClassificationOutput:
    status: str  # "operational", "unavailable"
    provider: str
    configured: bool
    classification: str | None = None
    confidence: float | None = None
    top_candidates: list[dict[str, Any]] | None = None
    error_message: str | None = None


class GraniteClassificationProvider:
    """Granite variety classification using ConvNeXt-V2 / EfficientNetV2 / ViT."""

    def __init__(self) -> None:
        settings = get_settings()
        self.model_path = settings.granite_classification_model_path

    def classify(self, image_bgr: np.ndarray) -> ClassificationOutput:
        if not model_file_exists(self.model_path):
            return ClassificationOutput(
                status="unavailable",
                provider="GraniteClassificationProvider",
                configured=False,
                error_message="GRANITE_CLASSIFICATION_MODEL_PATH not configured with trained weights.",
            )

        try:
            from ultralytics import YOLO

            model = YOLO(self.model_path)
            results = model.predict(source=image_bgr, verbose=False)
            if results and results[0].probs is not None:
                probs = results[0].probs
                top1_idx = int(probs.top1)
                top1_conf = float(probs.top1conf)
                names = results[0].names or {}
                class_name = str(names.get(top1_idx, top1_idx))
                return ClassificationOutput(
                    status="operational",
                    provider="GraniteClassificationProvider (YOLO/ConvNeXt)",
                    configured=True,
                    classification=class_name,
                    confidence=round(top1_conf, 4),
                )
            return ClassificationOutput(
                status="operational",
                provider="GraniteClassificationProvider",
                configured=True,
                error_message="Model returned no prediction probabilities.",
            )
        except Exception as exc:
            return ClassificationOutput(
                status="unavailable",
                provider="GraniteClassificationProvider",
                configured=False,
                error_message=f"Classification execution error: {exc}",
            )
