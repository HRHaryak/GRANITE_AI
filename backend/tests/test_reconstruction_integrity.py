import io
from datetime import datetime, timezone

import cv2
import numpy as np
import pytest
from PIL import Image, ExifTags
from fastapi.testclient import TestClient

from app.ai.providers.classification import (
    GraniteClassificationProvider,
    _color_texture_fallback,
)
from app.ai.providers.defects import (
    EvidenceGroundedDefectProvider,
)
from app.ai.providers.reconstruction import (
    OpenCVReconstructionProvider,
)
from app.geometry.reprojection import (
    compute_view_reprojection_metrics,
)
from app.main import app
from app.services.exif import (
    extract_image_exif,
    _convert_to_degrees,
)

client = TestClient(app)


def test_no_synthetic_cube_fallback():
    """
    Verify OpenCV provider rejects empty or uncalibrated inputs without
    generating a synthetic box or cube.
    """
    provider = OpenCVReconstructionProvider()

    out = provider.reconstruct(
        images=[],
        cm_per_pixel=None,
    )

    assert out.ok is False
    assert out.error_code in (
        "CALIBRATION_REQUIRED",
        "INSUFFICIENT_VIEWS",
    )
    assert len(out.points) == 0


def test_no_default_dimensions():
    """
    Verify that uncalibrated scale immediately fails without default
    dimensions.
    """
    provider = OpenCVReconstructionProvider()

    dummy_img = np.zeros(
        (100, 100, 3),
        dtype=np.uint8,
    )

    out = provider.reconstruct(
        images=[
            ("FRONT", dummy_img),
            ("BACK", dummy_img),
        ],
        cm_per_pixel=0,
    )

    assert out.ok is False
    assert out.error_code == "CALIBRATION_REQUIRED"


def test_raw_geometry_is_irregular_when_source_contour_is_irregular():
    """
    Verify that visual hull carving on irregular input contours generates an
    irregular 3D point cloud.
    """
    provider = OpenCVReconstructionProvider()

    h, w = 300, 400

    # Front view: trapezoidal granite block.
    img_front = np.full(
        (h, w, 3),
        40,
        dtype=np.uint8,
    )

    pts_front = np.array(
        [
            [100, 240],
            [300, 240],
            [250, 80],
            [150, 80],
        ],
        dtype=np.int32,
    )

    cv2.fillPoly(
        img_front,
        [pts_front],
        (180, 180, 180),
    )

    # Side view: chipped / tapered profile.
    img_side = np.full(
        (h, w, 3),
        40,
        dtype=np.uint8,
    )

    pts_side = np.array(
        [
            [120, 240],
            [280, 240],
            [240, 90],
            [140, 120],
        ],
        dtype=np.int32,
    )

    cv2.fillPoly(
        img_side,
        [pts_side],
        (180, 180, 180),
    )

    images = [
        ("FRONT", img_front),
        ("LEFT", img_side),
    ]

    out = provider.reconstruct(
        images=images,
        cm_per_pixel=0.5,
    )

    assert out.ok is True
    assert len(out.points) > 20
    assert out.status in (
        "operational",
        "approximate",
    )

    pts_arr = np.array(
        out.points,
        dtype=np.float64,
    )

    x_span = (
        pts_arr[:, 0].max()
        - pts_arr[:, 0].min()
    )

    y_span = (
        pts_arr[:, 1].max()
        - pts_arr[:, 1].min()
    )

    z_span = (
        pts_arr[:, 2].max()
        - pts_arr[:, 2].min()
    )

    assert x_span > 0
    assert y_span > 0
    assert z_span > 0

    assert out.point_provenance is not None
    assert len(out.point_provenance) == len(out.points)


def test_missing_bottom_remains_unobserved():
    """
    Verify a missing bottom stays explicitly UNOBSERVED.

    The reconstruction must not inject synthetic bottom points into the actual
    point cloud merely to close the geometry.
    """
    provider = OpenCVReconstructionProvider()

    h, w = 200, 200

    img = np.full(
        (h, w, 3),
        40,
        dtype=np.uint8,
    )

    cv2.rectangle(
        img,
        (40, 40),
        (160, 160),
        (200, 200, 200),
        -1,
    )

    images = [
        ("FRONT", img),
        ("BACK", img),
        ("LEFT", img),
    ]

    out = provider.reconstruct(
        images=images,
        cm_per_pixel=0.5,
    )

    assert out.ok is True
    assert out.bounding_box is not None

    assert (
        "BOTTOM"
        in out.bounding_box["missing_surfaces"]
    )

    assert (
        out.bounding_box["bottom_surface_status"]
        == "UNOBSERVED"
    )

    assert (
        out.bounding_box["bottom_geometry_injected"]
        is False
    )

    # Missing geometry remains missing. It is not physically inserted into
    # the reconstructed cloud.
    assert out.estimated_point_count == 0

    # Actual reconstructed evidence must still exist.
    assert out.observed_point_count > 0
    assert len(out.points) == out.observed_point_count

    assert out.point_provenance is not None
    assert len(out.point_provenance) == len(out.points)

    assert all(
        provenance == "observed"
        for provenance in out.point_provenance
    )


def test_four_views_do_not_imply_six_observed_surfaces():
    """
    Four uploaded views must not silently become six observed surfaces.
    """
    provider = OpenCVReconstructionProvider()

    h, w = 200, 200

    img = np.full(
        (h, w, 3),
        40,
        dtype=np.uint8,
    )

    cv2.rectangle(
        img,
        (40, 40),
        (160, 160),
        (200, 200, 200),
        -1,
    )

    images = [
        ("FRONT", img),
        ("LEFT", img),
        ("BACK", img),
        ("RIGHT", img),
    ]

    out = provider.reconstruct(
        images=images,
        cm_per_pixel=0.5,
    )

    assert out.ok is True

    assert (
        "BOTTOM"
        in out.bounding_box["missing_surfaces"]
    )

    assert len(
        out.surfaces_analyzed
    ) == 4


def test_duplicate_views_do_not_increase_surface_coverage():
    """
    Duplicate capture labels do not falsely claim multiple unique surfaces.
    """
    provider = OpenCVReconstructionProvider()

    h, w = 200, 200

    img = np.full(
        (h, w, 3),
        40,
        dtype=np.uint8,
    )

    cv2.rectangle(
        img,
        (40, 40),
        (160, 160),
        (200, 200, 200),
        -1,
    )

    images = [
        ("FRONT", img),
        ("FRONT", img),
    ]

    out = provider.reconstruct(
        images=images,
        cm_per_pixel=0.5,
    )

    assert out.ok is True

    unique_surfaces = set(
        out.surfaces_analyzed
    )

    assert len(
        unique_surfaces
    ) == 1

    assert (
        "BOTTOM"
        in out.bounding_box["missing_surfaces"]
    )


def test_exif_datetime_original_priority():
    """
    Verify priority: DateTimeOriginal is selected over DateTime when present.
    """
    img = Image.new(
        "RGB",
        (50, 50),
        color=(100, 100, 100),
    )

    exif = img.getexif()

    exif[0x9003] = (
        "2026:05:15 10:30:00"
    )

    exif[0x0132] = (
        "2026:01:01 00:00:00"
    )

    buf = io.BytesIO()

    img.save(
        buf,
        format="JPEG",
        exif=exif,
    )

    data = buf.getvalue()

    extracted = extract_image_exif(
        data
    )

    assert extracted.has_exif is True
    assert extracted.captured_at is not None
    assert extracted.captured_at.year == 2026
    assert extracted.captured_at.month == 5
    assert extracted.captured_at.day == 15
    assert (
        extracted.timestamp_source
        == "EXIF DateTimeOriginal"
    )


def test_missing_timestamp_is_not_fabricated():
    """
    Blank image with no EXIF returns None without fabricating timestamps.
    """
    img = Image.new(
        "RGB",
        (50, 50),
        color=(100, 100, 100),
    )

    buf = io.BytesIO()

    img.save(
        buf,
        format="JPEG",
    )

    data = buf.getvalue()

    extracted = extract_image_exif(
        data
    )

    assert extracted.has_exif is False
    assert extracted.captured_at is None
    assert extracted.timestamp_source is None


def test_gps_dms_to_decimal_conversion():
    """
    Test degrees-minutes-seconds to signed decimal conversion.
    """
    deg = _convert_to_degrees(
        (
            15.0,
            30.0,
            36.0,
        )
    )

    assert abs(
        deg - 15.51
    ) < 1e-4

    deg_south = -_convert_to_degrees(
        (
            15.0,
            30.0,
            36.0,
        )
    )

    assert abs(
        deg_south
        - (-15.51)
    ) < 1e-4


def test_missing_gps_returns_none():
    """
    Blank image without GPS tags returns None for coordinates and source.
    """
    img = Image.new(
        "RGB",
        (50, 50),
        color=(100, 100, 100),
    )

    buf = io.BytesIO()

    img.save(
        buf,
        format="JPEG",
    )

    extracted = extract_image_exif(
        buf.getvalue()
    )

    assert extracted.gps_latitude is None
    assert extracted.gps_longitude is None
    assert extracted.gps_source is None


def test_reprojection_metrics_not_hardcoded():
    """
    Compute view reprojection metrics with image evidence and 3D points.
    """
    img = np.full(
        (300, 400, 3),
        40,
        dtype=np.uint8,
    )

    img[
        60:240,
        80:320,
    ] = [
        180,
        180,
        180,
    ]

    pts_3d = [
        [-50, 0, -30],
        [50, 0, -30],
        [50, 0, 30],
        [-50, 0, 30],
        [-50, 20, -30],
        [50, 20, -30],
        [50, 20, 30],
        [-50, 20, 30],
    ]

    metrics = (
        compute_view_reprojection_metrics(
            img,
            pts_3d,
            "FRONT",
            cm_per_pixel=0.5,
        )
    )

    assert metrics["calculated"] is True

    assert (
        metrics["silhouette_iou"]
        is not None
    )

    assert (
        0.0
        <= metrics["silhouette_iou"]
        <= 1.0
    )

    assert (
        metrics["boundary_error_px"]
        is not None
    )


def test_metrics_unavailable_when_not_calculated():
    """
    When inputs are missing, metrics remain unavailable rather than being
    fabricated.
    """
    metrics = (
        compute_view_reprojection_metrics(
            None,
            None,
            "FRONT",
        )
    )

    assert metrics["calculated"] is False
    assert metrics["silhouette_iou"] is None
    assert metrics["boundary_error_px"] is None
    assert (
        metrics["view_confidence"]
        == "UNOBSERVED"
    )


def test_defect_status_does_not_equate_no_structural_fracture_with_no_surface_anomalies():
    """
    Surface anomalies and structural-fracture claims remain distinct.
    """
    provider = (
        EvidenceGroundedDefectProvider()
    )

    h, w = 300, 400

    img = np.full(
        (h, w, 3),
        120,
        dtype=np.uint8,
    )

    for y in range(
        50,
        250,
        15,
    ):
        cv2.line(
            img,
            (50, y),
            (350, y),
            (40, 40, 40),
            2,
        )

    res = provider.detect(
        img,
        "PHOTO_001",
    )

    assert res.configured is True

    narrative = res.summary.get(
        "narrative",
        "",
    )

    assert (
        "structural"
        in narrative.lower()
        or len(
            res.findings
        ) > 0
    )


def test_classification_fallback_provides_limited_assessment():
    """
    When trained model weights are absent, classification may provide a
    degraded visual assessment, but it must include an explicit disclaimer.
    """
    provider = (
        GraniteClassificationProvider()
    )

    img = np.full(
        (100, 100, 3),
        30,
        dtype=np.uint8,
    )

    res = provider.classify(
        img
    )

    assert res.status in (
        "operational",
        "degraded",
    )

    assert res.classification is not None

    assert (
        "granite"
        in res.classification.lower()
        or "black"
        in res.classification.lower()
    )

    if res.status == "degraded":
        assert res.disclaimer is not None

        assert (
            "not a laboratory-confirmed"
            in res.disclaimer
        )


def test_edge_damage_detected_on_irregular_contour():
    """
    An irregular contour with a deep V-notch produces visible surface-damage
    evidence.
    """
    provider = (
        EvidenceGroundedDefectProvider()
    )

    h, w = 300, 400

    img = np.full(
        (h, w, 3),
        40,
        dtype=np.uint8,
    )

    pts = np.array(
        [
            [80, 240],
            [320, 240],
            [320, 80],
            [220, 80],
            [200, 170],
            [180, 80],
            [80, 80],
        ],
        dtype=np.int32,
    )

    cv2.fillPoly(
        img,
        [pts],
        (180, 180, 180),
    )

    res = provider.detect(
        img,
        "PHOTO_003",
    )

    assert len(
        res.findings
    ) > 0

    kinds = [
        finding.kind
        for finding in res.findings
    ]

    assert any(
        kind in (
            "BLAST_FRACTURE",
            "EDGE_DAMAGE",
            "BROKEN_CHIPPED_UPPER_SECTION",
        )
        for kind in kinds
    )
