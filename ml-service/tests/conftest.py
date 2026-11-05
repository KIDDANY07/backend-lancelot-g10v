import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from datasets import build_daily_dataset, build_talent_dataset


@pytest.fixture(scope="session")
def daily_dataset():
    return build_daily_dataset(athletes=25, days=200, seed=7)


@pytest.fixture(scope="session")
def talent_dataset():
    return build_talent_dataset(athletes=80, seasons=4, seed=11)
