import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.synthetic import generate_synthetic_dataset


@pytest.fixture(scope="session")
def synthetic_dataset():
    return generate_synthetic_dataset(athletes=25, days=200, seed=7)
