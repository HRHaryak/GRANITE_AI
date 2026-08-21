from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models.entities import AuditLog


def audit(
    db: Session,
    *,
    entity_type: str,
    entity_id: str,
    action: str,
    actor_id: str | None,
    metadata: dict[str, Any] | None = None,
) -> AuditLog:
    event = AuditLog(
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        actor_id=actor_id,
        timestamp=datetime.now(timezone.utc),
        metadata_json=metadata or {},
    )
    db.add(event)
    db.flush()
    return event
