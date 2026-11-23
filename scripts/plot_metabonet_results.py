from __future__ import annotations

import argparse
import json
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Create presentation figures from MetaboNet training results."
    )
    parser.add_argument("--project-dir", type=Path, default=Path("."))
    parser.add_argument("--test-parquet", type=Path)
    parser.add_argument("--max-sequences", type=int, default=100_000)
    args = parser.parse_args()

    project = args.project_dir
    if args.test_parquet and not args.test_parquet.is_file():
        raise SystemExit(
            f"Test Parquet file was not found: {args.test_parquet}\n"
            "Replace the example path with the actual location of test.parquet."
        )
    results = project / "results"
    plots = project / "plots"
    plots.mkdir(exist_ok=True)

    history = np.genfromtxt(
        results / "metabonet_training_history.csv",
        delimiter=",",
        names=True,
    )
    metrics = json.loads((results / "metabonet_metrics.json").read_text(encoding="utf-8"))

    plt.figure(figsize=(8, 5))
    plt.plot(history["epoch"], history["train_loss"], marker="o", label="Training")
    plt.plot(history["epoch"], history["validation_loss"], marker="o", label="Validation")
    plt.xlabel("Epoch")
    plt.ylabel("MSE loss (scaled)")
    plt.title("MetaboNet Multimodal GRU Training and Validation Loss")
    plt.xticks(history["epoch"].astype(int))
    plt.legend()
    plt.tight_layout()
    plt.savefig(plots / "metabonet_training_validation_loss.png", dpi=180)
    plt.close()

    labels = ["MAE\n(mg/dL)", "RMSE\n(mg/dL)", "R-squared"]
    values = [
        float(metrics["mae_mg_dl"]),
        float(metrics["rmse_mg_dl"]),
        float(metrics["r2"]),
    ]
    plt.figure(figsize=(8, 5))
    bars = plt.bar(labels, values, color=["#2563eb", "#0f766e", "#7c3aed"])
    plt.ylabel("Value")
    plt.title("MetaboNet Multimodal GRU Holdout Metrics")
    for bar, value in zip(bars, values):
        plt.text(
            bar.get_x() + bar.get_width() / 2,
            bar.get_height(),
            f"{value:.4f}",
            ha="center",
            va="bottom",
        )
    plt.tight_layout()
    plt.savefig(plots / "metabonet_metrics_summary.png", dpi=180)
    plt.close()

    if args.test_parquet:
        import joblib
        import torch
        from torch.utils.data import DataLoader

        from metabonet_stream import MetaboNetStreamDataset
        from model import GlucoseGRU

        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        scaler = joblib.load(project / "scalers" / "metabonet_scaler.pkl")
        dataset = MetaboNetStreamDataset(
            args.test_parquet,
            project / "scalers" / "metabonet_scaler.pkl",
            "test",
            48,
            6,
            args.max_sequences,
        )
        loader = DataLoader(dataset, batch_size=512, shuffle=False)
        checkpoint = torch.load(
            project / "models" / "best_metabonet_gru_model.pth",
            map_location=device,
            weights_only=False,
        )
        model = GlucoseGRU(
            input_size=dataset.feature_count,
            hidden_size=int(checkpoint.get("config", {}).get("hidden_size", 64)),
            output_size=6,
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

        sample = min(50_000, len(actual))
        indices = np.linspace(0, len(actual) - 1, sample, dtype=int)
        plt.figure(figsize=(7, 6))
        plt.scatter(actual[indices], predicted[indices], s=2, alpha=0.25)
        bounds = [min(actual.min(), predicted.min()), max(actual.max(), predicted.max())]
        plt.plot(bounds, bounds, "r--", label="Perfect prediction")
        plt.xlabel("Actual glucose (mg/dL)")
        plt.ylabel("Predicted glucose (mg/dL)")
        plt.title("MetaboNet Holdout: Actual vs Predicted")
        plt.legend()
        plt.tight_layout()
        plt.savefig(plots / "metabonet_actual_vs_predicted.png", dpi=180)
        plt.close()

        plt.figure(figsize=(12, 4))
        plt.plot(actual[:500], label="Actual")
        plt.plot(predicted[:500], label="Predicted")
        plt.xlabel("Flattened forecast points")
        plt.ylabel("Glucose (mg/dL)")
        plt.title("MetaboNet Holdout Forecast Trajectory")
        plt.legend()
        plt.tight_layout()
        plt.savefig(plots / "metabonet_glucose_trajectory.png", dpi=180)
        plt.close()

        plt.figure(figsize=(8, 5))
        plt.hist(predicted - actual, bins=100)
        plt.xlabel("Prediction error (mg/dL)")
        plt.ylabel("Count")
        plt.title("MetaboNet Holdout Prediction Error Distribution")
        plt.tight_layout()
        plt.savefig(plots / "metabonet_prediction_error_distribution.png", dpi=180)
        plt.close()

        horizon_actual = actual[:6]
        horizon_predicted = predicted[:6]
        horizons = np.arange(5, 31, 5)
        plt.figure(figsize=(8, 5))
        plt.plot(horizons, horizon_actual, marker="o", label="Actual")
        plt.plot(horizons, horizon_predicted, marker="o", label="Predicted")
        plt.xticks(horizons)
        plt.xlabel("Forecast horizon (minutes)")
        plt.ylabel("Glucose (mg/dL)")
        plt.title("MetaboNet Six-Step Forecast Example")
        plt.legend()
        plt.tight_layout()
        plt.savefig(plots / "metabonet_forecast_example.png", dpi=180)
        plt.close()

        print(f"Created holdout plots from {len(actual) // 6:,} windows.")
    else:
        print(
            "Actual-vs-predicted, trajectory, error-distribution, and forecast "
            "example plots require --test-parquet."
        )
    print(f"Created: {plots / 'metabonet_training_validation_loss.png'}")
    print(f"Created: {plots / 'metabonet_metrics_summary.png'}")


if __name__ == "__main__":
    main()
