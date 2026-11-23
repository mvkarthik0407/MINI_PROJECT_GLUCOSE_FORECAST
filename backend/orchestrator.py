from __future__ import annotations

from dataclasses import dataclass
import re


@dataclass
class OrchestratorResult:
    response: str
    tools_used: list[str]
    sources: list[str]


def route_message(message: str) -> str:
    text = message.lower()
    tokens = set(re.findall(r"[a-z0-9]+", text))
    urgent_low_context = (
        "what if" in text
        or "below" in text
        or "less than" in text
        or "under" in text
        or "lower than" in text
    ) and any(
        term in text
        for term in ("glucose", "blood sugar", "sugar", "hypo", "low")
    )
    if urgent_low_context and any(
        value in text
        for value in ("48", "50", "54", "70", "below", "under", "lower", "less", "low", "hypogly")
    ):
        return "retrieve_medical_knowledge"
    forecast_requested = tokens.intersection({"predict", "prediction", "forecast", "future", "next"})
    if forecast_requested:
        return "predict_future_glucose"
    if tokens.intersection({"current", "latest", "now"}):
        return "get_patient_risk_status"
    if (
        "what if" in text
        and "glucose" in text
        and not any(word in text for word in ("below", "above", "under", "over", "low", "high", "hypo", "hyper"))
        and re.search(r"\b\d+\b", text)
    ):
        return "run_what_if_simulation"
    medical_topics = tokens.intersection({
        "pregnancy", "pregnant", "insulin", "ketone", "ketones",
        "diagnosis", "fasting", "weight", "obesity", "hypoglycemia",
        "hyperglycemia", "glucose", "diabetes", "exercise", "diet",
        "nutrition", "metformin", "glp1", "a1c", "hba1c", "tir",
        "time", "target", "targets", "guidelines", "guidance",
        "hypo", "low", "high",
    })
    if medical_topics:
        return "retrieve_medical_knowledge"
    safety_topic = tokens.intersection({"low", "hypoglycemia", "hypo", "high", "hyperglycemia", "hyper"})
    asks_for_guidance = (
        "what can i do" in text
        or "what should i do" in text
        or "how can i" in text
        or "how do i" in text
    )
    forecast_requested = tokens.intersection({"predict", "prediction", "forecast", "future", "next"})
    if forecast_requested:
        return "predict_future_glucose"
    if safety_topic and asks_for_guidance:
        return "retrieve_medical_knowledge"
    if tokens.intersection({"recommend", "recommendation", "suggestion", "advice"}):
        return "get_patient_recommendations"
    if tokens.intersection({"simulate", "simulation"}) or "what if" in text or "what-if" in text:
        return "run_what_if_simulation"
    if tokens.intersection({"current", "latest", "now"}):
        return "get_patient_risk_status"
    if tokens.intersection({"why", "explain", "guideline"}) or "what should" in text:
        return "retrieve_medical_knowledge"
    return "get_patient_risk_status"
