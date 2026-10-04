import threading
from collections.abc import Callable
from pathlib import Path
from typing import Any

import joblib
import pandas as pd

from app import backend_client
from app.config import get_settings
from app.explain import build_tree_explainer, top_factors
from app.features import FEATURE_VERSION, prepare_matrix


class ModelNotAvailable(Exception):
    pass


class ModelStore:
    def __init__(
        self,
        models_dir: Callable[[], Path] = lambda: get_settings().models_dir,
        active_version: Callable[[], str | None] = backend_client.get_active_model_version,
    ) -> None:
        self._models_dir = models_dir
        self._active_version = active_version
        self._bundle: dict[str, Any] | None = None
        self._explainer: Any = None
        self._lock = threading.Lock()

    @property
    def version(self) -> str | None:
        return None if self._bundle is None else self._bundle["version"]

    def load_version(self, version: str) -> None:
        path = self._models_dir() / f"{version}.joblib"
        if not path.is_file():
            raise ModelNotAvailable(
                f"El modelo activo {version} no está en el directorio de modelos"
            )
        bundle = joblib.load(path)
        if bundle.get("feature_version") != FEATURE_VERSION:
            raise ModelNotAvailable(
                f"El modelo {version} usa variables {bundle.get('feature_version')} "
                f"y el servicio espera {FEATURE_VERSION}"
            )
        explainer = build_tree_explainer(bundle) if bundle["kind"] == "tree" else None
        self._bundle = bundle
        self._explainer = explainer

    def refresh(self) -> None:
        with self._lock:
            version = self._active_version()
            if version is None:
                self._bundle = None
                self._explainer = None
                raise ModelNotAvailable("No hay un modelo de ML activo en el backend")
            if version != self.version:
                self.load_version(version)

    def ensure(self, requested_version: str | None) -> None:
        if self._bundle is None or (
            requested_version is not None and requested_version != self.version
        ):
            self.refresh()

    def predict(
        self, features: dict[str, Any], requested_version: str | None = None
    ) -> dict[str, Any]:
        self.ensure(requested_version)
        bundle = self._bundle
        if bundle is None:
            raise ModelNotAvailable("No hay un modelo de ML cargado")
        row = prepare_matrix(pd.DataFrame([features]))
        probability = float(bundle["model"].predict_proba(row)[0, 1])
        return {
            "probability": round(probability, 4),
            "top_factors": top_factors(bundle, row, self._explainer),
            "model_version": bundle["version"],
        }
