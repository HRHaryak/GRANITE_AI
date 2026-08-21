from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import require_roles, require_selected_user
from app.database.session import get_db
from app.models.entities import DemoUser
from app.models.enums import UserRole
from app.schemas.common import DemoUserCreate, DemoUserOut
from app.services.audit import audit

router = APIRouter(prefix="/demo-users", tags=["demo-users"])


@router.get("", response_model=list[DemoUserOut])
def list_users(db: Session = Depends(get_db)):
    rows = db.scalars(select(DemoUser).where(DemoUser.is_active.is_(True)).order_by(DemoUser.name)).all()
    return rows


@router.post("", response_model=DemoUserOut)
def create_user(
    payload: DemoUserCreate,
    db: Session = Depends(get_db),
    actor: DemoUser = Depends(require_roles(UserRole.ADMIN)),
):
    if payload.role not in {r.value for r in UserRole}:
        raise HTTPException(400, "Invalid role")
    initials = payload.avatar_initials or "".join(p[0] for p in payload.name.split()[:2]).upper()
    user = DemoUser(name=payload.name, role=payload.role, avatar_initials=initials, is_active=True)
    db.add(user)
    db.flush()
    audit(db, entity_type="demo_user", entity_id=user.id, action="user_created", actor_id=actor.id, metadata={"name": user.name})
    db.commit()
    db.refresh(user)
    return user


@router.get("/count")
def user_count(db: Session = Depends(get_db)):
    n = db.scalar(select(func.count()).select_from(DemoUser).where(DemoUser.is_active.is_(True))) or 0
    return {"count": n}
