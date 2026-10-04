import re
from pathlib import Path

import numpy as np
import pandas as pd

from app.features import FEATURES, filter_training_rows, prepare_matrix, rules_scores

BACKEND_SRC = Path(__file__).resolve().parents[2] / "src"

EXPECTED_FEATURES = [
    "age_years",
    "acute_load_7d",
    "chronic_load_28d",
    "acwr",
    "acwr_ewma",
    "monotony_7d",
    "strain_7d",
    "sessions_7d",
    "rpe_avg_7d",
    "match_minutes_7d",
    "high_rpe_sessions_14d",
    "prior_injuries_count",
    "prior_non_contact_injuries_count",
    "days_since_last_injury",
    "is_recovering",
]


def _ts_string_array(relative_path: str, constant: str) -> list[str]:
    source = (BACKEND_SRC / relative_path).read_text(encoding="utf-8")
    match = re.search(rf"{constant}\s*=\s*\[(.*?)\]", source, re.S)
    assert match, f"No se encontró {constant} en {relative_path}"
    return re.findall(r"'([a-z0-9_]+)'", match.group(1))


def test_feature_names_and_order_are_stable():
    assert FEATURES == EXPECTED_FEATURES


def test_features_are_allowed_by_the_backend_allowlist():
    allowlist = _ts_string_array(
        "injury_risk_assessments/predictors/ml-features-payload.ts", "ML_FEATURE_COLUMNS"
    )
    assert set(FEATURES) <= set(allowlist)


def test_features_exist_in_the_pseudonymized_export():
    export_columns = _ts_string_array("ml_features/feature-export.service.ts", "EXPORT_COLUMNS")
    assert set(FEATURES) <= set(export_columns)
    assert "id_user" not in export_columns


def test_prepare_matrix_orders_columns_and_converts_types():
    raw = pd.DataFrame(
        [
            {
                "is_recovering": "true",
                "acwr": "1.35",
                "id_user": 7,
                "sessions_7d": 4,
                "days_since_last_injury": None,
            }
        ]
    )
    matrix = prepare_matrix(raw)
    assert list(matrix.columns) == FEATURES
    assert matrix.loc[0, "acwr"] == 1.35
    assert matrix.loc[0, "is_recovering"] == 1.0
    assert np.isnan(matrix.loc[0, "days_since_last_injury"])
    assert np.isnan(matrix.loc[0, "age_years"])
    assert "id_user" not in matrix.columns


def test_filter_training_rows_keeps_only_labeled_available_current_version():
    raw = pd.DataFrame(
        [
            {"date": "2026-01-01", "label_quality": "labeled", "is_available": True, "feature_version": "v1", "label_injury_7d": True},
            {"date": "2026-01-02", "label_quality": "pending", "is_available": True, "feature_version": "v1", "label_injury_7d": None},
            {"date": "2026-01-03", "label_quality": "labeled", "is_available": False, "feature_version": "v1", "label_injury_7d": False},
            {"date": "2026-01-04", "label_quality": "labeled", "is_available": "true", "feature_version": "v0", "label_injury_7d": False},
            {"date": "2026-01-05", "label_quality": "unknown_mechanism", "is_available": True, "feature_version": "v1", "label_injury_7d": None},
            {"date": "2026-01-06", "label_quality": "labeled", "is_available": "t", "feature_version": "v1", "label_injury_7d": "false"},
        ]
    )
    rows = filter_training_rows(raw)
    assert [str(d) for d in rows["date"]] == ["2026-01-01", "2026-01-06"]
    assert rows["label_injury_7d"].tolist() == [1, 0]


def test_rules_scores_treat_medium_and_high_as_positive_signal():
    scores = rules_scores(pd.DataFrame({"rules_risk_level": ["alto", "medio", None, "bajo"]}))
    assert scores.tolist() == [1.0, 0.5, 0.0, 0.0]
