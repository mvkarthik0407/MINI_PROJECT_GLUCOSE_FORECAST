from __future__ import annotations
import argparse
import csv
import json
from pathlib import Path
import joblib
import matplotlib.pyplot as plt
import numpy as np
import torch
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from torch.utils.data import DataLoader
from dataset import GlucoseWindowDataset
from model import GlucoseGRU


def main():
    parser = argparse.ArgumentParser(); parser.add_argument("--project-dir", type=Path, default=Path(".")); parser.add_argument("--sequence-length", type=int, default=48); parser.add_argument("--batch-size", type=int, default=512); parser.add_argument("--max-sequences", type=int, default=None); args = parser.parse_args()
    project = args.project_dir; device = torch.device("cuda" if torch.cuda.is_available() else "cpu"); scaler = joblib.load(project / "scalers" / "glucose_scaler.pkl"); data = GlucoseWindowDataset(project / "cache", project / "scalers" / "glucose_scaler.pkl", "test", args.sequence_length, args.max_sequences); loader = DataLoader(data, batch_size=args.batch_size, shuffle=False)
    checkpoint = torch.load(project / "models" / "best_gru_model.pth", map_location=device, weights_only=False)
    model_config = checkpoint.get("config", {})
    model = GlucoseGRU(input_size=data.feature_count, hidden_size=int(model_config.get("hidden_size", 64))).to(device)
    model.load_state_dict(checkpoint["model_state_dict"]); model.eval(); actual = []; predicted = []
    with torch.no_grad():
        for inputs, targets in loader: predicted.extend(model(inputs.to(device)).cpu().numpy().ravel()); actual.extend(targets.numpy().ravel())
    actual_scaled = np.asarray(actual); predicted_scaled = np.asarray(predicted)
    actual = actual_scaled * scaler.scale_[0] + scaler.mean_[0]; predicted = predicted_scaled * scaler.scale_[0] + scaler.mean_[0]; metrics = {"test_sequences": len(data), "test_sequence_cap": args.max_sequences, "mae_mg_dl": mean_absolute_error(actual, predicted), "rmse_mg_dl": mean_squared_error(actual, predicted) ** 0.5, "r2": r2_score(actual, predicted), "best_validation_loss_scaled": checkpoint["best_validation_loss"]}
    plots = project / "plots"; plots.mkdir(exist_ok=True)
    history = np.genfromtxt(project / "results" / "training_history.csv", delimiter=",", names=True)
    plt.figure(figsize=(8, 5)); plt.plot(history["epoch"], history["train_loss"], label="Training"); plt.plot(history["epoch"], history["validation_loss"], label="Validation"); plt.xlabel("Epoch"); plt.ylabel("MSE loss (scaled)"); plt.legend(); plt.tight_layout(); plt.savefig(plots / "training_validation_loss.png", dpi=150); plt.close()
    sample = min(50_000, len(actual)); sample_indices = np.linspace(0, len(actual) - 1, sample, dtype=int)
    plt.figure(figsize=(7, 6)); plt.scatter(actual[sample_indices], predicted[sample_indices], s=2, alpha=0.25); bounds = [min(actual.min(), predicted.min()), max(actual.max(), predicted.max())]; plt.plot(bounds, bounds, "r--"); plt.xlabel("Actual glucose (mg/dL)"); plt.ylabel("Predicted glucose (mg/dL)"); plt.tight_layout(); plt.savefig(plots / "actual_vs_predicted.png", dpi=150); plt.close()
    plt.figure(figsize=(12, 4)); plt.plot(actual[:500], label="Actual"); plt.plot(predicted[:500], label="Predicted"); plt.xlabel("Consecutive test windows"); plt.ylabel("Glucose (mg/dL)"); plt.legend(); plt.tight_layout(); plt.savefig(plots / "glucose_trajectory.png", dpi=150); plt.close()
    plt.figure(figsize=(8, 5)); plt.hist(predicted - actual, bins=100); plt.xlabel("Prediction error (mg/dL)"); plt.ylabel("Count"); plt.tight_layout(); plt.savefig(plots / "prediction_error_distribution.png", dpi=150); plt.close()
    statuses = np.select([predicted < 54, predicted < 70, predicted <= 180, predicted <= 250], ["level_2_hypoglycemia", "level_1_hypoglycemia", "target_range", "level_1_hyperglycemia"], default="level_2_hyperglycemia")
    metrics["glycemic_risk_distribution"] = {str(status): int((statuses == status).sum()) for status in np.unique(statuses)}
    (project / "results" / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    with (project / "results" / "predictions.csv").open("w", newline="", encoding="utf-8") as output:
        writer = csv.writer(output); writer.writerow(["actual_mg_dl", "predicted_mg_dl", "predicted_status"])
        for actual_value, predicted_value in zip(actual, predicted):
            status = "level_2_hypoglycemia" if predicted_value < 54 else "level_1_hypoglycemia" if predicted_value < 70 else "target_range" if predicted_value <= 180 else "level_1_hyperglycemia" if predicted_value <= 250 else "level_2_hyperglycemia"; writer.writerow([actual_value, predicted_value, status])
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__": main()