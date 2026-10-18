import argparse
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def main() -> None:
    from app.synthetic import generate_synthetic_dataset, generate_talent_dataset

    parser = argparse.ArgumentParser(
        description="Genera un CSV sintético con el esquema del snapshot diario (riesgo) o del "
        "dataset por temporada (talento). Solo sirve para probar el pipeline; nunca escribe en "
        "la base de datos."
    )
    parser.add_argument("--task", choices=["injury_risk", "talent"], default="injury_risk")
    parser.add_argument("--seasons", type=int, default=4)
    parser.add_argument("--output", default=None)
    parser.add_argument("--athletes", type=int, default=30)
    parser.add_argument("--days", type=int, default=240)
    parser.add_argument("--start", default="2025-02-01")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    if args.task == "talent":
        dataset = generate_talent_dataset(
            athletes=args.athletes,
            seasons=args.seasons,
            first_season=date.fromisoformat(args.start).year,
            seed=args.seed,
        )
        output = Path(args.output or "data/synthetic_talent.csv")
        output.parent.mkdir(parents=True, exist_ok=True)
        dataset.to_csv(output, index=False)
        promotions = int(dataset["label_promoted"].sum())
        print(
            f"CSV sintético de talento escrito en {output}: {len(dataset)} filas, "
            f"{promotions} ascensos. El modelo que se entrene con él queda marcado como "
            "sintético y nunca podrá activarse."
        )
        return

    dataset = generate_synthetic_dataset(
        athletes=args.athletes,
        days=args.days,
        start=date.fromisoformat(args.start),
        seed=args.seed,
    )
    output = Path(args.output or "data/synthetic_features.csv")
    output.parent.mkdir(parents=True, exist_ok=True)
    dataset.to_csv(output, index=False)
    positives = int(dataset["label_injury_7d"].sum())
    print(
        f"CSV sintético escrito en {output}: {len(dataset)} filas, {positives} positivos. "
        "Las métricas obtenidas con estos datos NO representan el desempeño real."
    )


if __name__ == "__main__":
    main()
