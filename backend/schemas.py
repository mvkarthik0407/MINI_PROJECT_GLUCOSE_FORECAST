from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class PatientProfile(BaseModel):
    patient_id: str = Field(min_length=1, max_length=64)
    sex: str | None = Field(default=None, max_length=16)
    birth_year: int | None = Field(default=None, ge=1900, le=2100)


class PatientRegistration(BaseModel):
    patient_id: str = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")


class GlucoseReadingInput(BaseModel):
    measured_at: datetime
    glucose_mg_dl: float = Field(ge=20, le=600, description="Glucose concentration in mg/dL.")
    timing_context: str | None = Field(default=None, max_length=32, pattern=r"^[a-z_]+$")
    basal_insulin_iu: float | None = Field(default=None, ge=0, le=100)
    bolus_insulin_iu: float | None = Field(default=None, ge=0, le=100)
    carbohydrate_grams: float | None = Field(default=None, ge=0, le=500)
    source: str = Field(default="app", min_length=1, max_length=32)


class CgmConnectionRequest(BaseModel):
    provider: str = Field(min_length=1, max_length=32, pattern=r"^[a-zA-Z0-9_-]+$")
    external_patient_id: str = Field(min_length=1, max_length=128)


class PredictionPoint(BaseModel):
    measured_at: datetime
    glucose_mg_dl: float
    status: str


class PredictionResponse(BaseModel):
    patient_id: str
    model_version: str
    predictions: list[PredictionPoint]
    disclaimer: str


class SimulationInput(BaseModel):
    glucose_delta_mg_dl: float = Field(default=0, ge=-500, le=500)
    activity_delta: float = Field(default=0, ge=-1, le=1)
    carbohydrate_grams: float = Field(default=0, ge=0, le=500)
    steps: int = Field(default=12, ge=1, le=48)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    timing_context: str | None = Field(default=None, max_length=32, pattern=r"^[a-z_]+$")


class ChatResponse(BaseModel):
    response: str
    tools_used: list[str]
    sources: list[str] = []


class MCPToolCall(BaseModel):
    name: str = Field(min_length=1)
    arguments: dict[str, object] = Field(default_factory=dict)


class DigitalTwinResponse(BaseModel):
    patient: PatientProfile
    latest_reading: dict[str, object] | None
    risk: dict[str, str] | None
    predictions: list[PredictionPoint]
    alerts: list[dict[str, object]]
    recommendation: dict[str, str] | None
    disclaimer: str
