from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import torch
from torch.utils.data import IterableDataset

from metabonet_preprocessing import FEATURE_NAMES, _patient_frames, _prepared_segments


def fit_scaler_from_parquet(
    train_path: Path,
    scaler_path: Path,
    metadata_path: Path,
    sequence_length: int = 48,
    forecast_steps: int = 6,
) -> None:
    from sklearn.preprocessing import StandardScaler

    scaler = StandardScaler()
    segment_count = 0
    for _, frame in _patient_frames(train_path):
        for values in _prepared_segments(frame):
            train_end = max(
                sequence_length + forecast_steps + 1,
                int(len(values) * 0.85),
            )
            scaler.partial_fit(values[: min(train_end, len(values))].astype("float64"))
            segment_count += 1
    scaler_path.parent.mkdir(parents=True, exist_ok=True)
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(scaler, scaler_path)
    metadata_path.write_text(
        json.dumps(
            {
                "features": FEATURE_NAMES,
                "feature_count": len(FEATURE_NAMES),
                "segment_count": segment_count,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Fitted scaler from {segment_count:,} patient segments.")


class MetaboNetStreamDataset(IterableDataset):
    def __init__(
        self,
        parquet_path: Path,
        scaler_path: Path,
        partition: str,
        sequence_length: int = 48,
        forecast_steps: int = 6,
        max_sequences: int | None = None,
    ):
        self.parquet_path = parquet_path
        self.scaler = joblib.load(scaler_path)
        self.partition = partition
        self.sequence_length = sequence_length
        self.forecast_steps = forecast_steps
        self.max_sequences = max_sequences
        self.feature_count = len(FEATURE_NAMES)

    def __iter__(self):
        emitted = 0
        for _, frame in _patient_frames(self.parquet_path):
            for values in _prepared_segments(frame):
                if self.partition == "train":
                    end = max(
                        self.sequence_length + self.forecast_steps + 1,
                        int(len(values) * 0.85),
                    )
                    values = values[: min(end, len(values))]
                elif self.partition == "validation":
                    start = max(
                        0,
                        int(len(values) * 0.85) - self.sequence_length,
                    )
                    values = values[start:]
                scaled = self.scaler.transform(values).astype("float32")
                limit = len(scaled) - self.sequence_length - self.forecast_steps + 1
                for start in range(max(0, limit)):
                    end = start + self.sequence_length
                    yield (
                        torch.from_numpy(np.array(scaled[start:end], copy=True)),
                        torch.from_numpy(
                            np.array(
                                scaled[end : end + self.forecast_steps, 0],
                                copy=True,
                            )
                        ),
                    )
                    emitted += 1
                    if self.max_sequences and emitted >= self.max_sequences:
                        return
