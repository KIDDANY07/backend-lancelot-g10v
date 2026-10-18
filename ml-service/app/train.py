from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from app.features import (
    DATE,
    FEATURE_VERSION,
    FEATURES,
    LABEL,
    filter_training_rows,
    prepare_matrix,
    rules_scores,
    temporal_split,
)
from app.talent_features import (
    SEASON,
    TALENT_FEATURE_VERSION,
    TALENT_FEATURES,
    TALENT_LABEL,
    filter_talent_training_rows,
    prepare_talent_matrix,
    season_split,
    talent_rules_scores,
)

DECISION_THRESHOLD = 0.5
RANDOM_STATE = 42


class TrainingError(Exception):
    pass


@dataclass
class Candidate:
    name: str
    prefix: str
    kind: str
    pipeline: Pipeline


@dataclass
class TrainingResult:
    payload: dict[str, Any]
    model_path: Path
    candidates: dict[str, dict[str, Any]]


def build_candidates() -> list[Candidate]:
    return [
        Candidate(
            name="LogisticRegression",
            prefix="lr",
            kind="logistic",
            pipeline=Pipeline(
                [
                    ("imputer", SimpleImputer(strategy="median", keep_empty_features=True)),
                    ("scaler", StandardScaler()),
                    (
                        "classifier",
                        LogisticRegression(class_weight="balanced", max_iter=2000),
                    ),
                ]
            ),
        ),
        Candidate(
            name="RandomForestClassifier",
            prefix="rf",
            kind="tree",
            pipeline=Pipeline(
                [
                    ("imputer", SimpleImputer(strategy="median", keep_empty_features=True)),
                    (
                        "classifier",
                        RandomForestClassifier(
                            n_estimators=300,
                            min_samples_leaf=5,
                            class_weight="balanced",
                            random_state=RANDOM_STATE,
                            n_jobs=-1,
                        ),
                    ),
                ]
            ),
        ),
    ]


def _round(value: float | None) -> float | None:
    return None if value is None else round(float(value), 4)


def compute_metrics(y_true: pd.Series, scores: np.ndarray) -> dict[str, Any]:
    y = np.asarray(y_true).astype(int)
    scores = np.asarray(scores, dtype=float)
    predicted = (scores >= DECISION_THRESHOLD).astype(int)
    positives = int(y.sum())
    has_both_classes = 0 < positives < len(y)
    return {
        "roc_auc": _round(roc_auc_score(y, scores)) if has_both_classes else None,
        "pr_auc": _round(average_precision_score(y, scores)) if positives > 0 else None,
        "recall": _round(recall_score(y, predicted, zero_division=0)),
        "precision": _round(precision_score(y, predicted, zero_division=0)),
        "brier": _round(brier_score_loss(y, np.clip(scores, 0, 1))),
        "n_test": int(len(y)),
        "positives_test": positives,
    }


def _pr_auc_key(metrics: dict[str, Any]) -> float:
    value = metrics.get("pr_auc")
    return -1.0 if value is None else float(value)


def _select_best(
    x_train: pd.DataFrame,
    y_train: pd.Series,
    x_test: pd.DataFrame,
    y_test: pd.Series,
) -> tuple[dict[str, dict[str, Any]], str, Candidate]:
    evaluated: dict[str, dict[str, Any]] = {}
    fitted: dict[str, Candidate] = {}
    for candidate in build_candidates():
        candidate.pipeline.fit(x_train, y_train)
        scores = candidate.pipeline.predict_proba(x_test)[:, 1]
        metrics = compute_metrics(y_test, scores)
        metrics["n_train"] = int(len(x_train))
        evaluated[candidate.name] = metrics
        fitted[candidate.name] = candidate
    best_name = max(evaluated, key=lambda name: _pr_auc_key(evaluated[name]))
    return evaluated, best_name, fitted[best_name]


def train_model(
    df: pd.DataFrame,
    *,
    is_synthetic: bool,
    models_dir: Path,
    now: datetime | None = None,
) -> TrainingResult:
    rows = filter_training_rows(df)
    if rows.empty:
        raise TrainingError(
            "No hay filas etiquetadas, disponibles y con la versión de variables "
            f"{FEATURE_VERSION} para entrenar"
        )
    try:
        train, test = temporal_split(rows)
    except ValueError as error:
        raise TrainingError(str(error)) from error

    y_train = train[LABEL]
    y_test = test[LABEL]
    if y_train.nunique() < 2:
        raise TrainingError(
            "El conjunto de entrenamiento necesita días con y sin lesión sin contacto"
        )
    if int(y_test.sum()) == 0:
        raise TrainingError(
            "El conjunto de prueba no tiene lesiones sin contacto; no se puede evaluar el modelo"
        )

    evaluated, best_name, best = _select_best(
        prepare_matrix(train), y_train, prepare_matrix(test), y_test
    )

    rules_metrics = compute_metrics(y_test, rules_scores(test).to_numpy())
    rules_metrics["n_train"] = None

    timestamp = (now or datetime.now(timezone.utc)).strftime("%Y%m%d-%H%M%S")
    version = f"{best.prefix}-{timestamp}" + ("-synthetic" if is_synthetic else "")

    bundle = {
        "model": best.pipeline,
        "kind": best.kind,
        "version": version,
        "algorithm": best.name,
        "features": FEATURES,
        "feature_version": FEATURE_VERSION,
        "is_synthetic": is_synthetic,
    }
    models_dir.mkdir(parents=True, exist_ok=True)
    model_path = models_dir / f"{version}.joblib"
    joblib.dump(bundle, model_path)

    comparison = "; ".join(
        f"{name}: PR-AUC {metrics['pr_auc']}" for name, metrics in evaluated.items()
    )
    payload = {
        "version": version,
        "algorithm": best.name,
        "feature_version": FEATURE_VERSION,
        "features": FEATURES,
        "metrics": evaluated[best_name],
        "rules_baseline_metrics": rules_metrics,
        "train_from": str(train[DATE].min()),
        "train_to": str(train[DATE].max()),
        "test_from": str(test[DATE].min()),
        "test_to": str(test[DATE].max()),
        "is_synthetic": is_synthetic,
        "notes": f"Seleccionado por PR-AUC en el conjunto de prueba temporal ({comparison}). "
        f"Reglas de la fase 1: PR-AUC {rules_metrics['pr_auc']}",
    }
    return TrainingResult(payload=payload, model_path=model_path, candidates=evaluated)


def train_talent_model(
    df: pd.DataFrame,
    *,
    is_synthetic: bool,
    models_dir: Path,
    now: datetime | None = None,
) -> TrainingResult:
    rows = filter_talent_training_rows(df)
    if rows.empty:
        raise TrainingError(
            "No hay temporadas etiquetadas con la versión de variables "
            f"{TALENT_FEATURE_VERSION} para entrenar el modelo de talento"
        )
    try:
        train, test = season_split(rows)
    except ValueError as error:
        raise TrainingError(str(error)) from error

    y_train = train[TALENT_LABEL]
    y_test = test[TALENT_LABEL]
    if y_train.nunique() < 2:
        raise TrainingError(
            "Las temporadas de entrenamiento necesitan deportistas que ascendieron y que no"
        )
    if int(y_test.sum()) == 0:
        raise TrainingError(
            "La temporada de prueba no tiene ascensos; no se puede evaluar el modelo de talento"
        )

    evaluated, best_name, best = _select_best(
        prepare_talent_matrix(train), y_train, prepare_talent_matrix(test), y_test
    )
    rules_metrics = compute_metrics(y_test, talent_rules_scores(test).to_numpy())
    rules_metrics["n_train"] = None

    timestamp = (now or datetime.now(timezone.utc)).strftime("%Y%m%d-%H%M%S")
    version = f"talento-{best.prefix}-{timestamp}" + ("-synthetic" if is_synthetic else "")

    bundle = {
        "model": best.pipeline,
        "kind": best.kind,
        "task": "talent",
        "version": version,
        "algorithm": best.name,
        "features": TALENT_FEATURES,
        "feature_version": TALENT_FEATURE_VERSION,
        "is_synthetic": is_synthetic,
    }
    models_dir.mkdir(parents=True, exist_ok=True)
    model_path = models_dir / f"{version}.joblib"
    joblib.dump(bundle, model_path)

    comparison = "; ".join(
        f"{name}: PR-AUC {metrics['pr_auc']}" for name, metrics in evaluated.items()
    )
    payload = {
        "task": "talent",
        "version": version,
        "algorithm": best.name,
        "feature_version": TALENT_FEATURE_VERSION,
        "features": TALENT_FEATURES,
        "metrics": evaluated[best_name],
        "rules_baseline_metrics": rules_metrics,
        "train_from": str(train[SEASON].min()),
        "train_to": str(train[SEASON].max()),
        "test_from": str(test[SEASON].min()),
        "test_to": str(test[SEASON].max()),
        "is_synthetic": is_synthetic,
        "notes": "Modelo de potencial de ascenso entrenado con las temporadas anteriores y "
        f"probado con la última temporada etiquetada ({comparison}). "
        f"Reglas de detección de talento: PR-AUC {rules_metrics['pr_auc']}",
    }
    return TrainingResult(payload=payload, model_path=model_path, candidates=evaluated)
