import logging
from datetime import datetime, timezone

import joblib
import pytest

from app import features, predict
from app.predict import ModelStore
from app.runtime import library_versions, version_differences
from app.train import train_model

NOW = datetime(2026, 10, 1, tzinfo=timezone.utc)


def test_bundles_record_the_library_versions(daily_dataset, tmp_path):
    version = train_model(daily_dataset, models_dir=tmp_path, now=NOW).payload["version"]
    bundle = joblib.load(tmp_path / f"{version}.joblib")
    assert bundle["library_versions"]["scikit-learn"] == library_versions()["scikit-learn"]
    assert version_differences(bundle["library_versions"]) == {}


def test_a_saved_model_keeps_working_if_the_feature_list_changes(daily_dataset, tmp_path, monkeypatch):
    version = train_model(daily_dataset, models_dir=tmp_path, now=NOW).payload["version"]
    trained_with = list(features.FEATURES)
    monkeypatch.setattr(features, "FEATURES", [*trained_with, "nueva_variable"])
    store = ModelStore(models_dir=lambda: tmp_path, active_version=lambda: version)
    result = store.predict({"acwr": 1.4, "acwr_ewma": 1.3})
    assert 0 <= result["probability"] <= 1
    assert {factor["feature"] for factor in result["top_factors"]} <= set(trained_with)


def test_loading_a_model_from_other_library_versions_warns(daily_dataset, tmp_path, caplog):
    version = train_model(daily_dataset, models_dir=tmp_path, now=NOW).payload["version"]
    path = tmp_path / f"{version}.joblib"
    bundle = joblib.load(path)
    bundle["library_versions"] = {**bundle["library_versions"], "scikit-learn": "0.0.1"}
    joblib.dump(bundle, path)
    store = ModelStore(models_dir=lambda: tmp_path, active_version=lambda: version)
    with caplog.at_level(logging.WARNING, logger=predict.logger.name):
        store.refresh()
    assert "scikit-learn 0.0.1" in caplog.text


@pytest.mark.parametrize("saved", [None, {}])
def test_models_without_recorded_versions_still_load(saved):
    assert version_differences(saved) == {}
