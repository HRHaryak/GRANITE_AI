from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np


@dataclass
class QualityResult:
    """OpenCV heuristic image quality — not AI granite detection."""

    quality_score: float
    blur_var: float
    brightness_mean: float
    overexposed_ratio: float
    resolution_ok: bool
    width: int
    height: int
    issues: list[str] = field(default_factory=list)
    method: str = "opencv_heuristic"


def assess_image_quality(image_bgr: np.ndarray, min_width: int = 640, min_height: int = 480) -> QualityResult:
    h, w = image_bgr.shape[:2]
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    blur_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    brightness = float(np.mean(gray))
    overexposed = float(np.mean(gray > 245))
    issues: list[str] = []
    resolution_ok = w >= min_width and h >= min_height
    if not resolution_ok:
        issues.append("Resolution too low")
    if blur_var < 60:
        issues.append("Image too blurry")
    if brightness < 35:
        issues.append("Image too dark")
    if brightness > 230 or overexposed > 0.25:
        issues.append("Image overexposed")

    # Score in [0,1] from measured quantities only
    blur_score = min(1.0, blur_var / 400.0)
    bright_score = 1.0 - min(1.0, abs(brightness - 127.0) / 127.0)
    expo_score = 1.0 - min(1.0, overexposed / 0.25)
    res_score = 1.0 if resolution_ok else 0.3
    quality = round((0.35 * blur_score + 0.25 * bright_score + 0.2 * expo_score + 0.2 * res_score), 4)
    return QualityResult(
        quality_score=quality,
        blur_var=round(blur_var, 3),
        brightness_mean=round(brightness, 3),
        overexposed_ratio=round(overexposed, 4),
        resolution_ok=resolution_ok,
        width=w,
        height=h,
        issues=issues,
    )


def perceptual_hash(image_bgr: np.ndarray, hash_size: int = 16) -> str:
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    resized = cv2.resize(gray, (hash_size, hash_size), interpolation=cv2.INTER_AREA)
    avg = float(resized.mean())
    bits = (resized > avg).flatten()
    return "".join("1" if b else "0" for b in bits)


def hamming_distance(a: str, b: str) -> int:
    return sum(ch1 != ch2 for ch1, ch2 in zip(a, b, strict=False))
