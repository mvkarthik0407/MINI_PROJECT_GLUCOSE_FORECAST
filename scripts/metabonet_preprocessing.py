from __future__ import annotations

import argparse
import json
from datetime import timedelta
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import pyarrow.parquet as parquet
from sklearn.preprocessing import StandardScaler


RAW_COLUMNS = ["id", "source_file", "date", "CGM", "basal", "bolus", "carbs"]
FEATURE_NAMES = [
    "cgm",
    "basal",
    "bolus",
    "carbs",
    "time_sin",
    "time_cos",
    "weekday_sin",
    "weekday_cos",
]
FIVE_MINUTES = timedelta(minutes=5)
MAX_INTERPOLATION_STEPS = 6


def _patient_frames(path: Path, batch_size: int = 250_000):
    reader = parquet.ParquetFile(path)
    current_id: str | None = None
    pending: list[pd.DataFrame] = []
    seen: set[str] = set()

    for batch in reader.iter_batches(batch_size=batch_size, columns=RAW_COLUMNS):
        frame = batch.to_pandas()
        frame["id"] = frame["id"].astype("string")
        frame["source_file"] = frame["source_file"].astype("string")
        frame["_patient_key"] = frame["source_file"] + ":" + frame["id"]
        for patient_id, group in frame.groupby("_patient_key", sort=False, dropna=True):
            patient_key = str(patient_id)
            if current_id != patient_key:
                if current_id is not None:
                    yield current_id, pd.concat(pending, ignore_index=True)
                    seen.add(current_id)
                if patient_key in seen:
                    raise RuntimeError(
                        f"Source patient {patient_key} is not contiguous in {path}. "
                        "Sort the source by id and date before caching it."
                    )
                current_id = patient_key
                pending = []
            pending.append(group.drop(columns="_patient_key"))

    if current_id is not None:
        yield current_id, pd.concat(pending, ignore_index=True)


def _time_features(index: pd.DatetimeIndex) -> np.ndarray:
    minutes = index.hour.to_numpy() * 60 + index.minute.to_numpy()
    radians = 2 * np.pi * minutes / (24 * 60)
    weekday_radians = 2 * np.pi * index.dayofweek.to_numpy() / 7
    return np.column_stack(
        [
            np.sin(radians),
            np.cos(radians),
            np.sin(weekday_radians),
            np.cos(weekday_radians),
        ]
    ).astype(np.float32)


def _prepared_segments(frame: pd.DataFrame) -> list[np.ndarray]:
    frame["date"] = pd.to_datetime(frame["date"], errors="coerce")
    frame = frame.dropna(subset=["date"]).sort_values("date").drop_duplicates("date")
    if frame.empty:
        return []

    for column in ("CGM", "basal", "bolus", "carbs"):
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
    frame.loc[~frame["CGM"].between(20, 600), "CGM"] = np.nan

    gaps = frame["date"].diff() > timedelta(minutes=30)
    block_ids = gaps.fillna(True).cumsum()
    segments: list[np.ndarray] = []
    for _, block in frame.groupby(block_ids):
        block = block.set_index("date").sort_index()
        index = pd.date_range(block.index.min(), block.index.max(), freq="5min")
        block = block.reindex(index)
        cgm = block["CGM"].interpolate(limit=MAX_INTERPOLATION_STEPS, limit_area="inside")
        block["CGM"] = cgm
        block[["basal", "bolus", "carbs"]] = block[["basal", "bolus", "carbs"]].fillna(0.0)
        block = block.dropna(subset=["CGM"])
        if block.empty:
            continue
        values = np.column_stack(
            [
                block["CGM"].to_numpy(dtype=np.float32),
                block["basal"].to_numpy(dtype=np.float32),
                block["bolus"].to_numpy(dtype=np.float32),
                block["carbs"].to_numpy(dtype=np.float32),
                _time_features(block.index),
            ]
        )
        segments.append(values)
    return segments


def _write_split(
    input_path: Path,
    output_path: Path,
    split: str,
    sequence_length: int,
    forecast_steps: int,
) -> tuple[list[dict], int]:
    metadata: list[dict] = []
    total_rows = 0
    with output_path.open("wb") as output:
        for patient_id, frame in _patient_frames(input_path):
            for segment_number, values in enumerate(_prepared_segments(frame)):
                if len(values) <= sequence_length + forecast_steps:
                    continue
                start = total_rows
                values.astype("float32").tofile(output)
                total_rows += len(values)
                train_end = len(values)
                if split == "train":
                    train_end = max(sequence_length + forecast_steps + 1, int(len(values) * 0.85))
                    train_end = min(train_end, len(values))
                metadata.append(
                    {
                        "patient_id": patient_id,
                        "segment": segment_number,
                        "start": start,
                        "end": total_rows,
                        "train_end": start + train_end,
                    }
                )
    return metadata, total_rows


def build_cache(
    train_path: Path,
    test_path: Path,
    cache_dir: Path,
    sequence_length: int,
    forecast_steps: int,
) -> None:
    cache_dir.mkdir(parents=True, exist_ok=True)
    train_metadata, train_rows = _write_split(
        train_path,
        cache_dir / "train_values.float32",
        "train",
        sequence_length,
        forecast_steps,
    )
    test_metadata, test_rows = _write_split(
        test_path,
        cache_dir / "test_values.float32",
        "test",
        sequence_length,
        forecast_steps,
    )
    metadata = {
        "feature_count": len(FEATURE_NAMES),
        "features": FEATURE_NAMES,
        "sequence_length": sequence_length,
        "forecast_steps": forecast_steps,
        "train_rows": train_rows,
        "test_rows": test_rows,
        "train_segments": train_metadata,
        "test_segments": test_metadata,
    }
    (cache_dir / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(
        f"Cached {len(train_metadata):,} training segments and "
        f"{len(test_metadata):,} holdout segments."
    )


def fit_and_scale(cache_dir: Path, scaler_path: Path) -> None:
    metadata = json.loads((cache_dir / "metadata.json").read_text(encoding="utf-8"))
    feature_count = int(metadata["feature_count"])
    scaler = StandardScaler()
    train_values = np.memmap(
        cache_dir / "train_values.float32",
        dtype="float32",
        mode="r",
        shape=(int(metadata["train_rows"]), feature_count),
    )
    for start in range(0, len(train_values), 1_000_000):
        scaler.partial_fit(np.asarray(train_values[start : start + 1_000_000], dtype="float64"))
    scaler_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(scaler, scaler_path)

    for split in ("train", "test"):
        row_count = int(metadata[f"{split}_rows"])
        raw = np.memmap(
            cache_dir / f"{split}_values.float32",
            dtype="float32",
            mode="r",
            shape=(row_count, feature_count),
        )
        scaled = np.memmap(
            cache_dir / f"{split}_values_scaled.float32",
            dtype="float32",
            mode="w+",
            shape=(row_count, feature_count),
        )
        for start in range(0, row_count, 1_000_000):
            end = min(start + 1_000_000, row_count)
            scaled[start:end] = scaler.transform(np.asarray(raw[start:end])).astype("float32")
        scaled.flush()
    print(f"Saved scaler with {feature_count} features to {scaler_path}.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--train", type=Path, required=True)
    parser.add_argument("--test", type=Path, required=True)
    parser.add_argument("--project-dir", type=Path, default=Path("."))
    parser.add_argument("--sequence-length", type=int, default=48)
    parser.add_argument("--forecast-steps", type=int, default=6)
    args = parser.parse_args()
    cache_dir = args.project_dir / "cache" / "metabonet"
    build_cache(args.train, args.test, cache_dir, args.sequence_length, args.forecast_steps)
    fit_and_scale(cache_dir, args.project_dir / "scalers" / "metabonet_scaler.pkl")


if __name__ == "__main__":
    main()
