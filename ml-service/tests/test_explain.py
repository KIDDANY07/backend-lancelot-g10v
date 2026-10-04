import numpy as np
import pytest

from app.explain import TOP_FACTORS, contributions, top_factors
from app.features import FEATURES, LABEL, filter_training_rows, prepare_matrix
from app.train import build_candidates


@pytest.fixture(scope="module")
def fitted_bundles(synthetic_dataset):
    rows = filter_training_rows(synthetic_dataset)
    matrix = prepare_matrix(rows)
    bundles = {}
    for candidate in build_candidates():
        candidate.pipeline.fit(matrix, rows[LABEL])
        bundles[candidate.kind] = {"model": candidate.pipeline, "kind": candidate.kind}
    return bundles, matrix


@pytest.mark.parametrize("kind", ["logistic", "tree"])
def test_top_factors_shape_for_each_model_kind(fitted_bundles, kind):
    bundles, matrix = fitted_bundles
    factors = top_factors(bundles[kind], matrix.iloc[[0]])

    assert len(factors) == TOP_FACTORS
    assert all(factor["feature"] in FEATURES for factor in factors)
    magnitudes = [abs(factor["contribution"]) for factor in factors]
    assert magnitudes == sorted(magnitudes, reverse=True)


def test_logistic_contribution_is_coefficient_times_standardized_value(fitted_bundles):
    bundles, matrix = fitted_bundles
    bundle = bundles["logistic"]
    row = matrix.iloc[[5]]
    pipeline = bundle["model"]
    standardized = pipeline.named_steps["scaler"].transform(
        pipeline.named_steps["imputer"].transform(row)
    )
    expected = pipeline.named_steps["classifier"].coef_[0] * standardized[0]

    np.testing.assert_allclose(contributions(bundle, row), expected)


def test_tree_contributions_come_from_shap(fitted_bundles):
    bundles, matrix = fitted_bundles
    values = contributions(bundles["tree"], matrix.iloc[[3]])
    assert values.shape == (len(FEATURES),)
    assert np.isfinite(values).all()
