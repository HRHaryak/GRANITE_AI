from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

import cv2
import numpy as np

from app.api.deps import require_selected_user
from app.core.config import get_settings
from app.database.session import get_db
from app.models.entities import BlockImage, CaptureSession, DemoUser, GraniteBlock, ImageValidationResult
from app.models.enums import PRIMARY_SIDES, CalibrationType, CaptureSide
from app.schemas.common import ImageOut, SessionCreate, SessionOut, ValidationOut
from app.services.audit import audit
from app.services.image_validation import validate_image
from app.services.storage import get_storage

router = APIRouter(tags=["capture"])


@router.post("/capture-sessions", response_model=SessionOut)
def create_session(
    payload: SessionCreate,
    db: Session = Depends(get_db),
    actor: DemoUser = Depends(require_selected_user),
):
    block = db.get(GraniteBlock, payload.block_id)
    if not block:
        raise HTTPException(404, "Block not found")
    try:
        CalibrationType(payload.calibration_type)
    except ValueError:
        raise HTTPException(400, "Unsupported calibration type")
    marker_size = payload.marker_size_cm
    if payload.calibration_type == CalibrationType.MANUAL_REFERENCE:
        marker_size = payload.reference_pixels
    session = CaptureSession(
        block_id=payload.block_id,
        operator_id=actor.id,
        status="OPEN",
        calibration_type=payload.calibration_type,
        known_reference_cm=payload.known_reference_cm or payload.marker_size_cm,
        marker_size_cm=marker_size,
    )
    db.add(session)
    db.flush()
    block.status = "CAPTURE_IN_PROGRESS"
    audit(db, entity_type="capture_session", entity_id=session.id, action="capture_session_created", actor_id=actor.id, metadata={})
    db.commit()
    db.refresh(session)
    return session


@router.get("/capture-sessions/{session_id}", response_model=SessionOut)
def get_session(session_id: str, db: Session = Depends(get_db)):
    s = db.get(CaptureSession, session_id)
    if not s:
        raise HTTPException(404, "Session not found")
    return s


@router.get("/capture-sessions/{session_id}/images")
def list_images(session_id: str, db: Session = Depends(get_db)):
    images = db.scalars(select(BlockImage).where(BlockImage.capture_session_id == session_id)).all()
    out = []
    for im in images:
        val = db.scalar(select(ImageValidationResult).where(ImageValidationResult.image_id == im.id))
        item = {
            "id": im.id,
            "capture_session_id": im.capture_session_id,
            "capture_side": im.capture_side,
            "accepted": im.accepted,
            "rejected": im.rejected,
            "mime_type": im.mime_type,
            "validation": None,
        }
        if val:
            item["validation"] = ValidationOut.model_validate(val).model_dump()
        out.append(item)
    return out


@router.post("/capture-sessions/{session_id}/images")
async def upload_image(
    session_id: str,
    capture_side: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    actor: DemoUser = Depends(require_selected_user),
):
    session = db.get(CaptureSession, session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    try:
        CaptureSide(capture_side)
    except ValueError:
        raise HTTPException(400, "Invalid capture side")
    settings = get_settings()
    if file.content_type not in settings.allowed_mimes:
        raise HTTPException(400, "File type not allowed")
    data = await file.read()
    if len(data) > settings.max_image_bytes:
        raise HTTPException(400, "Image exceeds size limit")
    rel = f"original/{session.block_id}/{session_id}/{capture_side}-{file.filename}"
    get_storage().save(rel, data, file.content_type or "application/octet-stream")
    image = BlockImage(
        capture_session_id=session_id,
        capture_side=capture_side,
        storage_path=rel,
        original_filename=file.filename or "capture.jpg",
        mime_type=file.content_type or "image/jpeg",
        byte_size=len(data),
        captured_by_id=actor.id,
    )
    db.add(image)
    db.flush()
    audit(db, entity_type="block_image", entity_id=image.id, action="image_captured", actor_id=actor.id, metadata={"side": capture_side})
    db.commit()
    db.refresh(image)
    return {"id": image.id, "capture_side": image.capture_side, "storage_path": image.storage_path}


@router.post("/images/{image_id}/validate")
def validate(image_id: str, db: Session = Depends(get_db), actor: DemoUser = Depends(require_selected_user)):
    image = db.get(BlockImage, image_id)
    if not image:
        raise HTTPException(404, "Image not found")
    session = db.get(CaptureSession, image.capture_session_id)
    raw = get_storage().load(image.storage_path)
    arr = np.frombuffer(raw, dtype=np.uint8)
    bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if bgr is None:
        raise HTTPException(400, "Could not decode image")
    siblings = db.scalars(
        select(BlockImage).where(
            BlockImage.capture_session_id == image.capture_session_id,
            BlockImage.id != image.id,
            BlockImage.accepted.is_(True),
        )
    ).all()
    hashes = []
    for s in siblings:
        try:
            from app.ai.quality import perceptual_hash

            other = cv2.imdecode(np.frombuffer(get_storage().load(s.storage_path), dtype=np.uint8), cv2.IMREAD_COLOR)
            if other is not None:
                hashes.append(perceptual_hash(other))
        except FileNotFoundError:
            continue
    result = validate_image(
        db,
        image,
        bgr,
        actor_id=actor.id,
        calibration_type=session.calibration_type if session else None,
        known_reference_cm=session.known_reference_cm if session else None,
        marker_size_cm=session.marker_size_cm if session else None,
        sibling_hashes=hashes,
    )
    db.commit()
    db.refresh(result)
    return ValidationOut.model_validate(result)


@router.get("/capture-sessions/{session_id}/guidance", response_model_exclude_none=True)
def get_capture_guidance(session_id: str, db: Session = Depends(get_db)):
    """Get capture guidance for a session including AI recommendations."""
    from app.schemas.common import CaptureGuidanceResponse
    
    session = db.get(CaptureSession, session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    
    # Get images for this session
    images = db.scalars(
        select(BlockImage)
        .where(BlockImage.capture_session_id == session_id, BlockImage.accepted.is_(True))
    ).all()
    
    # Determine guidance based on capture progress
    sides = {im.capture_side for im in images}
    
    # Get recommended next view based on what's missing
    from app.models.enums import PRIMARY_SIDES, CaptureSide
    missing = [s for s in PRIMARY_SIDES if s.value not in sides]
    
    guidance = CaptureGuidanceResponse(
        requested_view=missing[0] if missing else None,
        next_recommended_view=missing[0] if missing else None,
        instruction=f"Please capture the {missing[0] if missing else 'required'} granite view(s).",
        reason=f"{len(images)} images captured. {len(missing)} more views needed for full coverage.",
        existing_image_id=None,
        recapture_view_label=None,
        recommended_capture_side=None,
        instruction_type="REQUESTED",
        available_views=[s.value for s in PRIMARY_SIDES],
        current_views=list(sides),
        capture_side=None,
        status="IN_PROGRESS" if len(missing) > 0 else "COMPLETE",
        validation=None,
        instruction_override=None,
        current_view_label=None,
        recapture_required=None,
        existing_view_replacement_required=None,
        recapture_evidence_added=None,
        inaccessible_surfaces={},
    )
    
    return guidance


@router.post("/capture-sessions/{session_id}/complete")
def complete_session(session_id: str, db: Session = Depends(get_db), actor: DemoUser = Depends(require_selected_user)):
    session = db.get(CaptureSession, session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    images = db.scalars(
        select(BlockImage).where(BlockImage.capture_session_id == session_id, BlockImage.accepted.is_(True))
    ).all()
    sides = {im.capture_side for im in images}
    missing = [s.value for s in PRIMARY_SIDES if s.value not in sides]
    if missing:
        raise HTTPException(400, f"Missing required sides: {', '.join(missing)}")
    session.status = "COMPLETE"
    block = db.get(GraniteBlock, session.block_id)
    if block:
        block.status = "READY_FOR_ANALYSIS"
    db.commit()
    return {"status": "COMPLETE", "accepted_images": len(images)}
