from __future__ import annotations

import numpy as np

from app.ai.providers.reconstruction import (
    _merge_pair_points_into_tracks,
    _pnp_correspondences_from_registered_view,
)


def _xyz(x: float) -> np.ndarray:
    return np.asarray(
        [[x, 0.0, 5.0]],
        dtype=np.float64,
    )


def _uv(x: float, y: float) -> np.ndarray:
    return np.asarray(
        [[x, y]],
        dtype=np.float64,
    )


def test_stable_feature_identity_extends_track_across_three_views() -> None:
    tracks: list[dict] = []

    first = _merge_pair_points_into_tracks(
        tracks,
        0,
        1,
        _xyz(0.0),
        _uv(100.0, 100.0),
        _uv(200.0, 100.0),
        np.asarray([0.5], dtype=np.float64),
        feature_ids_i=["cam0-feature-a"],
        feature_ids_j=["cam1-feature-a"],
        feature_indices_i=np.asarray([10], dtype=np.int64),
        feature_indices_j=np.asarray([20], dtype=np.int64),
    )

    assert first["association_method"] == "STABLE_FEATURE_IDENTITY"
    assert first["created"] == 1
    assert len(tracks) == 1

    second = _merge_pair_points_into_tracks(
        tracks,
        1,
        2,
        _xyz(0.1),
        # Deliberately displaced far beyond the legacy 2.5 px gate.
        _uv(260.0, 160.0),
        _uv(300.0, 120.0),
        np.asarray([0.7], dtype=np.float64),
        feature_ids_i=["cam1-feature-a"],
        feature_ids_j=["cam2-feature-a"],
        feature_indices_i=np.asarray([20], dtype=np.int64),
        feature_indices_j=np.asarray([30], dtype=np.int64),
    )

    assert second["association_method"] == "STABLE_FEATURE_IDENTITY"
    assert second["extended"] == 1
    assert len(tracks) == 1

    track = tracks[0]

    assert set(track["observations"].keys()) == {0, 1, 2}
    assert track["feature_ids"][0] == "cam0-feature-a"
    assert track["feature_ids"][1] == "cam1-feature-a"
    assert track["feature_ids"][2] == "cam2-feature-a"

    assert track["feature_indices"][0] == 10
    assert track["feature_indices"][1] == 20
    assert track["feature_indices"][2] == 30


def test_stable_feature_identity_does_not_merge_conflicting_tracks() -> None:
    tracks: list[dict] = []

    _merge_pair_points_into_tracks(
        tracks,
        0,
        1,
        _xyz(0.0),
        _uv(10.0, 10.0),
        _uv(20.0, 10.0),
        np.asarray([0.4], dtype=np.float64),
        feature_ids_i=["a0"],
        feature_ids_j=["shared-1"],
    )

    _merge_pair_points_into_tracks(
        tracks,
        1,
        2,
        _xyz(1.0),
        _uv(200.0, 200.0),
        _uv(210.0, 200.0),
        np.asarray([0.4], dtype=np.float64),
        feature_ids_i=["other-1"],
        feature_ids_j=["c2"],
    )

    assert len(tracks) == 2

    result = _merge_pair_points_into_tracks(
        tracks,
        0,
        2,
        _xyz(0.5),
        _uv(10.0, 10.0),
        _uv(210.0, 200.0),
        np.asarray([0.5], dtype=np.float64),
        feature_ids_i=["a0"],
        feature_ids_j=["c2"],
    )

    assert result["conflicting_track_associations"] == 1
    assert len(tracks) == 2


def test_pnp_track_lookup_uses_feature_identity_not_coordinate_proximity() -> None:
    tracks = [
        {
            "point": np.asarray([1.0, 2.0, 8.0], dtype=np.float64),
            "observations": {
                0: np.asarray([50.0, 50.0], dtype=np.float64),
            },
            "feature_ids": {
                0: "stable-feature-0",
            },
            "feature_indices": {
                0: 17,
            },
        }
    ]

    object_points, image_points, indexes, method = (
        _pnp_correspondences_from_registered_view(
            tracks,
            registered_camera=0,
            # 100+ px away from stored coordinate; identity must still match.
            registered_points=np.asarray(
                [[180.0, 180.0]],
                dtype=np.float64,
            ),
            candidate_points=np.asarray(
                [[300.0, 220.0]],
                dtype=np.float64,
            ),
            registered_feature_ids=["stable-feature-0"],
        )
    )

    assert method == "STABLE_FEATURE_IDENTITY"
    assert indexes == [0]
    assert object_points.shape == (1, 3)
    assert image_points.shape == (1, 2)
    assert np.allclose(
        object_points[0],
        [1.0, 2.0, 8.0],
    )
    assert np.allclose(
        image_points[0],
        [300.0, 220.0],
    )


def test_legacy_proximity_fallback_remains_explicit_for_old_matchers() -> None:
    tracks = [
        {
            "point": np.asarray([0.0, 0.0, 4.0], dtype=np.float64),
            "observations": {
                0: np.asarray([100.0, 100.0], dtype=np.float64),
            },
            "feature_ids": {},
        }
    ]

    object_points, image_points, indexes, method = (
        _pnp_correspondences_from_registered_view(
            tracks,
            registered_camera=0,
            registered_points=np.asarray(
                [[101.0, 100.5]],
                dtype=np.float64,
            ),
            candidate_points=np.asarray(
                [[220.0, 130.0]],
                dtype=np.float64,
            ),
            registered_feature_ids=None,
        )
    )

    assert method == "LEGACY_BOUNDED_IMAGE_SPACE_PROXIMITY"
    assert indexes == [0]
    assert object_points.shape == (1, 3)
    assert image_points.shape == (1, 2)
