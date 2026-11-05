from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.frozen import FrozenEstimator
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
from sklearn.tree import DecisionTreeClassifier

from app.features import (
    DATE,
    FEATURE_VERSION,
    FEATURES,
    GROUP,
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

RANDOM_STATE = 42
RULES_DECISION_THRESHOLD = 0.5
CALIBRATION_FRACTION = 0.25
ROLLING_WINDOWS = 3
MEDIUM_RISK_QUANTILE = 0.80
HIGH_RISK_QUANTILE = 0.95
LEAKAGE_ROC_AUC = 0.92
TALENT_DECISION_THRESHOLD = 0.5


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


def build_candidates(
    *, leaf: int = 50, depth: int = 3, regularization: float = 0.3
) -> list[Candidate]:
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
                        LogisticRegression(
                            C=regularization, class_weight="balanced", max_iter=2000
                        ),
                    ),
                ]
            ),
        ),
        Candidate(
            name="DecisionTreeClassifier",
            prefix="dt",
            kind="tree",
            pipeline=Pipeline(
                [
                    ("imputer", SimpleImputer(strategy="median", keep_empty_features=True)),
                    (
                        "classifier",
                        DecisionTreeClassifier(
                            max_depth=depth,
                            min_samples_leaf=leaf,
                            class_weight="balanced",
                            random_state=RANDOM_STATE,
                        ),
                    ),
                ]
            ),
        ),
    ]


def _clone_candidate(candidate: Candidate) -> Candidate:
    from sklearn.base import clone

    return Candidate(candidate.name, candidate.prefix, candidate.kind, clone(candidate.pipeline))


def _round(value: float | None) -> float | None:
    return None if value is None else round(float(value), 4)


def compute_metrics(
    y_true: pd.Series, scores: np.ndarray, threshold: float = RULES_DECISION_THRESHOLD
) -> dict[str, Any]:
    y = np.asarray(y_true).astype(int)
    scores = np.asarray(scores, dtype=float)
    predicted = (scores >= threshold).astype(int)
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


def _pr_auc(y: pd.Series, scores: np.ndarray) -> float | None:
    if int(np.asarray(y).sum()) == 0:
        return None
    return float(average_precision_score(np.asarray(y).astype(int), scores))


def _mean(values: list[float | None]) -> float | None:
    present = [v for v in values if v is not None]
    return _round(float(np.mean(present))) if present else None


def _split_by_dates(df: pd.DataFrame, fraction: float) -> tuple[pd.DataFrame, pd.DataFrame]:
    dates = sorted(df[DATE].unique())
    n_late = max(1, int(round(len(dates) * fraction)))
    cutoff = dates[len(dates) - n_late]
    return (
        df.loc[df[DATE] < cutoff].reset_index(drop=True),
        df.loc[df[DATE] >= cutoff].reset_index(drop=True),
    )


def fit_calibrated(candidate: Candidate, train: pd.DataFrame) -> tuple[Any, Pipeline, pd.DataFrame]:
    early, late = _split_by_dates(train, CALIBRATION_FRACTION)
    if early[LABEL].nunique() < 2 or late[LABEL].nunique() < 2:
        raise TrainingError(
            "El periodo de entrenamiento necesita días con y sin lesión sin contacto antes y "
            "después del bloque de calibración"
        )
    base = _clone_candidate(candidate).pipeline
    base.fit(prepare_matrix(early), early[LABEL])
    calibrated = CalibratedClassifierCV(FrozenEstimator(base), method="sigmoid")
    calibrated.fit(prepare_matrix(late), late[LABEL])
    return calibrated, base, late


def rolling_validation(candidate: Candidate, rows: pd.DataFrame) -> dict[str, Any]:
    dates = sorted(rows[DATE].unique())
    block = len(dates) // (ROLLING_WINDOWS + 1)
    folds = []
    for window in range(1, ROLLING_WINDOWS + 1):
        start = dates[window * block]
        end = dates[min(len(dates) - 1, (window + 1) * block - 1)]
        fit = rows.loc[rows[DATE] < start]
        valid = rows.loc[(rows[DATE] >= start) & (rows[DATE] <= end)]
        if fit[LABEL].nunique() < 2 or int(valid[LABEL].sum()) == 0:
            continue
        model = _clone_candidate(candidate).pipeline
        model.fit(prepare_matrix(fit), fit[LABEL])
        scores = model.predict_proba(prepare_matrix(valid))[:, 1]
        folds.append(
            {
                "from": str(start),
                "to": str(end),
                "pr_auc": _round(_pr_auc(valid[LABEL], scores)),
                "roc_auc": _round(roc_auc_score(valid[LABEL], scores))
                if valid[LABEL].nunique() == 2
                else None,
                "positives": int(valid[LABEL].sum()),
            }
        )
    return {
        "folds": folds,
        "pr_auc_mean": _mean([f["pr_auc"] for f in folds]),
        "roc_auc_mean": _mean([f["roc_auc"] for f in folds]),
    }


def leave_one_athlete_out(
    candidate: Candidate,
    rows: pd.DataFrame,
    label: str,
    prepare,
) -> dict[str, Any]:
    if GROUP not in rows.columns:
        return {"athletes": 0, "pr_auc": None, "roc_auc": None}
    scores = np.full(len(rows), np.nan)
    athletes = 0
    for athlete in sorted(rows[GROUP].unique()):
        held = rows[GROUP] == athlete
        fit = rows.loc[~held]
        if fit[label].nunique() < 2:
            continue
        model = _clone_candidate(candidate).pipeline
        model.fit(prepare(fit), fit[label])
        scores[held.to_numpy()] = model.predict_proba(prepare(rows.loc[held]))[:, 1]
        athletes += 1
    mask = ~np.isnan(scores)
    y = rows.loc[mask, label]
    return {
        "athletes": athletes,
        "pr_auc": _round(_pr_auc(y, scores[mask])),
        "roc_auc": _round(roc_auc_score(y, scores[mask])) if y.nunique() == 2 else None,
    }


def _validation_key(metrics: dict[str, Any]) -> float:
    value = metrics.get("pr_auc_mean")
    return -1.0 if value is None else float(value)


def train_model(
    df: pd.DataFrame,
    *,
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

    if train[LABEL].nunique() < 2:
        raise TrainingError(
            "El conjunto de entrenamiento necesita días con y sin lesión sin contacto"
        )
    if int(test[LABEL].sum()) == 0:
        raise TrainingError(
            "El conjunto de prueba no tiene lesiones sin contacto; no se puede evaluar el modelo"
        )

    candidates = build_candidates()
    validations = {c.name: rolling_validation(c, train) for c in candidates}
    best = max(candidates, key=lambda c: _validation_key(validations[c.name]))

    evaluated: dict[str, dict[str, Any]] = {}
    fitted: dict[str, tuple[Any, Pipeline, dict[str, Any]]] = {}
    for candidate in candidates:
        calibrated, base, late = fit_calibrated(candidate, train)
        late_scores = calibrated.predict_proba(prepare_matrix(late))[:, 1]
        medium = float(np.quantile(late_scores, MEDIUM_RISK_QUANTILE))
        high = float(np.quantile(late_scores, HIGH_RISK_QUANTILE))
        if high <= medium:
            high = min(1.0, medium + 0.01)
        scores = calibrated.predict_proba(prepare_matrix(test))[:, 1]
        metrics = compute_metrics(test[LABEL], scores, threshold=medium)
        metrics["n_train"] = int(len(train))
        metrics["threshold_medium"] = _round(medium)
        metrics["threshold_high"] = _round(high)
        metrics["validation"] = {
            "rolling_windows": validations[candidate.name],
            "leave_one_athlete_out": leave_one_athlete_out(candidate, train, LABEL, prepare_matrix),
            "selection": "pr_auc_mean de las ventanas temporales del entrenamiento",
        }
        evaluated[candidate.name] = metrics
        fitted[candidate.name] = (calibrated, base, metrics)

    rules_metrics = compute_metrics(test[LABEL], rules_scores(test).to_numpy())
    rules_metrics["n_train"] = None

    model, explain_model, metrics = fitted[best.name]
    timestamp = (now or datetime.now(timezone.utc)).strftime("%Y%m%d-%H%M%S")
    version = f"{best.prefix}-{timestamp}"

    bundle = {
        "model": model,
        "explain_model": explain_model,
        "kind": best.kind,
        "version": version,
        "algorithm": best.name,
        "features": FEATURES,
        "feature_version": FEATURE_VERSION,
    }
    models_dir.mkdir(parents=True, exist_ok=True)
    model_path = models_dir / f"{version}.joblib"
    joblib.dump(bundle, model_path)

    comparison = "; ".join(
        f"{name}: PR-AUC {m['pr_auc']} en prueba, {m['validation']['rolling_windows']['pr_auc_mean']} "
        f"en ventanas temporales y {m['validation']['leave_one_athlete_out']['pr_auc']} dejando un "
        "deportista fuera"
        for name, m in evaluated.items()
    )
    leakage = (
        f" Advertencia: ROC-AUC {metrics['roc_auc']} supera {LEAKAGE_ROC_AUC}; revise una posible fuga."
        if (metrics.get("roc_auc") or 0) > LEAKAGE_ROC_AUC
        else ""
    )
    payload = {
        "version": version,
        "algorithm": best.name,
        "feature_version": FEATURE_VERSION,
        "features": FEATURES,
        "metrics": metrics,
        "rules_baseline_metrics": rules_metrics,
        "train_from": str(train[DATE].min()),
        "train_to": str(train[DATE].max()),
        "test_from": str(test[DATE].min()),
        "test_to": str(test[DATE].max()),
        "notes": "Calibrado con método sigmoide en el último bloque temporal del entrenamiento y "
        f"seleccionado por validación en ventanas temporales ({comparison}). Umbrales de riesgo: "
        f"medio {metrics['threshold_medium']} y alto {metrics['threshold_high']}. "
        f"Reglas de la fase 1: PR-AUC {rules_metrics['pr_auc']}.{leakage}",
    }
    return TrainingResult(payload=payload, model_path=model_path, candidates=evaluated)


def train_talent_model(
    df: pd.DataFrame,
    *,
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

    if train[TALENT_LABEL].nunique() < 2:
        raise TrainingError(
            "Las temporadas de entrenamiento necesitan deportistas que ascendieron o se "
            "consolidaron y que no"
        )
    if int(test[TALENT_LABEL].sum()) == 0:
        raise TrainingError(
            "La temporada de prueba no tiene ascensos ni consolidaciones; no se puede evaluar "
            "el modelo de talento"
        )

    candidates = build_candidates(leaf=4, depth=2, regularization=0.1)
    evaluated: dict[str, dict[str, Any]] = {}
    fitted: dict[str, Candidate] = {}
    for candidate in candidates:
        loao = leave_one_athlete_out(candidate, rows, TALENT_LABEL, prepare_talent_matrix)
        model = _clone_candidate(candidate)
        model.pipeline.fit(prepare_talent_matrix(train), train[TALENT_LABEL])
        scores = model.pipeline.predict_proba(prepare_talent_matrix(test))[:, 1]
        metrics = compute_metrics(test[TALENT_LABEL], scores, threshold=TALENT_DECISION_THRESHOLD)
        metrics["n_train"] = int(len(train))
        metrics["validation"] = {
            "leave_one_athlete_out": loao,
            "selection": "pr_auc dejando un deportista fuera",
        }
        evaluated[candidate.name] = metrics
        fitted[candidate.name] = candidate

    def loao_key(name: str) -> float:
        value = evaluated[name]["validation"]["leave_one_athlete_out"]["pr_auc"]
        return -1.0 if value is None else float(value)

    best_name = max(evaluated, key=loao_key)
    best = fitted[best_name]
    final = _clone_candidate(best)
    final.pipeline.fit(prepare_talent_matrix(rows), rows[TALENT_LABEL])

    rules_metrics = compute_metrics(test[TALENT_LABEL], talent_rules_scores(test).to_numpy())
    rules_metrics["n_train"] = None

    timestamp = (now or datetime.now(timezone.utc)).strftime("%Y%m%d-%H%M%S")
    version = f"talento-{best.prefix}-{timestamp}"

    bundle = {
        "model": final.pipeline,
        "explain_model": final.pipeline,
        "kind": best.kind,
        "task": "talent",
        "version": version,
        "algorithm": best.name,
        "features": TALENT_FEATURES,
        "feature_version": TALENT_FEATURE_VERSION,
    }
    models_dir.mkdir(parents=True, exist_ok=True)
    model_path = models_dir / f"{version}.joblib"
    joblib.dump(bundle, model_path)

    comparison = "; ".join(
        f"{name}: PR-AUC {m['pr_auc']} en la última temporada y "
        f"{m['validation']['leave_one_athlete_out']['pr_auc']} dejando un deportista fuera"
        for name, m in evaluated.items()
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
        "notes": "Modelo de ascenso o consolidación por deportista y temporada. Se evaluó con la "
        "última temporada etiquetada y dejando un deportista fuera, se eligió por esta última "
        f"validación y el modelo final usa todas las temporadas etiquetadas ({comparison}). "
        f"Reglas de detección de talento: PR-AUC {rules_metrics['pr_auc']}",
    }
    return TrainingResult(payload=payload, model_path=model_path, candidates=evaluated)
