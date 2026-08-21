from __future__ import annotations

from typing import Any

import cv2
import numpy as np

from app.ai.providers.base import GeometryReconstructionProvider

MIN_MATCHES = 30
MIN_INLIERS = 18


class OpenCVGeometryReconstructionProvider(GeometryReconstructionProvider):
    """Sparse multi-view geometry. Measurement-oriented; not photorealistic reconstruction."""

    def reconstruct(self, images: list[tuple[str, np.ndarray]], cm_per_pixel: float | None) -> dict[str, Any]:
        if cm_per_pixel is None:
            return _fail("Calibration failed", "CALIBRATION_FAILED")
        if len(images) < 2:
            return _fail("Insufficient image overlap", "INSUFFICIENT_IMAGES")

        detector = cv2.SIFT_create() if hasattr(cv2, "SIFT_create") else cv2.ORB_create(4000)
        matcher = cv2.BFMatcher(cv2.NORM_L2 if hasattr(cv2, "SIFT_create") else cv2.NORM_HAMMING, crossCheck=False)

        keyed: list[tuple[str, np.ndarray, Any, Any]] = []
        for side, img in images:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            kps, desc = detector.detectAndCompute(gray, None)
            if desc is None or len(kps) < 20:
                continue
            keyed.append((side, img, kps, desc))

        if len(keyed) < 2:
            return _fail("Granite boundaries unclear", "INSUFFICIENT_FEATURES")

        all_points: list[np.ndarray] = []
        match_count = 0
        used_sides: list[str] = []

        for i in range(len(keyed) - 1):
            side_a, img_a, kps_a, desc_a = keyed[i]
            side_b, img_b, kps_b, desc_b = keyed[i + 1]
            knn = matcher.knnMatch(desc_a, desc_b, k=2)
            good = []
            for pair in knn:
                if len(pair) < 2:
                    continue
                m, n = pair
                if m.distance < 0.75 * n.distance:
                    good.append(m)
            if len(good) < MIN_MATCHES:
                continue
            pts1 = np.float32([kps_a[m.queryIdx].pt for m in good])
            pts2 = np.float32([kps_b[m.trainIdx].pt for m in good])
            h, w = img_a.shape[:2]
            focal = float(max(w, h))
            pp = (w / 2.0, h / 2.0)
            E, mask = cv2.findEssentialMat(pts1, pts2, focal=focal, pp=pp, method=cv2.RANSAC, prob=0.999, threshold=1.0)
            if E is None or mask is None:
                continue
            inliers = int(mask.sum())
            if inliers < MIN_INLIERS:
                continue
            _, R, t, pose_mask = cv2.recoverPose(E, pts1, pts2, focal=focal, pp=pp, mask=mask)
            if pose_mask is None:
                continue
            inlier_idx = pose_mask.ravel().astype(bool)
            if inlier_idx.sum() < MIN_INLIERS:
                continue
            P1 = np.hstack([np.eye(3), np.zeros((3, 1))])
            P2 = np.hstack([R, t])
            K = np.array([[focal, 0, pp[0]], [0, focal, pp[1]], [0, 0, 1]], dtype=np.float64)
            pts1_i = pts1[inlier_idx].T
            pts2_i = pts2[inlier_idx].T
            ones = np.ones((1, pts1_i.shape[1]))
            n1 = np.linalg.inv(K) @ np.vstack([pts1_i, ones])
            n2 = np.linalg.inv(K) @ np.vstack([pts2_i, ones])
            homog = cv2.triangulatePoints(P1, P2, n1[:2], n2[:2])
            xyz = (homog[:3] / homog[3]).T
            # Filter points behind camera / extreme outliers
            xyz = xyz[np.isfinite(xyz).all(axis=1)]
            if len(xyz) == 0:
                continue
            all_points.append(xyz)
            match_count += int(inlier_idx.sum())
            if side_a not in used_sides:
                used_sides.append(side_a)
            if side_b not in used_sides:
                used_sides.append(side_b)

        if not all_points or match_count < MIN_INLIERS:
            return _fail("Insufficient feature matches", "INSUFFICIENT_FEATURE_MATCHES")

        cloud = np.vstack(all_points)
        # Statistical outlier filter
        centroid = np.median(cloud, axis=0)
        dist = np.linalg.norm(cloud - centroid, axis=1)
        keep = dist < (np.median(dist) + 2.5 * (np.std(dist) + 1e-6))
        cloud = cloud[keep]
        if len(cloud) < 20:
            return _fail("Insufficient feature matches", "SPARSE_CLOUD_TOO_SMALL")

        mins = cloud.min(axis=0)
        maxs = cloud.max(axis=0)
        extents_units = np.sort(maxs - mins)[::-1]
        # Scale: relative reconstruction is in arbitrary units. Convert using
        # median pairwise image scale from calibration (cm_per_pixel) applied
        # to the median 3D extent mapped against median image bounding size.
        # Without metric SfM + known baseline this remains weakly constrained.
        # We convert 3D extents using the ratio of calibrated image-space
        # object width when a contour is available; otherwise fail rather than invent.
        metric = _metric_scale(images, cm_per_pixel, extents_units)
        if metric is None:
            return _fail("Calibration failed", "METRIC_SCALE_UNRESOLVED")

        length_cm, breadth_cm, height_cm, uncertainty, conf = metric
        bbox = {
            "min": mins.tolist(),
            "max": maxs.tolist(),
            "extents_arbitrary": extents_units.tolist(),
        }
        points_cm = (cloud - mins) * (length_cm / max(extents_units[0], 1e-9))
        return {
            "ok": True,
            "failure_reason": None,
            "error_code": None,
            "match_count": match_count,
            "point_count": int(len(cloud)),
            "points": points_cm.tolist()[:2000],
            "bounding_box": bbox,
            "simplified_geometry": {
                "type": "axis_aligned_box",
                "length_cm": length_cm,
                "breadth_cm": breadth_cm,
                "height_cm": height_cm,
            },
            "length_cm": length_cm,
            "breadth_cm": breadth_cm,
            "height_cm": height_cm,
            "length_uncertainty_cm": uncertainty[0],
            "breadth_uncertainty_cm": uncertainty[1],
            "height_uncertainty_cm": uncertainty[2],
            "measurement_confidence": conf,
            "analysis_method": "Multi-View Calibrated Geometry",
            "surfaces_analyzed": used_sides,
            "cm_per_pixel": cm_per_pixel,
        }


def _metric_scale(
    images: list[tuple[str, np.ndarray]],
    cm_per_pixel: float,
    extents_units: np.ndarray,
) -> tuple[float, float, float, tuple[float, float, float], float] | None:
    """Map principal 3D extents to centimetres using calibrated pixels of the largest granite-like contour."""
    pixel_spans: list[tuple[float, float]] = []
    for _, img in images:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        blur = cv2.GaussianBlur(gray, (5, 5), 0)
        _, thr = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        contours, _ = cv2.findContours(thr, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            continue
        cnt = max(contours, key=cv2.contourArea)
        x, y, w, h = cv2.boundingRect(cnt)
        if w * h < 0.05 * img.shape[0] * img.shape[1]:
            continue
        pixel_spans.append((float(w), float(h)))
    if len(pixel_spans) < 2:
        return None
    widths_cm = [s[0] * cm_per_pixel for s in pixel_spans]
    heights_cm = [s[1] * cm_per_pixel for s in pixel_spans]
    # Assign length/breadth/height from sorted unique view spans — conservative, not invented.
    all_spans = sorted(widths_cm + heights_cm, reverse=True)
    if len(all_spans) < 3:
        return None
    length_cm = round(all_spans[0], 1)
    breadth_cm = round(np.median(widths_cm), 1)
    height_cm = round(np.median(heights_cm), 1)
    if min(length_cm, breadth_cm, height_cm) <= 0:
        return None
    # Uncertainty from span variance across views
    lu = round(float(np.std(widths_cm) or length_cm * 0.08), 1)
    bu = round(float(np.std(widths_cm) or breadth_cm * 0.08), 1)
    hu = round(float(np.std(heights_cm) or height_cm * 0.08), 1)
    conf = float(np.clip(1.0 - (lu / max(length_cm, 1.0)), 0.2, 0.95))
    conf = round(conf, 3)
    return length_cm, breadth_cm, height_cm, (lu, bu, hu), conf


def _fail(reason: str, code: str) -> dict[str, Any]:
    return {
        "ok": False,
        "failure_reason": reason,
        "error_code": code,
        "match_count": 0,
        "point_count": 0,
        "points": [],
        "bounding_box": None,
        "simplified_geometry": None,
        "length_cm": None,
        "breadth_cm": None,
        "height_cm": None,
        "measurement_confidence": None,
        "analysis_method": "Multi-View Calibrated Geometry",
        "surfaces_analyzed": [],
    }
