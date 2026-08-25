from uuid import uuid4

from app.database.session import SessionLocal, engine
from app.database.base import Base, utcnow
from app.models.entities import DemoUser, GraniteCategory, Quarry


def main():
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()

    try:
        now = utcnow()

        # ----------------------------------------
        # DEMO USER
        # ----------------------------------------
        admin = (
            db.query(DemoUser)
            .filter(DemoUser.name == "Admin User")
            .first()
        )

        if admin:
            print(f"Demo user already exists: {admin.id}")
        else:
            admin = DemoUser(
                id=str(uuid4()),
                name="Admin User",
                role="ADMIN",
                is_active=True,
                avatar_initials="AD",
                created_at=now,
                updated_at=now,
            )

            db.add(admin)
            db.flush()

            print(f"Created demo user: {admin.id}")

        # ----------------------------------------
        # GRANITE CATEGORY
        # ----------------------------------------
        category = (
            db.query(GraniteCategory)
            .filter(GraniteCategory.code == "GRA-001")
            .first()
        )

        if category:
            print(f"Granite category already exists: {category.id}")
        else:
            category = GraniteCategory(
                id=str(uuid4()),
                code="GRA-001",
                name="Test Granite",
                description="Seeded category",
                is_active=True,
                created_at=now,
                updated_at=now,
            )

            db.add(category)
            db.flush()

            print(f"Created granite category: {category.id}")

        # ----------------------------------------
        # QUARRY
        # ----------------------------------------
        quarry = (
            db.query(Quarry)
            .filter(Quarry.quarry_code == "DQ-1")
            .first()
        )

        if quarry:
            print(f"Quarry already exists: {quarry.id}")

            # Make sure relationships are correct
            quarry.granite_category_id = category.id
            quarry.created_by_id = admin.id
            quarry.updated_at = now

        else:
            quarry = Quarry(
                id=str(uuid4()),
                quarry_name="Demo Quarry",
                quarry_code="DQ-1",
                lease_id="L1",
                district="DemoDistrict",
                mandal="DemoMandal",
                village="DemoVillage",
                granite_category_id=category.id,
                created_by_id=admin.id,
                created_at=now,
                updated_at=now,
            )

            db.add(quarry)
            db.flush()

            print(f"Created quarry: {quarry.id}")

        db.commit()

        print("")
        print("========================================")
        print("DATABASE READY")
        print("========================================")
        print("Admin ID:   ", admin.id)
        print("Category ID:", category.id)
        print("Quarry ID:  ", quarry.id)
        print("========================================")

    except Exception as e:
        db.rollback()

        print("")
        print("========== SEED ERROR ==========")
        print(type(e).__name__)
        print(e)
        print("================================")

        raise

    finally:
        db.close()


if __name__ == "__main__":
    main()