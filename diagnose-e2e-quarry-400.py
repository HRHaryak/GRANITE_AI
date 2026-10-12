from __future__ import annotations

import inspect
import sys
import uuid
from pathlib import Path

ROOT = Path(r"C:\Users\hrhar\Project\granitemeasure-ai")
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.database.session import SessionLocal, ensure_schema
from app.models.entities import DemoUser, GraniteCategory, Quarry

print("GraniteMeasure AI - E2E Quarry 400 Diagnostic")
print("=" * 72)

ensure_schema()

db = SessionLocal()
created_code = None

try:
    print("\n[1] Existing reference data")

    users = list(
        db.scalars(
            select(DemoUser).where(DemoUser.is_active.is_(True))
        ).all()
    )
    print("Active users:")
    for user in users:
        print(
            f"  id={user.id}  name={user.name!r}  role={user.role!r}"
        )

    categories = list(
        db.scalars(
            select(GraniteCategory)
        ).all()
    )
    print("\nGranite categories:")
    for cat in categories:
        print(
            f"  id={cat.id}  code={cat.code!r}  name={cat.name!r}"
        )

    existing_lease = list(
        db.scalars(
            select(Quarry).where(
                Quarry.lease_id == "TS-KHM-2026-099"
            )
        ).all()
    )
    print(
        "\nExisting quarries using lease "
        "'TS-KHM-2026-099':",
        len(existing_lease),
    )
    for quarry in existing_lease:
        print(
            "  "
            f"id={quarry.id} "
            f"code={quarry.quarry_code!r} "
            f"name={quarry.quarry_name!r}"
        )

    print("\n[2] Registered POST /api/v1/quarries endpoint")
    for route in app.routes:
        path = getattr(route, "path", None)
        methods = getattr(route, "methods", set()) or set()

        if (
            path == "/api/v1/quarries"
            and "POST" in methods
        ):
            endpoint = getattr(route, "endpoint", None)
            print("Endpoint:", endpoint)
            if endpoint is not None:
                try:
                    print(
                        "Signature:",
                        inspect.signature(endpoint),
                    )
                except Exception as exc:
                    print("Signature unavailable:", exc)

                try:
                    source = inspect.getsource(endpoint)
                    print("\nEndpoint source:")
                    print(source)
                except Exception as exc:
                    print(
                        "Endpoint source unavailable:",
                        exc,
                    )
            break
    else:
        print("[ERROR] POST /api/v1/quarries route not found")

    print("\n[3] Reproduce the current E2E request exactly")

    client = TestClient(app)
    unique = uuid.uuid4().hex[:10].upper()
    created_code = f"Q-E2E-DIAG-{unique}"

    q_payload = {
        "quarry_name": "Khammam Black Crystal Mine",
        "quarry_code": created_code,
        "lease_id": "TS-KHM-2026-099",
        "district": "Khammam",
        "mandal": "Kusumanchi",
        "village": "Mutyalammagudem",
        "granite_category_id": "BLACK_GRANITE",
        "latitude": 17.2472,
        "longitude": 80.1514,
    }

    no_header = client.post(
        "/api/v1/quarries",
        json=q_payload,
    )

    print("Without selected-user header:")
    print("  status:", no_header.status_code)
    print("  body:  ", no_header.text)

    if no_header.status_code == 200:
        print(
            "  NOTE: exact request succeeded in this diagnostic. "
            "The created diagnostic quarry will be removed below."
        )
    else:
        # Retry with a real selected user to isolate authentication/attribution.
        actor = users[0] if users else None

        if actor is None:
            print(
                "\nCannot test selected-user variant: "
                "no active DemoUser exists."
            )
        else:
            print(
                "\n[4] Same payload WITH x-selected-user-id"
            )

            with_header = client.post(
                "/api/v1/quarries",
                json=q_payload,
                headers={
                    "x-selected-user-id": str(actor.id),
                },
            )

            print(
                f"Using actor: {actor.name!r} "
                f"({actor.role!r}, {actor.id})"
            )
            print("  status:", with_header.status_code)
            print("  body:  ", with_header.text)

            if with_header.status_code == 200:
                print(
                    "\n[DIAGNOSIS] The E2E test is missing the "
                    "required selected-user header."
                )
            elif (
                "category" in with_header.text.lower()
                and "not found" in with_header.text.lower()
            ):
                print(
                    "\n[DIAGNOSIS] Quarry creation expects the "
                    "GraniteCategory database ID, while the E2E "
                    "fixture is sending the code BLACK_GRANITE."
                )
            elif (
                "lease" in with_header.text.lower()
                or "already" in with_header.text.lower()
                or "duplicate" in with_header.text.lower()
            ):
                print(
                    "\n[DIAGNOSIS] The E2E fixture is colliding "
                    "with persistent quarry/lease data."
                )
            else:
                print(
                    "\n[DIAGNOSIS] See the exact response body "
                    "above; it is neither the expected auth, "
                    "category-id, nor stale-lease case."
                )

finally:
    # Clean up only the unique diagnostic quarry if this script managed to
    # create it. This does not touch the user's real quarry records.
    try:
        if created_code:
            created = db.scalar(
                select(Quarry).where(
                    Quarry.quarry_code == created_code
                )
            )
            if created is not None:
                db.delete(created)
                db.commit()
                print(
                    "\n[CLEANUP] Removed diagnostic quarry:",
                    created_code,
                )
    except Exception as exc:
        db.rollback()
        print(
            "\n[WARNING] Diagnostic quarry cleanup failed:",
            exc,
        )
    finally:
        db.close()
