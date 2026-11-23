from __future__ import annotations

import json
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from .config import GEMINI_MODEL, GOOGLE_API_KEY


SYSTEM_PROMPT = """You are the Diabetes Digital Twin assistant.
Answer using the supplied authenticated patient context and retrieved safety
guidance. Glucose forecasts are estimates, not confirmed events. Never
diagnose diabetes and never prescribe, stop, skip, or change insulin, medication,
or treatment. If someone is unconscious, having a seizure, confused, or unable
to swallow safely, say not to give anything by mouth and direct the user to
emergency help. For a confirmed low in a conscious person, describe only the
retrieved clinician-approved fast-acting-carbohydrate guidance. For persistent
high glucose or illness, mention ketone checking only according to the user's
care plan. For severe symptoms or inability to respond safely, direct the user
to urgent medical help. Be clear, concise, and say when available data cannot
answer the question."""


def llm_is_configured() -> bool:
    return bool(GOOGLE_API_KEY.strip())


def gemini_endpoint() -> str:
    model = quote(GEMINI_MODEL, safe="")
    return f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GOOGLE_API_KEY}"


def generate_answer(question: str, patient_context: str, rag_context: str) -> str:
    if not llm_is_configured():
        raise RuntimeError("Google AI Studio is not configured.")
    payload = {
        "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{
            "role": "user",
            "parts": [{
                "text": (
                    f"Patient context (authenticated user only):\n{patient_context}\n\n"
                    f"Retrieved RAG guidance:\n{rag_context}\n\n"
                    f"Question:\n{question}"
                ),
            }],
        }],
        "generationConfig": {"temperature": 0.1},
    }
    request = Request(
        gemini_endpoint(),
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=30) as response:
            result = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
        raise RuntimeError("Google AI Studio could not be reached.") from error
    try:
        answer = result["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError) as error:
        raise RuntimeError("Google AI Studio returned an invalid response.") from error
    if not isinstance(answer, str) or not answer.strip():
        raise RuntimeError("Google AI Studio returned an empty response.")
    return answer.strip()
