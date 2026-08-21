from datetime import datetime, timezone

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.models.entities import BlockSequence


def next_block_code(db: Session, year: int | None = None) -> str:
    year = year or datetime.now(timezone.utc).year
    seq = db.get(BlockSequence, year)
    if seq is None:
        seq = BlockSequence(year=year, last_value=0)
        db.add(seq)
        db.flush()
    seq.last_value += 1
    db.flush()
    return f"GRN-{year}-{seq.last_value:05d}"
