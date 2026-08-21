from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.database.session import get_db
from app.models.entities import DemoUser, GraniteCategory, Quarry
from app.models.enums import UserRole
from app.schemas.common import CategoryCreate, QuarryCreate, QuarryOut
from app.services.audit import audit

router = APIRouter(tags=["quarries"])


@router.get("/quarries", response_model=list[QuarryOut])
def list_quarries(db: Session = Depends(get_db)):
    return db.scalars(select(Quarry).order_by(Quarry.quarry_name)).all()


@router.post("/quarries", response_model=QuarryOut)
def create_quarry(
    payload: QuarryCreate,
    db: Session = Depends(get_db),
    actor: DemoUser = Depends(require_roles(UserRole.ADMIN)),
):
    if db.scalar(select(Quarry).where(Quarry.quarry_code == payload.quarry_code)):
        raise HTTPException(400, "Quarry code already exists")
    if not db.get(GraniteCategory, payload.granite_category_id):
        raise HTTPException(400, "Unknown granite category")
    q = Quarry(**payload.model_dump(), created_by_id=actor.id)
    db.add(q)
    db.flush()
    audit(db, entity_type="quarry", entity_id=q.id, action="quarry_created", actor_id=actor.id, metadata={"code": q.quarry_code})
    db.commit()
    db.refresh(q)
    return q


@router.get("/granite-categories")
def list_categories(db: Session = Depends(get_db)):
    rows = db.scalars(select(GraniteCategory).where(GraniteCategory.is_active.is_(True)).order_by(GraniteCategory.code)).all()
    return [{"id": r.id, "code": r.code, "name": r.name, "description": r.description} for r in rows]


@router.post("/granite-categories")
def create_category(
    payload: CategoryCreate,
    db: Session = Depends(get_db),
    actor: DemoUser = Depends(require_roles(UserRole.ADMIN)),
):
    if db.scalar(select(GraniteCategory).where(GraniteCategory.code == payload.code)):
        raise HTTPException(400, "Category code exists")
    c = GraniteCategory(**payload.model_dump())
    db.add(c)
    db.flush()
    audit(db, entity_type="granite_category", entity_id=c.id, action="category_created", actor_id=actor.id, metadata={"code": c.code})
    db.commit()
    return {"id": c.id, "code": c.code, "name": c.name}
