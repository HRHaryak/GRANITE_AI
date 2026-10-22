from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings

# Import routers
from app.api.v1 import users as users_router
from app.api.v1 import quarries as quarries_router
from app.api.v1 import blocks as blocks_router
from app.api.v1 import capture as capture_router
from app.api.v1 import analysis as analysis_router
from app.api.v1 import capabilities as capabilities_router
from app.api.v1 import ai_assistant as ai_assistant_router

settings = get_settings()

app = FastAPI(title="GraniteMeasure AI API")

# Configure CORS using settings.cors_origin_list
origins = settings.cors_origin_list

if "*" in origins or settings.cors_origins.strip() == "*":
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"^https?://.*",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins if origins else ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Include API routers at root and under /api/v1 prefix for compatibility
routers = [
    users_router.router,
    quarries_router.router,
    blocks_router.router,
    capture_router.router,
    analysis_router.router,
    capabilities_router.router,
    ai_assistant_router.router,
]

for router in routers:
    app.include_router(router)
    app.include_router(router, prefix="/api/v1")


@app.get("/")
def root():
    return {
        "name": "GraniteMeasure AI API",
        "status": "online",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
@app.get("/api/v1/health")
def health():
    return {"status": "ok"}


# Optional startup event for logging and initialization
@app.on_event("startup")
def on_startup():
    print("GraniteMeasure AI backend starting up. CORS origins:", origins)
    try:
        if settings.database_init_mode and settings.database_init_mode.lower() == "create":
            from app.database.session import engine
            from app.database.base import Base

            print("Database init mode is 'create' — creating tables if missing...")
            Base.metadata.create_all(bind=engine)
            print("Database tables created (if they were missing).")
    except Exception as e:
        print("Database initialization warning:", e)

    if settings.seed_demo_users:
        try:
            from scripts.seed_demo import main as seed_demo_main

            print("SEED_DEMO_USERS is true — seeding initial demo data...")
            seed_demo_main()
            print("Demo data seeded successfully.")
        except Exception as e:
            print("Demo seeding warning:", e)
