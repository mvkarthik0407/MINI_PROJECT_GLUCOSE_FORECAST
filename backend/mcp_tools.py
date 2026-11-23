from __future__ import annotations

from typing import Any, Callable


Tool = Callable[..., Any]


TOOLS: dict[str, dict[str, Any]] = {
    "get_patient_profile": {
        "description": "Retrieve the authenticated patient's profile.",
        "input_schema": {"type": "object", "properties": {}},
    },
    "get_glucose_history": {
        "description": "Retrieve recent glucose readings for the authenticated patient.",
        "input_schema": {"type": "object", "properties": {"limit": {"type": "integer"}}},
    },
    "predict_future_glucose": {
        "description": "Predict future glucose values using the trained GRU model.",
        "input_schema": {"type": "object", "properties": {"steps": {"type": "integer"}}},
    },
    "get_patient_risk_status": {
        "description": "Return current glucose status and recent alerts.",
        "input_schema": {"type": "object", "properties": {}},
    },
    "run_what_if_simulation": {
        "description": "Run a clearly labeled hypothetical glucose simulation.",
        "input_schema": {"type": "object", "properties": {"glucose_delta_mg_dl": {"type": "number"}}},
    },
    "retrieve_medical_knowledge": {
        "description": "Retrieve curated ADA, WHO, and IDF medical safety guidance through the RAG service, with source URLs.",
        "input_schema": {"type": "object", "properties": {"query": {"type": "string"}}},
    },
    "get_patient_recommendations": {
        "description": "Generate a preventive recommendation from the latest reading.",
        "input_schema": {"type": "object", "properties": {}},
    },
}
