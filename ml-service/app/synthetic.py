import hashlib
from datetime import date, timedelta

import numpy as np
import pandas as pd

from app.features import FEATURE_VERSION

EXPORT_COLUMNS = [
    "athlete_key",
    "date",
    "id_season",
    "id_category",
    "position",
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
    "is_available",
    "rules_risk_level",
    "label_injury_7d",
    "label_quality",
    "feature_version",
]

POSITIONS = ["portero", "defensa", "volante", "delantero"]


def _ewma(values: np.ndarray, span: int) -> np.ndarray:
    return pd.Series(values).ewm(span=span, adjust=False).mean().to_numpy()


def _athlete_rows(
    rng: np.random.Generator, athlete: int, start: date, days: int
) -> list[dict]:
    key = hashlib.sha256(f"sintetico-{athlete}".encode()).hexdigest()[:16]
    position = POSITIONS[athlete % len(POSITIONS)]
    base_age = rng.uniform(11, 18)
    base_load = rng.uniform(250, 450)

    trains = rng.random(days) < 0.7
    spikes = rng.random(days) < 0.05
    rpe = np.clip(rng.normal(6, 1.5, days) + spikes * 2.5, 1, 10).round()
    minutes = np.where(trains, rng.normal(base_load / 6, 15, days), 0).clip(0)
    is_match = trains & (rng.random(days) < 0.12)
    daily_load = np.where(trains, rpe * minutes * (1 + spikes * 0.8), 0.0)

    series = pd.Series(daily_load)
    acute = series.rolling(7, min_periods=1).sum().to_numpy() / 7
    chronic = series.rolling(28, min_periods=1).sum().to_numpy() / 28
    acwr = np.divide(acute, chronic, out=np.full(days, np.nan), where=chronic > 0)
    ewma_acute = _ewma(daily_load, 7)
    ewma_chronic = _ewma(daily_load, 28)
    acwr_ewma = np.divide(
        ewma_acute, ewma_chronic, out=np.full(days, np.nan), where=ewma_chronic > 0
    )
    weekly_mean = series.rolling(7, min_periods=1).mean().to_numpy()
    weekly_sd = series.rolling(7, min_periods=1).std(ddof=0).to_numpy()
    monotony = np.divide(
        weekly_mean, weekly_sd, out=np.full(days, np.nan), where=weekly_sd > 0
    )
    strain = acute * 7 * monotony
    sessions = pd.Series(trains.astype(int)).rolling(7, min_periods=1).sum().to_numpy()
    rpe_sessions = pd.Series(np.where(trains, rpe, np.nan))
    rpe_avg = rpe_sessions.rolling(7, min_periods=1).mean().to_numpy()
    high_rpe = (
        pd.Series((trains & (rpe >= 8)).astype(int)).rolling(14, min_periods=1).sum().to_numpy()
    )
    match_minutes = (
        pd.Series(np.where(is_match, minutes, 0)).rolling(7, min_periods=1).sum().to_numpy()
    )

    rows: list[dict] = []
    prior_injuries = 0
    prior_non_contact = 0
    last_injury_day: int | None = None
    unavailable_until = -1
    recovered_day: int | None = None
    for day in range(days):
        current = start + timedelta(days=day)
        available = day > unavailable_until
        if recovered_day is None and last_injury_day is not None and available:
            recovered_day = day
        recovering = recovered_day is not None and day - recovered_day < 28

        risk_score = (
            -6.3
            + 2.2 * max(0.0, (acwr_ewma[day] if not np.isnan(acwr_ewma[day]) else 1.0) - 1.0)
            + 0.35 * high_rpe[day]
            + 0.6 * prior_non_contact
            + (0.7 if recovering else 0.0)
        )
        injured_next_week = available and rng.random() < 1 / (1 + np.exp(-risk_score))

        if acwr[day] > 1.5 and high_rpe[day] >= 3:
            rules_level = "alto"
        elif acwr[day] > 1.5 or high_rpe[day] >= 3:
            rules_level = "medio"
        else:
            rules_level = None

        rows.append(
            {
                "athlete_key": key,
                "date": current.isoformat(),
                "id_season": 1 if current.year == start.year else 2,
                "id_category": 1 + athlete % 3,
                "position": position,
                "age_years": round(base_age + day / 365.25, 2),
                "acute_load_7d": round(acute[day], 2),
                "chronic_load_28d": round(chronic[day], 2),
                "acwr": None if np.isnan(acwr[day]) else round(acwr[day], 2),
                "acwr_ewma": None if np.isnan(acwr_ewma[day]) else round(acwr_ewma[day], 2),
                "monotony_7d": None if np.isnan(monotony[day]) else round(monotony[day], 2),
                "strain_7d": None if np.isnan(strain[day]) else round(strain[day], 2),
                "sessions_7d": int(sessions[day]),
                "rpe_avg_7d": None if np.isnan(rpe_avg[day]) else round(rpe_avg[day], 2),
                "match_minutes_7d": int(match_minutes[day]),
                "high_rpe_sessions_14d": int(high_rpe[day]),
                "prior_injuries_count": prior_injuries,
                "prior_non_contact_injuries_count": prior_non_contact,
                "days_since_last_injury": None
                if last_injury_day is None
                else day - last_injury_day,
                "is_recovering": recovering,
                "is_available": available,
                "rules_risk_level": rules_level,
                "label_injury_7d": bool(injured_next_week),
                "label_quality": "labeled",
                "feature_version": FEATURE_VERSION,
            }
        )

        if injured_next_week:
            injury_day = day + int(rng.integers(1, 8))
            prior_injuries += 1
            prior_non_contact += 1
            last_injury_day = injury_day
            unavailable_until = injury_day + int(rng.integers(5, 21))
            recovered_day = None
    return rows


def generate_synthetic_dataset(
    athletes: int = 30,
    days: int = 240,
    start: date = date(2025, 2, 1),
    seed: int = 42,
) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows: list[dict] = []
    for athlete in range(athletes):
        rows.extend(_athlete_rows(rng, athlete, start, days))
    return pd.DataFrame(rows, columns=EXPORT_COLUMNS)
