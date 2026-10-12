from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.ai.providers.base import model_file_exists
from app.core.config import get_settings


@dataclass
class DepthOutput:
    status: str  # "operational", "unavailable"
    provider: str
    configured: bool
    is_calibrated_metric: bool
    relative_depth_map: np.ndarray | None = None
    min_depth: float | None = None
    max_depth: float | None = None
    mean_depth: float | None = None
    error_message: str | None = None


class DepthAnythingV2Provider:
    """Monocular depth estimation using Depth Anything V2."""

    def __init__(self) -> None:
        settings = get_settings()
        self.model_path = settings.depth_anything_model_path

    def estimate_depth(
        self,
        image_bgr: np.ndarray,
        metric_scale: float | None = None,
    ) -> DepthOutput:
        if not model_file_exists(self.model_path):
            return DepthOutput(
                status="unavailable",
                provider="DepthAnythingV2Provider",
                configured=False,
                is_calibrated_metric=False,
                error_message="DEPTH_ANYTHING_MODEL_PATH weights not configured.",
            )

        try:
            import torch
            from transformers import AutoImageProcessor, AutoModelForDepthEstimation

            # Load model if weights / Hugging Face repo configured
            device = "cuda" if torch.cuda.is_available() else "cpu"
            processor = AutoImageProcessor.from_pretrained(self.model_path)
            model = AutoModelForDepthEstimation.from_pretrained(self.model_path).to(device)

            import cv2
            rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
            inputs = processor(images=rgb, return_tensors="pt").to(device)

            with torch.no_grad():
                outputs = model(**inputs)
                predicted_depth = outputs.predicted_depth

            depth = predicted_depth.squeeze().cpu().numpy()
            is_metric = metric_scale is not None and metric_scale > 0
            if is_metric:
                depth = depth * metric_scale

            return DepthOutput(
                status="operational",
                provider="DepthAnythingV2Provider",
                configured=True,
                is_calibrated_metric=is_metric,
                relative_depth_map=depth,
                min_depth=float(depth.min()),
                max_depth=float(depth.max()),
                mean_depth=float(depth.mean()),
            )
        except Exception as exc:
            return DepthOutput(
                status="unavailable",
                provider="DepthAnythingV2Provider",
                configured=False,
                is_calibrated_metric=False,
                error_message=f"Depth Anything V2 execution failed: {exc}",
            )
