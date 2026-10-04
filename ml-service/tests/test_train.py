from datetime import datetime, timezone

import joblib
import pandas as pd
import pytest

from app.features import FEATURES
from app.train import TrainingError, compute_metrics, train_model

NOW = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)
METRIC_KEYS = {"roc_auc", "pr_auc", "recall", "precision", "brier", "n_train", "n_test", "positives_test"}


def test_train_model_selects_by_pr_auc_and_compares_with_rules(synthetic_dataset, tmp_path):
    result = train_model(synthetic_dataset, is_synthetic=True, models_dir=tmp_path, now=NOW)
    payload = result.payload

    best_pr_auc = max(m["pr_auc"] for m in result.candidates.values())
    assert payload["metrics"]["pr_auc"] == best_pr_auc
    assert set(payload["metrics"]) == METRIC_KEYS
    assert set(payload["rules_baseline_metrics"]) == METRIC_KEYS
    assert payload["features"] == FEATURES
    assert payload["feature_version"] == "v1"
    assert payload["train_to"] < payload["test_from"]
    assert payload["is_synthetic"] is True
    assert payload["version"].endswith("20261001-120000-synthetic")
    assert "accuracy" not in payload["metrics"]


def test_train_model_saves_a_loadable_bundle(synthetic_dataset, tmp_path):
    result = train_model(synthetic_dataset, is_synthetic=True, models_dir=tmp_path, now=NOW)
    bundle = joblib.load(result.model_path)
    assert bundle["version"] == result.payload["version"]
    assert bundle["features"] == FEATURES
    assert bundle["kind"] in {"logistic", "tree"}


def test_train_model_rejects_a_dataset_without_labeled_rows(synthetic_dataset, tmp_path):
    pending = synthetic_dataset.assign(label_quality="pending")
    with pytest.raises(TrainingError, match="No hay filas etiquetadas"):
        train_model(pending, is_synthetic=True, models_dir=tmp_path)


def test_train_model_rejects_a_test_set_without_injuries(synthetic_dataset, tmp_path):
    no_injuries = synthetic_dataset.assign(label_injury_7d=False)
    with pytest.raises(TrainingError):
        train_model(no_injuries, is_synthetic=True, models_dir=tmp_path)


def test_compute_metrics_handles_a_single_class():
    metrics = compute_metrics(pd.Series([0, 0, 0]), [0.1, 0.2, 0.3])
    assert metrics["roc_auc"] is None
    assert metrics["pr_auc"] is None
    assert metrics["positives_test"] == 0
