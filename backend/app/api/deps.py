from typing import Annotated

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.entities import DemoUser
from app.models.enums import UserRole

ROLE_NAV = {
    UserRole.ADMIN: {
        "dashboard",
        "blocks",
        "capture",
        "analysis",
        "assessments",
        "weighbridge",
        "dispatch",
        "audit",
        "quarries",
        "admin",
    },
    UserRole.QUARRY_OPERATOR: {"dashboard", "blocks", "capture", "analysis", "assessments"},
    UserRole.DMGO_OFFICER: {
        "dashboard",
        "blocks",
        "analysis",
        "assessments",
        "weighbridge",
        "dispatch",
        "audit",
    },
    UserRole.VIEWER: {"dashboard", "blocks", "analysis", "assessments", "audit"},
}


def get_selected_user(
    db: Session = Depends(get_db),
    x_selected_user_id: Annotated[str | None, Header()] = None,
) -> DemoUser | None:
    if not x_selected_user_id:
        return None
    user = db.get(DemoUser, x_selected_user_id)
    if user is None or not user.is_active:
        raise HTTPException(400, "Selected user is invalid or inactive")
    return user


def require_selected_user(user: DemoUser | None = Depends(get_selected_user)) -> DemoUser:
    if user is None:
        raise HTTPException(400, "Select a user before performing this action")
    return user


def require_roles(*roles: str):
    def _inner(user: DemoUser = Depends(require_selected_user)) -> DemoUser:
        if user.role not in roles and user.role != UserRole.ADMIN:
            raise HTTPException(403, "Role cannot perform this action")
        return user

    return _inner
