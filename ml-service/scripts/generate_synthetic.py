import argparse
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def main() -> None:
    from app.synthetic import generate_synthetic_dataset

    parser = argparse.ArgumentParser(
        description="Genera un CSV sintético con el esquema del snapshot diario. "
        "Solo sirve para probar el pipeline; nunca escribe en la base de datos."
    )
    parser.add_argument("--output", default="data/synthetic_features.csv")
    parser.add_argument("--athletes", type=int, default=30)
    parser.add_argument("--days", type=int, default=240)
    parser.add_argument("--start", default="2025-02-01")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    dataset = generate_synthetic_dataset(
        athletes=args.athletes,
        days=args.days,
        start=date.fromisoformat(args.start),
        seed=args.seed,
    )
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    dataset.to_csv(output, index=False)
    positives = int(dataset["label_injury_7d"].sum())
    print(
        f"CSV sintético escrito en {output}: {len(dataset)} filas, {positives} positivos. "
        "Las métricas obtenidas con estos datos NO representan el desempeño real."
    )


if __name__ == "__main__":
    main()
