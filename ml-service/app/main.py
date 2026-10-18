import hmac
import logging
from collections.abc import Callable
from contextlib import asynccontextmanager
from typing import Any, Literal

import pandas as pd

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from app import backend_client
from app.backend_client import BackendError
from app.config import get_settings
from app.db import load_dataset_from_csv, load_dataset_from_db, load_talent_dataset_from_db
from app.predict import ModelNotAvailable, ModelStore
from app.talent_features import TALENT_FEATURE_VERSION, prepare_talent_matrix
from app.train import TrainingError, TrainingResult, train_model, train_talent_model

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
    for name, model_store in (("riesgo de lesión", store), ("talento", talent_store)):
        try:
            model_store.refresh()
            logger.info("Modelo activo de %s cargado: %s", name, model_store.version)
        except (ModelNotAvailable, BackendError) as error:
            logger.warning("El servicio inicia sin modelo de %s: %s", name, error)
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


class TrainRequest(BaseModel):
    source: Literal["db", "csv"] = "db"
    csv_path: str | None = None
    allow_insufficient_data: bool = False


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


def _unmet_criteria(readiness: dict) -> str:
    unmet = [
        f"{criterion.get('descripcion', criterion.get('code'))}: {criterion.get('value')} de {criterion.get('minimum')}"
        for criterion in readiness.get("criteria", [])
        if not criterion.get("met")
    ]
    return "; ".join(unmet) or "criterios no informados"


def _run_training(
    request: TrainRequest,
    *,
    get_readiness: Callable[[], dict],
    load_from_db: Callable[[str], pd.DataFrame],
    trainer: Callable[..., TrainingResult],
    insufficient_detail: str,
) -> dict[str, Any]:
    try:
        readiness = get_readiness()
    except BackendError as error:
        raise HTTPException(
            status_code=502, detail=f"No se pudo verificar la readiness en el backend: {error}"
        ) from error

    ready = bool(readiness.get("ready"))
    if not ready and not request.allow_insufficient_data:
        raise HTTPException(
            status_code=409,
            detail=f"{insufficient_detail} Pendiente: {_unmet_criteria(readiness)}. "
            "Use allow_insufficient_data=true solo para probar el pipeline; el modelo quedará "
            "marcado como sintético y nunca podrá activarse.",
        )

    settings = get_settings()
    if request.source == "csv":
        if not request.csv_path:
            raise HTTPException(status_code=400, detail="Debe indicar csv_path cuando source es csv")
        try:
            dataset = load_dataset_from_csv(request.csv_path)
        except FileNotFoundError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
    else:
        if not settings.database_url:
            raise HTTPException(status_code=400, detail="DATABASE_URL no está configurada")
        dataset = load_from_db(settings.database_url)

    is_synthetic = (not ready) or request.source == "csv"
    try:
        result = trainer(dataset, is_synthetic=is_synthetic, models_dir=settings.models_dir)
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
        "mensaje": "Modelo entrenado y registrado en el backend"
        + (" como sintético (no activable)" if is_synthetic else ""),
        "model": result.payload,
        "candidates": result.candidates,
    }


@app.post("/train", dependencies=[Depends(require_api_key)])
def train(request: TrainRequest) -> dict:
    return _run_training(
        request,
        get_readiness=backend_client.get_readiness,
        load_from_db=load_dataset_from_db,
        trainer=train_model,
        insufficient_detail="No hay datos suficientes para entrenar un modelo real (fase 2 "
        "condicionada a una temporada completa).",
    )


@app.post("/talent/train", dependencies=[Depends(require_api_key)])
def train_talent(request: TrainRequest) -> dict:
    return _run_training(
        request,
        get_readiness=backend_client.get_talent_readiness,
        load_from_db=load_talent_dataset_from_db,
        trainer=train_talent_model,
        insufficient_detail="No hay temporadas suficientes con ascensos reales para entrenar "
        "un modelo de talento real.",
    )

