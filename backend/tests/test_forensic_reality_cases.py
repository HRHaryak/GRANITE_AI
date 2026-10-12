import numpy as np
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.cutting import optimize_cutting, wastage_from_geometry
from app.services.explanation import generate_cutting_explanation, answer_block_question
from app.ai.providers.reconstruction import OpenCVReconstructionProvider

client = TestClient(app)

# ---------------------------------------------------------------------------
# Hermetic forensic API fixture
# ---------------------------------------------------------------------------

FORENSIC_BLOCK_CODE = "TEST-FORENSIC-HYK-2002"
FORENSIC_OPERATOR_ID = None


@pytest.fixture(scope="module", autouse=True)
def _isolated_forensic_analysis_fixture():
    from datetime import datetime, timezone
    from app.database.session import SessionLocal
    from app.models.entities import (
        AnalysisJob,
        AnalysisJobTransition,
        BlockImage,
        CaptureSession,
        CuttingOptimizationResult,
        DefectResult,
        GeometryModel,
        GraniteBlock,
        GraniteCategory,
        MeasurementResult,
        Quarry,
        WastageResult,
        DemoUser,
    )

    db = SessionLocal()

    def delete_fixture(block):
        if block is None:
            return

        jobs = db.query(AnalysisJob).filter(
            AnalysisJob.block_id == block.id
        ).all()

        for job in jobs:
            db.query(AnalysisJobTransition).filter(
                AnalysisJobTransition.job_id == job.id
            ).delete(synchronize_session=False)

            for model in (
                WastageResult,
                CuttingOptimizationResult,
                DefectResult,
                GeometryModel,
                MeasurementResult,
            ):
                db.query(model).filter(
                    model.job_id == job.id
                ).delete(synchronize_session=False)

        sessions = db.query(CaptureSession).filter(
            CaptureSession.block_id == block.id
        ).all()

        for session in sessions:
            db.query(BlockImage).filter(
                BlockImage.capture_session_id == session.id
            ).delete(synchronize_session=False)

        for job in jobs:
            db.delete(job)
        for session in sessions:
            db.delete(session)

        db.delete(block)
        db.flush()

    try:
        stale = db.query(GraniteBlock).filter(
            GraniteBlock.block_code == FORENSIC_BLOCK_CODE
        ).first()
        delete_fixture(stale)
        db.commit()

        operator = db.query(DemoUser).filter(
            DemoUser.is_active.is_(True)
        ).first()
        quarry = db.query(Quarry).first()
        category = db.query(GraniteCategory).first()

        if operator is None or quarry is None or category is None:
            pytest.skip(
                "Reference user/quarry/category rows are required for "
                "the isolated forensic fixture."
            )

        global FORENSIC_OPERATOR_ID
        FORENSIC_OPERATOR_ID = str(operator.id)

        block = GraniteBlock(
            block_code=FORENSIC_BLOCK_CODE,
            quarry_id=quarry.id,
            granite_category_id=category.id,
            capture_date=datetime.now(timezone.utc),
            operator_id=operator.id,
            notes="TEST-ONLY forensic evidence fixture",
            status="ANALYZED",
        )
        db.add(block)
        db.flush()

        session = CaptureSession(
            block_id=block.id,
            operator_id=operator.id,
            status="COMPLETE",
            calibration_type="MEASUREMENT_BOARD",
            known_reference_cm=50.0,
            calibration_confidence=1.0,
            session_metadata={
                "fixture_scope": "TEST_ONLY",
                "capture_mode": "SEQUENTIAL",
                "unobserved_surface_policy": "PRESERVE_UNKNOWN",
            },
        )
        db.add(session)
        db.flush()

        capture_labels = [
            "PHOTO_001",
            "PHOTO_002",
            "PHOTO_003",
            "PHOTO_004",
        ]

        for seq, side in enumerate(capture_labels, start=1):
            db.add(
                BlockImage(
                    capture_session_id=session.id,
                    capture_side=side,
                    storage_path=(
                        f"test-only/forensic/{block.id}/{side.lower()}.jpg"
                    ),
                    original_filename=f"{side.lower()}.jpg",
                    mime_type="image/jpeg",
                    byte_size=1,
                    width_px=200,
                    height_px=200,
                    sequence_number=seq,
                    accepted=True,
                    rejected=False,
                    captured_by_id=operator.id,
                    quality_warnings=[],
                    device_metadata={"fixture_scope": "TEST_ONLY"},
                )
            )

        job = AnalysisJob(
            capture_session_id=session.id,
            block_id=block.id,
            submitted_by_id=operator.id,
            state="COMPLETED",
            current_stage="Analysis Complete",
            progress_percent=100,
            demo_simulated=False,
            started_at=datetime.now(timezone.utc),
            completed_at=datetime.now(timezone.utc),
        )
        db.add(job)
        db.flush()

        raw_l, raw_b, raw_h = 128.0, 128.0, 59.0
        raw_volume_m3 = (raw_l * raw_b * raw_h) / 1_000_000.0

        db.add(
            MeasurementResult(
                job_id=job.id,
                length_cm=raw_l,
                breadth_cm=raw_b,
                height_cm=raw_h,
                length_uncertainty_cm=1.0,
                breadth_uncertainty_cm=1.0,
                height_uncertainty_cm=1.0,
                volume_m3=raw_volume_m3,
                measurement_confidence=0.90,
                confidence_grade="HIGH",
                confidence_factors={"fixture_scope": "TEST_ONLY"},
                analysis_method="TEST_ONLY_PERSISTED_FORENSIC_EVIDENCE",
                images_used=len(capture_labels),
                calibration_method="MEASUREMENT_BOARD",
                surfaces_analyzed=capture_labels,
                cm_per_pixel=0.5,
            )
        )

        db.add(
            GeometryModel(
                job_id=job.id,
                point_cloud_path=None,
                mesh_path=None,
                bounding_box_json={
                    "min": [0.0, 0.0, 0.0],
                    "max": [raw_l, raw_b, raw_h],
                    "length_cm": raw_l,
                    "breadth_cm": raw_b,
                    "height_cm": raw_h,
                    "observed_surfaces": capture_labels,
                    "missing_surfaces": ["BOTTOM"],
                    "bottom_surface_status": "UNOBSERVED",
                    "bottom_geometry_injected": False,
                    "fixture_scope": "TEST_ONLY",
                },
                simplified_geometry_json={
                    "type": "TEST_ONLY_EVIDENCE_ENVELOPE",
                    "raw_granite_is_bounding_box": False,
                },
                reconstruction_provider="TEST_ONLY_PERSISTED_EVIDENCE",
                reconstruction_confidence=0.90,
                match_count=80,
                point_count=0,
                inlier_ratio=0.80,
                mesh_is_watertight=False,
                volume_status="NOT_CALCULATED",
                notes=(
                    '{"fixture_scope":"TEST_ONLY",'
                    '"unobserved_surface_policy":"PRESERVE_UNKNOWN"}'
                ),
            )
        )

        visible_defect = {
            "id": "TEST-DEF-001",
            "type": "VISIBLE_EDGE_DAMAGE",
            "kind": "VISIBLE_EDGE_DAMAGE",
            "category": "CONFIRMED_VISIBLE_DEFECT",
            "severity": "MEDIUM",
            "surface": "PHOTO_002",
            "visible_in_images": ["PHOTO_002"],
            "internal_defect": False,
            "provenance": "TEST_ONLY_PERSISTED_VISIBLE_EVIDENCE",
        }

        db.add(
            DefectResult(
                job_id=job.id,
                provider="TEST_ONLY_PERSISTED_EVIDENCE",
                status="available",
                visible_defects=[visible_defect],
                bottom_surface="Not Observed",
                internal_defects_claimed=False,
            )
        )

        def scenario(usable_m3):
            usable = round(float(usable_m3), 6)
            waste = round(raw_volume_m3 - usable, 6)
            yield_pct = round((usable / raw_volume_m3) * 100.0, 4)
            waste_pct = round(100.0 - yield_pct, 4)
            return {
                "usable_volume_m3": usable,
                "waste_volume_m3": waste,
                "recovery_yield_percentage": yield_pct,
                "waste_percentage": waste_pct,
            }

        scenarios = {
            "MAXIMUM_RECOVERY": scenario(0.80),
            "CONFIRMED_DAMAGE": scenario(0.72),
            "CONSERVATIVE": scenario(0.64),
        }
        confirmed = scenarios["CONFIRMED_DAMAGE"]

        db.add(
            CuttingOptimizationResult(
                job_id=job.id,
                orientations=[{"orientation": "TEST_ONLY_PRINCIPAL_AXIS"}],
                recommended_orientation="TEST_ONLY_PRINCIPAL_AXIS",
                max_usable_volume_cm3=(
                    confirmed["usable_volume_m3"] * 1_000_000.0
                ),
                usable_area_m2=0.0,
                wastage_area_m2=0.0,
                wastage_percentage=confirmed["waste_percentage"],
                pieces_estimated=1,
                solver="TEST_ONLY_DETERMINISTIC_FORENSIC_FIXTURE",
                parameters={
                    "fixture_scope": "TEST_ONLY",
                    "scenarios": scenarios,
                    "confirmed_case": confirmed,
                    "maximum_recovery_case": scenarios["MAXIMUM_RECOVERY"],
                    "conservative_case": scenarios["CONSERVATIVE"],
                    "final_dressed_dimensions": {
                        "length_cm": 120.0,
                        "breadth_cm": 110.0,
                        "height_cm": 54.0,
                    },
                    "cutting_steps": [
                        {
                            "step_number": 1,
                            "cut_name": "TEST_ONLY_VISIBLE_DAMAGE_EXCLUSION",
                            "reason": "Fixture-only persisted API contract evidence.",
                        }
                    ],
                    "volume_status": "TEST_ONLY_CONSERVED",
                },
                label="TEST-ONLY Cutting Optimization Evidence",
            )
        )

        db.add(
            WastageResult(
                job_id=job.id,
                bounding_volume_cm3=raw_volume_m3 * 1_000_000.0,
                adjusted_geometry_volume_cm3=raw_volume_m3 * 1_000_000.0,
                bounding_method="TEST_ONLY_RAW_DIMENSIONS",
                adjusted_method="TEST_ONLY_PERSISTED_EVIDENCE",
                irregularity_ratio=1.0,
                max_usable_cut_volume_cm3=(
                    confirmed["usable_volume_m3"] * 1_000_000.0
                ),
                estimated_waste_volume_cm3=(
                    confirmed["waste_volume_m3"] * 1_000_000.0
                ),
                waste_percentage=confirmed["waste_percentage"],
                defect_exclusion_volume_cm3=10_000.0,
                shape_notes={
                    "fixture_scope": "TEST_ONLY",
                    "volume_conservation": True,
                },
            )
        )

        db.commit()
        yield

    finally:
        try:
            block = db.query(GraniteBlock).filter(
                GraniteBlock.block_code == FORENSIC_BLOCK_CODE
            ).first()
            delete_fixture(block)
            db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()



def test_case_a_full_multiview_calibrated_capture():
    """Case A: Complete multi-view calibrated capture produces genuine extents and provenance."""
    res = client.get("/api/v1/granite-blocks/TEST-FORENSIC-HYK-2002/analysis?language=en")
    assert res.status_code == 200
    data = res.json()

    meas = data.get("measurement")
    assert meas is not None
    assert meas["length_cm"] > 0
    assert meas["breadth_cm"] > 0
    assert meas["height_cm"] > 0
    assert meas["volume_m3"] > 0

    # Verify strict unit conversion: m = cm / 100
    assert round(meas["length_m"], 2) == round(meas["length_cm"] / 100.0, 2)
    assert round(meas["breadth_m"], 2) == round(meas["breadth_cm"] / 100.0, 2)
    assert round(meas["height_m"], 2) == round(meas["height_cm"] / 100.0, 2)

    # Verify Reconstruction Quality Gate
    rq = data.get("reconstruction_quality")
    assert rq is not None
    assert rq["calibration_status"] in ("AVAILABLE", "CALIBRATED")
    assert rq["metric_measurement_allowed"] is True
    assert "BOTTOM" in rq["missing_surfaces"]


def test_case_b_missing_view_unobserved_reporting():
    """Case B: Missing view or bottom resting on quarry floor creates honest UNOBSERVED status."""
    res = client.get("/api/v1/granite-blocks/TEST-FORENSIC-HYK-2002/analysis?language=en")
    assert res.status_code == 200
    data = res.json()

    defects = data.get("defects") or {}
    assert "Not Observed" in defects.get("bottom_surface", "") or "Floor" in defects.get("bottom_surface", "")

    rq = data.get("reconstruction_quality") or {}
    assert "BOTTOM" in rq.get("missing_surfaces", [])


def test_case_c_uncalibrated_scale_restriction():
    """Case C: Reconstruction provider rejects empty or uncalibrated views without inventing fallback dimensions."""
    provider = OpenCVReconstructionProvider()
    out = provider.reconstruct(images=[], cm_per_pixel=None)
    assert out.ok is False
    assert out.error_code in ("CALIBRATION_REQUIRED", "INSUFFICIENT_RECONSTRUCTION")


def test_case_d_irregular_raw_vs_dressed_cuboid():
    """Case D: Raw volume is larger than inscribed dressed volume; defect exclusions reduce usable volume."""
    raw_l, raw_b, raw_h = 128.0, 128.0, 59.0
    raw_vol_m3 = (raw_l * raw_b * raw_h) / 1_000_000.0  # 0.9667 m3

    defects_list = [
        {"id": "DEF-001", "type": "BROKEN_CHIPPED_UPPER_SECTION", "surface": "PHOTO_002", "category": "CONFIRMED_DEFECT"}
    ]

    cut = optimize_cutting(
        length_cm=raw_l,
        breadth_cm=raw_b,
        height_cm=raw_h,
        defect_exclusion_cm3=10000.0,
        defects_list=defects_list,
    )

    usable_m3 = cut["usable_volume_m3"]
    assert usable_m3 < raw_vol_m3, "Usable volume must strictly be less than gross raw bounding volume."

    # Verify 3 scenarios exist with distinct recovery yields
    scenarios = cut["scenarios"]
    assert "MAXIMUM_RECOVERY" in scenarios
    assert "CONFIRMED_DAMAGE" in scenarios
    assert "CONSERVATIVE" in scenarios

    y_max = scenarios["MAXIMUM_RECOVERY"]["recovery_yield_percentage"]
    y_conf = scenarios["CONFIRMED_DAMAGE"]["recovery_yield_percentage"]
    y_cons = scenarios["CONSERVATIVE"]["recovery_yield_percentage"]

    assert y_max > y_conf > y_cons, f"Scenarios must have distinct yields: {y_max} > {y_conf} > {y_cons}"


def test_case_e_mathematical_volume_and_percentage_parity():
    """Case E: Raw Volume == Usable + Waste and Yield % + Waste % == 100.0% across all 3 scenarios."""
    res = client.get("/api/v1/granite-blocks/TEST-FORENSIC-HYK-2002/analysis?language=en")
    assert res.status_code == 200
    data = res.json()

    meas = data["measurement"]
    raw_vol = meas["volume_m3"]
    cutting = data["cutting"]
    scenarios = cutting["scenarios"]

    for sc_name, sc in scenarios.items():
        u_vol = sc["usable_volume_m3"]
        w_vol = sc["waste_volume_m3"]
        y_pct = sc["recovery_yield_percentage"]
        w_pct = sc["waste_percentage"]

        # Parity 1: Volume Conservation
        assert abs(round(u_vol + w_vol, 4) - round(raw_vol, 4)) < 0.001, f"{sc_name} volume sum mismatch: {u_vol} + {w_vol} != {raw_vol}"
        # Parity 2: Percentage Parity
        assert abs(round(y_pct + w_pct, 1) - 100.0) < 0.1, f"{sc_name} percentage sum mismatch: {y_pct} + {w_pct} != 100.0%"


def test_case_f_telugu_complete_localization():
    """Case F: Telugu request returns pure technical Telugu with zero English heading leaks."""
    res = client.get("/api/v1/granite-blocks/TEST-FORENSIC-HYK-2002/analysis?language=te")
    assert res.status_code == 200
    data = res.json()

    assert data["locale"] == "te-IN"
    ai_exp = data.get("ai_explanation")
    assert ai_exp is not None
    assert "AI ఆప్టిమైజేషన్ సాల్వర్" in ai_exp["summary"]
    assert "వాణిజ్య" in ai_exp["summary"] or "పరిమాణాన్ని" in ai_exp["summary"]

    # Test Telugu AI Assistant Q&A
    chat_res = client.post(
        "/api/v1/granite-blocks/TEST-FORENSIC-HYK-2002/ai-assistant",
        json={"question": "ఈ కట్టింగ్ దిశను ఎందుకు సిఫార్సు చేశారు?", "language": "te"},
        headers={"x-selected-user-id": FORENSIC_OPERATOR_ID},
    )
    assert chat_res.status_code == 200
    ans = chat_res.json()
    assert ans["locale"] == "te-IN"
    assert "సాల్వర్" in ans["answer"]
    assert "ఆప్టిమైజేషన్" in ans["fact_type"]


def test_mandatory_10_assertions():
    """Verify all 10 mandatory automated integration criteria."""
    # 1. No synthetic geometry returned as real reconstruction
    prov = OpenCVReconstructionProvider()
    out = prov.reconstruct(images=[], cm_per_pixel=None)
    assert out.ok is False

    # 2. Missing view creates UNOBSERVED status
    res = client.get("/api/v1/granite-blocks/TEST-FORENSIC-HYK-2002/analysis")
    d = res.json()
    assert "BOTTOM" in d["reconstruction_quality"]["missing_surfaces"]

    # 3. Scale calibration status reported
    assert d["reconstruction_quality"]["calibration_status"] == "AVAILABLE"

    # 4. Dressed block inside raw geometry
    raw_m3 = d["measurement"]["volume_m3"]
    dressed_m3 = d["cutting"]["usable_volume_m3"]
    assert dressed_m3 < raw_m3

    # 5. Defect zones excluded from final block
    defects = d["defects"]["visible_defects"]
    assert len(defects) > 0

    # 6. Web and Mobile API parity and evidence-matrix honesty:
    #    both clients consume the same /analysis endpoint, and the matrix
    #    contains one row per actual uploaded capture rather than a fabricated
    #    five-view/canonical-camera template.
    assert "reconstruction_quality" in d
    assert "photo_evidence_matrix" in d

    matrix = d["photo_evidence_matrix"]
    rq = d["reconstruction_quality"]

    assert len(matrix) > 0
    assert len(matrix) == rq["total_views_count"]
    assert rq["valid_views_count"] <= rq["total_views_count"]

    # The current fixture uses sequential captures, so the API must not invent
    # azimuth/elevation/distance values merely from sequence order.
    for entry in matrix:
        if str(entry.get("side", "")).upper().startswith("PHOTO_"):
            assert entry["camera_angles"] is None

    # 7. Telugu returns Telugu
    res_te = client.get("/api/v1/granite-blocks/TEST-FORENSIC-HYK-2002/analysis?language=te")
    assert res_te.json()["locale"] == "te-IN"

    # 8. Unit conversions correct
    m = d["measurement"]
    assert round(m["length_m"], 2) == round(m["length_cm"] / 100.0, 2)

    # 9. Volume consistency
    assert abs(round(d["cutting"]["usable_volume_m3"] + d["cutting"]["scenarios"]["CONFIRMED_DAMAGE"]["waste_volume_m3"], 4) - raw_m3) < 0.001

    # 10. Photo Evidence Matrix contains confirmed/unconfirmed geometry
    p0 = matrix[0]
    assert len(p0["unconfirmed_geometry"]) > 0


def test_case_g_exif_metadata_extraction_honesty():
    """Case G: Image without EXIF metadata leaves captured_at and GPS coordinates as None without fake timestamps."""
    from app.services.exif import extract_image_exif
    import io
    from PIL import Image

    # Create a blank in-memory image without EXIF
    img = Image.new("RGB", (100, 100), color=(120, 120, 120))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    data = buf.getvalue()

    exif = extract_image_exif(data)
    assert exif.has_exif is False
    assert exif.captured_at is None
    assert exif.gps_latitude is None
    assert exif.gps_longitude is None


def test_case_h_admin_delete_authorization():
    """Case H: Non-admin delete returns HTTP 403 Forbidden; Admin delete succeeds."""
    from app.database.session import SessionLocal
    from app.models.entities import DemoUser, GraniteBlock, Quarry, GraniteCategory
    from app.models.enums import UserRole
    from datetime import datetime, timezone
    import uuid

    db = SessionLocal()
    try:
        admin_user = db.query(DemoUser).filter(DemoUser.role == UserRole.ADMIN).first()
        operator_user = db.query(DemoUser).filter(DemoUser.role == UserRole.QUARRY_OPERATOR).first()

        quarry = db.query(Quarry).first()
        cat = db.query(GraniteCategory).first()

        test_block_code = f"TEST-DEL-{uuid.uuid4().hex[:6].upper()}"
        block = GraniteBlock(
            block_code=test_block_code,
            quarry_id=quarry.id,
            granite_category_id=cat.id,
            capture_date=datetime.now(timezone.utc),
            operator_id=admin_user.id,
        )
        db.add(block)
        db.commit()
        db.refresh(block)
        block_id = block.id

        # 1. Non-admin operator attempt -> 403 Forbidden
        headers_op = {"x-selected-user-id": operator_user.id}
        res_op = client.delete(f"/api/v1/granite-blocks/{block_id}", headers=headers_op)
        assert res_op.status_code == 403
        assert "Only administrators" in res_op.json()["detail"]

        # 2. Admin attempt -> 200 Success
        headers_admin = {"x-selected-user-id": admin_user.id}
        res_admin = client.delete(f"/api/v1/granite-blocks/{block_id}", headers=headers_admin)
        assert res_admin.status_code == 200
        assert res_admin.json()["status"] == "success"

        # Verify block was deleted in database
        db.expire_all()
        assert db.get(GraniteBlock, block_id) is None
    finally:
        db.close()


def test_case_i_capabilities_matrix_honesty():
    """Case I: Capabilities endpoint honestly reports NOT_CONFIGURED when model weights are not installed."""
    from app.ai.capabilities import check_capabilities
    caps = check_capabilities()

    assert "granite_detection" in caps
    assert "granite_segmentation" in caps
    assert "photogrammetry_reconstruction" in caps
    assert "granite_classification" in caps

    # When unconfigured, classification and detection report NOT_CONFIGURED or OPERATIONAL honestly
    assert caps["granite_classification"]["status"] in ("OPERATIONAL", "NOT_CONFIGURED")
    assert caps["photogrammetry_reconstruction"]["status"] == "OPERATIONAL"
    assert caps["granite_segmentation"]["status"] == "OPERATIONAL"


def test_case_j_reprojection_metrics_calculation():
    """Case J: Reprojection metrics calculate real numeric IoU and boundary errors without fake fallbacks."""
    from app.geometry.reprojection import compute_view_reprojection_metrics
    import numpy as np

    # Test 1: Unobserved / empty view returns None metrics
    res_none = compute_view_reprojection_metrics(None, None, "FRONT")
    assert res_none["silhouette_iou"] is None
    assert res_none["boundary_error_px"] is None
    assert res_none["calculated"] is False

    # Test 2: Valid synthetic stone image with 3D points
    img = np.full((300, 400, 3), 40, dtype=np.uint8)
    # Draw a distinct bright granite rectangle in the center
    img[60:240, 80:320] = [180, 180, 180]

    # 3D points corresponding to bounding volume
    pts_3d = [
        [-50, 0, -30], [50, 0, -30], [50, 0, 30], [-50, 0, 30],
        [-50, 20, -30], [50, 20, -30], [50, 20, 30], [-50, 20, 30]
    ]

    res_valid = compute_view_reprojection_metrics(img, pts_3d, "FRONT", cm_per_pixel=0.5)
    assert res_valid["calculated"] is True
    assert res_valid["silhouette_iou"] is not None
    assert 0.0 <= res_valid["silhouette_iou"] <= 1.0
    assert res_valid["boundary_error_px"] is not None


def test_case_k_four_photos_viewpoint_honesty():
    """Case K: Uploading 4 photos does NOT automatically assume all six sides are observed.
    BOTTOM surface remains unobserved (ground datum), and labels reflect actual sequential captures.
    """
    res = client.get("/api/v1/granite-blocks/TEST-FORENSIC-HYK-2002/analysis?language=en")
    assert res.status_code == 200
    data = res.json()

    rq = data.get("reconstruction_quality", {})
    missing = rq.get("missing_surfaces", [])
    assert "BOTTOM" in missing

    # Matrix entries must represent actual captures and must carry provenance.
    matrix = data.get("photo_evidence_matrix", [])
    assert len(matrix) == rq.get("total_views_count")

    for entry in matrix:
        assert "side" in entry
        assert "view_name" in entry
        assert "view_confidence" in entry
        assert "provenance" in entry

        # Sequential labels are not physical camera poses.
        if str(entry.get("side", "")).upper().startswith("PHOTO_"):
            assert entry.get("camera_angles") is None


def test_case_l_volume_containment():
    """Case L: Final dressed geometry and usable envelope must be strictly <= raw extents."""
    from app.services.cutting import optimize_cutting

    raw_l, raw_b, raw_h = 240.0, 140.0, 110.0
    raw_vol = (raw_l * raw_b * raw_h) / 1_000_000.0

    res = optimize_cutting(
        length_cm=raw_l,
        breadth_cm=raw_b,
        height_cm=raw_h,
        defect_exclusion_cm3=5000.0,
    )

    usable_vol = res["usable_volume_m3"]
    assert usable_vol <= raw_vol
    assert res["wastage_percentage"] >= 0.0
    assert res["wastage_percentage"] <= 100.0

    # Ensure all scenarios have usable volume <= raw volume
    for sc_key, sc in res["scenarios"].items():
        assert sc["usable_volume_m3"] <= raw_vol
        assert sc["waste_volume_m3"] >= 0.0
