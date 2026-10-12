import faulthandler
import sys

import uuid
import numpy as np
from fastapi.testclient import TestClient

from app.ai.capabilities import check_capabilities
from app.ai.confidence import calculate_pipeline_confidence
from app.geometry.open3d_processing import process_point_cloud_open3d
from app.geometry.trimesh_processing import validate_mesh_trimesh
from app.main import app
from app.services.cutting import optimize_cutting, wastage_from_geometry


def test_capabilities_registry_honesty():
    caps = check_capabilities()
    assert "granite_detection" in caps
    assert "granite_segmentation" in caps
    assert "feature_matching" in caps
    assert "photogrammetry_reconstruction" in caps
    assert "geometry_processing" in caps
    assert "mesh_processing" in caps
    assert "defect_detection" in caps
    assert "cutting_optimization" in caps
    assert "scale_calibration" in caps

    assert caps["geometry_processing"]["status"] == "OPERATIONAL"
    assert caps["mesh_processing"]["status"] == "OPERATIONAL"
    assert caps["cutting_optimization"]["status"] == "OPERATIONAL"

    assert caps["granite_classification"]["status"] in (
        "OPERATIONAL",
        "NOT_CONFIGURED",
    )


def test_confidence_scoring_model():
    score = calculate_pipeline_confidence(
        num_images=8,
        image_qualities=[0.85, 0.90, 0.88, 0.92],
        match_inlier_ratio=0.82,
        match_count=120,
        calibration_confidence=0.90,
        length_cm=280.0,
        length_uncertainty_cm=8.0,
        point_count=350,
        mesh_is_watertight=True,
        segmentation_confidence=0.92,
    )
    assert score.overall_confidence >= 0.80
    assert score.grade == "HIGH"
    assert "image_quality" in score.factors
    assert "geometry" in score.factors
    assert "coverage" in score.factors


def test_confidence_scoring_low_coverage():
    score = calculate_pipeline_confidence(
        num_images=2,
        image_qualities=[0.40, 0.45],
        match_inlier_ratio=0.30,
        match_count=15,
        calibration_confidence=0.40,
        length_cm=200.0,
        length_uncertainty_cm=45.0,
        point_count=20,
        mesh_is_watertight=False,
        segmentation_confidence=0.50,
    )
    assert score.overall_confidence < 0.60
    assert score.grade in ("LOW", "INSUFFICIENT")


def test_open3d_geometry_processing():
    rng = np.random.default_rng(42)
    pts = rng.uniform(
        low=[0, 0, 0],
        high=[200, 100, 80],
        size=(100, 3),
    )
    result = process_point_cloud_open3d(pts)
    assert result.ok is True
    assert result.length_cm is not None
    assert result.length_cm > 0
    assert result.oriented_bounding_box is not None
    assert result.axis_aligned_bounding_box is not None
    assert result.point_count > 0


def test_trimesh_mesh_validation():
    rng = np.random.default_rng(42)
    pts = rng.uniform(
        low=[0, 0, 0],
        high=[200, 100, 80],
        size=(50, 3),
    )
    res = validate_mesh_trimesh(
        pts,
        length_cm=200,
        breadth_cm=100,
        height_cm=80,
    )
    assert res.volume_m3 is not None
    assert res.volume_m3 > 0
    assert res.volume_status in ("reliable", "estimated")
    assert res.surface_area_m2 is not None


def test_ortools_cutting_optimization():
    res = optimize_cutting(
        length_cm=300.0,
        breadth_cm=180.0,
        height_cm=120.0,
        defect_exclusion_cm3=1000.0,
        irregularity_ratio=0.05,
    )
    assert "Cutting Optimization" in res["label"]
    assert "Google OR-Tools" in res["solver"]
    assert res["max_usable_volume_cm3"] > 0
    assert len(res["orientations"]) == 3
    assert res["usable_area_m2"] > 0
    assert res["pieces_estimated"] > 0


def test_wastage_from_geometry():
    w = wastage_from_geometry(
        length_cm=300.0,
        breadth_cm=180.0,
        height_cm=120.0,
        adjusted_volume_cm3=6_000_000.0,
        max_usable_cut_cm3=5_200_000.0,
        defect_exclusion_cm3=100_000.0,
    )
    assert w["bounding_volume_cm3"] == 6_480_000.0
    assert w["max_usable_cut_volume_cm3"] == 5_200_000.0
    assert w["waste_percentage"] is not None
    assert w["waste_percentage"] > 0


def test_api_capabilities_endpoint():
    client = TestClient(app)
    response = client.get("/api/v1/capabilities")
    assert response.status_code == 200
    data = response.json()
    assert "geometry_processing" in data
    assert data["geometry_processing"]["status"] == "OPERATIONAL"


def test_health_endpoint():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

    response2 = client.get("/api/v1/health")
    assert response2.status_code == 200
    assert response2.json()["status"] == "ok"


def test_rate_limiter_allows_normal_traffic():
    """Normal traffic (well under the limit) must not be rejected."""
    client = TestClient(app)
    for _ in range(5):
        r = client.get("/health")
        assert r.status_code == 200


def test_rate_limiter_blocks_excessive_requests():
    """Requests beyond the limit for a single IP must receive HTTP 429."""
    from app.middleware.rate_limit import SlidingWindowRateLimiter
    from fastapi import FastAPI

    test_app = FastAPI()
    test_app.add_middleware(
        SlidingWindowRateLimiter,
        limit=3,
    )

    @test_app.get("/probe")
    def probe():
        return {"ok": True}

    probe_client = TestClient(
        test_app,
        raise_server_exceptions=False,
    )
    responses = [
        probe_client.get("/probe")
        for _ in range(6)
    ]
    statuses = [
        r.status_code
        for r in responses
    ]
    assert 429 in statuses, (
        f"Expected at least one 429 but got: {statuses}"
    )
    assert all(
        s == 200
        for s in statuses[:3]
    )



def _e2e_progress(message: str) -> None:
    """Emit immediately-flushed progress so CI/PowerShell shows the exact stage."""
    print(
        f"[E2E-PROGRESS] {message}",
        flush=True,
    )


def test_full_e2e_workflow():
    """Test the complete end-to-end flow using physically consistent views.

    The synthetic fixture creates one irregular 3D granite body, one persistent
    set of physical 3D texture features, and four real pinhole-camera views.

    Unlike the older fixture, this test does not simulate depth by manually
    shifting 2D pixels. Every feature observation is a projection of the same
    3D point through a known world->camera pose, so epipolar geometry, parallax,
    PnP registration, multi-view tracks and triangulation are mutually
    consistent.
    """
    import cv2
    import io

    from app.database.session import ensure_schema
    from app.workers.analysis import run_analysis_job

    # If any native/CV/DB call blocks, dump the live Python stack every
    # 20 seconds instead of leaving the terminal apparently frozen.
    faulthandler.enable(file=sys.stderr, all_threads=True)
    faulthandler.dump_traceback_later(
        20,
        repeat=True,
        file=sys.stderr,
    )

    _e2e_progress("01 schema/start")
    ensure_schema()
    _e2e_progress("02 schema ready")

    client = TestClient(app)
    _e2e_progress("03 TestClient ready")

    _e2e_progress("04 health request")
    r_health = client.get("/health")
    assert r_health.status_code == 200
    _e2e_progress("05 health ok")

    _e2e_progress("06 capabilities request")
    r_caps = client.get("/api/v1/capabilities")
    assert r_caps.status_code == 200
    _e2e_progress("07 capabilities ok")

    # Resolve the intended category by stable code, then send the actual
    # database ID expected by QuarryCreate.granite_category_id.
    r_categories = client.get("/api/v1/granite-categories")
    assert r_categories.status_code == 200, (
        "Granite category lookup failed: "
        f"status={r_categories.status_code}, "
        f"body={r_categories.text}"
    )
    categories = r_categories.json()
    black_granite_category = next(
        (
            category
            for category in categories
            if category.get("code") == "BLACK_GRANITE"
        ),
        None,
    )
    assert black_granite_category is not None, (
        "BLACK_GRANITE category was not seeded."
    )
    black_granite_category_id = black_granite_category["id"]


    q_payload = {
        "quarry_name": "Khammam Black Crystal Mine",
        "quarry_code": f"Q-E2E-{uuid.uuid4().hex[:12].upper()}",
        "lease_id": "TS-KHM-2026-099",
        "district": "Khammam",
        "mandal": "Kusumanchi",
        "village": "Mutyalammagudem",
        "granite_category_id": black_granite_category_id,
        "latitude": 17.2472,
        "longitude": 80.1514,
    }
    _e2e_progress("08 create quarry")
    r_q = client.post(
        "/api/v1/quarries",
        json=q_payload,
    )
    assert r_q.status_code == 200, (
        "Quarry creation failed: "
        f"status={r_q.status_code}, "
        f"body={r_q.text}, "
        f"payload={q_payload}"
    )
    quarry = r_q.json()
    quarry_id = quarry["id"]
    _e2e_progress("09 quarry created")

    b_payload = {
        "quarry_id": quarry_id,
        "granite_category_id": (
            quarry["granite_category_id"]
        ),
        "capture_date": "2026-08-26T12:00:00Z",
        "notes": (
            "E2E Test Block - physically consistent "
            "multi-view synthetic granite"
        ),
        "skip_gps": False,
        "gps": {
            "latitude": 17.2472,
            "longitude": 80.1514,
            "accuracy": 2.5,
        },
    }
    _e2e_progress("10 create granite block")
    r_b = client.post(
        "/api/v1/granite-blocks",
        json=b_payload,
    )
    assert r_b.status_code == 200
    block = r_b.json()
    block_id = block["id"]
    _e2e_progress("11 granite block created")

    s_payload = {
        "block_id": block_id,
        "calibration_type": "MANUAL_REFERENCE",
        "known_reference_cm": 10.0,
        "reference_pixels": 100.0,
    }
    _e2e_progress("12 create capture session")
    r_s = client.post(
        "/api/v1/capture-sessions",
        json=s_payload,
    )
    assert r_s.status_code == 200
    session = r_s.json()
    session_id = session["id"]
    _e2e_progress("13 capture session created")

    base_h = 480
    base_w = 640

    fx = 760.0
    fy = 760.0
    cx = base_w / 2.0
    cy = base_h / 2.0

    K = np.asarray(
        [
            [fx, 0.0, cx],
            [0.0, fy, cy],
            [0.0, 0.0, 1.0],
        ],
        dtype=np.float64,
    )

    def look_at_world_to_camera(
        camera_center: np.ndarray,
        target: np.ndarray,
    ):
        """Return world->camera R,t using +Z as camera forward axis."""
        forward = target - camera_center
        forward = forward / np.linalg.norm(forward)

        world_up = np.asarray(
            [0.0, 1.0, 0.0],
            dtype=np.float64,
        )

        right = np.cross(
            world_up,
            forward,
        )
        right = right / np.linalg.norm(right)

        down_corrected_up = np.cross(
            forward,
            right,
        )
        down_corrected_up = (
            down_corrected_up
            / np.linalg.norm(
                down_corrected_up
            )
        )

        R = np.vstack(
            [
                right,
                down_corrected_up,
                forward,
            ]
        )

        t = (
            -R @ camera_center.reshape(3, 1)
        )

        return R, t

    def project_points(
        points_xyz: np.ndarray,
        R: np.ndarray,
        t: np.ndarray,
    ):
        camera_xyz = (
            R @ points_xyz.T
            + t
        ).T

        positive = (
            camera_xyz[:, 2] > 1e-6
        )

        uvw = (
            K @ camera_xyz.T
        ).T

        uv = np.full(
            (
                len(points_xyz),
                2,
            ),
            np.nan,
            dtype=np.float64,
        )

        uv[
            positive
        ] = (
            uvw[
                positive,
                :2,
            ]
            / uvw[
                positive,
                2:3,
            ]
        )

        return uv, camera_xyz[:, 2]

    rng = np.random.default_rng(
        20260901
    )

    # ------------------------------------------------------------------
    # One irregular 3D granite body
    # ------------------------------------------------------------------
    #
    # The feature cloud occupies a genuinely non-planar front/upper surface.
    # z is intentionally a function of x/y plus deterministic roughness.
    # This is enough to ensure the scene cannot be explained by a single
    # homography while remaining stable and deterministic for CI.
    feature_rows = []

    while len(feature_rows) < 420:
        x = float(
            rng.uniform(
                -105.0,
                105.0,
            )
        )
        y = float(
            rng.uniform(
                -62.0,
                62.0,
            )
        )

        ellipse = (
            (x / 112.0) ** 2
            + (y / 70.0) ** 2
        )

        if ellipse >= 1.0:
            continue

        irregular_depth = (
            20.0
            + 17.0 * np.sin(
                x / 31.0
            )
            + 11.0 * np.cos(
                y / 19.0
            )
            + 8.0 * np.sin(
                (x + y) / 23.0
            )
            + float(
                rng.normal(
                    0.0,
                    4.0,
                )
            )
        )

        # Taper the surface near the silhouette boundary.
        irregular_depth *= (
            0.72
            + 0.28
            * max(
                0.0,
                1.0 - ellipse,
            )
        )

        radius = int(
            rng.integers(
                2,
                5,
            )
        )

        intensity = int(
            rng.integers(
                78,
                225,
            )
        )

        orientation_deg = float(
            rng.uniform(
                0.0,
                180.0,
            )
        )

        feature_rows.append(
            (
                np.asarray(
                    [
                        x,
                        y,
                        irregular_depth,
                    ],
                    dtype=np.float64,
                ),
                radius,
                intensity,
                orientation_deg,
            )
        )

    _e2e_progress(
        f"14 generated 3D feature catalogue: {len(feature_rows)} points"
    )

    feature_xyz = np.asarray(
        [
            row[0]
            for row in feature_rows
        ],
        dtype=np.float64,
    )

    # Boundary samples come from the same 3D irregular body and are projected
    # through the same camera model.  They are used only to draw the visible
    # stone silhouette; they are not passed directly to reconstruction.
    boundary_xyz = []

    for angle in np.linspace(
        0.0,
        2.0 * np.pi,
        96,
        endpoint=False,
    ):
        radial_roughness = (
            1.0
            + 0.075
            * np.sin(
                5.0 * angle
            )
            + 0.045
            * np.cos(
                9.0 * angle
            )
        )

        x = (
            115.0
            * radial_roughness
            * np.cos(angle)
        )
        y = (
            72.0
            * radial_roughness
            * np.sin(angle)
        )
        z = (
            14.0
            + 11.0
            * np.sin(
                3.0 * angle
            )
            + 6.0
            * np.cos(
                7.0 * angle
            )
        )

        boundary_xyz.append(
            [x, y, z]
        )

    boundary_xyz = np.asarray(
        boundary_xyz,
        dtype=np.float64,
    )

    # ------------------------------------------------------------------
    # Four actual camera poses
    # ------------------------------------------------------------------
    #
    # Cameras remain on a front-side orbit so enough physical texture remains
    # visible in every frame. Baselines are large enough for triangulation but
    # not so large that matching loses overlap.
    camera_centers = [
        np.asarray(
            [-82.0, -8.0, 520.0],
            dtype=np.float64,
        ),
        np.asarray(
            [-28.0, 7.0, 500.0],
            dtype=np.float64,
        ),
        np.asarray(
            [30.0, -6.0, 500.0],
            dtype=np.float64,
        ),
        np.asarray(
            [86.0, 10.0, 525.0],
            dtype=np.float64,
        ),
    ]

    target = np.asarray(
        [0.0, 0.0, 12.0],
        dtype=np.float64,
    )

    _e2e_progress("15 generated irregular 3D boundary")

    camera_poses = [
        look_at_world_to_camera(
            center,
            target,
        )
        for center in camera_centers
    ]

    # Confirm that the fixture itself is not accidentally near-planar from a
    # depth perspective.
    assert (
        float(
            np.std(
                feature_xyz[:, 2]
            )
        )
        > 8.0
    )

    _e2e_progress("16 camera poses ready; rendering/uploading 4 images")

    for seq, (
        camera_center,
        (
            R,
            t,
        ),
    ) in enumerate(
        zip(
            camera_centers,
            camera_poses,
        ),
        start=1,
    ):
        _e2e_progress(f"17.{seq} render PHOTO_{seq:03d}")

        yy, xx = np.mgrid[
            0:base_h,
            0:base_w,
        ]

        background = (
            43.0
            + 0.018 * xx
            + 0.013 * yy
            + seq * 2.5
        )

        img = np.zeros(
            (
                base_h,
                base_w,
                3,
            ),
            dtype=np.uint8,
        )

        img[:, :, 0] = np.clip(
            background,
            0,
            255,
        ).astype(np.uint8)

        img[:, :, 1] = np.clip(
            background + 7,
            0,
            255,
        ).astype(np.uint8)

        img[:, :, 2] = np.clip(
            background + 12,
            0,
            255,
        ).astype(np.uint8)

        boundary_uv, boundary_depth = (
            project_points(
                boundary_xyz,
                R,
                t,
            )
        )

        valid_boundary = (
            np.isfinite(
                boundary_uv
            ).all(
                axis=1
            )
            & (
                boundary_depth > 0
            )
        )

        projected_boundary = (
            boundary_uv[
                valid_boundary
            ]
        )

        assert len(
            projected_boundary
        ) >= 16

        # Convex hull is used only as the segmentation-visible body. The actual
        # tracked texture points remain non-planar 3D observations.
        granite_polygon = cv2.convexHull(
            np.round(
                projected_boundary
            ).astype(
                np.int32
            )
        )

        granite_mask = np.zeros(
            (
                base_h,
                base_w,
            ),
            dtype=np.uint8,
        )

        cv2.fillConvexPoly(
            granite_mask,
            granite_polygon,
            255,
        )

        # Build stable granite texture. Most low-frequency texture is identical
        # in appearance between views while its projected location changes from
        # the physical camera geometry.
        stone = np.zeros_like(
            img
        )

        stone[:, :, 0] = 132
        stone[:, :, 1] = 137
        stone[:, :, 2] = 143

        # Only a small view-specific noise component is used so feature matching
        # remains stable but duplicate detection still sees different frames.
        noise_rng = np.random.default_rng(
            9100 + seq
        )

        fine_noise = noise_rng.normal(
            0.0,
            2.2,
            size=(
                base_h,
                base_w,
                1,
            ),
        )

        stone = np.clip(
            stone.astype(
                np.float32
            )
            + fine_noise,
            0,
            255,
        ).astype(
            np.uint8
        )

        img[
            granite_mask > 0
        ] = stone[
            granite_mask > 0
        ]

        feature_uv, feature_depth = (
            project_points(
                feature_xyz,
                R,
                t,
            )
        )

        visible_feature_count = 0

        for feature_index, (
            (
                point_xyz,
                radius,
                intensity,
                orientation_deg,
            ),
            uv,
            depth,
        ) in enumerate(
            zip(
                feature_rows,
                feature_uv,
                feature_depth,
            )
        ):
            if (
                depth <= 0
                or not np.isfinite(
                    uv
                ).all()
            ):
                continue

            px = int(
                round(
                    float(
                        uv[0]
                    )
                )
            )
            py = int(
                round(
                    float(
                        uv[1]
                    )
                )
            )

            if not (
                12 <= px < base_w - 12
                and 12 <= py < base_h - 12
            ):
                continue

            if (
                granite_mask[
                    py,
                    px,
                ]
                == 0
            ):
                continue

            visible_feature_count += 1

            # A stable per-feature glyph gives SIFT descriptors a stronger
            # identity than repeated anonymous dots.
            val = int(
                np.clip(
                    intensity,
                    35,
                    235,
                )
            )

            cv2.circle(
                img,
                (
                    px,
                    py,
                ),
                radius,
                (
                    val,
                    val,
                    val,
                ),
                -1,
                lineType=cv2.LINE_AA,
            )

            angle = np.deg2rad(
                orientation_deg
            )

            length = (
                5
                + (
                    feature_index
                    % 5
                )
            )

            dx = int(
                round(
                    np.cos(
                        angle
                    )
                    * length
                )
            )
            dy = int(
                round(
                    np.sin(
                        angle
                    )
                    * length
                )
            )

            dark = int(
                max(
                    20,
                    val - 55,
                )
            )

            cv2.line(
                img,
                (
                    px - dx,
                    py - dy,
                ),
                (
                    px + dx,
                    py + dy,
                ),
                (
                    dark,
                    dark,
                    dark,
                ),
                1,
                lineType=cv2.LINE_AA,
            )

            # Add a tiny asymmetric side dot for descriptor uniqueness.
            side_angle = (
                angle
                + np.pi / 2.0
            )

            sx = int(
                round(
                    px
                    + np.cos(
                        side_angle
                    )
                    * (
                        radius
                        + 3
                    )
                )
            )
            sy = int(
                round(
                    py
                    + np.sin(
                        side_angle
                    )
                    * (
                        radius
                        + 3
                    )
                )
            )

            if (
                2 <= sx < base_w - 2
                and 2 <= sy < base_h - 2
                and granite_mask[
                    sy,
                    sx,
                ]
                > 0
            ):
                cv2.circle(
                    img,
                    (
                        sx,
                        sy,
                    ),
                    1,
                    (
                        35,
                        35,
                        35,
                    ),
                    -1,
                    lineType=cv2.LINE_AA,
                )

        assert visible_feature_count >= 300

        # Draw two persistent defect-like veins by projecting actual 3D paths.
        vein_paths = [
            np.asarray(
                [
                    [-72.0, -24.0, 12.0],
                    [-38.0, -9.0, 27.0],
                    [-4.0, 7.0, 39.0],
                    [34.0, 21.0, 21.0],
                    [68.0, 30.0, 8.0],
                ],
                dtype=np.float64,
            ),
            np.asarray(
                [
                    [-62.0, 29.0, 21.0],
                    [-27.0, 17.0, 37.0],
                    [6.0, 23.0, 26.0],
                    [41.0, 12.0, 11.0],
                ],
                dtype=np.float64,
            ),
        ]

        for vein_xyz in vein_paths:
            vein_uv, vein_depth = (
                project_points(
                    vein_xyz,
                    R,
                    t,
                )
            )

            valid = (
                np.isfinite(
                    vein_uv
                ).all(
                    axis=1
                )
                & (
                    vein_depth > 0
                )
            )

            vein_pixels = (
                np.round(
                    vein_uv[
                        valid
                    ]
                )
                .astype(
                    np.int32
                )
                .reshape(
                    -1,
                    1,
                    2,
                )
            )

            if len(
                vein_pixels
            ) >= 2:
                cv2.polylines(
                    img,
                    [
                        vein_pixels
                    ],
                    False,
                    (
                        63,
                        63,
                        63,
                    ),
                    2,
                    lineType=cv2.LINE_AA,
                )

        # View-specific background patch. It stays outside the granite mask and
        # helps the capture duplicate detector without contaminating matching.
        marker_x = (
            18
            + (
                seq - 1
            )
            * 142
        )

        cv2.rectangle(
            img,
            (
                marker_x,
                18,
            ),
            (
                marker_x + 78,
                58,
            ),
            (
                44 + seq * 19,
                73 + seq * 13,
                101 + seq * 11,
            ),
            -1,
        )

        cv2.putText(
            img,
            f"CAM{seq}",
            (
                marker_x + 7,
                46,
            ),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.58,
            (
                238,
                238,
                238,
            ),
            2,
            cv2.LINE_AA,
        )

        # A tiny camera-position label is diagnostic only and remains outside
        # the stone mask.
        cv2.putText(
            img,
            (
                f"{camera_center[0]:+.0f}"
            ),
            (
                16,
                base_h - 18,
            ),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            (
                180,
                180,
                180,
            ),
            1,
            cv2.LINE_AA,
        )

        _e2e_progress(
            f"18.{seq} rendered PHOTO_{seq:03d}; visible_features={visible_feature_count}"
        )

        success, enc = cv2.imencode(
            ".jpg",
            img,
            [
                int(
                    cv2.IMWRITE_JPEG_QUALITY
                ),
                96,
            ],
        )

        assert success is True

        file_bytes = io.BytesIO(
            enc.tobytes()
        )

        files = {
            "file": (
                f"photo_{seq:03d}.jpg",
                file_bytes,
                "image/jpeg",
            )
        }

        data = {
            "capture_side": (
                f"PHOTO_{seq:03d}"
            ),
            "sequence_number": str(
                seq
            ),
            "quality_score": "0.94",
            "idempotency_key": (
                f"test_idemp_{seq}_{session_id}"
            ),
        }

        _e2e_progress(f"19.{seq} upload PHOTO_{seq:03d}")

        r_up = client.post(
            (
                f"/api/v1/capture-sessions/"
                f"{session_id}/images"
            ),
            data=data,
            files=files,
        )

        assert (
            r_up.status_code
            == 200
        ), (
            f"Upload failed for view {seq}: "
            f"status={r_up.status_code}, "
            f"body={r_up.text}"
        )

        up_res = r_up.json()

        assert up_res[
            "accepted"
        ] is True

        _e2e_progress(f"20.{seq} upload PHOTO_{seq:03d} accepted")

    _e2e_progress("21 complete capture session")
    r_comp = client.post(
        (
            f"/api/v1/capture-sessions/"
            f"{session_id}/complete"
        )
    )
    assert r_comp.status_code == 200
    assert (
        r_comp.json()[
            "status"
        ]
        == "COMPLETE"
    )

    _e2e_progress("22 capture complete; create analysis job")

    # E2E_SINGLE_EXECUTION_ANALYSIS_JOB_V1
    #
    # The production API intentionally starts analysis automatically when no
    # active RQ worker is available. Starlette TestClient waits for response
    # background tasks, so allowing that behavior here would execute the
    # worker inside the TestClient/background-task thread before this POST
    # returns. This E2E test then explicitly calls run_analysis_job(job_id)
    # below, causing two executions of the same analysis job.
    #
    # For this test only:
    #   1. force the API down the background-task branch,
    #   2. replace only the API module's background worker reference with a
    #      no-op,
    #   3. obtain the persisted job id,
    #   4. execute the real worker exactly once below in the test thread.
    #
    # Production API behavior is not changed.
    import app.api.v1.analysis as analysis_api
    from unittest.mock import patch as mock_patch

    with (
        mock_patch.object(
            analysis_api,
            "has_active_rq_workers",
            return_value=False,
        ),
        mock_patch.object(
            analysis_api,
            "run_analysis_job",
            return_value=None,
        ),
    ):
        r_job = client.post(
            "/api/v1/analysis-jobs",
            json={
                "capture_session_id": (
                    session_id
                )
            },
        )

    assert r_job.status_code == 200, (
        "Analysis job creation failed: "
        f"status={r_job.status_code}, "
        f"body={r_job.text}"
    )
    job_id = r_job.json()["id"]
    _e2e_progress(f"23 analysis job created: {job_id}")
    _e2e_progress("24 ENTER run_analysis_job")

    run_analysis_job(
        job_id
    )

    _e2e_progress("25 EXIT run_analysis_job")

    _e2e_progress("26 fetch analysis dossier")
    r_analysis = client.get(
        (
            f"/api/v1/granite-blocks/"
            f"{block_id}/analysis"
        )
    )
    assert r_analysis.status_code == 200

    analysis = r_analysis.json()

    assert (
        analysis["job"]["state"]
        == "COMPLETED"
    ), (
        "Physically consistent synthetic multi-view fixture did not "
        "complete reconstruction. "
        f"job={analysis.get('job')}, "
        f"reconstruction_quality={analysis.get('reconstruction_quality')}"
    )

    assert (
        analysis["measurement"]
        is not None
    )
    assert (
        analysis["measurement"][
            "length_cm"
        ]
        > 0
    )
    assert (
        analysis["measurement"][
            "breadth_cm"
        ]
        > 0
    )
    assert (
        analysis["measurement"][
            "height_cm"
        ]
        > 0
    )
    assert (
        analysis["measurement"][
            "volume_m3"
        ]
        > 0
    )

    assert (
        analysis["cutting"]
        is not None
    )
    assert (
        analysis["cutting"][
            "usable_area_m2"
        ]
        > 0
    )

    assert (
        analysis["wastage"]
        is not None
    )
    assert (
        analysis["seigniorage"]
        is not None
    )
    assert (
        analysis["geometry"]
        is not None
    )

    # The strict production path must not silently pass through a raw cube or
    # a two-view fallback.
    reconstruction_quality = (
        analysis.get(
            "reconstruction_quality"
        )
        or {}
    )

    geometry = (
        analysis.get(
            "geometry"
        )
        or {}
    )

    geometry_method = str(
        geometry.get(
            "reconstruction_method"
        )
        or geometry.get(
            "geometry_method"
        )
        or reconstruction_quality.get(
            "geometry_method"
        )
        or ""
    ).upper()

    assert (
        "CUBOID"
        not in geometry_method
    )
    assert (
        "BOX"
        not in geometry_method
    )

    if analysis[
        "points_3d_url"
    ]:
        r_points = client.get(
            analysis[
                "points_3d_url"
            ]
        )
        assert (
            r_points.status_code
            == 200
        )

    v_payload = {
        "job_id": job_id,
        "verified_length_cm": (
            analysis["measurement"][
                "length_cm"
            ]
            + 2.0
        ),
        "verified_breadth_cm": (
            analysis["measurement"][
                "breadth_cm"
            ]
            - 1.0
        ),
        "verified_height_cm": (
            analysis["measurement"][
                "height_cm"
            ]
        ),
        "decision": (
            "VERIFIED_WITH_CORRECTION"
        ),
        "remarks": (
            "Officer inspected in yard. "
            "Minor delta on length."
        ),
    }

    r_verify = client.post(
        (
            f"/api/v1/granite-blocks/"
            f"{block_id}/verification"
        ),
        json=v_payload,
    )
    assert (
        r_verify.status_code
        == 200
    )

    verification = (
        r_verify.json()
    )

    assert (
        verification[
            "decision"
        ]
        == "VERIFIED_WITH_CORRECTION"
    )

    assert (
        "delta_length_cm"
        in verification[
            "dimension_variance_json"
        ]
    )

    assert (
        verification[
            "dimension_variance_json"
        ][
            "delta_length_cm"
        ]
        == 2.0
    )

    r_vlist = client.get(
        (
            f"/api/v1/granite-blocks/"
            f"{block_id}/verification"
        )
    )

    assert (
        r_vlist.status_code
        == 200
    )

    assert len(
        r_vlist.json()
    ) >= 1

    _e2e_progress("27 E2E completed successfully")
    faulthandler.cancel_dump_traceback_later()
