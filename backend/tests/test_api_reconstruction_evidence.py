from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import numpy as np

from app.api.v1 import analysis as analysis_api
from app.models.entities import (
    CuttingOptimizationResult,
    DefectResult,
    GeometryModel,
    GraniteClassificationResult,
    MeasurementResult,
    SeigniorageAssessment,
    WastageResult,
)


class _FakeQuery:
    def __init__(
        self,
        rows: list[Any],
    ) -> None:
        self._rows = rows

    def filter(
        self,
        *_args: Any,
        **_kwargs: Any,
    ) -> "_FakeQuery":
        return self

    def order_by(
        self,
        *_args: Any,
        **_kwargs: Any,
    ) -> "_FakeQuery":
        return self

    def all(
        self,
    ) -> list[Any]:
        return list(
            self._rows
        )


class _FakeDB:
    def __init__(
        self,
        *,
        block: Any,
        job: Any,
        images: list[Any],
    ) -> None:
        self.block = block
        self.job = job
        self.images = images

    def get(
        self,
        _model: Any,
        key: Any,
    ) -> Any:
        if str(
            key
        ) == str(
            self.block.id
        ):
            return self.block

        return None

    def scalar(
        self,
        _statement: Any,
    ) -> Any:
        # get_block_analysis() first falls back to block lookup only when db.get
        # fails. Our direct-ID lookup succeeds, so the only scalar query is the
        # latest AnalysisJob query.
        return self.job

    def query(
        self,
        _model: Any,
    ) -> _FakeQuery:
        return _FakeQuery(
            self.images
        )


def _image(
    image_id: str,
    label: str,
    sequence: int,
) -> Any:
    return SimpleNamespace(
        id=image_id,
        capture_side=label,
        sequence_number=sequence,
        storage_path=(
            f"images/{image_id}.jpg"
        ),
        created_at=None,
    )


def _pose(
    label: str,
    translation: tuple[
        float,
        float,
        float,
    ],
) -> dict[str, Any]:
    return {
        "capture_label": label,
        "rotation": np.eye(
            3,
            dtype=np.float64,
        ).tolist(),
        "translation_arbitrary_scale": list(
            translation
        ),
        "registration": {
            "status": "REGISTERED",
        },
    }


def _calibration(
    *,
    image_id: str,
    label: str,
    metric_pose_reliable: bool,
) -> dict[str, Any]:
    return {
        "image_id": image_id,
        "surface": label,
        "detected": True,
        "cm_per_pixel": 0.1,
        "calibration_confidence": 0.95,
        "metric_pose_reliable": (
            metric_pose_reliable
        ),
        "camera_intrinsics": {
            "source": "SUPPLIED_CALIBRATED",
            "status": "CALIBRATED",
            "camera_matrix": [
                [
                    1000.0,
                    0.0,
                    500.0,
                ],
                [
                    0.0,
                    1000.0,
                    400.0,
                ],
                [
                    0.0,
                    0.0,
                    1.0,
                ],
            ],
            "metric_pose_reliable": (
                metric_pose_reliable
            ),
        },
        "marker_pose": {
            "available": True,
            "status": (
                "SOLVED_RELIABLE"
                if metric_pose_reliable
                else "SOLVED_APPROXIMATE"
            ),
            "rotation_matrix": np.eye(
                3,
                dtype=np.float64,
            ).tolist(),
            "tvec_cm": [
                0.0,
                0.0,
                100.0,
            ],
            "metric_pose_reliable": (
                metric_pose_reliable
            ),
            "reprojection_rmse_px": 0.5,
        },
        "details": {
            "selected_marker_id": 7,
        },
    }


def _point_cloud_payload(
    *,
    metric_solved: bool,
) -> dict[str, Any]:
    solver = {
        "status": (
            "SOLVED"
            if metric_solved
            else "NOT_SOLVED"
        ),
        "metric_sfm_scale_solved": (
            metric_solved
        ),
        "scale_cm_per_sfm_unit": (
            10.0
            if metric_solved
            else None
        ),
        "marker_id": (
            "7"
            if metric_solved
            else None
        ),
        "reason": (
            "ROBUST_SAME_ARUCO_MARKER_CAMERA_BASELINE_SCALE"
            if metric_solved
            else "NO_RELIABLE_SAME_MARKER_CAMERA_POSE_EVIDENCE"
        ),
    }

    return {
        "points": [
            [
                0.0,
                0.0,
                0.0,
            ],
            [
                10.0,
                20.0,
                30.0,
            ],
        ],
        "calibration": {
            "status": (
                "AVAILABLE"
            ),
            "per_image": [
                _calibration(
                    image_id="img-1",
                    label="PHOTO_001",
                    metric_pose_reliable=(
                        metric_solved
                    ),
                ),
                _calibration(
                    image_id="img-2",
                    label="PHOTO_002",
                    metric_pose_reliable=(
                        metric_solved
                    ),
                ),
                _calibration(
                    image_id="img-3",
                    label="PHOTO_003",
                    metric_pose_reliable=(
                        metric_solved
                    ),
                ),
            ],
        },
        "diagnostics": {
            "registered_camera_count": 3,
            "global_bundle_adjustment": False,
            "sfm_coordinate_scale": (
                "GLOBAL_METRIC_CENTIMETRES"
                if metric_solved
                else "ARBITRARY_RELATIVE_SCALE_BEFORE_ENVELOPE_SCALING"
            ),
            "metric_scale_source": (
                "RELIABLE_ARUCO_CAMERA_BASELINE_CONSTRAINT"
                if metric_solved
                else "LOCAL_IMAGE_PLANE_SESSION_REFERENCE"
            ),
            "metric_sfm_scale_solved": (
                metric_solved
            ),
            "metric_scale_provenance": (
                "ROBUST_RATIO_OF_MARKER_FRAME_CAMERA_BASELINES_TO_SFM_BASELINES"
                if metric_solved
                else "UNIFORM_SCALE_TO_SESSION_CALIBRATED_SILHOUETTE_ENVELOPE"
            ),
            "metric_scale_solver": (
                solver
            ),
            "global_camera_registration": True,
            "sparse_reconstruction": {
                "camera_poses": {
                    "0": _pose(
                        "PHOTO_001",
                        (
                            0.0,
                            0.0,
                            0.0,
                        ),
                    ),
                    "1": _pose(
                        "PHOTO_002",
                        (
                            -2.0,
                            0.0,
                            0.0,
                        ),
                    ),
                    "2": _pose(
                        "PHOTO_003",
                        (
                            -5.0,
                            0.0,
                            0.0,
                        ),
                    ),
                },
                "registered_camera_indexes": [
                    0,
                    1,
                    2,
                ],
                "unregistered_camera_indexes": [],
                "track_count": 24,
                "tracks_with_three_or_more_views": 8,
                "median_track_length": 2.5,
                "median_track_reprojection_error_px": 0.8,
                "global_coordinate_frame": (
                    "SEED_CAMERA_FRAME_ARBITRARY_SCALE"
                ),
            },
        },
    }


def _install_endpoint_fakes(
    monkeypatch: Any,
    *,
    metric_solved: bool,
) -> tuple[
    _FakeDB,
    list[Any],
]:
    block = SimpleNamespace(
        id="block-1",
        status="ANALYZED",
    )

    job = SimpleNamespace(
        id="job-1",
        block_id="block-1",
        capture_session_id="session-1",
        state="COMPLETED",
        created_at=None,
    )

    images = [
        _image(
            "img-1",
            "PHOTO_001",
            1,
        ),
        _image(
            "img-2",
            "PHOTO_002",
            2,
        ),
        _image(
            "img-3",
            "PHOTO_003",
            3,
        ),
    ]

    fake_db = _FakeDB(
        block=block,
        job=job,
        images=images,
    )

    row_map = {
        MeasurementResult: {
            "job_id": "job-1",
            "length_cm": 100.0,
            "breadth_cm": 80.0,
            "height_cm": 60.0,
            "cm_per_pixel": 0.1,
            "calibration_method": "ARUCO",
            "surfaces_analyzed": [
                "PHOTO_001",
                "PHOTO_002",
                "PHOTO_003",
            ],
        },
        GeometryModel: {
            "job_id": "job-1",
            "point_cloud_path": (
                "geometry/job-1/point_cloud.json"
            ),
            "match_count": 120,
            "point_count": 24,
            "inlier_ratio": 0.8,
            "reconstruction_confidence": 0.9,
            "reconstruction_provider": (
                "OpenCV Incremental Multi-View "
                "Sparse SfM Reconstruction"
            ),
            "bounding_box_json": {
                "missing_surfaces": [
                    "BOTTOM",
                ],
                "bottom_surface_status": (
                    "UNOBSERVED"
                ),
                "bottom_geometry_injected": False,
            },
            "simplified_geometry_json": {},
            "notes": "{}",
        },
        DefectResult: None,
        GraniteClassificationResult: None,
        CuttingOptimizationResult: None,
        WastageResult: None,
        SeigniorageAssessment: None,
    }

    monkeypatch.setattr(
        analysis_api,
        "_row_dict",
        lambda _db, model, _job_id: (
            dict(
                row_map[
                    model
                ]
            )
            if isinstance(
                row_map.get(
                    model
                ),
                dict,
            )
            else None
        ),
    )

    monkeypatch.setattr(
        analysis_api,
        "_load_json_artifact",
        lambda _path: (
            _point_cloud_payload(
                metric_solved=(
                    metric_solved
                )
            )
        ),
    )

    monkeypatch.setattr(
        analysis_api,
        "_load_block_image",
        lambda _image_row: None,
    )

    monkeypatch.setattr(
        analysis_api,
        "_artifact_exists",
        lambda _path: False,
    )

    monkeypatch.setattr(
        analysis_api,
        "check_capabilities",
        lambda: {
            "geometry_processing": {
                "status": "OPERATIONAL",
            },
        },
    )

    monkeypatch.setattr(
        analysis_api,
        "job_payload",
        lambda _db, _job: {
            "id": "job-1",
            "state": "COMPLETED",
        },
    )

    monkeypatch.setattr(
        analysis_api,
        "generate_cutting_explanation",
        lambda **_kwargs: None,
    )

    return (
        fake_db,
        images,
    )


def test_analysis_api_exposes_global_metric_scale_and_camera_poses(
    monkeypatch: Any,
) -> None:
    db, _images = (
        _install_endpoint_fakes(
            monkeypatch,
            metric_solved=True,
        )
    )

    response = (
        analysis_api.get_block_analysis(
            "block-1",
            language="en",
            accept_language=None,
            db=db,
        )
    )

    quality = response[
        "reconstruction_quality"
    ]

    assert (
        quality[
            "metric_sfm_scale_solved"
        ]
        is True
    )

    assert (
        quality[
            "metric_scale_source"
        ]
        == "RELIABLE_ARUCO_CAMERA_BASELINE_CONSTRAINT"
    )

    assert (
        quality[
            "metric_scale_cm_per_sfm_unit"
        ]
        == 10.0
    )

    assert (
        quality[
            "registered_camera_count"
        ]
        == 3
    )

    assert (
        quality[
            "camera_poses_available"
        ]
        is True
    )

    assert (
        quality[
            "global_bundle_adjustment"
        ]
        is False
    )

    rows = response[
        "photo_evidence_matrix"
    ]

    assert len(
        rows
    ) == 3

    row2 = next(
        row
        for row in rows
        if row[
            "photo_label"
        ]
        == "PHOTO_002"
    )

    assert (
        row2[
            "camera_pose_status"
        ]
        == "REGISTERED_GLOBAL_METRIC_SFM"
    )

    assert (
        row2[
            "camera_pose"
        ][
            "translation_sfm_units"
        ]
        == [
            -2.0,
            0.0,
            0.0,
        ]
    )

    assert (
        row2[
            "camera_pose"
        ][
            "translation_cm"
        ]
        == [
            -20.0,
            0.0,
            0.0,
        ]
    )

    assert (
        row2[
            "camera_pose"
        ][
            "metric_scale_applied"
        ]
        is True
    )

    assert (
        row2[
            "metric_pose_reliable"
        ]
        is True
    )

    assert (
        row2[
            "camera_intrinsics"
        ][
            "status"
        ]
        == "CALIBRATED"
    )

    assert (
        row2[
            "marker_pose"
        ][
            "available"
        ]
        is True
    )


def test_analysis_api_never_fabricates_metric_translation_without_global_scale(
    monkeypatch: Any,
) -> None:
    db, _images = (
        _install_endpoint_fakes(
            monkeypatch,
            metric_solved=False,
        )
    )

    response = (
        analysis_api.get_block_analysis(
            "block-1",
            language="en",
            accept_language=None,
            db=db,
        )
    )

    quality = response[
        "reconstruction_quality"
    ]

    assert (
        quality[
            "metric_sfm_scale_solved"
        ]
        is False
    )

    assert (
        quality[
            "metric_scale_cm_per_sfm_unit"
        ]
        is None
    )

    for row in response[
        "photo_evidence_matrix"
    ]:
        assert (
            row[
                "camera_pose_status"
            ]
            == "REGISTERED_RELATIVE_SFM"
        )

        assert (
            row[
                "camera_pose"
            ][
                "translation_cm"
            ]
            is None
        )

        assert (
            row[
                "camera_pose"
            ][
                "metric_scale_applied"
            ]
            is False
        )


def test_analysis_api_preserves_sequential_labels_without_surface_invention(
    monkeypatch: Any,
) -> None:
    db, _images = (
        _install_endpoint_fakes(
            monkeypatch,
            metric_solved=True,
        )
    )

    response = (
        analysis_api.get_block_analysis(
            "block-1",
            language="en",
            accept_language=None,
            db=db,
        )
    )

    labels = [
        row[
            "photo_label"
        ]
        for row
        in response[
            "photo_evidence_matrix"
        ]
    ]

    assert labels == [
        "PHOTO_001",
        "PHOTO_002",
        "PHOTO_003",
    ]

    assert all(
        row[
            "side"
        ]
        == row[
            "photo_label"
        ]
        for row
        in response[
            "photo_evidence_matrix"
        ]
    )

    assert all(
        row[
            "camera_angles"
        ]
        is None
        for row
        in response[
            "photo_evidence_matrix"
        ]
    )


def test_analysis_api_exposes_track_and_scale_solver_diagnostics(
    monkeypatch: Any,
) -> None:
    db, _images = (
        _install_endpoint_fakes(
            monkeypatch,
            metric_solved=True,
        )
    )

    response = (
        analysis_api.get_block_analysis(
            "block-1",
            language="en",
            accept_language=None,
            db=db,
        )
    )

    quality = response[
        "reconstruction_quality"
    ]

    sparse = quality[
        "sparse_reconstruction_summary"
    ]

    assert sparse[
        "track_count"
    ] == 24

    assert (
        sparse[
            "tracks_with_three_or_more_views"
        ]
        == 8
    )

    assert (
        sparse[
            "median_track_reprojection_error_px"
        ]
        == 0.8
    )

    solver = quality[
        "metric_scale_solver"
    ]

    assert solver[
        "status"
    ] == "SOLVED"

    assert (
        solver[
            "scale_cm_per_sfm_unit"
        ]
        == 10.0
    )

    assert (
        solver[
            "marker_id"
        ]
        == "7"
    )


def test_analysis_api_matches_calibration_by_image_id_before_label() -> None:
    rows = [
        {
            "image_id": "img-a",
            "surface": "PHOTO_001",
            "cm_per_pixel": 0.1,
        },
        {
            "image_id": "img-b",
            "surface": "PHOTO_001",
            "cm_per_pixel": 0.2,
        },
    ]

    selected = (
        analysis_api._calibration_for_capture(
            rows,
            capture_label=(
                "PHOTO_001"
            ),
            image_id="img-b",
        )
    )

    assert selected is not None
    assert (
        selected[
            "image_id"
        ]
        == "img-b"
    )
    assert (
        selected[
            "cm_per_pixel"
        ]
        == 0.2
    )


def test_analysis_api_metric_translation_helper_rejects_invalid_scale() -> None:
    pose = _pose(
        "PHOTO_001",
        (
            2.0,
            3.0,
            4.0,
        ),
    )

    assert (
        analysis_api._scaled_sfm_translation_cm(
            pose,
            None,
        )
        is None
    )

    assert (
        analysis_api._scaled_sfm_translation_cm(
            pose,
            0.0,
        )
        is None
    )

    assert (
        analysis_api._scaled_sfm_translation_cm(
            pose,
            -10.0,
        )
        is None
    )
