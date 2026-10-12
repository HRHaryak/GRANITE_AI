from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np

from app.ai.providers.base import model_file_exists
from app.core.config import get_settings


@dataclass
class MatchResult:
    status: str  # "operational", "degraded", "insufficient_matches", "failed"
    provider: str
    configured: bool
    num_features_a: int = 0
    num_features_b: int = 0
    num_matches: int = 0
    inlier_count: int = 0
    inlier_ratio: float = 0.0
    pts_a: list[list[float]] = field(default_factory=list)
    pts_b: list[list[float]] = field(default_factory=list)
    fundamental_matrix: list[list[float]] | None = None
    essential_matrix: list[list[float]] | None = None
    rotation: list[list[float]] | None = None
    translation: list[list[float]] | None = None
    error_message: str | None = None


class SuperPointLightGlueFeatureMatchingProvider:
    """SuperPoint + LightGlue feature extraction and correspondence matching."""

    def __init__(self) -> None:
        settings = get_settings()
        self.sp_path = settings.superpoint_model_path
        self.lg_path = settings.lightglue_model_path

    def match(self, img_a_bgr: np.ndarray, img_b_bgr: np.ndarray) -> MatchResult:
        if not (model_file_exists(self.sp_path) and model_file_exists(self.lg_path)):
            return MatchResult(
                status="unavailable",
                provider="SuperPointLightGlueFeatureMatchingProvider",
                configured=False,
                error_message="SuperPoint and LightGlue weights not configured",
            )
        # Attempt to run SuperPoint / LightGlue if installed
        try:
            import torch
            from lightglue import LightGlue, SuperPoint
            from lightglue.utils import numpy_image_to_torch

            device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            extractor = SuperPoint(max_num_keypoints=2048).eval().to(device)
            matcher = LightGlue(features="superpoint").eval().to(device)

            image0 = numpy_image_to_torch(cv2.cvtColor(img_a_bgr, cv2.COLOR_BGR2RGB)).to(device)
            image1 = numpy_image_to_torch(cv2.cvtColor(img_b_bgr, cv2.COLOR_BGR2RGB)).to(device)

            feats0 = extractor.extract(image0)
            feats1 = extractor.extract(image1)
            matches01 = matcher({"image0": feats0, "image1": feats1})

            points0 = feats0["keypoints"][0].cpu().numpy()
            points1 = feats1["keypoints"][0].cpu().numpy()
            matches = matches01["matches"][0].cpu().numpy()

            m_pts0 = points0[matches[:, 0]]
            m_pts1 = points1[matches[:, 1]]

            inlier_count = len(matches)
            inlier_ratio = float(inlier_count / max(len(points0), 1))

            return MatchResult(
                status="operational",
                provider="SuperPointLightGlueFeatureMatchingProvider",
                configured=True,
                num_features_a=len(points0),
                num_features_b=len(points1),
                num_matches=len(matches),
                inlier_count=inlier_count,
                inlier_ratio=round(inlier_ratio, 4),
                pts_a=m_pts0.tolist(),
                pts_b=m_pts1.tolist(),
            )
        except Exception as exc:
            return MatchResult(
                status="failed",
                provider="SuperPointLightGlueFeatureMatchingProvider",
                configured=False,
                error_message=f"SuperPoint/LightGlue error: {exc}",
            )


class OpenCVFeatureMatchingProvider:
    """SIFT / ORB feature extraction and KNN RANSAC matching."""

    def __init__(self) -> None:
        self.use_sift = hasattr(cv2, "SIFT_create")
        if self.use_sift:
            self.detector = cv2.SIFT_create(nfeatures=4000)
            self.matcher = cv2.BFMatcher(cv2.NORM_L2, crossCheck=False)
        else:
            self.detector = cv2.ORB_create(nfeatures=4000)
            self.matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)

    def match(self, img_a_bgr: np.ndarray, img_b_bgr: np.ndarray) -> MatchResult:
        gray_a = cv2.cvtColor(img_a_bgr, cv2.COLOR_BGR2GRAY)
        gray_b = cv2.cvtColor(img_b_bgr, cv2.COLOR_BGR2GRAY)

        kps_a, desc_a = self.detector.detectAndCompute(gray_a, None)
        kps_b, desc_b = self.detector.detectAndCompute(gray_b, None)

        if desc_a is None or desc_b is None or len(kps_a) < 10 or len(kps_b) < 10:
            return MatchResult(
                status="insufficient_matches",
                provider="OpenCVFeatureMatchingProvider",
                configured=True,
                num_features_a=len(kps_a) if kps_a else 0,
                num_features_b=len(kps_b) if kps_b else 0,
                error_message="Insufficient keypoints extracted from image pair",
            )

        knn = self.matcher.knnMatch(desc_a, desc_b, k=2)
        good = []
        for pair in knn:
            if len(pair) == 2:
                m, n = pair
                if m.distance < 0.75 * n.distance:
                    good.append(m)

        if len(good) < 8:
            return MatchResult(
                status="insufficient_matches",
                provider="OpenCVFeatureMatchingProvider",
                configured=True,
                num_features_a=len(kps_a),
                num_features_b=len(kps_b),
                num_matches=len(good),
                error_message=f"Only {len(good)} candidate matches found (minimum 8 required)",
            )

        pts_a = np.float32([kps_a[m.queryIdx].pt for m in good])
        pts_b = np.float32([kps_b[m.trainIdx].pt for m in good])

        h, w = img_a_bgr.shape[:2]
        focal = float(max(w, h))
        pp = (w / 2.0, h / 2.0)

        E, mask = cv2.findEssentialMat(
            pts_a, pts_b, focal=focal, pp=pp, method=cv2.RANSAC, prob=0.999, threshold=1.0
        )
        inlier_count = int(mask.sum()) if mask is not None else 0
        inlier_ratio = round(float(inlier_count / max(len(good), 1)), 4)

        R, t = None, None
        if E is not None and mask is not None and inlier_count >= 8:
            _, r_mat, t_vec, _ = cv2.recoverPose(E, pts_a, pts_b, focal=focal, pp=pp, mask=mask)
            R = r_mat.tolist() if r_mat is not None else None
            t = t_vec.tolist() if t_vec is not None else None

        return MatchResult(
            status="operational",
            provider=f"OpenCVFeatureMatchingProvider ({'SIFT' if self.use_sift else 'ORB'} + RANSAC)",
            configured=True,
            num_features_a=len(kps_a),
            num_features_b=len(kps_b),
            num_matches=len(good),
            inlier_count=inlier_count,
            inlier_ratio=inlier_ratio,
            pts_a=pts_a.tolist(),
            pts_b=pts_b.tolist(),
            essential_matrix=E.tolist() if E is not None else None,
            rotation=R,
            translation=t,
        )


class FeatureMatchingManager:
    """Manages SuperPoint+LightGlue with automatic graceful fallback to OpenCV."""

    def __init__(self) -> None:
        self.superpoint = SuperPointLightGlueFeatureMatchingProvider()
        self.opencv = OpenCVFeatureMatchingProvider()

    def match(self, img_a_bgr: np.ndarray, img_b_bgr: np.ndarray) -> MatchResult:
        res = self.superpoint.match(img_a_bgr, img_b_bgr)
        if res.status == "operational":
            return res
        return self.opencv.match(img_a_bgr, img_b_bgr)
