from typing import Any

import numpy as np
import pandas as pd

from app.features import FEATURES

TOP_FACTORS = 3


def build_tree_explainer(bundle: dict[str, Any]) -> Any:
    import shap

    return shap.TreeExplainer(bundle["model"].named_steps["classifier"])


def _positive_class_contributions(values: Any) -> np.ndarray:
    if isinstance(values, list):
        return np.asarray(values[1])[0]
    array = np.asarray(values)
    if array.ndim == 3:
        return array[0, :, 1]
    return array[0]


def contributions(
    bundle: dict[str, Any], row: pd.DataFrame, explainer: Any = None
) -> np.ndarray:
    pipeline = bundle["model"]
    imputed = pipeline.named_steps["imputer"].transform(row)
    if bundle["kind"] == "logistic":
        standardized = pipeline.named_steps["scaler"].transform(imputed)
        return pipeline.named_steps["classifier"].coef_[0] * standardized[0]
    tree_explainer = explainer or build_tree_explainer(bundle)
    return _positive_class_contributions(tree_explainer.shap_values(imputed))


def top_factors(
    bundle: dict[str, Any], row: pd.DataFrame, explainer: Any = None
) -> list[dict[str, Any]]:
    values = contributions(bundle, row, explainer)
    order = np.argsort(-np.abs(values))[:TOP_FACTORS]
    return [
        {"feature": FEATURES[index], "contribution": round(float(values[index]), 4)}
        for index in order
    ]
