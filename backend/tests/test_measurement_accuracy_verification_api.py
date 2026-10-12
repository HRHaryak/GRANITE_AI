from __future__ import annotations

from datetime import datetime, timezone
import uuid

import pytest
from fastapi.testclient import TestClient

from app.database.session import SessionLocal, ensure_schema
from app.main import app
from app.models.entities import (
    AnalysisJob,
    AuditLog,
    CaptureSession,
    DemoUser,
    GraniteBlock,
    GraniteCategory,
    ManualVerification,
    MeasurementResult,
    Quarry,
)


client = TestClient(app)


def test_officer_verification_persists_real_measurement_accuracy() -> None:
    """
    Persisted AI measurement -> officer/tape physical ground truth
    -> backend accuracy calculation -> ManualVerification persistence
    -> GET verification read-back.

    Deliberately uses:
      length  = 100%
      breadth = 100%
      height  = 70%
      mean    = 90%

    Strict 80% per-axis target MUST be False.
    """
    ensure_schema()
    db = SessionLocal()

    block = None
    session = None
    job = None
    verification_id = None

    try:
        actor = (
            db.query(DemoUser)
            .filter(DemoUser.is_active.is_(True))
            .first()
        )
        quarry = db.query(Quarry).first()
        category = db.query(GraniteCategory).first()

        if actor is None or quarry is None or category is None:
            pytest.skip(
                "Active DemoUser, Quarry and GraniteCategory reference rows "
                "are required for this API integration test."
            )

        unique = uuid.uuid4().hex[:12].upper()

        block = GraniteBlock(
            block_code=f"TEST-ACCURACY-{unique}",
            quarry_id=quarry.id,
            granite_category_id=category.id,
            capture_date=datetime.now(timezone.utc),
            operator_id=actor.id,
            notes="TEST-ONLY physical measurement accuracy API fixture",
            status="ANALYZED",
        )
        db.add(block)
        db.flush()

        session = CaptureSession(
            block_id=block.id,
            operator_id=actor.id,
            status="COMPLETE",
            calibration_type="MEASUREMENT_BOARD",
            known_reference_cm=50.0,
            calibration_confidence=1.0,
            session_metadata={
                "fixture_scope": "TEST_ONLY",
                "purpose": "MEASUREMENT_ACCURACY_API_VALIDATION",
            },
        )
        db.add(session)
        db.flush()

        job = AnalysisJob(
            capture_session_id=session.id,
            block_id=block.id,
            submitted_by_id=actor.id,
            state="COMPLETED",
            current_stage="Analysis Complete",
            progress_percent=100,
            demo_simulated=False,
            started_at=datetime.now(timezone.utc),
            completed_at=datetime.now(timezone.utc),
        )
        db.add(job)
        db.flush()

        ai_length_cm = 100.0
        ai_breadth_cm = 80.0
        ai_height_cm = 70.0

        db.add(
            MeasurementResult(
                job_id=job.id,
                length_cm=ai_length_cm,
                breadth_cm=ai_breadth_cm,
                height_cm=ai_height_cm,
                length_uncertainty_cm=1.0,
                breadth_uncertainty_cm=1.0,
                height_uncertainty_cm=1.0,
                volume_m3=(
                    ai_length_cm
                    * ai_breadth_cm
                    * ai_height_cm
                    / 1_000_000.0
                ),
                measurement_confidence=0.95,
                confidence_grade="HIGH",
                confidence_factors={
                    "fixture_scope": "TEST_ONLY",
                    "note": (
                        "High pipeline confidence must not become "
                        "physical measurement accuracy."
                    ),
                },
                analysis_method="TEST_ONLY_PERSISTED_MEASUREMENT",
                images_used=6,
                calibration_method="MEASUREMENT_BOARD",
                surfaces_analyzed=[
                    "FRONT",
                    "BACK",
                    "LEFT",
                    "RIGHT",
                    "TOP",
                ],
                cm_per_pixel=0.5,
            )
        )
        db.commit()

        payload = {
            "job_id": str(job.id),
            "verified_length_cm": 100.0,
            "verified_breadth_cm": 80.0,
            "verified_height_cm": 100.0,
            "decision": "VERIFIED_WITH_CORRECTION",
            "remarks": (
                "TEST ONLY: officer/tape physical dimensions for "
                "accuracy validation."
            ),
        }

        response = client.post(
            f"/api/v1/granite-blocks/{block.id}/verification",
            json=payload,
            headers={
                "x-selected-user-id": str(actor.id),
            },
        )

        assert response.status_code == 200, response.text

        saved = response.json()
        verification_id = saved["id"]

        variance = saved["dimension_variance_json"]

        assert variance["accuracy_status"] == (
            "VALIDATED_AGAINST_PHYSICAL_GROUND_TRUTH"
        )
        assert variance["accuracy_target_pct"] == pytest.approx(80.0)
        assert variance["accuracy_target_met"] is False

        assert variance["length_accuracy_pct"] == pytest.approx(100.0)
        assert variance["breadth_accuracy_pct"] == pytest.approx(100.0)
        assert variance["height_accuracy_pct"] == pytest.approx(70.0)

        assert variance["mean_axis_accuracy_pct"] == pytest.approx(90.0)
        assert variance["worst_axis_accuracy_pct"] == pytest.approx(70.0)

        assert variance["mean_absolute_error_cm"] == pytest.approx(10.0)
        assert variance[
            "mean_absolute_percentage_error_pct"
        ] == pytest.approx(10.0)

        assert variance["delta_length_cm"] == pytest.approx(0.0)
        assert variance["delta_breadth_cm"] == pytest.approx(0.0)
        assert variance["delta_height_cm"] == pytest.approx(30.0)

        volume_validation = saved["volume_variance_json"]

        assert volume_validation["volume_accuracy_basis"] == (
            "DIMENSIONAL_ENVELOPE_LxBxH_NOT_TRUE_IRREGULAR_RAW_VOLUME"
        )
        assert volume_validation[
            "ai_envelope_volume_m3"
        ] == pytest.approx(0.56)
        assert volume_validation[
            "verified_envelope_volume_m3"
        ] == pytest.approx(0.8)
        assert volume_validation[
            "envelope_volume_accuracy_pct"
        ] == pytest.approx(70.0)

        list_response = client.get(
            f"/api/v1/granite-blocks/{block.id}/verification"
        )
        assert list_response.status_code == 200, list_response.text

        rows = list_response.json()
        persisted = next(
            row for row in rows if row["id"] == verification_id
        )

        persisted_variance = persisted["dimension_variance_json"]

        assert persisted_variance["accuracy_target_met"] is False
        assert persisted_variance[
            "mean_axis_accuracy_pct"
        ] == pytest.approx(90.0)
        assert persisted_variance[
            "worst_axis_accuracy_pct"
        ] == pytest.approx(70.0)

    finally:
        db.rollback()

        if verification_id is not None:
            db.query(AuditLog).filter(
                AuditLog.entity_type == "manual_verification",
                AuditLog.entity_id == verification_id,
            ).delete(synchronize_session=False)

        if block is not None:
            db.query(ManualVerification).filter(
                ManualVerification.block_id == block.id
            ).delete(synchronize_session=False)

        if job is not None:
            db.query(MeasurementResult).filter(
                MeasurementResult.job_id == job.id
            ).delete(synchronize_session=False)
            db.delete(job)

        if session is not None:
            db.delete(session)

        if block is not None:
            db.delete(block)

        db.commit()
        db.close()
