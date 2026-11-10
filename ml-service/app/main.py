import hmac
import logging
from collections.abc import Callable
from contextlib import asynccontextmanager
from typing import Any

import pandas as pd

from fastapi import Depends, FastAPI, Header, HTTPException, Path
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError

from app import backend_client
from app.backend_client import BackendError
from app.config import get_settings
from app.db import load_dataset_from_db, load_talent_dataset_from_db
from app.predict import ModelNotAvailable, ModelStore
from app.runtime import library_versions
from app.talent_features import TALENT_FEATURE_VERSION, prepare_talent_matrix
from app.train import TrainingError, TrainingResult, train_model, train_talent_model

logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(name)s - %(message)s")
logger = logging.getLogger("lancelot-ml")

store = ModelStore()
talent_store = ModelStore(
    active_version=lambda: backend_client.get_active_model_version("talent"),
    feature_version=TALENT_FEATURE_VERSION,
    prepare=prepare_talent_matrix,
    label="de talento",
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    logger.info("Versiones de librerías: %s", library_versions())
    logger.info(
        "Directorio de modelos %s: %s archivos .joblib",
        settings.models_dir,
        len(list(settings.models_dir.glob("*.joblib"))) if settings.models_dir.is_dir() else "no existe",
    )
    for name, model_store in (("riesgo de lesión", store), ("talento", talent_store)):
        try:
            model_store.refresh()
            logger.info("Modelo activo de %s cargado: %s", name, model_store.version)
        except (ModelNotAvailable, BackendError) as error:
            logger.warning("El servicio inicia sin modelo de %s: %s", name, error)
        except Exception:
            logger.exception(
                "No se pudo cargar el modelo activo de %s; el servicio inicia sin él y las predicciones responderán 503",
                name,
            )
    yield


app = FastAPI(
    title="Lancelot ML",
    description="Microservicio de aprendizaje automático: riesgo de lesión sin contacto (fase 2) y potencial de ascenso",
    version="1.0.0",
    lifespan=lifespan,
)


def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    expected = get_settings().api_key
    if not expected or not x_api_key or not hmac.compare_digest(x_api_key, expected):
        raise HTTPException(status_code=401, detail="Clave del servicio inválida o no configurada")


class PredictRequest(BaseModel):
    model_version: str | None = None
    features: dict[str, float | int | bool | str | None]


class Factor(BaseModel):
    feature: str
    contribution: float


class PredictResponse(BaseModel):
    probability: float = Field(ge=0, le=1)
    top_factors: list[Factor]
    model_version: str


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "model_loaded": store.version is not None,
        "model_version": store.version,
        "talent_model_loaded": talent_store.version is not None,
        "talent_model_version": talent_store.version,
    }


@app.post("/predict", response_model=PredictResponse, dependencies=[Depends(require_api_key)])
def predict(request: PredictRequest) -> dict:
    try:
        return store.predict(request.features, request.model_version)
    except (ModelNotAvailable, BackendError) as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.post(
    "/talent/predict", response_model=PredictResponse, dependencies=[Depends(require_api_key)]
)
def predict_talent(request: PredictRequest) -> dict:
    try:
        return talent_store.predict(request.features, request.model_version)
    except (ModelNotAvailable, BackendError) as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


def _unmet_criteria(readiness: dict) -> list[str]:
    return [
        f"{criterion.get('descripcion', criterion.get('code'))}: {criterion.get('value')} de {criterion.get('minimum')}"
        for criterion in readiness.get("criteria", [])
        if not criterion.get("met")
    ]


def _readiness_summary(get_readiness: Callable[[], dict]) -> dict[str, Any]:
    try:
        readiness = get_readiness()
    except BackendError as error:
        return {"ready": None, "pending": [f"No se pudo consultar la readiness: {error}"]}
    return {"ready": bool(readiness.get("ready")), "pending": _unmet_criteria(readiness)}


def _run_training(
    *,
    get_readiness: Callable[[], dict],
    load_from_db: Callable[[str], pd.DataFrame],
    trainer: Callable[..., TrainingResult],
) -> dict[str, Any]:
    settings = get_settings()
    if not settings.database_url:
        raise HTTPException(status_code=400, detail="DATABASE_URL no está configurada")
    readiness = _readiness_summary(get_readiness)
    try:
        dataset = load_from_db(settings.database_url)
    except SQLAlchemyError as error:
        logger.error("No se pudo leer la base de datos: %s", error)
        reason = str(getattr(error, "orig", None) or error).splitlines()[0]
        raise HTTPException(
            status_code=502,
            detail=f"El servicio de ML no pudo leer la base de datos (revise DATABASE_URL): {reason}",
        ) from error

    try:
        result = trainer(dataset, models_dir=settings.models_dir)
    except TrainingError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    try:
        backend_client.register_model(result.payload)
    except BackendError as error:
        raise HTTPException(
            status_code=502,
            detail=f"El modelo se entrenó y guardó en {result.model_path} pero no se pudo registrar: {error}",
        ) from error

    return {
        "mensaje": "Modelo entrenado y registrado en el backend",
        "model": result.payload,
        "candidates": result.candidates,
        "readiness": readiness,
    }


@app.post("/train", dependencies=[Depends(require_api_key)])
def train() -> dict:
    return _run_training(
        get_readiness=backend_client.get_readiness,
        load_from_db=load_dataset_from_db,
        trainer=train_model,
    )


@app.post("/talent/train", dependencies=[Depends(require_api_key)])
def train_talent() -> dict:
    return _run_training(
        get_readiness=backend_client.get_talent_readiness,
        load_from_db=load_talent_dataset_from_db,
        trainer=train_talent_model,
    )


@app.delete("/models/{version}", dependencies=[Depends(require_api_key)])
def delete_model(version: str = Path(pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]*$")) -> dict:
    if ".." in version:
        raise HTTPException(status_code=400, detail="Versión de modelo inválida")
    path = get_settings().models_dir / f"{version}.joblib"
    existed = path.is_file()
    if existed:
        path.unlink()
    return {
        "mensaje": f"Archivo del modelo {version} eliminado"
        if existed
        else f"El modelo {version} no tenía archivo en este servicio",
        "deleted": existed,
    }
