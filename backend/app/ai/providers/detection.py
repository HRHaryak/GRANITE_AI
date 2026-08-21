from pathlib import Path

import numpy as np

from app.ai.providers.base import DetectionResult, GraniteDetectionProvider, ModelNotConfiguredError, model_file_exists
from app.core.config import get_settings


class YOLOGraniteDetectionProvider(GraniteDetectionProvider):
    """Loads a configured Ultralytics YOLO model. Does not invent detections."""

    def __init__(self, model_path: str | None = None) -> None:
        settings = get_settings()
        self.model_path = model_path if model_path is not None else settings.granite_detection_model_path
        self._model = None

    def _load(self):
        if not model_file_exists(self.model_path):
            raise ModelNotConfiguredError(
                "Granite detection model is not configured. Set GRANITE_DETECTION_MODEL_PATH to a trained YOLO weights file."
            )
        if self._model is None:
            from ultralytics import YOLO

            self._model = YOLO(self.model_path)
        return self._model

    def detect(self, image_bgr: np.ndarray) -> DetectionResult:
        try:
            model = self._load()
        except ModelNotConfiguredError as exc:
            return DetectionResult(
                is_granite=None,
                detection_confidence=None,
                provider="YOLOGraniteDetectionProvider",
                configured=False,
                error_code="MODEL_NOT_CONFIGURED",
                error_message=str(exc),
                issues=["Granite detection model is not configured."],
            )

        results = model.predict(source=image_bgr, verbose=False)
        if not results:
            return DetectionResult(
                is_granite=False,
                detection_confidence=0.0,
                provider="YOLOGraniteDetectionProvider",
                configured=True,
                issues=["No detections returned by the configured model."],
            )

        result = results[0]
        names = result.names or {}
        boxes = []
        granite_conf = 0.0
        found = False
        if result.boxes is not None and len(result.boxes):
            for box in result.boxes:
                cls_id = int(box.cls[0])
                conf = float(box.conf[0])
                label = str(names.get(cls_id, cls_id)).lower()
                xyxy = [float(x) for x in box.xyxy[0].tolist()]
                boxes.append({"label": label, "confidence": round(conf, 4), "xyxy": xyxy})
                if "granite" in label or label in {"positive", "block", "stone"}:
                    found = True
                    granite_conf = max(granite_conf, conf)

        if not found and boxes:
            # Model ran; no granite-class box. Do not treat other classes as granite.
            top = max(boxes, key=lambda b: b["confidence"])
            return DetectionResult(
                is_granite=False,
                detection_confidence=round(top["confidence"], 4),
                provider="YOLOGraniteDetectionProvider",
                configured=True,
                boxes=boxes,
                issues=["Not a Granite Block"],
            )

        return DetectionResult(
            is_granite=found,
            detection_confidence=round(granite_conf, 4) if found else 0.0,
            provider="YOLOGraniteDetectionProvider",
            configured=True,
            boxes=boxes,
            issues=[] if found else ["Not a Granite Block"],
        )


def get_granite_detection_provider() -> YOLOGraniteDetectionProvider:
    return YOLOGraniteDetectionProvider()
