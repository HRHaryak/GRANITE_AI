from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.entities import AnalysisJob, BlockImage, CaptureSession, GraniteBlock

router = APIRouter(tags=["analysis"])


class MeasurementOut:
    """Simple measurement output."""

    pass


class GeometryOut:
    """Simple geometry output."""

    pass


class DefectOut:
    """Simple defect output."""

    pass


class ClassificationOut:
    """Simple classification output."""

    pass


class CuttingOut:
    """Simple cutting output."""

    pass


class WastageOut:
    """Simple wastage output."""

    pass


class SeigniorageOut:
    """Simple seigniorage output."""

    pass


@router.get("/granite-blocks/{block_id}/analysis")
async def get_block_analysis(
    block_id: str,
    language: str = Query("en", alias="language"),
    db: Session = Depends(get_db),
) -> dict:
    """Get analysis results for a block."""
    block = db.get(GraniteBlock, block_id)
    if not block:
        raise HTTPException(404, "Block not found")

    # Get latest analysis job for this block
    job = db.scalar(
        select(AnalysisJob)
        .where(AnalysisJob.block_id == block_id)
        .order_by(AnalysisJob.created_at.desc())
    )

    # Convert job to dict manually (avoid model_dump issues)
    job_dict = None
    if job:
        job_dict = {
            "id": str(job.id),
            "capture_session_id": str(job.capture_session_id) if job.capture_session_id else None,
            "block_id": str(job.block_id),
            "submitted_by_id": str(job.submitted_by_id) if job.submitted_by_id else None,
            "state": job.state,
            "failure_reason": job.failure_reason,
            "demo_simulated": job.demo_simulated,
        }

    # Get capture bundle (session + images)
    session = db.scalar(
        select(CaptureSession).where(CaptureSession.block_id == block_id)
    )

    images = []
    if session:
        images_result = db.scalars(
            select(BlockImage).where(BlockImage.capture_session_id == session.id)
        ).all()
        images = [
            {
                "id": img.id,
                "capture_session_id": img.capture_session_id,
                "capture_side": img.capture_side,
                "storage_path": img.storage_path,
                "original_filename": img.original_filename,
                "accepted": img.accepted,
                "rejected": img.rejected,
                "mime_type": img.mime_type,
                "byte_size": img.byte_size,
            }
            for img in images_result
        ]

    return {
        "block_id": block.id,
        "status": block.status,
        "job": job_dict,
        "measurement": None,
        "geometry": None,
        "defects": None,
        "classification": None,
        "cutting": None,
        "wastage": None,
        "seigniorage": None,
        "physical_cavities": None,
        "reconstruction_quality": None,
        "observed_shape_validation": None,
        "photo_evidence_matrix": None,
        "points_3d_url": None,
        "mesh_3d_url": None,
        "digital_twin": None,
        "verifications": [],
        "ai_explanation": None,
    }
