from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_selected_user
from app.database.session import get_db
from app.models.entities import DemoUser, GraniteBlock, GraniteCategory, Quarry
from app.models.enums import BlockStatus
from app.schemas.common import BlockCreate, BlockOut
from app.services.audit import audit
from app.services.block_ids import next_block_code

router = APIRouter(prefix="/granite-blocks", tags=["blocks"])


@router.get("", response_model=list[BlockOut])
def list_blocks(db: Session = Depends(get_db)):
    return db.scalars(select(GraniteBlock).order_by(GraniteBlock.created_at.desc())).all()


@router.post("", response_model=BlockOut)
def create_block(
    payload: BlockCreate,
    db: Session = Depends(get_db),
    actor: DemoUser = Depends(require_selected_user),
):
    if not db.get(Quarry, payload.quarry_id):
        raise HTTPException(400, "Quarry not found")
    if not db.get(GraniteCategory, payload.granite_category_id):
        raise HTTPException(400, "Granite category not found")
    code = payload.block_code.strip() if payload.block_code else next_block_code(db)
    if db.scalar(select(GraniteBlock).where(GraniteBlock.block_code == code)):
        raise HTTPException(400, "Block ID already exists")
    gps = payload.gps if payload.gps and not payload.skip_gps else None
    block = GraniteBlock(
        block_code=code,
        quarry_id=payload.quarry_id,
        granite_category_id=payload.granite_category_id,
        capture_date=payload.capture_date,
        operator_id=actor.id,
        notes=payload.notes,
        status=BlockStatus.REGISTERED,
        latitude=gps.latitude if gps else None,
        longitude=gps.longitude if gps else None,
        gps_accuracy_m=gps.accuracy if gps else None,
        gps_captured_at=datetime.now(timezone.utc) if gps else None,
    )
    db.add(block)
    db.flush()
    audit(db, entity_type="granite_block", entity_id=block.id, action="block_created", actor_id=actor.id, metadata={"block_code": code})
    if gps:
        audit(
            db,
            entity_type="granite_block",
            entity_id=block.id,
            action="gps_captured",
            actor_id=actor.id,
            metadata={"latitude": gps.latitude, "longitude": gps.longitude, "accuracy": gps.accuracy},
        )
    db.commit()
    db.refresh(block)
    return block


@router.get("/{block_id}", response_model=BlockOut)
def get_block(block_id: str, db: Session = Depends(get_db)):
    block = db.get(GraniteBlock, block_id)
    if not block:
        raise HTTPException(404, "Block not found")
    return block


@router.get("/{block_id}/capture", response_model_exclude_none=True)
def get_block_capture(block_id: str, db: Session = Depends(get_db)):
    """Get granite block capture state including session and images."""
    block = db.get(GraniteBlock, block_id)
    if not block:
        raise HTTPException(404, "Block not found")

    from app.schemas.common import BlockCaptureOut, SessionOut, ImageOut

    # Get latest session for this block
    from app.models.entities import CaptureSession
    session = db.scalars(
        select(CaptureSession)
        .where(CaptureSession.block_id == block_id)
        .order_by(CaptureSession.created_at.desc())
        .limit(1)
    ).first()

    # Get images for this block
    from app.models.entities import BlockImage
    images = db.scalars(
        select(BlockImage)
        .where(BlockImage.capture_session_id == session.id if session else None)
        .order_by(BlockImage.created_at.desc())
    ).all() if session else []
    
    return BlockCaptureOut(
        block=block,
        session=session,
        images=images,
    )
