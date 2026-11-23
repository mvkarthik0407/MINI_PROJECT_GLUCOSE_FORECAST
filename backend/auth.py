from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt
from fastapi import HTTPException

from .config import AUTH_SECRET, APP_ENV


def create_access_token(patient_id: str, expires_minutes: int = 60) -> str:
    secret = AUTH_SECRET or "diabetes-digital-twin-development-secret"
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": patient_id, "iat": now, "exp": now + timedelta(minutes=expires_minutes)},
        secret,
        algorithm="HS256",
    )


def patient_from_token(token: str) -> str:
    secret = AUTH_SECRET or "diabetes-digital-twin-development-secret"
    try:
        claims = jwt.decode(token, secret, algorithms=["HS256"])
    except jwt.PyJWTError as error:
        raise HTTPException(status_code=401, detail="Invalid or expired access token.") from error
    patient_id = claims.get("sub")
    if not isinstance(patient_id, str) or not patient_id.strip():
        raise HTTPException(status_code=401, detail="Access token has no valid patient identity.")
    return patient_id


def production_authentication_required() -> bool:
    return APP_ENV.lower() in {"production", "staging"}
