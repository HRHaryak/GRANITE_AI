from __future__ import annotations

import math

import numpy as np

from app.ai.providers.reconstruction import (
    _metric_scale_from_marker_camera_baselines,
)


def _sfm_pose(
    label: str,
    center_xyz: tuple[float, float, float],
) -> dict:
    """
    Build a world-to-camera pose whose camera center equals center_xyz.

    For R = I and X_camera = R X_world + t, camera center is -t.
    """
    center = np.asarray(
        center_xyz,
        dtype=np.float64,
    )

    return {
        "capture_label": label,
        "rotation": np.eye(
            3,
            dtype=np.float64,
        ).tolist(),
        "translation_arbitrary_scale": (
            -center
        ).tolist(),
        "registration": {
            "status": "REGISTERED",
        },
    }


def _metric_marker_evidence(
    label: str,
    marker_id: int,
    camera_center_cm: tuple[
        float,
        float,
        float,
    ],
    *,
    reliable: bool = True,
) -> dict:
    """
    Build a marker pose whose marker-frame camera center is camera_center_cm.

    With R = I, solvePnP-style tvec is -camera_center.
    """
    center = np.asarray(
        camera_center_cm,
        dtype=np.float64,
    )

    return {
        "image_id": (
            f"img-{label}"
        ),
        "surface": label,
        "detected": True,
        "cm_per_pixel": 0.1,
        "calibration_confidence": 0.95,
        "metric_pose_reliable": reliable,
        "details": {
            "selected_marker_id": marker_id,
        },
        "marker_pose": {
            "available": True,
            "status": (
                "SOLVED_RELIABLE"
                if reliable
                else "SOLVED_APPROXIMATE"
            ),
            "rotation_matrix": np.eye(
                3,
                dtype=np.float64,
            ).tolist(),
            "tvec_cm": (
                -center
            ).tolist(),
            "metric_pose_reliable": reliable,
            "reprojection_rmse_px": (
                0.5
            ),
        },
    }


def test_metric_scale_solver_recovers_known_global_scale() -> None:
    """
    Three registered cameras observe the same reliable marker.

    SfM camera centers:
        0, 2, 5 arbitrary units

    Metric camera centers:
        0, 20, 50 cm

    Expected scale:
        10 cm / SfM unit
    """
    diagnostics = {
        "camera_poses": {
            "0": _sfm_pose(
                "PHOTO_001",
                (
                    0.0,
                    0.0,
                    0.0,
                ),
            ),
            "1": _sfm_pose(
                "PHOTO_002",
                (
                    2.0,
                    0.0,
                    0.0,
                ),
            ),
            "2": _sfm_pose(
                "PHOTO_003",
                (
                    5.0,
                    0.0,
                    0.0,
                ),
            ),
        },
    }

    evidence = [
        _metric_marker_evidence(
            "PHOTO_001",
            7,
            (
                0.0,
                0.0,
                0.0,
            ),
        ),
        _metric_marker_evidence(
            "PHOTO_002",
            7,
            (
                20.0,
                0.0,
                0.0,
            ),
        ),
        _metric_marker_evidence(
            "PHOTO_003",
            7,
            (
                50.0,
                0.0,
                0.0,
            ),
        ),
    ]

    scale, result = (
        _metric_scale_from_marker_camera_baselines(
            multiview_diagnostics=diagnostics,
            calibration_evidence=evidence,
        )
    )

    assert scale is not None
    assert math.isclose(
        scale,
        10.0,
        rel_tol=1e-9,
        abs_tol=1e-9,
    )
    assert (
        result[
            "metric_sfm_scale_solved"
        ]
        is True
    )
    assert result[
        "status"
    ] == "SOLVED"
    assert result[
        "marker_id"
    ] == "7"
    assert (
        result[
            "reliable_camera_count"
        ]
        == 3
    )
    assert (
        result[
            "candidate_pair_count"
        ]
        == 3
    )
    assert (
        result[
            "inlier_pair_count"
        ]
        == 3
    )


def test_metric_scale_solver_rejects_two_camera_solution() -> None:
    diagnostics = {
        "camera_poses": {
            "0": _sfm_pose(
                "PHOTO_001",
                (
                    0.0,
                    0.0,
                    0.0,
                ),
            ),
            "1": _sfm_pose(
                "PHOTO_002",
                (
                    2.0,
                    0.0,
                    0.0,
                ),
            ),
        },
    }

    evidence = [
        _metric_marker_evidence(
            "PHOTO_001",
            7,
            (
                0.0,
                0.0,
                0.0,
            ),
        ),
        _metric_marker_evidence(
            "PHOTO_002",
            7,
            (
                20.0,
                0.0,
                0.0,
            ),
        ),
    ]

    scale, result = (
        _metric_scale_from_marker_camera_baselines(
            multiview_diagnostics=diagnostics,
            calibration_evidence=evidence,
        )
    )

    assert scale is None
    assert (
        result[
            "metric_sfm_scale_solved"
        ]
        is False
    )
    assert result[
        "reason"
    ] in {
        "FEWER_THAN_THREE_REGISTERED_SFM_CAMERAS",
        "FEWER_THAN_THREE_RELIABLE_CAMERAS_OBSERVE_SAME_MARKER",
    }


def test_metric_scale_solver_does_not_mix_different_marker_ids() -> None:
    diagnostics = {
        "camera_poses": {
            "0": _sfm_pose(
                "PHOTO_001",
                (
                    0.0,
                    0.0,
                    0.0,
                ),
            ),
            "1": _sfm_pose(
                "PHOTO_002",
                (
                    2.0,
                    0.0,
                    0.0,
                ),
            ),
            "2": _sfm_pose(
                "PHOTO_003",
                (
                    5.0,
                    0.0,
                    0.0,
                ),
            ),
        },
    }

    evidence = [
        _metric_marker_evidence(
            "PHOTO_001",
            7,
            (
                0.0,
                0.0,
                0.0,
            ),
        ),
        _metric_marker_evidence(
            "PHOTO_002",
            7,
            (
                20.0,
                0.0,
                0.0,
            ),
        ),
        _metric_marker_evidence(
            "PHOTO_003",
            8,
            (
                50.0,
                0.0,
                0.0,
            ),
        ),
    ]

    scale, result = (
        _metric_scale_from_marker_camera_baselines(
            multiview_diagnostics=diagnostics,
            calibration_evidence=evidence,
        )
    )

    assert scale is None
    assert (
        result[
            "metric_sfm_scale_solved"
        ]
        is False
    )
    assert result[
        "reason"
    ] == (
        "FEWER_THAN_THREE_RELIABLE_CAMERAS_OBSERVE_SAME_MARKER"
    )


def test_metric_scale_solver_rejects_approximate_pose_evidence() -> None:
    diagnostics = {
        "camera_poses": {
            "0": _sfm_pose(
                "PHOTO_001",
                (
                    0.0,
                    0.0,
                    0.0,
                ),
            ),
            "1": _sfm_pose(
                "PHOTO_002",
                (
                    2.0,
                    0.0,
                    0.0,
                ),
            ),
            "2": _sfm_pose(
                "PHOTO_003",
                (
                    5.0,
                    0.0,
                    0.0,
                ),
            ),
        },
    }

    evidence = [
        _metric_marker_evidence(
            "PHOTO_001",
            7,
            (
                0.0,
                0.0,
                0.0,
            ),
            reliable=False,
        ),
        _metric_marker_evidence(
            "PHOTO_002",
            7,
            (
                20.0,
                0.0,
                0.0,
            ),
            reliable=False,
        ),
        _metric_marker_evidence(
            "PHOTO_003",
            7,
            (
                50.0,
                0.0,
                0.0,
            ),
            reliable=False,
        ),
    ]

    scale, result = (
        _metric_scale_from_marker_camera_baselines(
            multiview_diagnostics=diagnostics,
            calibration_evidence=evidence,
        )
    )

    assert scale is None
    assert (
        result[
            "metric_sfm_scale_solved"
        ]
        is False
    )
    assert result[
        "reason"
    ] == (
        "NO_RELIABLE_SAME_MARKER_CAMERA_POSE_EVIDENCE"
    )


def test_metric_scale_solver_rejects_inconsistent_baselines() -> None:
    diagnostics = {
        "camera_poses": {
            "0": _sfm_pose(
                "PHOTO_001",
                (
                    0.0,
                    0.0,
                    0.0,
                ),
            ),
            "1": _sfm_pose(
                "PHOTO_002",
                (
                    2.0,
                    0.0,
                    0.0,
                ),
            ),
            "2": _sfm_pose(
                "PHOTO_003",
                (
                    5.0,
                    0.0,
                    0.0,
                ),
            ),
        },
    }

    # Baselines deliberately do not share one common scale:
    # PHOTO_001 -> PHOTO_002 gives 10 cm/unit,
    # PHOTO_001 -> PHOTO_003 gives 20 cm/unit.
    evidence = [
        _metric_marker_evidence(
            "PHOTO_001",
            7,
            (
                0.0,
                0.0,
                0.0,
            ),
        ),
        _metric_marker_evidence(
            "PHOTO_002",
            7,
            (
                20.0,
                0.0,
                0.0,
            ),
        ),
        _metric_marker_evidence(
            "PHOTO_003",
            7,
            (
                100.0,
                0.0,
                0.0,
            ),
        ),
    ]

    scale, result = (
        _metric_scale_from_marker_camera_baselines(
            multiview_diagnostics=diagnostics,
            calibration_evidence=evidence,
        )
    )

    assert scale is None
    assert (
        result[
            "metric_sfm_scale_solved"
        ]
        is False
    )
    assert result[
        "reason"
    ] in {
        "BASELINE_SCALE_RATIOS_INCONSISTENT",
        "RELIABLE_MARKER_POSES_HAVE_EXCESSIVE_SCALE_SPREAD",
    }
