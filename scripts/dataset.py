from __future__ import annotations
import json
from pathlib import Path
import joblib
import numpy as np
import torch
from torch.utils.data import Dataset


class GlucoseWindowDataset(Dataset):
    def __init__(self, cache_dir: Path, scaler_path: Path, split: str, sequence_length: int = 48, max_sequences: int | None = None):
        self.sequence_length = sequence_length
        scaled_path = cache_dir / "glucose_values_scaled.float32"
        self.uses_scaled_cache = scaled_path.exists()
        cache_metadata = json.loads((cache_dir / "metadata.json").read_text(encoding="utf-8"))
        self.feature_count = cache_metadata.get("feature_count", 1)
        metadata = cache_metadata.get("patients", cache_metadata)
        total = sum(item["count"] for item in metadata.values())
        self.values = np.memmap(scaled_path if scaled_path.exists() else cache_dir / "glucose_values.float32", dtype="float32", mode="r", shape=(total, self.feature_count))
        self.scaler = joblib.load(scaler_path)
        self.windows = [(item[split][0], item[split][1]) for item in metadata.values() if item[split][1] - item[split][0] > sequence_length]
        self.offsets = np.cumsum([0] + [end - start - sequence_length for start, end in self.windows], dtype=np.int64)
        total = int(self.offsets[-1])
        self.indices = np.linspace(0, total - 1, max_sequences, dtype=np.int64) if max_sequences and max_sequences < total else None

    def __len__(self):
        return len(self.indices) if self.indices is not None else int(self.offsets[-1])

    def __getitem__(self, index):
        if self.indices is not None:
            index = int(self.indices[index])
        window_index = int(np.searchsorted(self.offsets, index, side="right") - 1)
        start, _ = self.windows[window_index]
        local_index = index - int(self.offsets[window_index])
        raw = np.asarray(self.values[start + local_index:start + local_index + self.sequence_length + 1], dtype=np.float32)
        if self.uses_scaled_cache:
            scaled = raw
        else:
            scaled = self.scaler.transform(raw).astype(np.float32)
        return torch.from_numpy(np.array(scaled[:-1], copy=True)), torch.tensor([scaled[-1, 0]], dtype=torch.float32)