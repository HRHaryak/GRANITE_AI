from __future__ import annotations

from pathlib import Path

from app.core.config import get_settings


class StorageProvider:
    def save(self, relative_path: str, data: bytes, content_type: str) -> str:
        raise NotImplementedError

    def load(self, relative_path: str) -> bytes:
        raise NotImplementedError

    def public_hint(self, relative_path: str) -> str:
        return relative_path


class LocalStorageProvider(StorageProvider):
    def __init__(self) -> None:
        self.root = Path(get_settings().local_storage_dir).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def save(self, relative_path: str, data: bytes, content_type: str) -> str:
        dest = self.root / relative_path
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        return str(relative_path)

    def load(self, relative_path: str) -> bytes:
        return (self.root / relative_path).read_bytes()


class SupabaseStorageProvider(StorageProvider):
    def __init__(self) -> None:
        settings = get_settings()
        if not settings.supabase_url or not settings.supabase_service_role_key:
            raise RuntimeError("Supabase Storage is not configured")
        self.settings = settings

    def save(self, relative_path: str, data: bytes, content_type: str) -> str:
        import httpx

        url = f"{self.settings.supabase_url}/storage/v1/object/{self.settings.supabase_storage_bucket}/{relative_path}"
        headers = {
            "Authorization": f"Bearer {self.settings.supabase_service_role_key}",
            "Content-Type": content_type,
            "apikey": self.settings.supabase_service_role_key,
        }
        with httpx.Client(timeout=60) as client:
            r = client.post(url, headers=headers, content=data)
            r.raise_for_status()
        return relative_path

    def load(self, relative_path: str) -> bytes:
        import httpx

        url = f"{self.settings.supabase_url}/storage/v1/object/{self.settings.supabase_storage_bucket}/{relative_path}"
        headers = {
            "Authorization": f"Bearer {self.settings.supabase_service_role_key}",
            "apikey": self.settings.supabase_service_role_key,
        }
        with httpx.Client(timeout=60) as client:
            r = client.get(url, headers=headers)
            r.raise_for_status()
            return r.content


def get_storage() -> StorageProvider:
    settings = get_settings()
    if settings.storage_backend == "supabase":
        return SupabaseStorageProvider()
    return LocalStorageProvider()
