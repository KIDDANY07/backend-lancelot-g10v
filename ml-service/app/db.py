from pathlib import Path

import pandas as pd
from sqlalchemy import create_engine, text

from app.features import FEATURE_VERSION, FEATURES

DATASET_COLUMNS = [
    "date",
    *FEATURES,
    "is_available",
    "rules_risk_level",
    "label_injury_7d",
    "label_quality",
    "feature_version",
]

DATASET_QUERY = text(
    f"""
    SELECT {", ".join(DATASET_COLUMNS)}
    FROM athlete_daily_features
    WHERE label_quality = 'labeled'
      AND feature_version = :feature_version
    ORDER BY date
    """
)


def load_dataset_from_db(database_url: str) -> pd.DataFrame:
    engine = create_engine(database_url, pool_pre_ping=True)
    try:
        with engine.connect() as connection:
            connection.exec_driver_sql("SET TRANSACTION READ ONLY")
            return pd.read_sql(
                DATASET_QUERY,
                connection,
                params={"feature_version": FEATURE_VERSION},
            )
    finally:
        engine.dispose()


def load_dataset_from_csv(csv_path: str) -> pd.DataFrame:
    path = Path(csv_path)
    if not path.is_file():
        raise FileNotFoundError(f"No existe el archivo CSV {csv_path}")
    return pd.read_csv(path)
