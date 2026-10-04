import pandas as pd
import pytest

from app.features import DATE, filter_training_rows, temporal_split


def test_temporal_split_has_no_leakage(synthetic_dataset):
    rows = filter_training_rows(synthetic_dataset)
    train, test = temporal_split(rows)

    assert not train.empty and not test.empty
    assert max(train[DATE]) < min(test[DATE])
    assert set(train[DATE]).isdisjoint(set(test[DATE]))
    assert len(train) + len(test) == len(rows)


def test_temporal_split_uses_the_last_20_percent_of_dates(synthetic_dataset):
    rows = filter_training_rows(synthetic_dataset)
    train, test = temporal_split(rows, test_fraction=0.2)
    all_dates = sorted(rows[DATE].unique())
    test_dates = sorted(test[DATE].unique())

    assert len(test_dates) == round(len(all_dates) * 0.2)
    assert test_dates == all_dates[-len(test_dates):]


def test_temporal_split_is_not_random():
    rows = pd.DataFrame({DATE: pd.to_datetime(["2026-01-03", "2026-01-01", "2026-01-02", "2026-01-04", "2026-01-05"]).date})
    first_train, first_test = temporal_split(rows)
    second_train, second_test = temporal_split(rows.sample(frac=1, random_state=3))

    assert sorted(first_test[DATE]) == sorted(second_test[DATE])
    assert sorted(first_train[DATE]) == sorted(second_train[DATE])


def test_temporal_split_requires_two_dates():
    rows = pd.DataFrame({DATE: pd.to_datetime(["2026-01-01", "2026-01-01"]).date})
    with pytest.raises(ValueError):
        temporal_split(rows)
