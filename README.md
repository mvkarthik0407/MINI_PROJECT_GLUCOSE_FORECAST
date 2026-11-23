# AI-Driven Diabetes Digital Twin

An end-to-end Type 1 diabetes monitoring and forecasting prototype with a rich React interface, FastAPI backend, multimodal MetaboNet GRU forecasting, evidence-grounded chatbot, MCP-style tools, glucose alerts, what-if simulation, and CGM-provider integration boundaries.

> **Safety notice:** This project is an investigational decision-support prototype. It does not diagnose diabetes, prescribe medication or insulin, replace clinical assessment, or provide instructions for emergencies. Always follow the individual's clinician-approved care plan.

## Repository

**GitHub:** https://github.com/mvkarthik0407/MINI_PROJECT_GLUCOSE_FORECAST

**Primary branch:** `main`

---

## Project summary

The application combines:

- Real-time and historical glucose monitoring
- Patient-specific glucose forecasting
- Low/high glucose alerts
- 30-minute and visual 60-minute forecast views
- Hypothetical what-if glucose shifts
- ADA/WHO evidence-grounded chatbot responses
- Source citations and agent trace/debug output
- MCP-style tool discovery and invocation
- Manual, CGM, and signed-webhook glucose ingestion boundaries
- React web interface and React Native mobile interface

The React interface is the primary browser UI. The FastAPI backend serves the built React application and the API on the same origin.

---

## System architecture

```text
React / TypeScript Browser UI
          |
          | HTTP / JSON
          v
FastAPI Backend
  ├── Authentication and patient identity
  ├── Glucose ingestion and history
  ├── Forecast service
  ├── Alert and recommendation service
  ├── What-if simulation
  ├── MCP-style tools
  ├── Intent routing
  └── PDF RAG retrieval
          |
          ├── SQLite / PostgreSQL
          ├── MetaboNet GRU checkpoint
          ├── StandardScaler artifacts
          └── Official ADA / WHO PDF corpus
```

The project has a web frontend in `frontend/`, a mobile app in `mobile/`, backend services in `backend/`, training/evaluation code in `scripts/`, and official PDF sources in `knowledge_docs/`.

---

## Major features

### 1. Glucose entry

The interface supports:

- mg/dL and mmol/L units
- Manual fingerstick readings
- CGM synchronization
- Six measurement contexts:
  - Fasting
  - Before meal
  - After meal
  - Bedtime
  - Symptoms
  - Routine
- Timestamp entry and future-timestamp validation
- Backdate confirmation for readings older than 24 hours
- LO/HI meter flags
- Exact submitted glucose preservation in the demo CGM stream

### 2. Digital Twin dashboard

The browser dashboard includes:

- Live glucose card
- Range classification
- Recorded glucose trend
- Forecast trajectory
- Forecast uncertainty display
- Time in range
- Time below range
- Time above range
- Mean glucose
- Glucose variability/CV
- Manual fingerstick diary
- Alerts
- What-if simulator
- Model information
- Browser notification controls
- Chat assistant

### 3. Forecasting

The active multimodal checkpoint is:

```text
models/best_metabonet_gru_model.pth
scalers/metabonet_scaler.pkl
```

The model is a GRU forecast pipeline with:

- 48 historical readings
- 5-minute sampling
- Six direct forecast points
- 30-minute native forecast horizon
- Optional visual 60-minute display

The first 30 minutes are direct 5-minute model outputs. Sixty-minute display values are not presented as a separate clinical 60-minute evaluation.

### 4. Multimodal features

The MetaboNet preprocessing uses eight domain-selected features:

1. CGM glucose
2. Basal insulin
3. Bolus insulin
4. Carbohydrates
5. Time-of-day sine
6. Time-of-day cosine
7. Weekday sine
8. Weekday cosine

The time features are derived from the timestamp:

```text
minutes = hour * 60 + minute
time_sin = sin(2 * pi * minutes / 1440)
time_cos = cos(2 * pi * minutes / 1440)
weekday_sin = sin(2 * pi * weekday / 7)
weekday_cos = cos(2 * pi * weekday / 7)
```

The eight features were selected manually/domain-based. There was no correlation threshold, RFE, LASSO, PCA, mutual-information ranking, SHAP-based selection, or other automated feature-selection technique in the preprocessing implementation.

Basal insulin, bolus insulin, and carbohydrate values are filled with zero when not supplied. Runtime glucose captures should provide real basal, bolus, and carbohydrate values when available.

### 5. Recorded model metrics

The active MetaboNet checkpoint has the following saved evaluation metrics:

| Metric | Value |
|---|---:|
| MAE | 10.3405 mg/dL |
| RMSE | 15.3403 mg/dL |
| R-squared | 0.9128 |
| Forecast points | 6 |
| Forecast horizon | 30 minutes |
| Test sequence cap | 100,000 |

Separate legacy glucose-only artifacts remain in `models/best_gru_model.pth` and `results/metrics.json`. They belong to a different three-feature setup and must not be combined with the active MetaboNet metrics.

| Legacy glucose-only metric | Value |
|---|---:|
| MAE | 6.4427 mg/dL |
| RMSE | 11.5862 mg/dL |
| R-squared | 0.97575 |

The active API does not use the legacy checkpoint for its primary MetaboNet forecast path.

### 6. Dataset and preprocessing

The MetaboNet Parquet preprocessing:

- Reads patients in streams
- Sorts each patient by timestamp
- Validates CGM values in the 20–600 or 40–400 range according to preprocessing stage
- Removes invalid glucose values
- Breaks segments after gaps greater than 30 minutes
- Interpolates short gaps
- Fills missing basal, bolus, and carbohydrate values with zero
- Uses 48-reading input windows
- Generates six future readings
- Fits scaling only on training data

The supplied MetaboNet inputs report 132,811,004 training rows and 22,069,548 test rows in the project inspection context. Training can be intentionally sequence-capped; capped sequence windows do not mean that every raw row was used.

### 7. Alerts

The alert engine includes:

- Critical low glucose
- Low glucose
- High glucose
- Critical high glucose
- Rapid-change warnings
- Severe symptom escalation
- Signal-loss handling
- Browser notification support
- Alert acknowledgement and snoozing in the richer UI/API

Safety boundaries:

- Glucose below 54 mg/dL is level 2 hypoglycemia
- Glucose below 70 mg/dL is low glucose
- Severe symptoms require urgent medical assistance
- Nothing should be given by mouth to a person unable to swallow
- The app must not change insulin or medication

### 8. What-if simulation

The what-if tool accepts a glucose shift from -50 to +50 mg/dL.

This is:

- A mathematical perturbation of the forecast
- A sensitivity demonstration
- A non-causal simulation
- Not a physiological simulator
- Not approved for insulin dose, meal, or medication calculations

### 9. PDF RAG chatbot

The official PDF corpus is stored in `knowledge_docs/`:

- ADA 2026 diagnosis/classification guidance
- ADA 2026 glycemic goals/hypoglycemia guidance
- ADA 2026 pregnancy guidance
- ADA 2026 obesity/weight-management guidance
- WHO insulin-use guidance for adults with Type 1 diabetes
- WHO diabetes prevention and care guidance

The PDF retrieval pipeline:

1. Extracts PDF text
2. Splits text into page and chunk records
3. Normalizes whitespace
4. Calculates lexical and phrase relevance
5. Boosts topic-specific sources
6. Penalizes unrelated documents such as pregnancy during low-glucose questions
7. Selects relevant sentences rather than dumping whole chunks
8. Returns citations containing organization, document title, year, page, and URL
9. Applies emergency and non-prescriptive safety boundaries

The chatbot supports general clinical education questions such as:

- Hypoglycemia precautions
- ADA fasting glucose thresholds
- Pregnancy glucose guidance
- Exercise and glucose control
- Weight management
- Insulin safety
- Glycemic goals
- Diabetes technology
- Current glucose status
- Forecast interpretation
- Alert interpretation

### 10. MCP-style tools

Available MCP-style tool categories include:

- Patient glucose history
- Current glucose status
- Forecast generation
- Medical knowledge retrieval
- Patient recommendations
- What-if simulation
- MCP tool discovery

The MCP implementation is a local integration boundary. MCP must not be used to prescribe insulin or medication.

---

## Backend API

The primary API is documented at `/docs`.

### Core endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Process liveness |
| GET | `/ready` | Database and artifact readiness |
| POST | `/api/patients/register` | Register a local prototype patient |
| GET/PUT | `/api/patients/me` | Profile retrieval/update |
| POST | `/api/glucose` | Add a glucose reading |
| GET | `/api/glucose/history` | Retrieve patient readings |
| POST | `/api/predict` | Generate forecast |
| GET | `/api/digital-twin` | Combined Digital Twin state |
| POST | `/api/simulate` | What-if simulation |
| GET | `/api/alerts` | Patient alerts |
| POST | `/api/chat` | Chat with RAG/MCP routing |
| GET/DELETE | `/api/chat/history` | Read or clear chat history |
| GET | `/api/knowledge` | Direct medical knowledge retrieval |
| GET | `/api/mcp/tools` | MCP tool discovery |
| POST | `/api/mcp/call` | MCP tool invocation |

The richer React frontend compatibility layer is under `/api/v1`:

- `/api/v1/auth/register`
- `/api/v1/auth/login`
- `/api/v1/readings/current`
- `/api/v1/readings`
- `/api/v1/readings/manual`
- `/api/v1/readings/cgm-sync`
- `/api/v1/forecast/latest`
- `/api/v1/whatif`
- `/api/v1/stats`
- `/api/v1/model-info`
- `/api/v1/alerts`
- `/api/v1/demo/seed`
- `/api/v1/demo/trigger`
- `/api/v1/chat`

---

## Authentication

Local development supports a patient ID header:

```text
X-Patient-ID: <patient-id>
```

Staging and production require bearer authentication. Configure:

- `AUTH_SECRET`
- `CGM_WEBHOOK_SECRET`
- `DATABASE_URL`
- `MODEL_PATH`
- `SCALER_PATH`
- `MODEL_DEVICE`
- `GOOGLE_API_KEY` if Gemini is enabled
- `GEMINI_MODEL`

Do not commit secrets or `.env` files.

---

## Frontend

### Rich React browser UI

Location:

```text
frontend/
```

Technology:

- React
- TypeScript
- Vite
- Tailwind CSS
- Lucide icons
- Browser notifications

The browser UI provides dashboard cards, 1/3/6/24-hour chart controls, 30/60-minute forecast views, what-if controls, alerts, data sources, model information, and a chat trace drawer.

### Mobile UI

Location:

```text
mobile/
```

The React Native/Expo interface provides:

- Unique patient IDs
- Six glucose timing contexts
- Reading entry
- Forecast/history display
- Chat assistant
- Secure token storage
- Browser/LAN API configuration

---

## Backend and frontend run instructions

### Backend

From the project root:

```powershell
cd C:\Users\venka\OneDrive\Desktop\Mini_Project
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --app-dir "C:\Users\venka\OneDrive\Desktop\Mini_Project" --host 0.0.0.0 --port 8002
```

Open:

- UI: http://localhost:8002
- API docs: http://localhost:8002/docs
- Health: http://localhost:8002/health

### React frontend development server

```powershell
cd C:\Users\venka\OneDrive\Desktop\Mini_Project\frontend
npm install
npm run dev
```

The development server normally runs through Vite and proxies `/api` to port 8000 unless configured otherwise.

### Production frontend build

```powershell
cd C:\Users\venka\OneDrive\Desktop\Mini_Project\frontend
npm run build
```

The built files are written to `frontend/dist/`.

### Docker

```powershell
docker compose up --build
```

Set `POSTGRES_PASSWORD`, `AUTH_SECRET`, `CGM_WEBHOOK_SECRET`, and `DATABASE_URL` in a local `.env` file before deployment.

---

## Training

### Legacy glucose-only model

```powershell
python scripts\train.py --project-dir . --sequence-length 48 --epochs 10 --batch-size 512
```

Evaluate:

```powershell
python scripts\evaluate.py --project-dir . --sequence-length 48
```

Artifacts:

```text
models/best_gru_model.pth
scalers/glucose_scaler.pkl
```

### Multimodal MetaboNet model

```powershell
python scripts\train_metabonet.py `
  --train-parquet C:\Downloads\train.parquet `
  --test-parquet C:\Downloads\test.parquet `
  --project-dir . `
  --sequence-length 48 `
  --forecast-steps 6 `
  --epochs 10 `
  --batch-size 256
```

Evaluate:

```powershell
python scripts\evaluate_metabonet.py `
  --test-parquet C:\Downloads\test.parquet `
  --project-dir .
```

Artifacts:

```text
models/best_metabonet_gru_model.pth
scalers/metabonet_scaler.pkl
results/metabonet_metrics.json
```

Increasing epochs may improve validation loss only if the learning curve indicates underfitting, and it requires holdout comparison. More epochs can also increase overfitting. The final result must be re-evaluated, not assumed to improve.

---

## Testing

Run the Python suite:

```powershell
python -m unittest discover -s tests -v
```

Test coverage includes:

- Health and root contracts
- Readiness
- Authentication
- Patient registration uniqueness
- Glucose bounds
- Exact entered-CGM value preservation
- Alert creation
- CGM webhook validation
- MCP tools
- Forecast after a single reading
- Forecast steps
- Chat persistence
- Patient-scoped chat history
- 15-15 hypoglycemia routing
- Pregnancy routing
- Exercise/general glucose routing
- Below-50/lower-than-48 routing
- PDF source retrieval
- LLM configuration and endpoint behavior

The frontend build validation is:

```powershell
cd frontend
npm run build
```

---

## Known limitations

- The project is a research prototype, not a clinically certified medical device
- Metrics are retrospective and not prospective clinical validation
- The forecast may lose accuracy outside the training distribution
- 60-minute display values are extrapolated for UI presentation
- Basal, bolus, and carbohydrate values may be missing or zero in manual captures
- PDF retrieval is lexical/ranking-based, not a full vector database or fine-tuned medical model
- PDF chunks can still be noisy after extraction
- LLM output must be validated before real-world use
- Real CGM vendor integration requires approved OAuth/webhook adapters
- Alerts require patient-specific hysteresis, review, and clinical configuration
- Patient and chatbot history require retention/privacy policies for production
- No real diagnosis or medication dosing is intended

---

## Safety and privacy

Before production use:

- Configure strong authentication and secrets
- Use HTTPS
- Enforce patient/clinician role boundaries
- Add consent and chat-history retention controls
- Audit data access
- Review all chatbot citations
- Review emergency escalation language with clinicians
- Never expose API keys or credentials
- Do not send real patient data to external LLM providers without approved privacy terms
- Replace prototype patient IDs with an identity-provider subject ID
- Add database migrations
- Validate vendor CGM adapters and event signatures

---

## Repository structure

```text
backend/
  main.py                 FastAPI routes
  knowledge.py            PDF RAG retrieval
  orchestrator.py         Chat intent routing
  model_service.py        Forecast inference
  db.py                   Database models
  health.py               Glucose classification
  auth.py                 Authentication
  agents.py               Recommendations

frontend/
  src/
    App.tsx
    components/
    services/
  dist/                   Built React assets

mobile/
  App.js                  React Native/Expo interface

scripts/
  preprocessing.py        Legacy glucose preprocessing
  train.py                Legacy GRU training
  evaluate.py             Legacy evaluation
  metabonet_preprocessing.py
  metabonet_stream.py
  train_metabonet.py
  evaluate_metabonet.py

knowledge_docs/           Official ADA/WHO PDF sources
models/                   Trained checkpoints
scalers/                  Fitted scaler artifacts
results/                  Metrics and training metadata
plots/                    Training/evaluation plots
tests/                    Backend and routing tests
```

---

## Final status

The project is a complete prototype with:

- Working FastAPI backend
- Rich React browser interface
- Mobile interface
- Active forecast model
- Exact CGM entered-value preservation
- Context-aware glucose interpretation
- Alert and what-if services
- ADA/WHO PDF retrieval
- MCP-style tool boundary
- Patient-scoped chat storage
- Automated test coverage
- Docker and deployment configuration

Before clinical or public deployment, a professional medical review, privacy review, security review, and prospective real-world validation are required.
