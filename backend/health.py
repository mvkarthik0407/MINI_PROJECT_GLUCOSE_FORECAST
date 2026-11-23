from __future__ import annotations


def glucose_status(value: float) -> tuple[str, str]:
    if value < 54:
        return "level_2_hypoglycemia", "critical"
    if value < 70:
        return "level_1_hypoglycemia", "high"
    if value <= 180:
        return "target_range", "normal"
    if value <= 250:
        return "level_1_hyperglycemia", "high"
    return "level_2_hyperglycemia", "critical"


def alert_message(value: float, status: str) -> str:
    if status == "target_range":
        return "Glucose is currently in the configured target range."
    return (
        f"Reading {value:.1f} mg/dL is classified as {status}. "
        "Follow the clinician-approved care plan and seek medical help for severe "
        "or worsening symptoms. Do not change medication based on this prediction."
    )


TIMING_LABELS = {
    "fasting": "fasting",
    "before_meal": "before a meal",
    "after_meal": "after a meal",
    "bedtime": "at bedtime",
    "symptoms": "while symptoms are present",
    "routine": "as a routine check",
}


def interpret_glucose(value: float, timing_context: str | None = None) -> dict[str, str]:
    status, urgency = glucose_status(value)
    context = TIMING_LABELS.get(timing_context or "", "without a timing context")

    if value < 54:
        interpretation = "This reading is in the severe low range."
        next_steps = "If the person has severe symptoms, confusion, seizure, or cannot swallow safely, use emergency help and glucagon only if prescribed; do not give anything by mouth."
    elif value < 70:
        interpretation = "This reading is below 70 mg/dL, the level used to identify hypoglycemia."
        next_steps = "If conscious and able to swallow safely, follow the person's written low-glucose plan and recheck after 15 minutes."
    elif timing_context == "fasting" and value >= 126:
        interpretation = "A fasting glucose of 126 mg/dL or higher can meet an ADA laboratory diagnostic threshold, but it must be confirmed by an appropriate repeat test unless unequivocal hyperglycemia is present."
        next_steps = "Contact a healthcare professional for confirmatory testing and do not diagnose from this app reading alone."
    elif timing_context in {"before_meal", "fasting"} and value > 180:
        interpretation = "This reading is above the common general target for a fasting or pre-meal check."
        next_steps = "Check for symptoms and follow the clinician-approved monitoring or ketone plan if applicable."
    elif timing_context == "after_meal" and value > 180:
        interpretation = "This reading is above 180 mg/dL at a post-meal check."
        next_steps = "Repeat and trend with your care plan; persistent readings or symptoms should be discussed with the diabetes care team."
    elif value <= 180:
        interpretation = "This reading is within the general 70-180 mg/dL target used by this application."
        next_steps = "Continue the clinician-approved monitoring plan and consider the reading with symptoms and timing."
    else:
        interpretation = "This reading is above the general target range."
        next_steps = "Follow the person's sick-day and monitoring plan and contact a healthcare professional if high readings persist or symptoms develop."

    return {
        "status": status,
        "urgency": urgency,
        "context": context,
        "interpretation": interpretation,
        "next_steps": next_steps,
        "disclaimer": "This is general education, not a diagnosis or individualized medication advice.",
    }
