import numpy as np

from app.ai.providers.base import GraniteSegmentationProvider, SegmentationResult, model_file_exists
from app.core.config import get_settings


class YOLOGraniteSegmentationProvider(GraniteSegmentationProvider):
    def __init__(self, model_path: str | None = None) -> None:
        settings = get_settings()
        self.model_path = model_path if model_path is not None else settings.granite_segmentation_model_path
        self._model = None

    def segment(self, image_bgr: np.ndarray) -> SegmentationResult:
        if not model_file_exists(self.model_path):
            return SegmentationResult(
                mask=None,
                provider="YOLOGraniteSegmentationProvider",
                configured=False,
                error_code="MODEL_NOT_CONFIGURED",
                error_message="Granite segmentation model is not configured. Set GRANITE_SEGMENTATION_MODEL_PATH.",
            )
        from ultralytics import YOLO

        if self._model is None:
            self._model = YOLO(self.model_path)
        results = self._model.predict(source=image_bgr, verbose=False)
        if not results or results[0].masks is None:
            return SegmentationResult(
                mask=None,
                provider="YOLOGraniteSegmentationProvider",
                configured=True,
                error_code="NO_MASK",
                error_message="Configured segmentation model returned no mask.",
            )
        mask = results[0].masks.data[0].cpu().numpy()
        conf = None
        if results[0].boxes is not None and len(results[0].boxes):
            conf = float(results[0].boxes.conf[0])
        return SegmentationResult(mask=mask, provider="YOLOGraniteSegmentationProvider", configured=True, confidence=conf)
