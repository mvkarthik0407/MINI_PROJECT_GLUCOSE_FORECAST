from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import torch
from torch.utils.data import Dataset


class MetaboNetWindowDataset(Dataset):
    def __init__(
        self,
        cache_dir: Path,
        scaler_path: Path,
        split: str,
        partition: str,
        sequence_length: int = 48,
        forecast_steps: int = 6,
        max_sequences: int | None = None,
    ):
        metadata = json.loads((cache_dir / "metadata.json").read_text(encoding="utf-8"))
        self.feature_count = int(metadata["feature_count"])
        self.forecast_steps = forecast_steps
        self.sequence_length = sequence_length
        self.scaler = joblib.load(scaler_path)
        row_count = int(metadata[f"{split}_rows"])
        scaled_path = cache_dir / f"{split}_values_scaled.float32"
        self.values = np.memmap(
            scaled_path,
            dtype="float32",
            mode="r",
            shape=(row_count, self.feature_count),
        )
        self.windows: list[tuple[int, int]] = []
        for segment in metadata[f"{split}_segments"]:
            start = int(segment["start"])
            end = int(segment["end"])
            if split == "train" and partition == "train":
                ranges = [(start, int(segment["train_end"]))]
            elif split == "train" and partition == "validation":
                validation_start = int(segment["train_end"]) - sequence_length
                ranges = [(max(start, validation_start), end)]
            else:
                ranges = [(start, end)]
            for range_start, range_end in ranges:
                if range_end - range_start > sequence_length + forecast_steps:
                    self.windows.append((range_start, range_end))
        self.offsets = np.cumsum(
            [0]
            + [
                end - start - sequence_length - forecast_steps + 1
                for start, end in self.windows
            ],
            dtype=np.int64,
        )
        total = int(self.offsets[-1])
        self.indices = (
            np.linspace(0, total - 1, max_sequences, dtype=np.int64)
            if max_sequences and max_sequences < total
            else None
        )

    def __len__(self) -> int:
        return len(self.indices) if self.indices is not None else int(self.offsets[-1])

    def __getitem__(self, index: int):
        if self.indices is not None:
            index = int(self.indices[index])
        window_index = int(np.searchsorted(self.offsets, index, side="right") - 1)
        start, _ = self.windows[window_index]
        local_index = index - int(self.offsets[window_index])
        raw = np.asarray(
            self.values[
                start + local_index : start + local_index + self.sequence_length + self.forecast_steps
            ],
            dtype=np.float32,
        )
        inputs = torch.from_numpy(np.array(raw[: self.sequence_length], copy=True))
        targets = torch.from_numpy(
            np.array(raw[self.sequence_length :, 0], copy=True)
        )
        return inputs, targets
