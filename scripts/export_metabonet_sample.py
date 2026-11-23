from __future__ import annotations

import argparse
import json
from pathlib import Path

import pyarrow.parquet as parquet


SAMPLE_COLUMNS = [
    "id",
    "source_file",
    "date",
    "CGM",
    "basal",
    "bolus",
    "insulin",
    "carbs",
    "age",
    "gender",
    "steps",
    "heartrate",
    "calories_burned",
    "is_test",
]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--parquet", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, default=Path("results"))
    parser.add_argument("--rows", type=int, default=100)
    args = parser.parse_args()

    reader = parquet.ParquetFile(args.parquet)
    available = set(reader.schema_arrow.names)
    columns = [column for column in SAMPLE_COLUMNS if column in available]
    sample = reader.read_row_group(0, columns=columns).slice(0, args.rows)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    csv_path = args.output_dir / f"{args.parquet.stem}_sample_{args.rows}.csv"
    summary_path = args.output_dir / f"{args.parquet.stem}_summary.json"
    sample.to_pandas().to_csv(csv_path, index=False)
    summary_path.write_text(
        json.dumps(
            {
                "source": str(args.parquet),
                "rows": reader.metadata.num_rows,
                "row_groups": reader.metadata.num_row_groups,
                "columns": reader.schema_arrow.names,
                "sample": str(csv_path),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Sample: {csv_path}")
    print(f"Summary: {summary_path}")


if __name__ == "__main__":
    main()
