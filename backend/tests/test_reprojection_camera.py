"""
Targeted tests for real camera perspective reprojection validation.
Verifies:
- Real K[R|t] perspective projection
- Missing camera => CAMERA_POSE_UNAVAILABLE
- Different camera pose => different projection
- IoU not hardcoded (measured from geometry)
- Points behind camera (p_z <= 0) rejected
"""
import cv2
import numpy as np
import pytest

from app.geometry.reprojection import (
    compute_view_reprojection_metrics,
    render_mesh_silhouette_from_camera,
    validate_observed_views,
)


def _make_box_mesh(L: float = 200.0, B: float = 100.0, H: float = 80.0):
    """Synthetic box mesh centered at origin."""
    hl, hb, hh = L / 2.0, B / 2.0, H / 2.0
    vertices = np.array([
        [-hl, -hb, -hh], [hl, -hb, -hh], [hl, hb, -hh], [-hl, hb, -hh],
        [-hl, -hb, hh], [hl, -hb, hh], [hl, hb, hh], [-hl, hb, hh],
    ], dtype=np.float64)
    # 12 triangles (2 per cube face)
    triangles = np.array([
        [0, 1, 2], [0, 2, 3],  # bottom
        [4, 6, 5], [4, 7, 6],  # top
        [0, 5, 1], [0, 4, 5],  # front
        [2, 7, 3], [2, 6, 7],  # back
        [0, 7, 4], [0, 3, 7],  # left
        [1, 6, 2], [1, 5, 6],  # right
    ], dtype=np.int64)
    return vertices, triangles


def test_perspective_projection_and_depth_occlusion():
    """Verify that render_mesh_silhouette_from_camera uses real perspective projection."""
    verts, faces = _make_box_mesh(200.0, 100.0, 80.0)
    w, h = 640, 480
    f = 500.0
    K = np.array([[f, 0, w / 2.0], [0, f, h / 2.0], [0, 0, 1.0]], dtype=np.float64)
    R = np.eye(3, dtype=np.float64)
    # Camera placed 300 cm in front of the box along Z axis
    t = np.array([0.0, 0.0, 300.0], dtype=np.float64)

    silhouette = render_mesh_silhouette_from_camera(
        vertices_world=verts,
        triangles=faces,
        K=K,
        R=R,
        t=t,
        image_width=w,
        image_height=h,
    )

    assert silhouette is not None
    assert silhouette.shape == (h, w)
    rendered_pixels = np.count_nonzero(silhouette)
    assert rendered_pixels > 1000, "Should rasterise a substantial non-empty silhouette"


def test_missing_camera_returns_camera_pose_unavailable():
    """Missing camera intrinsics/extrinsics returns CAMERA_POSE_UNAVAILABLE."""
    verts, faces = _make_box_mesh()
    img = np.zeros((480, 640, 3), dtype=np.uint8)

    res = compute_view_reprojection_metrics(
        mesh_vertices=verts,
        mesh_triangles=faces,
        camera_intrinsics=None,
        camera_rotation=None,
        camera_translation=None,
        image_bgr=img,
        view_id="PHOTO_001",
    )

    assert res["calculated"] is False
    assert res["silhouette_iou"] is None
    assert res["view_confidence"] == "CAMERA_POSE_UNAVAILABLE"


def test_different_camera_poses_produce_different_projections():
    """Changing camera rotation or translation must produce materially different projected silhouettes."""
    verts, faces = _make_box_mesh(200.0, 100.0, 80.0)
    w, h = 640, 480
    f = 500.0
    K = np.array([[f, 0, w / 2.0], [0, f, h / 2.0], [0, 0, 1.0]], dtype=np.float64)

    # Pose 1: Looking straight along Z at distance 350
    R1 = np.eye(3, dtype=np.float64)
    t1 = np.array([0.0, 0.0, 350.0], dtype=np.float64)
    sil1 = render_mesh_silhouette_from_camera(verts, faces, K, R1, t1, w, h)

    # Pose 2: Rotated 45 degrees around Y axis
    angle = np.radians(45.0)
    R2 = np.array([
        [np.cos(angle), 0, np.sin(angle)],
        [0, 1, 0],
        [-np.sin(angle), 0, np.cos(angle)],
    ], dtype=np.float64)
    t2 = np.array([0.0, 0.0, 350.0], dtype=np.float64)
    sil2 = render_mesh_silhouette_from_camera(verts, faces, K, R2, t2, w, h)

    assert sil1 is not None and sil2 is not None
    # Compare pixel overlap
    overlap = np.count_nonzero(sil1 & sil2)
    union = np.count_nonzero(sil1 | sil2)
    iou = overlap / union if union > 0 else 0.0
    assert iou < 0.95, f"Rotated camera must produce different silhouette (got IoU {iou})"


def test_iou_is_not_hardcoded():
    """IoU calculation must be computed from actual masks, not hardcoded."""
    verts, faces = _make_box_mesh(200.0, 100.0, 80.0)
    w, h = 640, 480
    f = 500.0
    K = np.array([[f, 0, w / 2.0], [0, f, h / 2.0], [0, 0, 1.0]], dtype=np.float64)
    R = np.eye(3, dtype=np.float64)
    t = np.array([0.0, 0.0, 350.0], dtype=np.float64)

    # Render silhouette
    sil = render_mesh_silhouette_from_camera(verts, faces, K, R, t, w, h)
    assert sil is not None

    # Test with perfectly matching mask
    res_perfect = compute_view_reprojection_metrics(
        mesh_vertices=verts,
        mesh_triangles=faces,
        camera_intrinsics=K,
        camera_rotation=R,
        camera_translation=t,
        observed_mask=sil,
        view_id="TEST_VIEW",
    )
    assert res_perfect["calculated"] is True
    assert res_perfect["silhouette_iou"] >= 0.98, "Matching mask should have ~1.0 IoU"

    # Test with partially shifted mask
    shifted_mask = np.roll(sil, 50, axis=1)
    res_shifted = compute_view_reprojection_metrics(
        mesh_vertices=verts,
        mesh_triangles=faces,
        camera_intrinsics=K,
        camera_rotation=R,
        camera_translation=t,
        observed_mask=shifted_mask,
        view_id="TEST_VIEW",
    )
    assert res_shifted["calculated"] is True
    assert res_shifted["silhouette_iou"] < res_perfect["silhouette_iou"]
    assert res_shifted["silhouette_iou"] != 0.90, "IoU must reflect actual geometry, never hardcoded 0.90"


def test_points_behind_camera_rejected():
    """Vertices with z <= 0 (behind camera) must not be projected."""
    verts = np.array([[0, 0, -50], [10, 10, -50], [20, 0, -50]], dtype=np.float64)
    faces = np.array([[0, 1, 2]], dtype=np.int64)
    K = np.eye(3, dtype=np.float64) * 400
    K[2, 2] = 1.0
    R = np.eye(3, dtype=np.float64)
    # Camera at origin looking along +Z, points are at z = -50 (behind camera)
    t = np.array([0, 0, 0], dtype=np.float64)

    sil = render_mesh_silhouette_from_camera(verts, faces, K, R, t, 640, 480)
    assert sil is not None
    assert np.count_nonzero(sil) == 0, "Points behind camera must produce 0 rendered pixels"
