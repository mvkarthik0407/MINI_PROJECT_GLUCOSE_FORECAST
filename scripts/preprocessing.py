from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler

CHUNK_SIZE = 500_000


def inspect_dataset(data_dir: Path, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    report = {"files": {}}
    for path in sorted(data_dir.glob("*.csv")):
        header = pd.read_csv(path, nrows=0)
        item = {"rows": 0, "columns": header.columns.tolist(), "dtypes": {},
                "missing_values": {column: 0 for column in header.columns},
                "duplicate_rows": 0}
        patients: set[str] = set(); dates: list[pd.Timestamp] = []
        measurements: list[float] = []; names: set[str] = set()
        for chunk in pd.read_csv(path, chunksize=CHUNK_SIZE, low_memory=False):
            item["rows"] += len(chunk)
            item["duplicate_rows"] += int(chunk.duplicated().sum())
            for column in header.columns:
                item["missing_values"][column] += int(chunk[column].isna().sum())
            if "Patient_ID" in chunk:
                patients.update(chunk["Patient_ID"].dropna().astype(str).unique())
            date_column = "Measurement_date" if "Measurement_date" in chunk else "Reception_date" if "Reception_date" in chunk else None
            if date_column:
                dates.extend(pd.to_datetime(chunk[date_column], errors="coerce").dropna().tolist())
            if "Measurement" in chunk:
                measurements.extend(pd.to_numeric(chunk["Measurement"], errors="coerce").dropna().tolist())
            if "Name" in chunk:
                names.update(chunk["Name"].dropna().astype(str).unique())
        item["dtypes"] = {column: str(dtype) for column, dtype in header.dtypes.items()}
        if patients: item["unique_patients"] = len(patients)
        if dates: item["min_date"], item["max_date"] = str(min(dates)), str(max(dates))
        if measurements:
            values = np.asarray(measurements, dtype=np.float64)
            item["measurement_statistics"] = {"count": int(values.size), "mean": float(values.mean()), "std": float(values.std()), "min": float(values.min()), "25%": float(np.percentile(values, 25)), "50%": float(np.percentile(values, 50)), "75%": float(np.percentile(values, 75)), "max": float(values.max())}
        if names: item["biochemical_parameter_names"] = sorted(names)
        report["files"][path.name] = item
    (output_dir / "dataset_inspection.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


def _write_patient(values: np.ndarray, patient_id: str, output, metadata: dict) -> None:
    values = values[np.isfinite(values).all(axis=1)]
    if values.shape[0] < 3: return
    start = output.tell() // (np.dtype("float32").itemsize * values.shape[1])
    values.astype("float32").tofile(output)
    count = int(values.shape[0]); train_end = max(1, int(count * 0.70)); val_end = min(count, max(train_end + 1, int(count * 0.85)))
    metadata[patient_id] = {"start": start, "count": count, "train": [start, start + train_end], "validation": [start + train_end, start + val_end], "test": [start + val_end, start + count]}


def build_glucose_cache(data_dir: Path, cache_dir: Path) -> None:
    cache_dir.mkdir(parents=True, exist_ok=True)
    patient_info = pd.read_csv(data_dir / "Patient_info.csv", usecols=["Patient_ID", "Sex", "Birth_year"])
    patient_info["Patient_ID"] = patient_info["Patient_ID"].astype(str)
    patient_info["Birth_year"] = pd.to_numeric(patient_info["Birth_year"], errors="coerce")
    median_birth_year = float(patient_info["Birth_year"].median())
    patient_info = patient_info.drop_duplicates("Patient_ID").set_index("Patient_ID")
    metadata: dict = {}; seen: set[str] = set(); pending_id = None; pending: list[pd.DataFrame] = []
    with (cache_dir / "glucose_values.float32").open("wb") as output:
        for chunk in pd.read_csv(data_dir / "Glucose_measurements.csv", usecols=["Patient_ID", "Measurement_date", "Measurement_time", "Measurement"], chunksize=CHUNK_SIZE, low_memory=False):
            chunk["Patient_ID"] = chunk["Patient_ID"].astype(str)
            chunk["Measurement"] = pd.to_numeric(chunk["Measurement"], errors="coerce")
            chunk["datetime"] = pd.to_datetime(chunk["Measurement_date"].astype(str) + " " + chunk["Measurement_time"].astype(str), errors="coerce")
            chunk = chunk.dropna(subset=["Patient_ID", "datetime", "Measurement"]).drop_duplicates(["Patient_ID", "datetime", "Measurement"])
            info = patient_info.reindex(chunk["Patient_ID"])
            birth_year = info["Birth_year"].fillna(median_birth_year).to_numpy()
            age = chunk["datetime"].dt.year.to_numpy() - birth_year
            sex_male = info["Sex"].fillna("").astype(str).str.upper().eq("M").to_numpy(dtype=np.float32)
            chunk["age_years"] = np.maximum(age, 0).astype(np.float32)
            chunk["sex_male"] = sex_male
            for patient_id, group in chunk.groupby("Patient_ID", sort=False):
                patient_key = str(patient_id)
                if pending_id is not None and patient_key != pending_id:
                    rows = pd.concat(pending, ignore_index=True).sort_values("datetime")
                    _write_patient(rows[["Measurement", "age_years", "sex_male"]].to_numpy(dtype=np.float32), pending_id, output, metadata); pending = []; pending_id = None
                if pending_id is None:
                    if patient_key in seen: raise RuntimeError("Patient IDs are not contiguous; external sorting is required.")
                    seen.add(patient_key); pending_id = patient_key
                pending.append(group[["datetime", "Measurement", "age_years", "sex_male"]])
        if pending_id is not None:
            rows = pd.concat(pending, ignore_index=True).sort_values("datetime")
            _write_patient(rows[["Measurement", "age_years", "sex_male"]].to_numpy(dtype=np.float32), pending_id, output, metadata)
    cache_metadata = {"feature_count": 3, "features": ["glucose", "age_years", "sex_male"], "patients": metadata}
    (cache_dir / "metadata.json").write_text(json.dumps(cache_metadata, indent=2), encoding="utf-8")
    print(f"Cached {len(metadata):,} patients and {sum(x['count'] for x in metadata.values()):,} valid glucose values.")


def fit_scaler(cache_dir: Path, scaler_path: Path) -> None:
    cache_metadata = json.loads((cache_dir / "metadata.json").read_text(encoding="utf-8"))
    metadata = cache_metadata["patients"]
    feature_count = cache_metadata["feature_count"]
    total = sum(item["count"] for item in metadata.values())
    values = np.memmap(cache_dir / "glucose_values.float32", dtype="float32", mode="r", shape=(total, feature_count))
    scaler = StandardScaler()
    for item in metadata.values():
        start, end = item["train"]
        scaler.partial_fit(np.asarray(values[start:end], dtype="float64"))
    scaler_path.parent.mkdir(parents=True, exist_ok=True); joblib.dump(scaler, scaler_path)
    scaled = np.memmap(cache_dir / "glucose_values_scaled.float32", dtype="float32", mode="w+", shape=(total, feature_count))
    for start in range(0, total, 1_000_000):
        end = min(start + 1_000_000, total)
        scaled[start:end] = scaler.transform(np.asarray(values[start:end])).astype("float32")
    scaled.flush()
    if scaler.mean_ is None or scaler.scale_ is None:
        raise RuntimeError("Scaler fitting produced no statistics.")
    print(f"Saved scaler: mean={scaler.mean_[0]:.4f}, scale={scaler.scale_[0]:.4f}")


def main() -> None:
    parser = argparse.ArgumentParser(); parser.add_argument("--data-dir", type=Path, default=Path(".")); parser.add_argument("--project-dir", type=Path, default=Path(".")); args = parser.parse_args()
    inspect_dataset(args.data_dir, args.project_dir / "results"); build_glucose_cache(args.data_dir, args.project_dir / "cache"); fit_scaler(args.project_dir / "cache", args.project_dir / "scalers" / "glucose_scaler.pkl")


if __name__ == "__main__": main()
