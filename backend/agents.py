from __future__ import annotations

from datetime import datetime

from .health import glucose_status
from .knowledge import retrieve_medical_knowledge


def recommendation_for_glucose(value: float) -> dict[str, str]:
    status, urgency = glucose_status(value)
    if status == "target_range":
        message = "Continue the clinician-approved monitoring and care plan."
    elif "hypoglycemia" in status:
        message = "Follow your clinician-approved low-glucose plan and seek help for severe or worsening symptoms."
    else:
        message = "Follow your clinician-approved high-glucose plan and contact your healthcare professional if it persists."
    return {"status": status, "urgency": urgency, "recommendation": message}


def recommendation_for_forecast(values: list[dict]) -> str:
    abnormal = [
        item for item in values
        if item.get("status") in {
            "level_1_hypoglycemia",
            "level_2_hypoglycemia",
            "level_1_hyperglycemia",
            "level_2_hyperglycemia",
        }
    ]
    if not abnormal:
        return (
            "The forecast remains within the configured target range. "
            "Continue monitoring and follow the clinician-approved care plan."
        )

    low = [item for item in abnormal if "hypoglycemia" in str(item.get("status"))]
    high = [item for item in abnormal if "hyperglycemia" in str(item.get("status"))]
    concerns: list[str] = []
    if low:
        lowest = min(low, key=lambda item: float(item["glucose_mg_dl"]))
        concerns.append(
            f"low glucose may occur, with a minimum forecast of "
            f"{float(lowest['glucose_mg_dl']):.1f} mg/dL"
        )
    if high:
        highest = max(high, key=lambda item: float(item["glucose_mg_dl"]))
        concerns.append(
            f"high glucose may occur, with a maximum forecast of "
            f"{float(highest['glucose_mg_dl']):.1f} mg/dL"
        )
    return (
        f"Forecast warning: {' and '.join(concerns)}. Verify the trend with your "
        "CGM or an approved glucose check and follow your clinician-approved "
        "plan. If you have severe symptoms or cannot respond safely, seek urgent "
        "medical help. Do not change insulin or medication based only on this "
        "forecast."
    )


def knowledge_agent(query: str) -> dict[str, object]:
    result = retrieve_medical_knowledge(query)
    return {"answer": result.answer, "sources": result.sources, "generated_at": datetime.utcnow()}
