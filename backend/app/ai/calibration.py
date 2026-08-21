from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from app.core.config import get_settings
from app.models.enums import CalibrationType


@dataclass
class CalibrationResult:
    calibration_type: str
    detected: bool
    known_reference_cm: float | None
    marker_size_cm: float | None
    cm_per_pixel: float | None
    calibration_confidence: float | None
    details: dict


def _aruco_detector():
    dictionary_name = get_settings().aruco_dictionary
    dictionary = cv2.aruco.getPredefinedDictionary(getattr(cv2.aruco, dictionary_name))
    params = cv2.aruco.DetectorParameters()
    if hasattr(cv2.aruco, "ArucoDetector"):
        return cv2.aruco.ArucoDetector(dictionary, params)
    return dictionary, params


def detect_aruco(image_bgr: np.ndarray, marker_size_cm: float | None = None) -> CalibrationResult:
    settings = get_settings()
    size_cm = marker_size_cm or settings.aruco_marker_size_cm
    detector = _aruco_detector()
    if hasattr(detector, "detectMarkers"):
        corners, ids, _ = detector.detectMarkers(image_bgr)
    else:
        dictionary, params = detector
        corners, ids, _ = cv2.aruco.detectMarkers(image_bgr, dictionary, parameters=params)

    if ids is None or len(corners) == 0:
        return CalibrationResult(
            calibration_type=CalibrationType.ARUCO,
            detected=False,
            known_reference_cm=size_cm,
            marker_size_cm=size_cm,
            cm_per_pixel=None,
            calibration_confidence=None,
            details={"markers": 0},
        )

    # Use the largest detected marker side in pixels
    side_px = []
    for c in corners:
        pts = c.reshape(-1, 2)
        d01 = float(np.linalg.norm(pts[0] - pts[1]))
        d12 = float(np.linalg.norm(pts[1] - pts[2]))
        side_px.append((d01 + d12) / 2.0)
    px = float(max(side_px))
    cm_per_pixel = size_cm / px if px > 0 else None
    return CalibrationResult(
        calibration_type=CalibrationType.ARUCO,
        detected=True,
        known_reference_cm=size_cm,
        marker_size_cm=size_cm,
        cm_per_pixel=cm_per_pixel,
        calibration_confidence=min(1.0, 0.5 + 0.1 * len(corners)),
        details={"markers": int(len(ids)), "side_px": round(px, 2)},
    )


def detect_measurement_board(image_bgr: np.ndarray, known_reference_cm: float) -> CalibrationResult:
    """Detect a high-contrast rectangular board and map its longest side to known_reference_cm."""
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 50, 150)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    best = None
    best_area = 0.0
    for cnt in contours:
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
        if len(approx) == 4:
            area = float(cv2.contourArea(approx))
            if area > best_area:
                best_area = area
                best = approx.reshape(-1, 2)
    if best is None or best_area < 500:
        return CalibrationResult(
            calibration_type=CalibrationType.MEASUREMENT_BOARD,
            detected=False,
            known_reference_cm=known_reference_cm,
            marker_size_cm=None,
            cm_per_pixel=None,
            calibration_confidence=None,
            details={"reason": "No rectangular board detected"},
        )
    d01 = float(np.linalg.norm(best[0] - best[1]))
    d12 = float(np.linalg.norm(best[1] - best[2]))
    long_px = max(d01, d12)
    cm_per_pixel = known_reference_cm / long_px if long_px > 0 else None
    return CalibrationResult(
        calibration_type=CalibrationType.MEASUREMENT_BOARD,
        detected=True,
        known_reference_cm=known_reference_cm,
        marker_size_cm=None,
        cm_per_pixel=cm_per_pixel,
        calibration_confidence=0.6,
        details={"long_side_px": round(long_px, 2), "area_px": round(best_area, 1)},
    )
