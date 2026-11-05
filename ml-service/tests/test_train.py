from datetime import datetime, timezone

import joblib
import pandas as pd
import pytest

from app.features import FEATURES
from app.train import TrainingError, compute_metrics, train_model

NOW = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)
METRIC_KEYS = {"roc_auc", "pr_auc", "recall", "precision", "brier", "n_train", "n_test", "positives_test"}


def test_train_model_is_selected_by_temporal_validation_and_compared_with_rules(
    daily_dataset, tmp_path
):
    result = train_model(daily_dataset, models_dir=tmp_path, now=NOW)
    payload = result.payload

    assert payload["algorithm"] in result.candidates
    validation = payload["metrics"]["validation"]
    assert validation["rolling_windows"]["folds"]
    assert validation["leave_one_athlete_out"]["athletes"] == 25
    best_validation = max(
        m["validation"]["rolling_windows"]["pr_auc_mean"] or -1 for m in result.candidates.values()
    )
    assert validation["rolling_windows"]["pr_auc_mean"] == best_validation
    assert METRIC_KEYS <= set(payload["metrics"])
    assert set(payload["rules_baseline_metrics"]) == METRIC_KEYS
    assert 0 < payload["metrics"]["threshold_medium"] < payload["metrics"]["threshold_high"] <= 1
    assert payload["features"] == FEATURES
    assert payload["feature_version"] == "v1"
    assert payload["train_to"] < payload["test_from"]
    assert "is_synthetic" not in payload
    assert payload["version"].endswith("20261001-120000")
    assert "accuracy" not in payload["metrics"]


def test_train_model_is_calibrated_with_sigmoid(daily_dataset, tmp_path):
    result = train_model(daily_dataset, models_dir=tmp_path, now=NOW)
    bundle = joblib.load(result.model_path)
    assert bundle["model"].method == "sigmoid"
    assert bundle["explain_model"].named_steps["classifier"] is not None


def test_train_model_saves_a_loadable_bundle(daily_dataset, tmp_path):
    result = train_model(daily_dataset, models_dir=tmp_path, now=NOW)
    bundle = joblib.load(result.model_path)
    assert bundle["version"] == result.payload["version"]
    assert bundle["features"] == FEATURES
    assert bundle["kind"] in {"logistic", "tree"}


def test_train_model_rejects_a_dataset_without_labeled_rows(daily_dataset, tmp_path):
    pending = daily_dataset.assign(label_quality="pending")
    with pytest.raises(TrainingError, match="No hay filas etiquetadas"):
        train_model(pending, models_dir=tmp_path)


def test_train_model_rejects_a_test_set_without_injuries(daily_dataset, tmp_path):
    no_injuries = daily_dataset.assign(label_injury_7d=False)
    with pytest.raises(TrainingError):
        train_model(no_injuries, models_dir=tmp_path)


def test_compute_metrics_handles_a_single_class():
    metrics = compute_metrics(pd.Series([0, 0, 0]), [0.1, 0.2, 0.3])
    assert metrics["roc_auc"] is None
    assert metrics["pr_auc"] is None
    assert metrics["positives_test"] == 0
