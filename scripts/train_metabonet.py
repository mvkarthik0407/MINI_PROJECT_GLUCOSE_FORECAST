from __future__ import annotations

import argparse
import csv
import json
import random
from pathlib import Path

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader

from metabonet_stream import MetaboNetStreamDataset, fit_scaler_from_parquet
from model import GlucoseGRU


def seed_everything(seed: int = 42) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def run_epoch(model, loader, loss_fn, optimizer, device, training: bool) -> float:
    model.train(training)
    total = 0.0
    count = 0
    for inputs, targets in loader:
        inputs, targets = inputs.to(device), targets.to(device)
        with torch.set_grad_enabled(training):
            loss = loss_fn(model(inputs), targets)
            if training:
                optimizer.zero_grad(set_to_none=True)
                loss.backward()
                optimizer.step()
        total += loss.item() * len(inputs)
        count += len(inputs)
    return total / max(count, 1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-dir", type=Path, default=Path("."))
    parser.add_argument("--train-parquet", type=Path, required=True)
    parser.add_argument("--test-parquet", type=Path, default=None)
    parser.add_argument("--sequence-length", type=int, default=48)
    parser.add_argument("--forecast-steps", type=int, default=6)
    parser.add_argument("--epochs", type=int, default=10)
    parser.add_argument("--batch-size", type=int, default=512)
    parser.add_argument("--hidden-size", type=int, default=64)
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument("--patience", type=int, default=3)
    parser.add_argument("--workers", type=int, default=0)
    parser.add_argument("--max-sequences", type=int, default=None)
    parser.add_argument("--resume", type=Path, default=None)
    args = parser.parse_args()

    seed_everything()
    project = args.project_dir
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    scaler_path = project / "scalers" / "metabonet_scaler.pkl"
    metadata_path = project / "results" / "metabonet_features.json"
    if not scaler_path.exists():
        fit_scaler_from_parquet(
            args.train_parquet,
            scaler_path,
            metadata_path,
            args.sequence_length,
            args.forecast_steps,
        )
    train_data = MetaboNetStreamDataset(
        args.train_parquet,
        scaler_path,
        "train",
        args.sequence_length,
        args.forecast_steps,
        args.max_sequences,
    )
    validation_data = MetaboNetStreamDataset(
        args.train_parquet,
        scaler_path,
        "validation",
        args.sequence_length,
        args.forecast_steps,
        args.max_sequences // 4 if args.max_sequences else None,
    )
    train_loader = DataLoader(
        train_data,
        batch_size=min(args.batch_size, 128),
        shuffle=False,
        num_workers=args.workers,
        pin_memory=device.type == "cuda",
    )
    validation_loader = DataLoader(
        validation_data,
        batch_size=min(args.batch_size, 128),
        shuffle=False,
        num_workers=args.workers,
        pin_memory=device.type == "cuda",
    )
    model = GlucoseGRU(
        input_size=train_data.feature_count,
        hidden_size=args.hidden_size,
        output_size=args.forecast_steps,
    ).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=args.learning_rate)
    loss_fn = nn.MSELoss()
    best_loss = float("inf")
    stale = 0
    history: list[dict[str, float | int]] = []
    start_epoch = 1

    (project / "models").mkdir(exist_ok=True)
    (project / "results").mkdir(exist_ok=True)
    latest_checkpoint = project / "models" / "latest_metabonet_gru_checkpoint.pth"
    if args.resume:
        checkpoint = torch.load(args.resume, map_location=device, weights_only=False)
        model.load_state_dict(checkpoint["model_state_dict"])
        optimizer.load_state_dict(checkpoint["optimizer_state_dict"])
        best_loss = checkpoint["best_validation_loss"]
        stale = checkpoint["stale_epochs"]
        history = checkpoint["history"]
        start_epoch = checkpoint["epoch"] + 1
    for epoch in range(start_epoch, args.epochs + 1):
        train_loss = run_epoch(model, train_loader, loss_fn, optimizer, device, True)
        validation_loss = run_epoch(
            model, validation_loader, loss_fn, optimizer, device, False
        )
        history.append(
            {
                "epoch": epoch,
                "train_loss": train_loss,
                "validation_loss": validation_loss,
            }
        )
        print(
            f"Epoch {epoch:02d}: train_loss={train_loss:.6f}, "
            f"validation_loss={validation_loss:.6f}"
        )
        if validation_loss < best_loss:
            best_loss = validation_loss
            stale = 0
            torch.save(
                {
                    "model_state_dict": model.state_dict(),
                    "best_validation_loss": best_loss,
                    "config": vars(args),
                    "feature_names": json.loads(
                        metadata_path.read_text(encoding="utf-8")
                    )["features"],
                },
                project / "models" / "best_metabonet_gru_model.pth",
            )
        else:
            stale += 1
        torch.save(
            {
                "epoch": epoch,
                "model_state_dict": model.state_dict(),
                "optimizer_state_dict": optimizer.state_dict(),
                "best_validation_loss": best_loss,
                "stale_epochs": stale,
                "history": history,
                "config": vars(args),
            },
            latest_checkpoint,
        )
        if stale >= args.patience:
            print("Early stopping.")
            break

    with (project / "results" / "metabonet_training_history.csv").open(
        "w", newline="", encoding="utf-8"
    ) as output:
        writer = csv.DictWriter(
            output, fieldnames=["epoch", "train_loss", "validation_loss"]
        )
        writer.writeheader()
        writer.writerows(history)
    (project / "results" / "metabonet_training_config.json").write_text(
        json.dumps(
            {
                **vars(args),
                "device": str(device),
                "input_size": train_data.feature_count,
                "train_sequence_cap": args.max_sequences,
                "validation_sequence_cap": args.max_sequences // 4 if args.max_sequences else None,
            },
            indent=2,
            default=str,
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
