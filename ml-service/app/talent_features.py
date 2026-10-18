import numpy as np
import pandas as pd

from app.features import _to_bool

TALENT_FEATURE_VERSION = "t1"

TALENT_FEATURES: list[str] = [
    "age_years",
    "birth_quarter",
    "years_to_category_max",
    "plays_up",
    "seasons_in_club",
    "cohort_size",
    "index_value",
    "index_percentile",
    "physical_score",
    "technical_score",
    "tactical_score",
    "participation_score",
    "contribution_score",
    "index_delta",
    "injuries_in_season",
    "severe_injury",
]

BOOLEAN_FEATURES = {"plays_up", "severe_injury"}

TALENT_LABEL = "label_promoted"
SEASON = "season_start"
RULES_FLAGGED = "rules_flagged"


def prepare_talent_matrix(df: pd.DataFrame) -> pd.DataFrame:
    matrix = pd.DataFrame(index=df.index)
    for feature in TALENT_FEATURES:
        if feature not in df.columns:
            matrix[feature] = np.nan
        elif feature in BOOLEAN_FEATURES:
            matrix[feature] = df[feature].map(_to_bool).astype(float)
        else:
            matrix[feature] = pd.to_numeric(df[feature], errors="coerce")
    return matrix[TALENT_FEATURES].astype(float)


def filter_talent_training_rows(df: pd.DataFrame) -> pd.DataFrame:
    rows = df.copy()
    rows[TALENT_LABEL] = rows[TALENT_LABEL].map(_to_bool)
    mask = (
        (rows["label_quality"].astype(str) == "labeled")
        & (rows["feature_version"].astype(str) == TALENT_FEATURE_VERSION)
        & rows[TALENT_LABEL].notna()
    )
    rows = rows.loc[mask].copy()
    rows[TALENT_LABEL] = rows[TALENT_LABEL].astype(bool).astype(int)
    rows[SEASON] = pd.to_datetime(rows[SEASON]).dt.date
    return rows.reset_index(drop=True)


def season_split(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    seasons = sorted(df[SEASON].unique())
    if len(seasons) < 2:
        raise ValueError(
            "Se necesitan al menos dos temporadas etiquetadas: una para entrenar y otra para probar"
        )
    last = seasons[-1]
    train = df.loc[df[SEASON] < last].reset_index(drop=True)
    test = df.loc[df[SEASON] == last].reset_index(drop=True)
    return train, test


def talent_rules_scores(df: pd.DataFrame) -> pd.Series:
    return df[RULES_FLAGGED].map(_to_bool).fillna(False).astype(float)
