from __future__ import annotations

from app.ai.measurement_quality_gate import evaluate_measurement_release_gate


def _strong(**overrides):
    payload = dict(
        capture_sides=[
            "FRONT",
            "FRONT_RIGHT",
            "RIGHT",
            "BACK",
            "LEFT",
            "TOP",
        ],
        usable_mask_count=6,
        segmentation_confidence=0.91,
        calibration_available=True,
        calibration_confidence=0.92,
        global_metric_scale_solved=True,
        coordinate_scale="GLOBAL_METRIC_CENTIMETRES",
        registered_camera_count=6,
        match_count=640,
        inlier_ratio=0.78,
        reconstruction_confidence=0.88,
        point_count=2500,
        dimensions_cm=(280.0, 165.0, 138.0),
        uncertainties_cm=(7.0, 5.0, 4.0),
        reconstruction_extents_cm=(277.0, 168.0, 136.0),
        geometry_source="SPARSE_SFM_FALLBACK",
    )
    payload.update(overrides)
    return evaluate_measurement_release_gate(**payload)


def test_strong_multiview_metric_evidence_is_released():
    result = _strong()
    assert result.allowed is True
    assert result.status == "MEASUREMENT_RELEASE_ALLOWED"


def test_local_scale_does_not_masquerade_as_global_metric_3d():
    result = _strong(
        global_metric_scale_solved=False,
        coordinate_scale="SFM_RELATIVE_SCALE",
    )
    assert result.allowed is False
    assert result.checks["global_metric_scale"]["passed"] is False


def test_high_confidence_cannot_override_bad_uncertainty():
    result = _strong(
        reconstruction_confidence=0.97,
        uncertainties_cm=(35.0, 20.0, 16.0),
    )
    assert result.allowed is False
    assert result.checks["axis_uncertainty"]["passed"] is False


def test_too_few_views_is_rejected():
    result = _strong(
        capture_sides=["FRONT", "RIGHT", "LEFT"],
        usable_mask_count=3,
        registered_camera_count=3,
    )
    assert result.allowed is False
    assert result.checks["capture_count"]["passed"] is False
    assert result.checks["unique_viewpoints"]["passed"] is False


def test_extent_disagreement_is_rejected():
    result = _strong(
        reconstruction_extents_cm=(220.0, 120.0, 95.0),
    )
    assert result.allowed is False
    assert result.checks["geometry_cross_check"]["passed"] is False
