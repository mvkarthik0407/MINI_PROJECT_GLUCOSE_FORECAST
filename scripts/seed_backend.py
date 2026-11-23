from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.db import GlucoseReading, Patient, SessionLocal, create_tables


def seed_patients(project_dir: Path, patient_id: str | None) -> int:
    frame = pd.read_csv(project_dir / "Patient_info.csv", usecols=["Patient_ID", "Sex", "Birth_year"])
    frame["Patient_ID"] = frame["Patient_ID"].astype(str)
    if patient_id:
        frame = frame[frame["Patient_ID"] == patient_id]
    with SessionLocal() as db:
        count = 0
        for row in frame.itertuples(index=False):
            patient = db.get(Patient, row.Patient_ID) or Patient(patient_id=row.Patient_ID)
            patient.sex = None if pd.isna(row.Sex) else str(row.Sex)
            patient.birth_year = None if pd.isna(row.Birth_year) else int(row.Birth_year)
            db.add(patient)
            count += 1
        db.commit()
    return count


def seed_readings(project_dir: Path, patient_id: str, limit: int) -> int:
    selected: list[dict[str, object]] = []
    for chunk in pd.read_csv(
        project_dir / "Glucose_measurements.csv",
        usecols=["Patient_ID", "Measurement_date", "Measurement_time", "Measurement"],
        chunksize=500_000,
        low_memory=False,
    ):
        rows = chunk[chunk["Patient_ID"].astype(str) == patient_id].copy()
        if rows.empty:
            continue
        rows["measured_at"] = pd.to_datetime(
            rows["Measurement_date"].astype(str) + " " + rows["Measurement_time"].astype(str),
            errors="coerce",
        )
        rows["glucose_mg_dl"] = pd.to_numeric(rows["Measurement"], errors="coerce")
        selected.extend(rows.dropna(subset=["measured_at", "glucose_mg_dl"])[["measured_at", "glucose_mg_dl"]].to_dict("records"))
    selected = sorted(selected, key=lambda row: row["measured_at"])[-limit:]
    with SessionLocal() as db:
        db.query(GlucoseReading).filter(GlucoseReading.patient_id == patient_id).delete()
        db.add_all(
            [
                GlucoseReading(patient_id=patient_id, measured_at=row["measured_at"], glucose_mg_dl=float(row["glucose_mg_dl"]), source="dataset")
                for row in selected
            ]
        )
        db.commit()
    return len(selected)


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed patient data for a local backend demo.")
    parser.add_argument("--project-dir", type=Path, default=Path("."))
    parser.add_argument("--patient-id", default=None)
    parser.add_argument("--readings", type=int, default=0, help="Recent readings to import for one patient.")
    args = parser.parse_args()
    create_tables()
    print(f"Seeded patients: {seed_patients(args.project_dir, args.patient_id)}")
    if args.readings:
        if not args.patient_id:
            raise SystemExit("--patient-id is required when --readings is used.")
        print(f"Seeded readings: {seed_readings(args.project_dir, args.patient_id, args.readings)}")


if __name__ == "__main__":
    main()
