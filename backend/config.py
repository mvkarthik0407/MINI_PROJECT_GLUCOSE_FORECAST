from __future__ import annotations

import os
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./diabetes_twin.db")
MODEL_PATH = Path(os.getenv("MODEL_PATH", PROJECT_ROOT / "models" / "best_metabonet_gru_model.pth"))
SCALER_PATH = Path(os.getenv("SCALER_PATH", PROJECT_ROOT / "scalers" / "metabonet_scaler.pkl"))
SEQUENCE_LENGTH = int(os.getenv("SEQUENCE_LENGTH", "48"))
MODEL_DEVICE = os.getenv("MODEL_DEVICE", "cpu")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
APP_ENV = os.getenv("APP_ENV", "development")
AUTH_SECRET = os.getenv("AUTH_SECRET", "")
CGM_WEBHOOK_SECRET = os.getenv("CGM_WEBHOOK_SECRET", "")
CORS_ORIGINS = tuple(
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:8080").split(",")
    if origin.strip()
)
