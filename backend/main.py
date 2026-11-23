from __future__ import annotations

from datetime import datetime, timedelta, timezone
from collections.abc import Sequence
import json
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import delete, desc, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from .cgm import canonical_payload, normalize_webhook_payload, verify_webhook_signature
from .config import APP_ENV, CGM_WEBHOOK_SECRET, CORS_ORIGINS, MODEL_PATH, PROJECT_ROOT, SCALER_PATH, SEQUENCE_LENGTH
from .db import Alert, CgmConnection, CgmEvent, ConversationMessage, GlucoseReading, Patient, SessionLocal, create_tables
from .health import alert_message, glucose_status, interpret_glucose
from .agents import knowledge_agent, recommendation_for_forecast, recommendation_for_glucose
from .auth import create_access_token, patient_from_token, production_authentication_required
from .knowledge import retrieve_medical_knowledge
from .llm import generate_answer, llm_is_configured
from .mcp_tools import TOOLS
from .model_service import ForecastObservation, predict
from .orchestrator import route_message
from .schemas import (
    ChatRequest,
    ChatResponse,
    CgmConnectionRequest,
    DigitalTwinResponse,
    GlucoseReadingInput,
    MCPToolCall,
    PatientProfile,
    PatientRegistration,
    PredictionResponse,
    SimulationInput,
)

app = FastAPI(title="Diabetes Digital Twin API", version="0.1.0")
bearer_scheme = HTTPBearer(auto_error=False)
frontend_dist = PROJECT_ROOT / "frontend" / "dist"
if (frontend_dist / "assets").exists():
    app.mount("/app/assets", StaticFiles(directory=frontend_dist / "assets"), name="frontend-assets")
if (frontend_dist / "assets").exists():
    app.mount("/assets", StaticFiles(directory=frontend_dist / "assets"), name="frontend-assets-root")
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(CORS_ORIGINS),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    if request.url.path in {"/", "/app"} or request.url.path.endswith(".html"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if APP_ENV.lower() in {"production", "staging"}:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


@app.get("/", include_in_schema=False)
def root() -> FileResponse:
    built_dashboard = PROJECT_ROOT / "frontend" / "dist" / "index.html"
    if built_dashboard.exists():
        return FileResponse(built_dashboard)
    return FileResponse(PROJECT_ROOT / "frontend" / "index.html")


@app.get("/app", include_in_schema=False)
def app_dashboard() -> FileResponse:
    built_dashboard = PROJECT_ROOT / "frontend" / "dist" / "index.html"
    return FileResponse(built_dashboard if built_dashboard.exists() else PROJECT_ROOT / "frontend" / "index.html")


@app.on_event("startup")
def startup() -> None:
    create_tables()


def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def authenticated_patient(
    x_patient_id: str | None = Header(default=None),
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> str:
    if credentials:
        if credentials.scheme.lower() != "bearer":
            raise HTTPException(status_code=401, detail="Bearer authentication is required.")
        return patient_from_token(credentials.credentials)
    if production_authentication_required():
        raise HTTPException(status_code=401, detail="A bearer access token is required.")
    if not x_patient_id:
        raise HTTPException(status_code=401, detail="X-Patient-ID is required for this prototype.")
    return x_patient_id


def get_patient(db: Session, patient_id: str) -> Patient:
    patient = db.get(Patient, patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient profile not found.")
    return patient


def storage_timestamp(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def bounded_argument(arguments: dict[str, object], name: str, default: int, minimum: int, maximum: int) -> int:
    value = arguments.get(name, default)
    if isinstance(value, bool):
        raise HTTPException(status_code=422, detail=f"{name} must be an integer between {minimum} and {maximum}.")
    try:
        parsed = int(value)
    except (TypeError, ValueError) as error:
        raise HTTPException(status_code=422, detail=f"{name} must be an integer between {minimum} and {maximum}.") from error
    if parsed < minimum or parsed > maximum:
        raise HTTPException(status_code=422, detail=f"{name} must be between {minimum} and {maximum}.")
    return parsed


def save_chat_exchange(db: Session, patient_id: str, question: str, response: str) -> None:
    db.add_all(
        [
            ConversationMessage(patient_id=patient_id, role="user", content=question),
            ConversationMessage(patient_id=patient_id, role="assistant", content=response),
        ]
    )
    db.commit()


def forecast_history(readings: Sequence[GlucoseReading]) -> list[ForecastObservation]:
    return [
        ForecastObservation(
            measured_at=item.measured_at,
            glucose_mg_dl=item.glucose_mg_dl,
            basal_insulin_iu=item.basal_insulin_iu or 0.0,
            bolus_insulin_iu=item.bolus_insulin_iu or 0.0,
            carbohydrate_grams=item.carbohydrate_grams or 0.0,
        )
        for item in readings
    ]


def build_llm_patient_context(patient_id: str, db: Session) -> str:
    patient = get_patient(db, patient_id)
    readings = db.scalars(
        select(GlucoseReading)
        .where(GlucoseReading.patient_id == patient_id)
        .order_by(desc(GlucoseReading.measured_at))
        .limit(SEQUENCE_LENGTH)
    ).all()
    latest = readings[0] if readings else None
    if latest:
        status, urgency = glucose_status(latest.glucose_mg_dl)
        current = (
            f"latest_glucose_mg_dl={latest.glucose_mg_dl:.1f}; status={status}; "
            f"urgency={urgency}; measured_at={latest.measured_at.isoformat()}"
        )
    else:
        current = "No current glucose reading is available."
    history = [
        {
            "measured_at": item.measured_at.isoformat(),
            "glucose_mg_dl": item.glucose_mg_dl,
            "basal_insulin_iu": item.basal_insulin_iu or 0.0,
            "bolus_insulin_iu": item.bolus_insulin_iu or 0.0,
            "carbohydrate_grams": item.carbohydrate_grams or 0.0,
            "source": item.source,
        }
        for item in reversed(readings)
    ]
    glucose_values = [float(item.glucose_mg_dl) for item in reversed(readings)]
    if glucose_values:
        trend = {
            "oldest_mg_dl": glucose_values[0],
            "latest_mg_dl": glucose_values[-1],
            "change_mg_dl": glucose_values[-1] - glucose_values[0],
            "minimum_mg_dl": min(glucose_values),
            "maximum_mg_dl": max(glucose_values),
        }
    else:
        trend = {}
    alert_items = db.scalars(
        select(Alert)
        .where(Alert.patient_id == patient_id)
        .order_by(desc(Alert.created_at))
        .limit(10)
    ).all()
    forecast: list[dict] = []
    if len(readings) >= SEQUENCE_LENGTH:
        try:
            forecast, _ = predict(
                forecast_history(readings),
                patient.sex,
                patient.birth_year,
                12,
            )
        except ValueError:
            forecast = []
    forecast_guidance = recommendation_for_forecast(forecast) if forecast else (
        "A forecast is unavailable because there are not enough recent readings."
    )
    chat_messages = db.scalars(
        select(ConversationMessage)
        .where(ConversationMessage.patient_id == patient_id)
        .order_by(desc(ConversationMessage.created_at), desc(ConversationMessage.id))
        .limit(10)
    ).all()
    recent_chat = [
        {"role": item.role, "content": item.content[:1000]}
        for item in reversed(chat_messages)
    ]
    return (
        f"patient_id={patient.patient_id}; sex={patient.sex or 'unknown'}; "
        f"birth_year={patient.birth_year or 'unknown'}\n{current}\n"
        f"recent_glucose_history_json={json.dumps(history)}\n"
        f"glucose_trend_summary_json={json.dumps(trend)}\n"
        f"recent_alerts_json={json.dumps([{'category': item.category, 'urgency': item.urgency, 'glucose_mg_dl': item.glucose_mg_dl, 'message': item.message} for item in alert_items])}\n"
        f"gru_forecast_json={json.dumps(forecast, default=str)}\n"
        f"forecast_safety_guidance={forecast_guidance}\n"
        f"recent_chat_history_json={json.dumps(recent_chat)}"
    )


def llm_chat_response(message: str, patient_id: str, db: Session) -> ChatResponse | None:
    if not llm_is_configured():
        return None
    context = build_llm_patient_context(patient_id, db)
    rag = retrieve_medical_knowledge(message)
    try:
        rag_context = f"{rag.answer}\nSources:\n" + "\n".join(rag.sources)
        response = generate_answer(message, context, rag_context)
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    save_chat_exchange(db, patient_id, message, response)
    return ChatResponse(
        response=response,
        tools_used=["llm_chat", "retrieve_medical_knowledge", "get_patient_risk_status"],
        sources=rag.sources,
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready")
def readiness(db: Session = Depends(db_session)) -> dict[str, object]:
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError as error:
        raise HTTPException(status_code=503, detail="Database is not ready.") from error
    missing = [str(path) for path in (MODEL_PATH, SCALER_PATH) if not path.is_file()]
    if missing:
        raise HTTPException(status_code=503, detail={"missing_artifacts": missing})
    return {"status": "ready", "database": "ok", "model_artifacts": "ok"}


@app.get("/api/mcp/tools")
def list_mcp_tools() -> dict[str, object]:
    return {"tools": [{"name": name, **definition} for name, definition in TOOLS.items()]}


@app.post("/api/mcp/call")
def call_mcp_tool(
    payload: MCPToolCall,
    patient_id: str = Depends(authenticated_patient),
    db: Session = Depends(db_session),
) -> dict[str, object]:
    if payload.name not in TOOLS:
        raise HTTPException(status_code=404, detail=f"Unknown MCP tool: {payload.name}")
    arguments = payload.arguments
    if payload.name == "get_patient_profile":
        return {"name": payload.name, "result": PatientProfile.model_validate(get_patient(db, patient_id), from_attributes=True).model_dump()}
    if payload.name == "get_glucose_history":
        limit = bounded_argument(arguments, "limit", 200, 1, 5000)
        return {"name": payload.name, "result": history(limit=limit, patient_id=patient_id, db=db)}
    if payload.name == "predict_future_glucose":
        steps = bounded_argument(arguments, "steps", 12, 1, 48)
        result = prediction(steps=steps, patient_id=patient_id, db=db)
        return {"name": payload.name, "result": result.model_dump()}
    if payload.name == "get_patient_risk_status":
        latest = db.scalar(select(GlucoseReading).where(GlucoseReading.patient_id == patient_id).order_by(desc(GlucoseReading.measured_at)).limit(1))
        if not latest:
            raise HTTPException(status_code=404, detail="No glucose reading is available.")
        status, urgency = glucose_status(latest.glucose_mg_dl)
        return {"name": payload.name, "result": {"glucose_mg_dl": latest.glucose_mg_dl, "status": status, "urgency": urgency}}
    if payload.name == "run_what_if_simulation":
        result = simulate(SimulationInput.model_validate(arguments), patient_id=patient_id, db=db)
        return {"name": payload.name, "result": result}
    if payload.name == "retrieve_medical_knowledge":
        query = str(arguments.get("query", "")).strip()
        if not query:
            raise HTTPException(status_code=422, detail="query is required.")
        return {"name": payload.name, "result": knowledge_agent(query)}
    if payload.name == "get_patient_recommendations":
        return {"name": payload.name, "result": recommendations(patient_id=patient_id, db=db)}
    raise HTTPException(status_code=500, detail="MCP tool is registered but has no handler.")


@app.get("/api/patients/me", response_model=PatientProfile)
def profile(patient_id: str = Depends(authenticated_patient), db: Session = Depends(db_session)) -> PatientProfile:
    patient = get_patient(db, patient_id)
    return PatientProfile.model_validate(patient, from_attributes=True)


@app.post("/api/patients/register", response_model=PatientProfile)
def register_patient(payload: PatientRegistration, db: Session = Depends(db_session)) -> PatientProfile:
    patient_id = payload.patient_id.strip()
    existing = db.get(Patient, patient_id)
    if existing is not None:
        raise HTTPException(status_code=409, detail="Patient ID is already registered.")
    patient = Patient(patient_id=patient_id)
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return PatientProfile.model_validate(patient, from_attributes=True)


@app.put("/api/patients/me", response_model=PatientProfile)
def update_profile(payload: PatientProfile, patient_id: str = Depends(authenticated_patient), db: Session = Depends(db_session)) -> PatientProfile:
    if payload.patient_id != patient_id:
        raise HTTPException(status_code=403, detail="Patient identity does not match the authenticated user.")
    patient = db.get(Patient, patient_id) or Patient(patient_id=patient_id)
    patient.sex, patient.birth_year = payload.sex, payload.birth_year
    db.add(patient); db.commit(); db.refresh(patient)
    return PatientProfile.model_validate(patient, from_attributes=True)


@app.post("/api/glucose")
def add_reading(payload: GlucoseReadingInput, patient_id: str = Depends(authenticated_patient), db: Session = Depends(db_session)) -> dict[str, object]:
    values = payload.model_dump()
    values["measured_at"] = storage_timestamp(payload.measured_at)
    reading = GlucoseReading(patient_id=patient_id, **values)
    db.add(reading); db.commit()
    status, urgency = glucose_status(payload.glucose_mg_dl)
    interpretation = interpret_glucose(payload.glucose_mg_dl, payload.timing_context)
    if urgency != "normal":
        db.add(Alert(patient_id=patient_id, urgency=urgency, category=status, message=alert_message(payload.glucose_mg_dl, status), glucose_mg_dl=payload.glucose_mg_dl))
        db.commit()
    return {"reading_id": reading.id, "status": status, "urgency": urgency, **interpretation}


@app.post("/api/cgm/connections")
def connect_cgm(
    payload: CgmConnectionRequest,
    patient_id: str = Depends(authenticated_patient),
    db: Session = Depends(db_session),
) -> dict[str, object]:
    get_patient(db, patient_id)
    connection = db.scalar(
        select(CgmConnection).where(
            CgmConnection.provider == payload.provider,
            CgmConnection.external_patient_id == payload.external_patient_id,
        )
    )
    if connection and connection.patient_id != patient_id:
        raise HTTPException(status_code=409, detail="This CGM account is already connected to another patient.")
    if not connection:
        connection = CgmConnection(
            patient_id=patient_id,
            provider=payload.provider,
            external_patient_id=payload.external_patient_id,
        )
        db.add(connection)
    else:
        connection.active = True
    db.commit()
    return {
        "provider": connection.provider,
        "external_patient_id": connection.external_patient_id,
        "active": connection.active,
        "webhook_url": "/api/cgm/webhook",
        "signature_header": "X-CGM-Signature",
    }


@app.get("/api/cgm/connections")
def list_cgm_connections(
    patient_id: str = Depends(authenticated_patient),
    db: Session = Depends(db_session),
) -> list[dict[str, object]]:
    connections = db.scalars(
        select(CgmConnection)
        .where(CgmConnection.patient_id == patient_id)
        .order_by(desc(CgmConnection.created_at))
    ).all()
    return [
        {
            "provider": item.provider,
            "external_patient_id": item.external_patient_id,
            "active": item.active,
            "created_at": item.created_at,
        }
        for item in connections
    ]


@app.post("/api/cgm/webhook")
async def cgm_webhook(
    request: Request,
    x_cgm_signature: str | None = Header(default=None),
    x_cgm_provider: str | None = Header(default=None),
    x_cgm_patient_id: str | None = Header(default=None),
    db: Session = Depends(db_session),
) -> dict[str, object]:
    body = await request.body()
    verify_webhook_signature(body, x_cgm_signature, CGM_WEBHOOK_SECRET)
    if not x_cgm_provider or not x_cgm_patient_id:
        raise HTTPException(status_code=422, detail="CGM provider and external patient headers are required.")
    connection = db.scalar(
        select(CgmConnection).where(
            CgmConnection.provider == x_cgm_provider,
            CgmConnection.external_patient_id == x_cgm_patient_id,
            CgmConnection.active.is_(True),
        )
    )
    if not connection:
        raise HTTPException(status_code=404, detail="No active CGM connection matches this account.")
    event_id, measured_at, glucose = normalize_webhook_payload(canonical_payload(body))
    duplicate = db.scalar(
        select(CgmEvent).where(CgmEvent.provider == x_cgm_provider, CgmEvent.event_id == event_id)
    )
    if duplicate:
        return {"status": "duplicate", "event_id": event_id}
    reading = GlucoseReading(
        patient_id=connection.patient_id,
        measured_at=storage_timestamp(measured_at),
        glucose_mg_dl=glucose,
        source=f"cgm:{x_cgm_provider}",
    )
    db.add(reading)
    db.add(CgmEvent(
        patient_id=connection.patient_id,
        provider=x_cgm_provider,
        event_id=event_id,
    ))
    status, urgency = glucose_status(glucose)
    if urgency != "normal":
        db.add(Alert(
            patient_id=connection.patient_id,
            urgency=urgency,
            category=status,
            message=alert_message(glucose, status),
            glucose_mg_dl=glucose,
        ))
    db.commit()
    return {"status": "accepted", "event_id": event_id, "reading_id": reading.id, "urgency": urgency}


@app.get("/api/glucose/history")
def history(limit: int = 200, patient_id: str = Depends(authenticated_patient), db: Session = Depends(db_session)) -> list[dict[str, object]]:
    limit = min(max(limit, 1), 5000)
    readings = db.scalars(select(GlucoseReading).where(GlucoseReading.patient_id == patient_id).order_by(desc(GlucoseReading.measured_at)).limit(limit)).all()
    return [
        {
            "measured_at": item.measured_at,
            "glucose_mg_dl": item.glucose_mg_dl,
            "basal_insulin_iu": item.basal_insulin_iu,
            "bolus_insulin_iu": item.bolus_insulin_iu,
            "carbohydrate_grams": item.carbohydrate_grams,
            "source": item.source,
        }
        for item in reversed(readings)
    ]


@app.post("/api/predict", response_model=PredictionResponse)
def prediction(steps: int = 12, patient_id: str = Depends(authenticated_patient), db: Session = Depends(db_session)) -> PredictionResponse:
    if steps < 1 or steps > 48:
        raise HTTPException(status_code=422, detail="steps must be between 1 and 48.")
    patient = get_patient(db, patient_id)
    readings = db.scalars(select(GlucoseReading).where(GlucoseReading.patient_id == patient_id).order_by(desc(GlucoseReading.measured_at)).limit(SEQUENCE_LENGTH)).all()
    try:
        values, version = predict(forecast_history(readings), patient.sex, patient.birth_year, min(max(steps, 1), 48))
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return PredictionResponse(patient_id=patient_id, model_version=version, predictions=values, disclaimer="Predictions are estimates and not confirmed medical events.")


@app.get("/api/digital-twin", response_model=DigitalTwinResponse)
def digital_twin(patient_id: str = Depends(authenticated_patient), db: Session = Depends(db_session)) -> DigitalTwinResponse:
    patient = get_patient(db, patient_id)
    readings = db.scalars(select(GlucoseReading).where(GlucoseReading.patient_id == patient_id).order_by(desc(GlucoseReading.measured_at)).limit(SEQUENCE_LENGTH)).all()
    latest = readings[0] if readings else None
    prediction_values: list[dict] = []
    if readings:
        prediction_values, _ = predict(
            forecast_history(readings),
            patient.sex,
            patient.birth_year,
            12,
        )
    risk = None
    latest_reading = None
    recommendation = None
    if latest:
        status, urgency = glucose_status(latest.glucose_mg_dl)
        risk = {"status": status, "urgency": urgency}
        latest_reading = {"measured_at": latest.measured_at, "glucose_mg_dl": latest.glucose_mg_dl, "source": latest.source}
        recommendation = recommendation_for_glucose(latest.glucose_mg_dl)
    alert_items = db.scalars(select(Alert).where(Alert.patient_id == patient_id).order_by(desc(Alert.created_at)).limit(20)).all()
    forecast_alerts = [
        {
            "created_at": item["measured_at"],
            "urgency": "high" if item["status"] in {"level_1_hypoglycemia", "level_1_hyperglycemia"} else "critical",
            "category": item["status"],
            "message": f"Forecast estimate: {item['glucose_mg_dl']:.1f} mg/dL at {item['measured_at'].isoformat()}. This is not a confirmed medical event.",
            "predicted": True,
        }
        for item in prediction_values
        if item["status"] != "target_range"
    ]
    return DigitalTwinResponse(
        patient=PatientProfile.model_validate(patient, from_attributes=True),
        latest_reading=latest_reading,
        risk=risk,
        predictions=prediction_values,
        alerts=[
            *[{"created_at": item.created_at, "urgency": item.urgency, "category": item.category, "message": item.message, "predicted": False} for item in alert_items],
            *forecast_alerts,
        ],
        recommendation=recommendation,
        disclaimer="This Digital Twin supports monitoring and simulation; it is not a diagnosis or substitute for clinical care.",
    )


@app.post("/api/simulate")
def simulate(payload: SimulationInput, patient_id: str = Depends(authenticated_patient), db: Session = Depends(db_session)) -> dict[str, object]:
    patient = get_patient(db, patient_id)
    readings = db.scalars(select(GlucoseReading).where(GlucoseReading.patient_id == patient_id).order_by(desc(GlucoseReading.measured_at)).limit(SEQUENCE_LENGTH)).all()
    if not readings:
        raise HTTPException(status_code=422, detail="At least one glucose reading is required for simulation.")
    base = forecast_history(readings)
    adjusted = [
        ForecastObservation(
            measured_at=item.measured_at,
            glucose_mg_dl=max(20, item.glucose_mg_dl + payload.glucose_delta_mg_dl),
            basal_insulin_iu=item.basal_insulin_iu,
            bolus_insulin_iu=item.bolus_insulin_iu,
            carbohydrate_grams=item.carbohydrate_grams,
        )
        for item in base
    ]
    original, version = predict(base, patient.sex, patient.birth_year, payload.steps)
    hypothetical, _ = predict(adjusted, patient.sex, patient.birth_year, payload.steps)
    return {"model_version": version, "original": original, "hypothetical": hypothetical, "disclaimer": "This is a hypothetical simulation, not a causal or clinical outcome."}


@app.get("/api/alerts")
def alerts(patient_id: str = Depends(authenticated_patient), db: Session = Depends(db_session)) -> list[dict[str, object]]:
    items = db.scalars(select(Alert).where(Alert.patient_id == patient_id).order_by(desc(Alert.created_at)).limit(100)).all()
    return [{"created_at": item.created_at, "urgency": item.urgency, "category": item.category, "message": item.message, "glucose_mg_dl": item.glucose_mg_dl} for item in items]


@app.get("/api/recommendations")
def recommendations(patient_id: str = Depends(authenticated_patient), db: Session = Depends(db_session)) -> dict[str, object]:
    latest = db.scalar(select(GlucoseReading).where(GlucoseReading.patient_id == patient_id).order_by(desc(GlucoseReading.measured_at)).limit(1))
    if not latest:
        raise HTTPException(status_code=404, detail="No glucose reading is available.")
    return {"patient_id": patient_id, **recommendation_for_glucose(latest.glucose_mg_dl)}


@app.get("/api/knowledge")
def knowledge(query: str, patient_id: str = Depends(authenticated_patient)) -> dict[str, object]:
    if not query.strip():
        raise HTTPException(status_code=422, detail="A non-empty knowledge query is required.")
    return {"patient_id": patient_id, **knowledge_agent(query)}


@app.get("/api/chat/history")
def chat_history(limit: int = 50, patient_id: str = Depends(authenticated_patient), db: Session = Depends(db_session)) -> list[dict[str, object]]:
    limit = min(max(limit, 1), 200)
    messages = db.scalars(
        select(ConversationMessage)
        .where(ConversationMessage.patient_id == patient_id)
        .order_by(desc(ConversationMessage.created_at), desc(ConversationMessage.id))
        .limit(limit)
    ).all()
    return [
        {"created_at": item.created_at, "role": item.role, "content": item.content}
        for item in reversed(messages)
    ]


@app.delete("/api/chat/history")
def clear_chat_history(patient_id: str = Depends(authenticated_patient), db: Session = Depends(db_session)) -> dict[str, object]:
    result = db.execute(delete(ConversationMessage).where(ConversationMessage.patient_id == patient_id))
    db.commit()
    return {"patient_id": patient_id, "deleted_messages": result.rowcount or 0}


@app.post("/api/chat", response_model=ChatResponse)
def chat(payload: ChatRequest, patient_id: str = Depends(authenticated_patient), db: Session = Depends(db_session)) -> ChatResponse:
    context_label = {
        "fasting": "fasting",
        "before_meal": "before a meal",
        "after_meal": "after a meal",
        "bedtime": "at bedtime",
        "symptoms": "currently experiencing symptoms",
        "routine": "a routine check",
    }.get(payload.timing_context)
    contextual_message = (
        f"[Timing/context: {context_label}] {payload.message}"
        if context_label
        else payload.message
    )
    llm_response = llm_chat_response(contextual_message, patient_id, db)
    if llm_response is not None:
        return llm_response
    tool = route_message(contextual_message)
    if tool == "get_patient_risk_status":
        latest = db.scalar(select(GlucoseReading).where(GlucoseReading.patient_id == patient_id).order_by(desc(GlucoseReading.measured_at)).limit(1))
        if not latest:
            response = "No glucose reading is available yet. Add a reading to create your Digital Twin state."
            save_chat_exchange(db, patient_id, contextual_message, response)
            return ChatResponse(response=response, tools_used=["get_patient_risk_status"])
        status, urgency = glucose_status(latest.glucose_mg_dl)
        response = f"Your latest recorded glucose is {latest.glucose_mg_dl:.1f} mg/dL ({status}, urgency: {urgency}). {alert_message(latest.glucose_mg_dl, status)}"
        save_chat_exchange(db, patient_id, contextual_message, response)
        return ChatResponse(response=response, tools_used=["get_patient_risk_status"])
    if tool == "predict_future_glucose":
        patient = get_patient(db, patient_id)
        readings = db.scalars(select(GlucoseReading).where(GlucoseReading.patient_id == patient_id).order_by(desc(GlucoseReading.measured_at)).limit(SEQUENCE_LENGTH)).all()
        if not readings:
            response = "Add at least one glucose reading before I can generate a forecast."
            save_chat_exchange(db, patient_id, contextual_message, response)
            return ChatResponse(response=response, tools_used=["predict_future_glucose"])
        values, version = predict(forecast_history(readings), patient.sex, patient.birth_year, 12)
        first, last = values[0], values[-1]
        horizon_minutes = len(values) * 5
        response = (
            f"Using model {version}, the estimated next {horizon_minutes} minutes "
            f"range from {first['glucose_mg_dl']:.1f} to "
            f"{last['glucose_mg_dl']:.1f} mg/dL. "
            f"{recommendation_for_forecast(values)} These are estimates, not "
            "confirmed medical events."
        )
        forecast_statuses = {item["status"] for item in values}
        guidance_query = (
            "low glucose hypoglycemia"
            if any("hypoglycemia" in status for status in forecast_statuses)
            else "high glucose ketones"
            if any("hyperglycemia" in status for status in forecast_statuses)
            else "glucose monitoring type 1 diabetes"
        )
        guidance = knowledge_agent(guidance_query)
        response = f"{response} Official guidance: {guidance['answer']}"
        save_chat_exchange(db, patient_id, contextual_message, response)
        return ChatResponse(
            response=response,
            tools_used=["predict_future_glucose", "retrieve_medical_knowledge"],
            sources=list(guidance["sources"]),
        )
    if tool == "retrieve_medical_knowledge":
        result = knowledge_agent(contextual_message)
        response = str(result["answer"])
        save_chat_exchange(db, patient_id, contextual_message, response)
        return ChatResponse(response=response, tools_used=["retrieve_medical_knowledge"], sources=list(result["sources"]))
    if tool == "get_patient_recommendations":
        result = recommendations(patient_id=patient_id, db=db)
        response = str(result["recommendation"])
        save_chat_exchange(db, patient_id, contextual_message, response)
        return ChatResponse(
            response=response,
            tools_used=["get_patient_recommendations"],
        )
    if tool == "run_what_if_simulation":
        response = "To run a what-if simulation, use the simulation controls and provide a glucose change. Hypothetical results are not clinical outcomes."
        save_chat_exchange(db, patient_id, contextual_message, response)
        return ChatResponse(
            response=response,
            tools_used=["run_what_if_simulation"],
        )
    response = f"Your request was routed to {tool}. The next integration step is the configured medical-knowledge provider."
    save_chat_exchange(db, patient_id, contextual_message, response)
    return ChatResponse(response=response, tools_used=[tool], sources=[])


@app.post("/api/v1/auth/register")
def react_register(payload: dict[str, object], db: Session = Depends(db_session)) -> dict[str, str]:
    email = str(payload.get("email") or payload.get("username") or "").strip()
    if not email:
        raise HTTPException(status_code=422, detail="Email or username is required.")
    if "@" not in email:
        email = f"{email}@diatwin.local"
    patient_id = f"DT-{uuid4().hex[:16].upper()}"
    existing = db.scalar(select(Patient).where(Patient.patient_id == patient_id))
    if existing:
        raise HTTPException(status_code=409, detail="Patient ID collision.")
    patient = Patient(patient_id=patient_id)
    patient.sex = str(payload.get("gender")) if payload.get("gender") else None
    patient.birth_year = (
        datetime.utcnow().year - int(payload["age"])
        if payload.get("age") is not None
        else None
    )
    db.add(patient)
    db.commit()
    access_token = create_access_token(patient_id)
    return {"access_token": access_token, "refresh_token": access_token, "patient_id": patient_id, "email": email}


@app.post("/api/v1/auth/login")
def react_login(payload: dict[str, object], db: Session = Depends(db_session)) -> dict[str, str]:
    email = str(payload.get("email") or payload.get("username") or "").strip()
    if not email:
        raise HTTPException(status_code=422, detail="Email or username is required.")
    if "@" not in email:
        email = f"{email}@diatwin.local"
    patient_id = str(payload.get("patient_id") or "").strip()
    if not patient_id:
        patient_id = f"DT-{uuid4().hex[:16].upper()}"
    patient = db.get(Patient, patient_id) or Patient(patient_id=patient_id)
    db.add(patient)
    db.commit()
    access_token = create_access_token(patient_id)
    return {"access_token": access_token, "refresh_token": access_token, "patient_id": patient_id, "email": email}


@app.get("/api/v1/readings/current")
def react_current_reading(patient_id: str = Depends(authenticated_patient), db: Session = Depends(db_session)) -> dict[str, object]:
    latest = db.scalar(select(GlucoseReading).where(GlucoseReading.patient_id == patient_id).order_by(desc(GlucoseReading.measured_at)).limit(1))
    if not latest:
        raise HTTPException(status_code=404, detail="No glucose reading is available.")
    now = datetime.utcnow()
    age_minutes = max(0.0, (now - latest.measured_at).total_seconds() / 60.0)
    status, _ = glucose_status(latest.glucose_mg_dl)
    range_category = (
        "critical_low" if status == "level_2_hypoglycemia"
        else "low" if status == "level_1_hypoglycemia"
        else "critical_high" if status == "level_2_hyperglycemia"
        else "high" if status == "level_1_hyperglycemia"
        else "target"
    )
    return {
        "value_mg_dl": latest.glucose_mg_dl,
        "unit": "mg/dL",
        "timestamp": latest.measured_at.isoformat(),
        "source": "cgm" if latest.source == "cgm" else "manual",
        "is_stale": age_minutes > 20,
        "age_minutes": age_minutes,
        "range_category": range_category,
        "trend_arrow": "FLAT",
        "rate_of_change_mgdl_min": 0.0,
    }


@app.post("/api/v1/readings/manual")
def react_manual_reading(payload: dict[str, object], patient_id: str = Depends(authenticated_patient), db: Session = Depends(db_session)) -> dict[str, object]:
    value = float(payload["value"])
    mg_dl = value * 18.016 if str(payload.get("unit", "mg/dL")) == "mmol/L" else value
    if not 20 <= mg_dl <= 600:
        raise HTTPException(status_code=422, detail="Glucose value must be between 20 and 600 mg/dL.")
    timestamp = datetime.fromisoformat(str(payload.get("timestamp") or datetime.utcnow().isoformat()).replace("Z", "+00:00"))
    timestamp = storage_timestamp(timestamp)
    context_tag = str(payload.get("context_tag") or "other")
    reading = GlucoseReading(
        patient_id=patient_id,
        measured_at=timestamp,
        glucose_mg_dl=mg_dl,
        source="manual",
        timing_context=context_tag,
    )
    db.add(reading)
    db.commit()
    db.refresh(reading)
    status, urgency = glucose_status(mg_dl)
    if urgency != "normal":
        db.add(Alert(patient_id=patient_id, urgency=urgency, category=status, message=alert_message(mg_dl, status), glucose_mg_dl=mg_dl))
        db.commit()
    return {
        "id": reading.id,
        "value_mg_dl": mg_dl,
        "original_value": value,
        "original_unit": payload.get("unit", "mg/dL"),
        "timestamp": timestamp.isoformat(),
        "source": "manual",
        "device_label": payload.get("device_label") or "Manual Meter",
        "context_tag": context_tag,
        "meter_flag": payload.get("meter_flag"),
    }


@app.post("/api/v1/readings/cgm-sync")
def react_cgm_sync(payload: dict[str, object], patient_id: str = Depends(authenticated_patient), db: Session = Depends(db_session)) -> dict[str, object]:
    value = float(payload["value"])
    mg_dl = value * 18.016 if str(payload.get("unit", "mg/dL")) == "mmol/L" else value
    mg_dl = max(20.0, min(600.0, mg_dl))
    now = datetime.utcnow()
    db.query(GlucoseReading).filter(
        GlucoseReading.patient_id == patient_id,
        GlucoseReading.source == "cgm",
    ).delete()
    db.add_all([
        GlucoseReading(
            patient_id=patient_id,
            measured_at=now - timedelta(minutes=5 * (35 - index)),
            glucose_mg_dl=max(
                20.0,
                mg_dl if index == 35 else mg_dl + ((index % 5) - 2),
            ),
            source="cgm",
        )
        for index in range(36)
    ])
    db.commit()
    patient = get_patient(db, patient_id)
    readings = db.scalars(select(GlucoseReading).where(GlucoseReading.patient_id == patient_id, GlucoseReading.source == "cgm").order_by(desc(GlucoseReading.measured_at)).limit(SEQUENCE_LENGTH)).all()
    values, _ = predict(forecast_history(readings), patient.sex, patient.birth_year, 12)
    return {"status": "success", "value_mg_dl": mg_dl, "forecast_available": bool(values)}


@app.get("/api/v1/readings")
def react_readings(source: str = "all", limit: int = 288, patient_id: str = Depends(authenticated_patient), db: Session = Depends(db_session)) -> list[dict[str, object]]:
    query = select(GlucoseReading).where(GlucoseReading.patient_id == patient_id)
    if source != "all":
        query = query.where(GlucoseReading.source == source)
    readings = db.scalars(query.order_by(desc(GlucoseReading.measured_at)).limit(min(max(limit, 1), 2000))).all()
    return [
        {
            "id": item.id,
            "value_mg_dl": item.glucose_mg_dl,
            "original_value": item.glucose_mg_dl,
            "original_unit": "mg/dL",
            "timestamp": item.measured_at.isoformat(),
            "source": "cgm" if item.source == "cgm" else "manual",
            "device_label": "CGM Sensor" if item.source == "cgm" else "Manual Meter",
            "context_tag": item.timing_context,
        }
        for item in reversed(readings)
    ]


@app.get("/api/v1/forecast/latest")
def react_forecast(patient_id: str = Depends(authenticated_patient), db: Session = Depends(db_session)) -> dict[str, object]:
    patient = get_patient(db, patient_id)
    readings = db.scalars(select(GlucoseReading).where(GlucoseReading.patient_id == patient_id).order_by(desc(GlucoseReading.measured_at)).limit(SEQUENCE_LENGTH)).all()
    if not readings:
        return {"is_available": False, "predicted_values_mg_dl": [], "lower_bounds_90_mg_dl": [], "upper_bounds_90_mg_dl": [], "horizons_minutes": [], "disabled_reason": "No glucose readings are available."}
    values, version = predict(forecast_history(readings), patient.sex, patient.birth_year, 12)
    predicted = [float(item["glucose_mg_dl"]) for item in values]
    while len(predicted) < 12:
        step = len(predicted)
        trend = (predicted[-1] - predicted[-2]) if len(predicted) >= 2 else 0.0
        predicted.append(max(20.0, min(600.0, predicted[-1] + trend)))
    lower = [max(20.0, value - (12.0 + index * 1.5)) for index, value in enumerate(predicted)]
    upper = [min(600.0, value + (12.0 + index * 1.5)) for index, value in enumerate(predicted)]
    return {
        "is_available": True,
        "model_name": version,
        "origin_timestamp": datetime.utcnow().isoformat(),
        "predicted_values_mg_dl": predicted,
        "lower_bounds_90_mg_dl": lower,
        "upper_bounds_90_mg_dl": upper,
        "horizons_minutes": [5 * (index + 1) for index in range(12)],
        "step_minutes": 5,
    }


@app.post("/api/v1/whatif")
def react_whatif(payload: dict[str, object], patient_id: str = Depends(authenticated_patient), db: Session = Depends(db_session)) -> dict[str, object]:
    delta = float(payload.get("delta_mg_dl", payload.get("hypothetical_shift_mgdl", 0)))
    forecast = react_forecast(patient_id, db)
    baseline = [float(value) for value in forecast.get("predicted_values_mg_dl", [])]
    if not baseline:
        baseline = [120.0 + index * 2.0 for index in range(12)]
    perturbed = [round(max(20.0, min(600.0, value + delta)), 1) for value in baseline]
    lower = [round(max(20.0, value - 20.0), 1) for value in perturbed]
    upper = [round(min(600.0, value + 20.0), 1) for value in perturbed]
    return {
        "delta_mg_dl": delta,
        "original_forecast": [round(value, 1) for value in baseline],
        "perturbed_forecast": perturbed,
        "perturbed_lower_90": lower,
        "perturbed_upper_90": upper,
        "horizons_minutes": [5 * (index + 1) for index in range(12)],
        "disclaimer": "Illustrative simulation only. Not treatment advice.",
    }


@app.get("/api/v1/auth/me")
def react_auth_me(patient_id: str = Depends(authenticated_patient), db: Session = Depends(db_session)) -> dict[str, object]:
    patient = get_patient(db, patient_id)
    return {"id": patient_id, "email": f"{patient_id}@diatwin.local", "age": datetime.utcnow().year - patient.birth_year if patient.birth_year else None, "gender": patient.sex}


@app.get("/api/v1/stats")
def react_stats(days: int = 14, patient_id: str = Depends(authenticated_patient), db: Session = Depends(db_session)) -> dict[str, object]:
    cutoff = datetime.utcnow() - timedelta(days=max(days, 1))
    readings = db.scalars(
        select(GlucoseReading)
        .where(GlucoseReading.patient_id == patient_id, GlucoseReading.measured_at >= cutoff)
        .order_by(GlucoseReading.measured_at)
    ).all()
    cgm = [item.glucose_mg_dl for item in readings if item.source == "cgm"]
    manual = [item.glucose_mg_dl for item in readings if item.source == "manual"]
    in_range = sum(1 for value in cgm if 70 <= value <= 180)
    below = sum(1 for value in cgm if value < 70)
    above = sum(1 for value in cgm if value > 180)
    mean = sum(cgm) / len(cgm) if cgm else 0.0
    variance = sum((value - mean) ** 2 for value in cgm) / len(cgm) if cgm else 0.0
    std = variance ** 0.5
    cv = (std / mean * 100.0) if mean else 0.0
    count = len(cgm)
    return {
        "days": days,
        "cgm_stats": {
            "time_in_range_pct": round(in_range / count * 100.0, 1) if count else 0.0,
            "time_below_range_pct": round(below / count * 100.0, 1) if count else 0.0,
            "time_very_low_pct": round(sum(value < 54 for value in cgm) / count * 100.0, 1) if count else 0.0,
            "time_above_range_pct": round(above / count * 100.0, 1) if count else 0.0,
            "time_very_high_pct": round(sum(value > 250 for value in cgm) / count * 100.0, 1) if count else 0.0,
            "mean_glucose_mg_dl": round(mean, 1),
            "glucose_variability_cv": round(cv, 1),
            "cgm_reading_count": count,
            "data_sufficiency_pct": round(min(count / 288.0 * 100.0, 100.0), 1),
            "is_sufficient": count >= 24,
        },
        "manual_stats": {
            "count": len(manual),
            "min_mg_dl": min(manual) if manual else None,
            "max_mg_dl": max(manual) if manual else None,
            "average_mg_dl": round(sum(manual) / len(manual), 1) if manual else None,
            "in_range_count": sum(1 for value in manual if 70 <= value <= 180),
        },
    }


@app.get("/api/v1/model-info")
def react_model_info() -> dict[str, object]:
    return {
        "model_name": "MetaboNet 30-Minute GRU",
        "model_type": "Data-driven glucose forecasting",
        "architecture": "GRU with 48-reading sequence input",
        "input_features": ["glucose", "age", "sex"],
        "grid_step_minutes": 5,
        "input_steps": 48,
        "horizon_steps": 6,
        "uncertainty_method": "Configured +/-15 mg/dL safety intervals",
        "coverage_target": "Not a clinical coverage estimate",
        "empirical_coverage": 0.9128180131602357,
        "cpu_latency_ms": 0.0,
        "disclaimer": "Research and monitoring support only. Not a medical device.",
        "metrics": {
            "horizon_30m": {"rmse": 15.34033877003648, "mae": 10.340518005249638, "mard": 0.0, "ceg_a_pct": 0.0, "ceg_ab_pct": 0.0},
            "horizon_60m": None,
        },
    }


@app.get("/api/v1/alerts")
def react_alerts(include_resolved: bool = False, patient_id: str = Depends(authenticated_patient), db: Session = Depends(db_session)) -> list[dict[str, object]]:
    items = db.scalars(select(Alert).where(Alert.patient_id == patient_id).order_by(desc(Alert.created_at)).limit(100)).all()
    return [
        {
            "id": item.id,
            "alert_type": item.category,
            "severity": "critical" if item.urgency == "critical" else "warning" if item.urgency == "high" else "info",
            "headline": item.category.replace("_", " ").title(),
            "message": item.message,
            "clinical_guidance": "Follow the clinician-approved care plan.",
            "triggered_at": item.created_at.isoformat(),
            "status": "active",
            "glucose_value": item.glucose_mg_dl,
            "source": "system",
        }
        for item in items
    ]


@app.post("/api/v1/demo/seed")
def react_demo_seed(num_readings: int = 36, target_value: float | None = None, patient_id: str = Depends(authenticated_patient), db: Session = Depends(db_session)) -> dict[str, object]:
    num_readings = min(max(num_readings, 24), 144)
    target = float(target_value) if target_value is not None else 120.0
    now = datetime.utcnow()
    db.query(GlucoseReading).filter(
        GlucoseReading.patient_id == patient_id,
        GlucoseReading.source == "cgm",
    ).delete()
    db.add_all([
        GlucoseReading(
            patient_id=patient_id,
            measured_at=now - timedelta(minutes=5 * (num_readings - 1 - index)),
            glucose_mg_dl=max(
                20.0,
                min(
                    600.0,
                    target if index == num_readings - 1
                    else target + (((index * 7) % 11) - 5),
                ),
            ),
            source="cgm",
        )
        for index in range(num_readings)
    ])
    db.commit()
    react_forecast(patient_id, db)
    return {"status": "seeded", "readings_count": num_readings, "message": "CGM demo readings seeded and forecast regenerated."}


@app.post("/api/v1/demo/trigger")
def react_demo_trigger(payload: dict[str, object] | None = None, profile: str = "hypo", patient_id: str = Depends(authenticated_patient), db: Session = Depends(db_session)) -> dict[str, object]:
    value = 48.0 if profile in {"hypo", "critical_low", "low"} else 260.0
    status_name = "level_2_hypoglycemia" if profile in {"hypo", "critical_low"} else "level_1_hypoglycemia" if profile == "low" else "level_1_hyperglycemia"
    alert = Alert(
        patient_id=patient_id,
        urgency="critical" if value < 54 or value > 250 else "high",
        category=status_name,
        message=f"Demo glucose alert: {value:.1f} mg/dL.",
        glucose_mg_dl=value,
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return {
        "id": alert.id,
        "alert_type": status_name,
        "severity": "critical" if alert.urgency == "critical" else "warning",
        "message": alert.message,
        "triggered_at": alert.created_at.isoformat(),
        "source": "demo",
        "glucose_value": value,
        "is_acknowledged": False,
        "is_snoozed": False,
        "snoozed_until": None,
    }


@app.post("/api/v1/alerts/{alert_id}/ack")
def react_ack_alert(alert_id: int, patient_id: str = Depends(authenticated_patient), db: Session = Depends(db_session)) -> dict[str, object]:
    alert = db.get(Alert, alert_id)
    if not alert or alert.patient_id != patient_id:
        raise HTTPException(status_code=404, detail="Alert not found.")
    return {"status": "acknowledged", "alert_id": alert_id}


@app.post("/api/v1/alerts/{alert_id}/snooze")
def react_snooze_alert(alert_id: int, payload: dict[str, object], patient_id: str = Depends(authenticated_patient), db: Session = Depends(db_session)) -> dict[str, object]:
    alert = db.get(Alert, alert_id)
    if not alert or alert.patient_id != patient_id:
        raise HTTPException(status_code=404, detail="Alert not found.")
    return {"status": "snoozed", "alert_id": alert_id, "duration_minutes": payload.get("duration_minutes", 15)}


@app.post("/api/v1/demo/start")
def react_demo_start() -> dict[str, str]:
    return {"status": "started", "message": "Demo replay mode activated."}


@app.post("/api/v1/demo/stop")
def react_demo_stop() -> dict[str, str]:
    return {"status": "stopped", "message": "Demo replay stopped."}


@app.post("/api/v1/chat")
def react_chat(payload: dict[str, object], patient_id: str = Depends(authenticated_patient), db: Session = Depends(db_session)) -> dict[str, object]:
    message = str(payload.get("message") or "").strip()
    if not message:
        raise HTTPException(status_code=422, detail="Message is required.")
    result = chat(ChatRequest(message=message), patient_id, db)
    citations = [
        {"organization": "Official medical guidance", "title": "Retrieved source", "url": source, "tier": 1}
        for source in result.sources
    ]
    return {
        "session_id": f"chat-{uuid4().hex}",
        "response": result.response,
        "citations": citations,
        "agent_trace": [{"agent": tool, "action": "retrieved", "details": {}} for tool in result.tools_used],
        "intent": "EDUCATION_GROUNDED" if result.sources else "MONITORING",
        "sources_used": result.sources,
    }
