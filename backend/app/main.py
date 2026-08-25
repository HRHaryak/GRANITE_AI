from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings

# Import routers
from app.api.v1 import users as users_router
from app.api.v1 import quarries as quarries_router
from app.api.v1 import blocks as blocks_router
from app.api.v1 import capture as capture_router

settings = get_settings()

app = FastAPI(title="GraniteMeasure AI API")

# Configure CORS using settings.cors_origin_list
origins = settings.cors_origin_list

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(users_router.router)
app.include_router(quarries_router.router)
app.include_router(blocks_router.router)
app.include_router(capture_router.router)


@app.get("/health")
def health():
    return {"status": "ok"}


# Optional startup event for logging
@app.on_event("startup")
def on_startup():
    # Simple log to indicate startup
    print("GraniteMeasure AI backend starting up. CORS origins:", origins)
    # Optionally initialize the database schema for local development
    try:
        if settings.database_init_mode and settings.database_init_mode.lower() == "create":
            from app.database.session import engine
            from app.database.base import Base

            print("Database init mode is 'create' — creating tables if missing...")
            Base.metadata.create_all(bind=engine)
            print("Database tables created (if they were missing).")
    except Exception as e:
        print("Database initialization warning:", e)
