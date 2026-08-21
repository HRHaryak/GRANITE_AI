from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import GraniteCategory, SeigniorageRate, SeigniorageRateVersion
from app.models.enums import GangsawClass


def classify_gangsaw(length_cm: float, breadth_cm: float, above_length_cm: float, above_breadth_cm: float) -> str:
    if length_cm > above_length_cm and breadth_cm > above_breadth_cm:
        return GangsawClass.ABOVE_GANGSAW
    return GangsawClass.BELOW_GANGSAW


def active_rate(
    db: Session,
    category_id: str,
    gangsaw_class: str,
    at: datetime | None = None,
) -> SeigniorageRate | None:
    at = at or datetime.now(timezone.utc)
    versions = db.scalars(
        select(SeigniorageRateVersion)
        .where(SeigniorageRateVersion.is_published.is_(True))
        .where(SeigniorageRateVersion.effective_from <= at)
        .order_by(SeigniorageRateVersion.effective_from.desc())
    ).all()
    for v in versions:
        if v.effective_to is not None and v.effective_to < at:
            continue
        rate = db.scalar(
            select(SeigniorageRate).where(
                SeigniorageRate.version_id == v.id,
                SeigniorageRate.category_id == category_id,
                SeigniorageRate.gangsaw_class == gangsaw_class,
            )
        )
        if rate:
            return rate
    return None


def indicative_amount(volume_cm3: float, rate_per_m3: float) -> tuple[float, float]:
    volume_m3 = volume_cm3 / 1_000_000.0
    return round(volume_m3, 6), round(volume_m3 * rate_per_m3, 2)
