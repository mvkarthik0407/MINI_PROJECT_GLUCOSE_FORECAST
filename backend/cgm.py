from __future__ import annotations

from datetime import datetime
import hashlib
import hmac
import json

from fastapi import HTTPException


def verify_webhook_signature(body: bytes, signature: str | None, secret: str) -> None:
    if not secret:
        raise HTTPException(status_code=503, detail="CGM webhook authentication is not configured.")
    if not signature or not signature.startswith("sha256="):
        raise HTTPException(status_code=401, detail="A valid CGM webhook signature is required.")
    expected = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature.removeprefix("sha256="), expected):
        raise HTTPException(status_code=401, detail="Invalid CGM webhook signature.")


def normalize_webhook_payload(payload: dict[str, object]) -> tuple[str, datetime, float]:
    event_id = payload.get("event_id")
    measured_at = payload.get("measured_at")
    glucose = payload.get("glucose_mg_dl")
    if not isinstance(event_id, str) or not event_id.strip():
        raise HTTPException(status_code=422, detail="event_id is required.")
    if not isinstance(measured_at, str):
        raise HTTPException(status_code=422, detail="measured_at must be an ISO-8601 timestamp.")
    try:
        timestamp = datetime.fromisoformat(measured_at.replace("Z", "+00:00"))
    except ValueError as error:
        raise HTTPException(status_code=422, detail="measured_at must be an ISO-8601 timestamp.") from error
    if isinstance(glucose, bool):
        raise HTTPException(status_code=422, detail="glucose_mg_dl must be a number.")
    try:
        glucose_value = float(glucose)
    except (TypeError, ValueError) as error:
        raise HTTPException(status_code=422, detail="glucose_mg_dl must be a number.") from error
    if not 20 <= glucose_value <= 600:
        raise HTTPException(status_code=422, detail="glucose_mg_dl must be between 20 and 600.")
    return event_id.strip(), timestamp, glucose_value


def canonical_payload(body: bytes) -> dict[str, object]:
    try:
        payload = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=422, detail="CGM webhook body must be valid JSON.") from error
    if not isinstance(payload, dict):
        raise HTTPException(status_code=422, detail="CGM webhook body must be a JSON object.")
    return payload
