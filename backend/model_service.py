from __future__ import annotations

from datetime import datetime, timedelta
from dataclasses import dataclass
from functools import lru_cache
import sys
from collections.abc import Sequence

import joblib
import numpy as np
import torch
from sklearn.preprocessing import StandardScaler

from scripts.model import GlucoseGRU

from .config import MODEL_DEVICE, MODEL_PATH, SCALER_PATH, SEQUENCE_LENGTH
from .health import glucose_status


@dataclass(frozen=True)
class ForecastObservation:
    measured_at: datetime
    glucose_mg_dl: float
    basal_insulin_iu: float = 0.0
    bolus_insulin_iu: float = 0.0
    carbohydrate_grams: float = 0.0


def _load_checkpoint(device: torch.device) -> dict:
    try:
        return torch.load(MODEL_PATH, map_location=device, weights_only=False)
    except (ModuleNotFoundError, AttributeError) as error:
        if sys.platform != "win32" or "pathlib._local" not in str(error):
            raise
        import pathlib as pathlib_module

        local_module = getattr(pathlib_module, "_local", pathlib_module)
        sys.modules["pathlib._local"] = local_module
        setattr(local_module, "PosixPath", pathlib_module.WindowsPath)
        return torch.load(MODEL_PATH, map_location=device, weights_only=False)


@lru_cache(maxsize=1)
def load_model() -> tuple[GlucoseGRU, StandardScaler, str, int]:
    device = torch.device(MODEL_DEVICE if MODEL_DEVICE == "cuda" and torch.cuda.is_available() else "cpu")
    checkpoint = _load_checkpoint(device)
    config = checkpoint.get("config", {})
    input_size = int(checkpoint["model_state_dict"]["gru.weight_ih_l0"].shape[1])
    scaler = joblib.load(SCALER_PATH)
    scaler_features = int(getattr(scaler, "n_features_in_", input_size))
    if input_size != scaler_features:
        raise RuntimeError(
            f"Model expects {input_size} features but scaler has {scaler_features}. "
            "Copy the matching model and scaler artifacts from the completed training run."
        )
    model = GlucoseGRU(
        input_size=input_size,
        hidden_size=int(config.get("hidden_size", 64)),
        output_size=int(config.get("forecast_steps", checkpoint["model_state_dict"]["head.1.weight"].shape[0])),
    ).to(device)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()
    output_size = int(checkpoint["model_state_dict"]["head.1.weight"].shape[0])
    return model, scaler, str(checkpoint.get("model_version", MODEL_PATH.name)), output_size


def predict(
    history: Sequence[ForecastObservation | tuple[datetime, float]],
    sex: str | None,
    birth_year: int | None,
    steps: int,
) -> tuple[list[dict], str]:
    if not history:
        raise ValueError("At least one glucose reading is required for prediction.")
    model, scaler, version, output_size = load_model()
    history = sorted(
        history,
        key=lambda item: item.measured_at if isinstance(item, ForecastObservation) else item[0],
    )[-SEQUENCE_LENGTH:]
    observations = [
        item
        if isinstance(item, ForecastObservation)
        else ForecastObservation(measured_at=item[0], glucose_mg_dl=item[1])
        for item in history
    ]
    if len(observations) < SEQUENCE_LENGTH:
        observations = _pad_observations(observations, SEQUENCE_LENGTH)
    last_time = observations[-1].measured_at
    feature_count = int(getattr(scaler, "n_features_in_", 3))
    age = max(last_time.year - birth_year, 0) if birth_year else 0
    male = 1.0 if (sex or "").upper() == "M" else 0.0
    if feature_count == 1:
        raw = np.asarray([[item.glucose_mg_dl] for item in observations], dtype=np.float32)
    elif feature_count == 3:
        raw = np.asarray([[item.glucose_mg_dl, age, male] for item in observations], dtype=np.float32)
    elif feature_count == 8:
        raw = np.asarray([_multimodal_features(item) for item in observations], dtype=np.float32)
    else:
        raise ValueError(f"Unsupported trained feature count: {feature_count}.")
    scaled = scaler.transform(raw).astype(np.float32)
    glucose_scale, glucose_mean = _glucose_scaler_stats(scaler)
    sequence = torch.from_numpy(scaled).unsqueeze(0)
    device = next(model.parameters()).device
    sequence = sequence.to(device)
    results: list[dict] = []
    with torch.no_grad():
        output = model(sequence).cpu().numpy().reshape(-1)
        if output_size == 1:
            output_values = []
            current_sequence = sequence
            for step in range(steps):
                value = float(model(current_sequence).cpu().item())
                output_values.append(value)
                glucose = max(0.0, value * glucose_scale + glucose_mean)
                timestamp = last_time + timedelta(minutes=15 * (step + 1))
                if feature_count == 1:
                    next_raw = np.asarray([[glucose]], dtype=np.float32)
                elif feature_count == 3:
                    next_raw = np.asarray([[glucose, age, male]], dtype=np.float32)
                else:
                    next_raw = np.asarray(
                        [_multimodal_features(ForecastObservation(timestamp, glucose))],
                        dtype=np.float32,
                    )
                next_scaled = scaler.transform(next_raw).astype(np.float32)
                current_sequence = torch.cat(
                    (current_sequence[:, 1:, :], torch.from_numpy(next_scaled).unsqueeze(0).to(device)),
                    dim=1,
                )
        else:
            output_values = output[: min(steps, output_size)]
        for step, value in enumerate(output_values):
            glucose = max(0.0, float(value) * glucose_scale + glucose_mean)
            interval = 5 if output_size > 1 else 15
            timestamp = last_time + timedelta(minutes=interval * (step + 1))
            status, _ = glucose_status(glucose)
            results.append({"measured_at": timestamp, "glucose_mg_dl": glucose, "status": status})
    return results, version


def _pad_observations(
    observations: Sequence[ForecastObservation],
    target_length: int,
) -> list[ForecastObservation]:
    """Repeat recent context until the trained GRU sequence has its required length."""
    if not observations:
        return []
    padded = list(observations)
    newest = padded[-1]
    interval = timedelta(minutes=5)
    if len(padded) >= 2:
        interval = max(
            timedelta(minutes=1),
            padded[-1].measured_at - padded[-2].measured_at,
        )
    while len(padded) < target_length:
        measured_at = padded[0].measured_at - interval
        padded.insert(
            0,
            ForecastObservation(
                measured_at=measured_at,
                glucose_mg_dl=newest.glucose_mg_dl,
                basal_insulin_iu=newest.basal_insulin_iu,
                bolus_insulin_iu=newest.bolus_insulin_iu,
                carbohydrate_grams=newest.carbohydrate_grams,
            ),
        )
    return padded[-target_length:]


def _multimodal_features(item: ForecastObservation) -> list[float]:
    minutes = item.measured_at.hour * 60 + item.measured_at.minute
    day_radians = 2 * np.pi * minutes / (24 * 60)
    weekday_radians = 2 * np.pi * item.measured_at.weekday() / 7
    return [
        item.glucose_mg_dl,
        item.basal_insulin_iu,
        item.bolus_insulin_iu,
        item.carbohydrate_grams,
        float(np.sin(day_radians)),
        float(np.cos(day_radians)),
        float(np.sin(weekday_radians)),
        float(np.cos(weekday_radians)),
    ]


def _glucose_scaler_stats(scaler: StandardScaler) -> tuple[float, float]:
    if scaler.scale_ is None or scaler.mean_ is None:
        raise RuntimeError("The glucose scaler is not fitted.")
    return float(scaler.scale_[0]), float(scaler.mean_[0])
