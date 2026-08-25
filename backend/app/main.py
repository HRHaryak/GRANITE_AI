from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.v1 import blocks, capture, quarries, users
from app.core.config import get_settings
from app.database.base import Base
from app.database.session import engine
from app.models import entities as _entities


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    with engine.begin() as connection:
        connection.execute(text("SELECT 1"))
        if settings.database_init_mode == "create":
            Base.metadata.create_all(connection)
    yield


settings = get_settings()
app = FastAPI(
    title="GraniteMeasure AI API",
    description="Granite block capture, measurement, and assessment services.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_prefix = "/api/v1"
app.include_router(users.router, prefix=api_prefix)
app.include_router(quarries.router, prefix=api_prefix)
app.include_router(blocks.router, prefix=api_prefix)
app.include_router(capture.router, prefix=api_prefix)


@app.get("/", tags=["system"])
def root() -> dict[str, str]:
    return {"name": "GraniteMeasure AI API", "version": app.version}


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok", "service": "granitemeasure-api"}