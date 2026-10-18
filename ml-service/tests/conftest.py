import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.synthetic import generate_synthetic_dataset, generate_talent_dataset


@pytest.fixture(scope="session")
def synthetic_dataset():
    return generate_synthetic_dataset(athletes=25, days=200, seed=7)


@pytest.fixture(scope="session")
def synthetic_talent_dataset():
    return generate_talent_dataset(athletes=80, seasons=4, seed=11)
