from app.core.demo_block import seed_demo_block_data
from app.database.base import Base
from app.database.session import SessionLocal, engine


def main() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        block = seed_demo_block_data(db)
        print(f"Demo block ensured: {block.block_code} ({block.id})")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
