from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import torch
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from torch.utils.data import DataLoader

from metabonet_stream import MetaboNetStreamDataset
from model import GlucoseGRU


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-dir", type=Path, default=Path("."))
    parser.add_argument("--test-parquet", type=Path, required=True)
    parser.add_argument("--batch-size", type=int, default=512)
    parser.add_argument("--sequence-length", type=int, default=48)
    parser.add_argument("--forecast-steps", type=int, default=6)
    parser.add_argument("--max-sequences", type=int, default=None)
    args = parser.parse_args()

    project = args.project_dir
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    scaler = joblib.load(project / "scalers" / "metabonet_scaler.pkl")
    data = MetaboNetStreamDataset(
        Path(args.test_parquet),
        project / "scalers" / "metabonet_scaler.pkl",
        "test",
        args.sequence_length,
        args.forecast_steps,
        args.max_sequences,
    )
    loader = DataLoader(data, batch_size=args.batch_size, shuffle=False)
    checkpoint = torch.load(
        project / "models" / "best_metabonet_gru_model.pth",
        map_location=device,
        weights_only=False,
    )
    model = GlucoseGRU(
        input_size=data.feature_count,
        hidden_size=int(checkpoint.get("config", {}).get("hidden_size", 64)),
        output_size=args.forecast_steps,
    ).to(device)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()
    actual_scaled: list[np.ndarray] = []
    predicted_scaled: list[np.ndarray] = []
    with torch.no_grad():
        for inputs, targets in loader:
            predicted_scaled.append(model(inputs.to(device)).cpu().numpy())
            actual_scaled.append(targets.numpy())
    actual = np.concatenate(actual_scaled).reshape(-1)
    predicted = np.concatenate(predicted_scaled).reshape(-1)
    actual = actual * scaler.scale_[0] + scaler.mean_[0]
    predicted = predicted * scaler.scale_[0] + scaler.mean_[0]
    metrics = {
        "test_sequence_cap": args.max_sequences,
        "forecast_steps": args.forecast_steps,
        "mae_mg_dl": mean_absolute_error(actual, predicted),
        "rmse_mg_dl": mean_squared_error(actual, predicted) ** 0.5,
        "r2": r2_score(actual, predicted),
        "best_validation_loss_scaled": checkpoint["best_validation_loss"],
    }
    (project / "results" / "metabonet_metrics.json").write_text(
        json.dumps(metrics, indent=2), encoding="utf-8"
    )
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
