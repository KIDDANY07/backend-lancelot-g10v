import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    database_url: str | None
    backend_url: str
    api_key: str | None
    models_dir: Path
    request_timeout_seconds: float


def get_settings() -> Settings:
    return Settings(
        database_url=os.environ.get("DATABASE_URL") or None,
        backend_url=os.environ.get("BACKEND_URL", "http://localhost:3000").rstrip("/"),
        api_key=os.environ.get("ML_SERVICE_API_KEY") or None,
        models_dir=Path(os.environ.get("MODELS_DIR", "./models")),
        request_timeout_seconds=float(os.environ.get("BACKEND_TIMEOUT_SECONDS", "10")),
    )
