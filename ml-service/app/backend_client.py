from typing import Any

import httpx

from app.config import get_settings


class BackendError(Exception):
    pass


def _headers() -> dict[str, str]:
    settings = get_settings()
    return {"x-api-key": settings.api_key or ""}


def _request(method: str, path: str, **kwargs: Any) -> httpx.Response:
    settings = get_settings()
    try:
        return httpx.request(
            method,
            f"{settings.backend_url}/api{path}",
            headers=_headers(),
            timeout=settings.request_timeout_seconds,
            **kwargs,
        )
    except httpx.HTTPError as error:
        raise BackendError(f"No se pudo contactar el backend: {error}") from error


def get_readiness() -> dict[str, Any]:
    response = _request("GET", "/ml/readiness")
    if response.status_code != 200:
        raise BackendError(
            f"El backend respondió {response.status_code} al consultar la readiness"
        )
    return response.json()["readiness"]


def get_active_model_version() -> str | None:
    response = _request("GET", "/ml/models/active")
    if response.status_code == 404:
        return None
    if response.status_code != 200:
        raise BackendError(
            f"El backend respondió {response.status_code} al consultar el modelo activo"
        )
    return response.json()["model"]["version"]


def register_model(payload: dict[str, Any]) -> dict[str, Any]:
    response = _request("POST", "/ml/models", json=payload)
    if response.status_code not in (200, 201):
        raise BackendError(
            f"El backend rechazó el registro del modelo ({response.status_code}): {response.text}"
        )
    return response.json()
