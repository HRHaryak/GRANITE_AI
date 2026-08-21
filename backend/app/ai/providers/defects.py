import numpy as np

from app.ai.providers.base import DefectAnalysisResult, DefectDetectionProvider, DefectFinding, model_file_exists
from app.core.config import get_settings


class YOLODefectDetectionProvider(DefectDetectionProvider):
    """Visible surface defects only. Never reports internal defects or bottom surface analysis."""

    def __init__(self, model_path: str | None = None) -> None:
        settings = get_settings()
        self.model_path = model_path if model_path is not None else settings.defect_detection_model_path
        self._model = None

    def detect(self, image_bgr: np.ndarray, capture_side: str) -> DefectAnalysisResult:
        if not model_file_exists(self.model_path):
            return DefectAnalysisResult(
                findings=[],
                provider="YOLODefectDetectionProvider",
                configured=False,
                error_code="MODEL_NOT_CONFIGURED",
                error_message="Defect detection model is not configured. Set DEFECT_DETECTION_MODEL_PATH.",
            )
        from ultralytics import YOLO

        if self._model is None:
            self._model = YOLO(self.model_path)
        results = self._model.predict(source=image_bgr, verbose=False)
        findings: list[DefectFinding] = []
        if results and results[0].boxes is not None:
            names = results[0].names or {}
            for box in results[0].boxes:
                cls_id = int(box.cls[0])
                conf = float(box.conf[0])
                label = str(names.get(cls_id, cls_id)).lower()
                xyxy = [float(x) for x in box.xyxy[0].tolist()]
                findings.append(
                    DefectFinding(
                        kind=label,
                        severity="visible",
                        surface=capture_side,
                        bbox=xyxy,
                        confidence=round(conf, 4),
                        visible_surface_defect=True,
                        internal_defect=False,
                    )
                )
        return DefectAnalysisResult(
            findings=findings,
            provider="YOLODefectDetectionProvider",
            configured=True,
            bottom_surface="Not Observed",
            internal_defects_claimed=False,
        )
