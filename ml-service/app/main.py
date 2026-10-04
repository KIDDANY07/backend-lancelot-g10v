import hmac
import logging
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from app import backend_client
from app.backend_client import BackendError
from app.config import get_settings
from app.db import load_dataset_from_csv, load_dataset_from_db
from app.predict import ModelNotAvailable, ModelStore
from app.train import TrainingError, train_model

logger = logging.getLogger("lancelot-ml")

store = ModelStore()


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        store.refresh()
        logger.info("Modelo activo cargado: %s", store.version)
    except (ModelNotAvailable, BackendError) as error:
        logger.warning("El servicio inicia sin modelo cargado: %s", error)
    yield


app = FastAPI(
    title="Lancelot ML",
    description="Microservicio de aprendizaje automático (fase 2) para estimar el riesgo de lesión sin contacto",
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
    }


@app.post("/predict", response_model=PredictResponse, dependencies=[Depends(require_api_key)])
def predict(request: PredictRequest) -> dict:
    try:
        return store.predict(request.features, request.model_version)
    except (ModelNotAvailable, BackendError) as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


def _unmet_criteria(readiness: dict) -> str:
    unmet = [
        f"{criterion.get('descripcion', criterion.get('code'))}: {criterion.get('value')} de {criterion.get('minimum')}"
        for criterion in readiness.get("criteria", [])
        if not criterion.get("met")
    ]
    return "; ".join(unmet) or "criterios no informados"


@app.post("/train", dependencies=[Depends(require_api_key)])
def train(request: TrainRequest) -> dict:
    try:
        readiness = backend_client.get_readiness()
    except BackendError as error:
        raise HTTPException(
            status_code=502, detail=f"No se pudo verificar la readiness en el backend: {error}"
        ) from error

    ready = bool(readiness.get("ready"))
    if not ready and not request.allow_insufficient_data:
        raise HTTPException(
            status_code=409,
            detail="No hay datos suficientes para entrenar un modelo real (fase 2 condicionada a "
            f"una temporada completa). Pendiente: {_unmet_criteria(readiness)}. "
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
        dataset = load_dataset_from_db(settings.database_url)

    is_synthetic = (not ready) or request.source == "csv"
    try:
        result = train_model(dataset, is_synthetic=is_synthetic, models_dir=settings.models_dir)
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
