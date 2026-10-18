from datetime import datetime, timezone

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app import backend_client, main
from app.predict import ModelStore
from app.talent_features import (
    TALENT_FEATURE_VERSION,
    TALENT_FEATURES,
    filter_talent_training_rows,
    prepare_talent_matrix,
    season_split,
    talent_rules_scores,
)
from app.train import TrainingError, train_talent_model

API_KEY = "test-key"
HEADERS = {"x-api-key": API_KEY}

TALENT_PAYLOAD = {
    "age_years": 13,
    "birth_quarter": 1,
    "years_to_category_max": 0,
    "plays_up": False,
    "seasons_in_club": 2,
    "cohort_size": 18,
    "index_value": 74.5,
    "index_percentile": 92.0,
    "physical_score": 70,
    "technical_score": 78,
    "tactical_score": None,
    "participation_score": 85,
    "contribution_score": 66,
    "index_delta": 6.5,
    "injuries_in_season": 0,
    "severe_injury": False,
}


def test_prepare_talent_matrix_keeps_the_whitelist_and_booleans():
    matrix = prepare_talent_matrix(
        pd.DataFrame([{**TALENT_PAYLOAD, "plays_up": "true", "nombre": "Ana"}])
    )
    assert list(matrix.columns) == TALENT_FEATURES
    assert matrix.loc[0, "plays_up"] == 1.0
    assert pd.isna(matrix.loc[0, "tactical_score"])


def test_season_split_tests_on_the_last_labeled_season(synthetic_talent_dataset):
    rows = filter_talent_training_rows(synthetic_talent_dataset)
    train, test = season_split(rows)
    assert test["season_start"].nunique() == 1
    assert train["season_start"].max() < test["season_start"].min()


def test_season_split_needs_two_seasons(synthetic_talent_dataset):
    rows = filter_talent_training_rows(synthetic_talent_dataset)
    first = rows.loc[rows["season_start"] == rows["season_start"].min()]
    with pytest.raises(ValueError):
        season_split(first)


def test_only_labeled_rows_of_the_current_version_are_used(synthetic_talent_dataset):
    data = synthetic_talent_dataset.copy()
    data.loc[0, "label_quality"] = "pending"
    data.loc[1, "feature_version"] = "t0"
    rows = filter_talent_training_rows(data)
    assert len(rows) == len(data) - 2


def test_rules_baseline_is_the_rules_flag(synthetic_talent_dataset):
    scores = talent_rules_scores(synthetic_talent_dataset.head(5))
    expected = synthetic_talent_dataset.head(5)["rules_flagged"].astype(float)
    assert scores.tolist() == expected.tolist()


def test_train_talent_model_registers_a_talent_payload(synthetic_talent_dataset, tmp_path):
    result = train_talent_model(
        synthetic_talent_dataset,
        is_synthetic=True,
        models_dir=tmp_path,
        now=datetime(2026, 10, 18, tzinfo=timezone.utc),
    )
    payload = result.payload
    assert payload["task"] == "talent"
    assert payload["feature_version"] == TALENT_FEATURE_VERSION
    assert payload["features"] == TALENT_FEATURES
    assert payload["version"].startswith("talento-")
    assert payload["version"].endswith("-synthetic")
    assert payload["is_synthetic"] is True
    assert payload["test_from"] == "2026-02-01"
    assert payload["metrics"]["positives_test"] > 0
    assert payload["rules_baseline_metrics"]["n_train"] is None
    assert result.model_path.is_file()


def test_train_talent_model_rejects_a_test_season_without_promotions(
    synthetic_talent_dataset, tmp_path
):
    data = synthetic_talent_dataset.copy()
    data.loc[data["season_start"] == data["season_start"].max(), "label_promoted"] = False
    with pytest.raises(TrainingError, match="no tiene ascensos"):
        train_talent_model(data, is_synthetic=True, models_dir=tmp_path)


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("ML_SERVICE_API_KEY", API_KEY)
    monkeypatch.setenv("MODELS_DIR", str(tmp_path))
    monkeypatch.setattr(main, "store", ModelStore(models_dir=lambda: tmp_path, active_version=lambda: None))
    monkeypatch.setattr(
        main, "talent_store", ModelStore(models_dir=lambda: tmp_path, active_version=lambda: None)
    )
    with TestClient(main.app) as test_client:
        yield test_client


def test_talent_predict_without_active_model_returns_503(client):
    response = client.post("/talent/predict", json={"features": TALENT_PAYLOAD}, headers=HEADERS)
    assert response.status_code == 503


def test_talent_predict_uses_the_talent_model(client, monkeypatch, synthetic_talent_dataset, tmp_path):
    from app.talent_features import prepare_talent_matrix as prepare

    result = train_talent_model(
        synthetic_talent_dataset,
        is_synthetic=True,
        models_dir=tmp_path,
        now=datetime(2026, 10, 18, tzinfo=timezone.utc),
    )
    version = result.payload["version"]
    monkeypatch.setattr(
        main,
        "talent_store",
        ModelStore(
            models_dir=lambda: tmp_path,
            active_version=lambda: version,
            feature_version=TALENT_FEATURE_VERSION,
            prepare=prepare,
            label="de talento",
        ),
    )
    response = client.post(
        "/talent/predict",
        json={"model_version": version, "features": TALENT_PAYLOAD},
        headers=HEADERS,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["model_version"] == version
    assert 0 <= body["probability"] <= 1
    assert all(factor["feature"] in TALENT_FEATURES for factor in body["top_factors"])


def test_talent_train_is_rejected_without_talent_readiness(client, monkeypatch):
    monkeypatch.setattr(
        backend_client,
        "get_talent_readiness",
        lambda: {
            "ready": False,
            "criteria": [
                {
                    "code": "temporadas_etiquetadas",
                    "descripcion": "Temporadas etiquetadas",
                    "value": 1,
                    "minimum": 2,
                    "met": False,
                }
            ],
        },
    )
    response = client.post("/talent/train", json={"source": "db"}, headers=HEADERS)
    assert response.status_code == 409
    assert "ascensos reales" in response.json()["detail"]
    assert "Temporadas etiquetadas: 1 de 2" in response.json()["detail"]


def test_talent_train_from_csv_registers_a_synthetic_talent_model(
    client, monkeypatch, synthetic_talent_dataset, tmp_path
):
    csv_path = tmp_path / "talento.csv"
    synthetic_talent_dataset.to_csv(csv_path, index=False)
    registered = []
    monkeypatch.setattr(backend_client, "get_talent_readiness", lambda: {"ready": True, "criteria": []})
    monkeypatch.setattr(backend_client, "register_model", lambda payload: registered.append(payload))

    response = client.post(
        "/talent/train", json={"source": "csv", "csv_path": str(csv_path)}, headers=HEADERS
    )

    assert response.status_code == 200
    assert registered[0]["task"] == "talent"
    assert registered[0]["is_synthetic"] is True
