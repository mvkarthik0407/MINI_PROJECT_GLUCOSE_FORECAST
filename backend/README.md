# Backend service

This service is the first application milestone. It exposes patient-scoped APIs for
the trained GRU, Digital Twin state, alerts, simulation, chatbot routing, and
MCP-style tool discovery.

Set `DATABASE_URL` to PostgreSQL for deployment. The default SQLite URL is only
for local development. Set `MODEL_PATH`, `SCALER_PATH`, and `MODEL_DEVICE` when
the trained artifacts are stored elsewhere.

Run from the project root:

```powershell
python -m uvicorn backend.main:app --reload
```

Open the mobile-friendly dashboard at `http://127.0.0.1:8000/app`.

The dashboard source is now a React/Vite client in `frontend/src`. Build it
with Node.js from the `frontend` directory:

```powershell
npm install
npm run build
```

The API serves `frontend/dist/index.html` after a build. If the build has not
been run, it falls back to the local frontend entry file so the API remains
usable during development. The Dockerfile performs the React build in its
frontend stage automatically.

The dashboard provides a simulated reading flow through `POST /api/glucose`.
For a future vendor connection, register the provider account for an
authenticated patient:

```text
POST /api/cgm/connections
{"provider": "your-adapter", "external_patient_id": "vendor-user-id"}
```

Vendor adapters should send normalized readings to `POST /api/cgm/webhook`
with `X-CGM-Provider`, `X-CGM-Patient-ID`, and an HMAC-SHA256
`X-CGM-Signature` over the exact JSON request body. Configure the shared
`CGM_WEBHOOK_SECRET` without committing it. The payload contract is:

```json
{"event_id": "vendor-event-id", "measured_at": "2026-11-11T08:00:00Z", "glucose_mg_dl": 125}
```

Events are idempotent by provider and event ID, and the connection layer
stores readings under the authenticated patient's internal ID. This is an
adapter boundary, not a live vendor integration; each vendor still requires
its approved OAuth/webhook adapter and terms/privacy review. The GRU uses the
latest 48 readings, while the bundled dataset is used for historical/demo data.

Seed profiles and a demo patient's recent readings:

```powershell
python scripts/seed_backend.py --project-dir . --patient-id LIB193263 --readings 100
```

Run the focused backend tests:

```powershell
python -m unittest discover -s tests -v
```

The test client dependency is included in `requirements.txt` so API smoke
tests run consistently in a fresh virtual environment.

CORS origins are configured with the comma-separated `CORS_ORIGINS` setting.
The API also emits browser security headers; HSTS is enabled only in staging
and production, where HTTPS must be terminated.

Use `GET /health` for a process liveness check and `GET /ready` for readiness.
Readiness verifies the database connection and both trained model artifacts;
container orchestration should route traffic only after `/ready` succeeds.

API validation bounds glucose ingestion to 20–600 mg/dL, forecasts and
simulations to 1–48 steps, and history requests to at most 5,000 readings.
MCP calls use the same bounds and return validation errors instead of
uncaught conversion failures. Incoming timezone-aware CGM timestamps are
normalized to UTC before storage so reading order is consistent across
SQLite and PostgreSQL.

Use `X-Patient-ID: LIB193263` for local development requests. In `staging` or
`production`, configure a long random `AUTH_SECRET` and send a signed HS256
bearer token with the patient's ID in its `sub` claim. The helper
`backend.auth.create_access_token` can create short-lived development tokens;
an approved identity provider should issue tokens for a real deployment.

Production and staging reject `X-Patient-ID` without bearer authentication.
Do not expose token creation as an unauthenticated API endpoint.

## Container deployment

Copy `.env.example` to `.env`, set a strong `POSTGRES_PASSWORD`,
`AUTH_SECRET`, `CGM_WEBHOOK_SECRET`, and matching `DATABASE_URL`, then run:

```powershell
docker compose up --build
```

The API container runs as an unprivileged user. Do not commit `.env` or place
provider credentials in Compose files. The database schema is initialized by
SQLAlchemy at startup for this prototype; use a reviewed migration system
before applying schema changes to an existing production database.

The API will be available at `http://localhost:8000/app` and its documentation
at `http://localhost:8000/docs`. Do not deploy the bundled dataset or prototype
identity header to a public environment without privacy, authentication, and
clinical review.

MCP-compatible discovery and calls are available at:

```text
GET  /api/mcp/tools
POST /api/mcp/call
```

Example request body:

```json
{"name": "get_patient_risk_status", "arguments": {}}
```

Chat exchanges are stored per patient in the local database and can be read
through `GET /api/chat/history` or removed with the authenticated
`DELETE /api/chat/history` endpoint. This is intended for continuity in the
prototype; production deployments should define retention, deletion, audit,
and privacy policies before enabling long-term storage.

## Multimodal MetaboNet training

The second forecasting pipeline trains a six-step, 30-minute GRU using the
MetaboNet 5-minute data. It uses CGM, basal insulin, bolus insulin,
carbohydrates, time-of-day, and weekday features. The Parquet files are read
as patient streams so the full dataset is not loaded into memory:

```powershell
.\.venv\Scripts\python.exe scripts\train_metabonet.py `
  --train-parquet C:\Downloads\train.parquet `
  --test-parquet C:\Downloads\test.parquet `
  --project-dir . --sequence-length 48 --forecast-steps 6 `
  --epochs 10 --batch-size 256
```

Evaluate the trained checkpoint on the separate holdout file:

```powershell
.\.venv\Scripts\python.exe scripts\evaluate_metabonet.py `
  --test-parquet C:\Downloads\test.parquet --project-dir .
```

The multimodal checkpoint is the default API checkpoint after holdout review.
`MODEL_PATH` and `SCALER_PATH` can still override it for experiments. Live
clients should provide basal insulin, bolus insulin,
and carbohydrate values with each glucose reading when available; omitted
values are treated as zero by the inference boundary.

The deterministic RAG safety layer uses curated guidance from the American
Diabetes Association (ADA), World Health Organization (WHO), and International
Diabetes Federation (IDF), and returns source URLs with matched responses.
Hugging Face is not treated as a clinical authority. The RAG records are
reviewed project content, not a live medical database; update them only after
reviewing the current official source pages.

The web chatbot also accepts a `timing_context` value (`fasting`,
`before_meal`, `after_meal`, `bedtime`, `symptoms`, or `routine`). The dashboard
shows these as context buttons and sends the selected value with the question.
This improves interpretation and guidance relevance; it does not change the
GRU forecast accuracy or replace clinical assessment.

Without provider credentials, the chatbot uses this deterministic local safety
fallback. To enable the LLM orchestrator with Google AI Studio, set
`GOOGLE_API_KEY` without committing it and set `GEMINI_MODEL` (default
`gemini-2.5-flash`). The backend sends only the authenticated patient's
limited context and retrieved guidance to Gemini. The LLM is instructed not
to diagnose or prescribe, and provider failures return an explicit error
rather than silently falling back. Review Google AI Studio privacy and data
processing terms before sending real patient data. The curated RAG content
remains intentionally small; production use requires reviewed, versioned
sources and privacy review.
