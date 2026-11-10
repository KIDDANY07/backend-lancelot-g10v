import math

import numpy as np
import pandas as pd

FEATURE_VERSION = "v1"

FEATURES: list[str] = [
    "acwr",
    "acwr_ewma",
]

LABEL = "label_injury_7d"
GROUP = "id_user"
DATE = "date"
RULES_LEVEL = "rules_risk_level"

BOOLEAN_TRUE = {"true", "t", "1", "yes"}
BOOLEAN_FALSE = {"false", "f", "0", "no"}


def _to_bool(value):
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return np.nan
    if isinstance(value, (bool, np.bool_)):
        return bool(value)
    text = str(value).strip().lower()
    if text in BOOLEAN_TRUE:
        return True
    if text in BOOLEAN_FALSE:
        return False
    return np.nan


BOOLEAN_FEATURES = {"is_recovering"}


def prepare_matrix(df: pd.DataFrame, features: list[str] | None = None) -> pd.DataFrame:
    columns = list(features) if features else FEATURES
    matrix = pd.DataFrame(index=df.index)
    for feature in columns:
        if feature not in df.columns:
            matrix[feature] = np.nan
        elif feature in BOOLEAN_FEATURES:
            matrix[feature] = df[feature].map(_to_bool).astype(float)
        else:
            matrix[feature] = pd.to_numeric(df[feature], errors="coerce")
    return matrix[columns].astype(float)


def filter_training_rows(df: pd.DataFrame) -> pd.DataFrame:
    rows = df.copy()
    rows["is_available"] = rows["is_available"].map(_to_bool)
    rows[LABEL] = rows[LABEL].map(_to_bool)
    mask = (
        (rows["label_quality"].astype(str) == "labeled")
        & rows["is_available"].eq(True)
        & (rows["feature_version"].astype(str) == FEATURE_VERSION)
        & rows[LABEL].notna()
    )
    rows = rows.loc[mask].copy()
    rows[LABEL] = rows[LABEL].astype(bool).astype(int)
    rows[DATE] = pd.to_datetime(rows[DATE]).dt.date
    return rows.reset_index(drop=True)


def temporal_split(
    df: pd.DataFrame, test_fraction: float = 0.2
) -> tuple[pd.DataFrame, pd.DataFrame]:
    dates = sorted(df[DATE].unique())
    if len(dates) < 2:
        raise ValueError("Se necesitan al menos dos fechas distintas para separar entrenamiento y prueba")
    n_test_dates = max(1, math.ceil(len(dates) * test_fraction))
    cutoff = dates[len(dates) - n_test_dates]
    train = df.loc[df[DATE] < cutoff].reset_index(drop=True)
    test = df.loc[df[DATE] >= cutoff].reset_index(drop=True)
    return train, test


def rules_scores(df: pd.DataFrame) -> pd.Series:
    mapping = {"alto": 1.0, "medio": 0.5}
    return df[RULES_LEVEL].map(lambda level: mapping.get(str(level), 0.0)).astype(float)
