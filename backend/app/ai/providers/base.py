from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np


class ModelNotConfiguredError(RuntimeError):
    """Raised when a trained model path is missing. Never treat as a detection result."""


@dataclass
class DetectionResult:
    is_granite: bool | None
    detection_confidence: float | None
    provider: str
    configured: bool
    issues: list[str] = field(default_factory=list)
    error_code: str | None = None
    error_message: str | None = None
    boxes: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class SegmentationResult:
    mask: np.ndarray | None
    provider: str
    configured: bool
    confidence: float | None = None
    error_code: str | None = None
    error_message: str | None = None


@dataclass
class DefectFinding:
    kind: str
    severity: str
    surface: str
    bbox: list[float]
    confidence: float | None
    visible_surface_defect: bool = True
    internal_defect: bool = False


@dataclass
class DefectAnalysisResult:
    findings: list[DefectFinding]
    provider: str
    configured: bool
    bottom_surface: str = "Not Observed"
    internal_defects_claimed: bool = False
    error_code: str | None = None
    error_message: str | None = None


class GraniteDetectionProvider(ABC):
    @abstractmethod
    def detect(self, image_bgr: np.ndarray) -> DetectionResult:
        raise NotImplementedError


class GraniteSegmentationProvider(ABC):
    @abstractmethod
    def segment(self, image_bgr: np.ndarray) -> SegmentationResult:
        raise NotImplementedError


class DefectDetectionProvider(ABC):
    @abstractmethod
    def detect(self, image_bgr: np.ndarray, capture_side: str) -> DefectAnalysisResult:
        raise NotImplementedError


class GeometryReconstructionProvider(ABC):
    @abstractmethod
    def reconstruct(self, images: list[tuple[str, np.ndarray]], cm_per_pixel: float | None) -> dict[str, Any]:
        raise NotImplementedError


def model_file_exists(path: str) -> bool:
    return bool(path) and Path(path).is_file()
