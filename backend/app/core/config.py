from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    # Use SQLite by default for local development to avoid requiring Postgres/Docker
    database_url: str = "sqlite:///./granitemeasure.db"
    # If you need Postgres locally, override DATABASE_URL in backend/.env
    redis_url: str = "redis://localhost:6379/0"
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_storage_bucket: str = "granitemeasure"
    storage_backend: Literal["local", "supabase"] = "local"
    local_storage_dir: str = "./storage"

    # Comma-separated origins. Include common local development ports by default.
    cors_origins: str = "http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001"

    # Database init mode: set to 'create' to create tables on startup for local development
    database_init_mode: str = "none"

    granite_detection_model_path: str = ""
    granite_segmentation_model_path: str = ""
    defect_detection_model_path: str = ""

    aruco_marker_size_cm: float = 10.0
    aruco_dictionary: str = "DICT_5X5_100"

    max_image_bytes: int = 15_728_640
    allowed_image_mime_types: str = "image/jpeg,image/png,image/webp"

    demo_mode: bool = False
    seed_demo_users: bool = False
    default_granite_density_t_m3: float | None = None
    rate_limit_per_minute: int = 120

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def allowed_mimes(self) -> set[str]:
        return {m.strip() for m in self.allowed_image_mime_types.split(",") if m.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()
