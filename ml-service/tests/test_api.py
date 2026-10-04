from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app import backend_client, main
from app.predict import ModelStore
from app.train import train_model

API_KEY = "test-key"
HEADERS = {"x-api-key": API_KEY}

FEATURES_PAYLOAD = {
    "age_years": 15.2,
    "acute_load_7d": 410.0,
    "chronic_load_28d": 280.0,
    "acwr": 1.46,
    "acwr_ewma": 1.52,
    "monotony_7d": 1.8,
    "strain_7d": 5166.0,
    "sessions_7d": 6,
    "rpe_avg_7d": 7.4,
    "match_minutes_7d": 90,
    "high_rpe_sessions_14d": 4,
    "prior_injuries_count": 1,
    "prior_non_contact_injuries_count": 1,
    "days_since_last_injury": 60,
    "is_recovering": False,
}


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("ML_SERVICE_API_KEY", API_KEY)
    monkeypatch.setenv("MODELS_DIR", str(tmp_path))
    monkeypatch.setattr(backend_client, "get_active_model_version", lambda: None)
    monkeypatch.setattr(main, "store", ModelStore(models_dir=lambda: tmp_path, active_version=lambda: None))
    with TestClient(main.app) as test_client:
        yield test_client


@pytest.fixture
def trained_version(synthetic_dataset, tmp_path, monkeypatch):
    result = train_model(
        synthetic_dataset,
        is_synthetic=True,
        models_dir=tmp_path,
        now=datetime(2026, 10, 1, tzinfo=timezone.utc),
    )
    version = result.payload["version"]
    monkeypatch.setattr(main, "store", ModelStore(models_dir=lambda: tmp_path, active_version=lambda: version))
    return version


def test_health_reports_no_model(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "model_loaded": False, "model_version": None}


def test_predict_requires_the_api_key(client):
    response = client.post("/predict", json={"features": FEATURES_PAYLOAD})
    assert response.status_code == 401


def test_predict_without_active_model_returns_503(client):
    response = client.post("/predict", json={"features": FEATURES_PAYLOAD}, headers=HEADERS)
    assert response.status_code == 503


def test_predict_output_shape(client, trained_version):
    response = client.post(
        "/predict",
        json={"model_version": trained_version, "features": FEATURES_PAYLOAD},
        headers=HEADERS,
    )
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"probability", "top_factors", "model_version"}
    assert 0 <= body["probability"] <= 1
    assert body["model_version"] == trained_version
    assert len(body["top_factors"]) == 3
    for factor in body["top_factors"]:
        assert set(factor) == {"feature", "contribution"}
        assert factor["feature"] in FEATURES_PAYLOAD
        assert isinstance(factor["contribution"], float)
    contributions = [abs(f["contribution"]) for f in body["top_factors"]]
    assert contributions == sorted(contributions, reverse=True)


def test_predict_ignores_unknown_and_missing_features(client, trained_version):
    response = client.post(
        "/predict",
        json={"features": {"acwr_ewma": 1.4, "nombre": "no debe usarse"}},
        headers=HEADERS,
    )
    assert response.status_code == 200
    assert all(f["feature"] != "nombre" for f in response.json()["top_factors"])


def test_train_is_rejected_without_enough_data(client, monkeypatch):
    registered = []
    monkeypatch.setattr(
        backend_client,
        "get_readiness",
        lambda: {
            "ready": False,
            "criteria": [
                {"code": "dias_etiquetados", "descripcion": "Días etiquetados", "value": 40, "minimum": 270, "met": False},
                {"code": "deportistas", "descripcion": "Deportistas", "value": 22, "minimum": 20, "met": True},
            ],
        },
    )
    monkeypatch.setattr(backend_client, "register_model", lambda payload: registered.append(payload))

    response = client.post("/train", json={"source": "db"}, headers=HEADERS)

    assert response.status_code == 409
    assert "No hay datos suficientes" in response.json()["detail"]
    assert "Días etiquetados: 40 de 270" in response.json()["detail"]
    assert "Deportistas" not in response.json()["detail"]
    assert registered == []


def test_train_with_insufficient_data_allowed_registers_a_synthetic_model(
    client, monkeypatch, synthetic_dataset, tmp_path
):
    csv_path = tmp_path / "synthetic.csv"
    synthetic_dataset.to_csv(csv_path, index=False)
    registered = []
    monkeypatch.setattr(backend_client, "get_readiness", lambda: {"ready": False, "criteria": []})
    monkeypatch.setattr(backend_client, "register_model", lambda payload: registered.append(payload))

    response = client.post(
        "/train",
        json={"source": "csv", "csv_path": str(csv_path), "allow_insufficient_data": True},
        headers=HEADERS,
    )

    assert response.status_code == 200
    assert len(registered) == 1
    assert registered[0]["is_synthetic"] is True
    assert "sintético" in response.json()["mensaje"]


def test_train_requires_the_api_key(client):
    response = client.post("/train", json={"source": "db"})
    assert response.status_code == 401
