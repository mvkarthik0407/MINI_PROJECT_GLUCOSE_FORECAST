from __future__ import annotations

from dataclasses import dataclass
import re
from pathlib import Path
from functools import lru_cache

try:
    from PyPDF2 import PdfReader
except ImportError:
    PdfReader = None



@dataclass(frozen=True)
class KnowledgeResult:
    answer: str
    sources: list[str]


KNOWLEDGE = (
    {
        "id": "monitoring-basics",
        "title": "Glucose monitoring basics",
        "keywords": {"glucose", "monitor", "reading", "check", "trend"},
        "text": "Glucose readings and forecasts should be interpreted with timing, symptoms, device context, and the person's clinician-approved care plan. A forecast is an estimate, not a confirmed medical event. People with type 1 diabetes should continue regular glucose monitoring and prescribed insulin care.",
        "source": "International Diabetes Federation (IDF), Type 1 Diabetes",
        "url": "https://idf.org/about-diabetes/type-1-diabetes/",
    },
    {
        "id": "low-glucose",
        "title": "Low glucose safety",
        "keywords": {"low", "hypoglycemia", "hypo", "below", "54", "70"},
        "text": "The American Diabetes Association describes low blood glucose as below 70 mg/dL and recommends treating it promptly with fast-acting carbohydrate according to the person's diabetes care plan; its 15/15 rule uses 15 grams and a recheck after 15 minutes. This guidance is only for a person who is conscious and able to swallow safely. Severe hypoglycemia, unconsciousness, confusion, seizure, or inability to take carbohydrates requires help from another person, glucagon if prescribed, and urgent emergency help. Nothing should be given by mouth to someone who cannot swallow safely. Do not change, stop, or skip insulin or medication based only on this application.",
        "source": "American Diabetes Association (ADA), Low Blood Glucose",
        "url": "https://diabetes.org/living-with-diabetes/hypoglycemia-low-blood-glucose",
    },
    {
        "id": "high-glucose",
        "title": "High glucose safety",
        "keywords": {"high", "hyperglycemia", "hyper", "above", "180", "250", "ketone", "ketones", "dka", "vomiting"},
        "text": "Persistently high glucose, illness, or symptoms such as vomiting, heavy breathing, confusion, or dehydration may require ketone checking under the person's sick-day plan. The American Diabetes Association identifies high ketones and severe symptoms as possible diabetic ketoacidosis emergencies requiring urgent medical care. Follow the prescribed care plan and contact the healthcare team; this application does not prescribe insulin or medication changes.",
        "source": "American Diabetes Association (ADA), Managing Ketones with Diabetes",
        "url": "https://diabetes.org/living-with-diabetes/managing-ketones",
    },
    {
        "id": "forecast-safety",
        "title": "Forecast safety actions",
        "keywords": {"forecast", "predicted", "prediction", "future", "soon", "precautions"},
        "text": "A predicted low or high is an early warning, not a confirmed event. Check the current glucose using the approved device and follow the person's written care-team plan. If a predicted low is confirmed and the person is conscious and can swallow safely, keep the clinician-approved fast-acting carbohydrate plan available. If high glucose persists, follow the sick-day and ketone-checking plan; never use a forecast alone to change insulin.",
        "source": "ADA low-glucose and ketone safety guidance, applied as project forecast policy",
        "url": "https://diabetes.org/living-with-diabetes/hypoglycemia-low-blood-glucose",
    },
    {
        "id": "type-1-care",
        "title": "Type 1 diabetes insulin and monitoring",
        "keywords": {"type", "t1d", "insulin", "treatment", "care", "patient"},
        "text": "WHO guidance on Type 1 diabetes supports safe insulin use and blood-glucose self-monitoring. Insulin regimens and dose adjustments must be individualized by a healthcare professional; the chatbot must not recommend a dose change.",
        "source": "World Health Organization (WHO), Guidelines on insulin use for Type 1 diabetes in adults",
        "url": "https://www.who.int/publications/i/item/9789240126244",
    },
)


DOCUMENT_SOURCES = (
    {
        "file": "type1 diabetes.pdf",
        "title": "WHO 2026 insulin-use guideline for adults with type 1 diabetes",
        "source": "World Health Organization",
        "year": "2026",
        "url": "https://www.who.int/publications/i/item/9789240126244",
    },
    {
        "file": "type 1 diabetes 4.pdf",
        "title": "ADA 2026 diagnosis and classification of diabetes",
        "source": "American Diabetes Association",
        "year": "2026",
        "url": "https://diabetesjournals.org/care/issue/49/Supplement_1",
    },
    {
        "file": "tyoe 1 diabetes 6.pdf",
        "title": "ADA 2026 glycemic goals and hypoglycemia",
        "source": "American Diabetes Association",
        "year": "2026",
        "url": "https://diabetesjournals.org/care/issue/49/Supplement_1",
    },
    {
        "file": "type 1 diabetes 5.pdf",
        "title": "ADA 2026 pregnancy and diabetes guidance",
        "source": "American Diabetes Association",
        "year": "2026",
        "url": "https://diabetesjournals.org/care/issue/49/Supplement_1",
    },
    {
        "file": "type 1 diabetes  3.pdf",
        "title": "ADA 2026 obesity and weight management",
        "source": "American Diabetes Association",
        "year": "2026",
        "url": "https://diabetesjournals.org/care/issue/49/Supplement_1",
    },
    {
        "file": "type 1 diabetes 2.pdf",
        "title": "WHO diabetes prevention and care guidance",
        "source": "World Health Organization",
        "year": "2006",
        "url": "https://www.who.int/publications/i/item/9241594934",
    },
)


@lru_cache(maxsize=1)
def retrieve_document_chunks() -> tuple[dict[str, object], ...]:
    if PdfReader is None:
        return ()
    docs_dir = Path(__file__).resolve().parents[1] / "knowledge_docs"
    chunks: list[dict[str, object]] = []
    for document in DOCUMENT_SOURCES:
        path = docs_dir / document["file"]
        if not path.exists():
            continue
        try:
            reader = PdfReader(str(path))
            for page_number, page in enumerate(reader.pages, start=1):
                text = (page.extract_text() or "").strip()
                if not text:
                    continue
                normalized = re.sub(r"\s+", " ", text)
                for start in range(0, len(normalized), 900):
                    chunk = normalized[start:start + 900].strip()
                    if len(chunk) >= 80:
                        chunks.append({
                            **document,
                            "page": page_number,
                            "text": chunk,
                        })
        except Exception:
            continue
    return tuple(chunks)


def select_relevant_sentences(text: str, query_lower: str, limit: int = 3) -> list[str]:
    normalized = re.sub(r"\s+", " ", text)
    sentences = [
        sentence.strip()
        for sentence in re.split(r"(?<=[.!?])\s+|(?:\n|;)\s*", normalized)
        if len(sentence.strip()) >= 35
    ]
    query_terms = {
        term
        for term in re.findall(r"[a-z0-9]+", query_lower)
        if len(term) >= 3 and not term.isdigit()
    }
    ranked: list[tuple[int, str]] = []
    for sentence in sentences:
        sentence_lower = sentence.lower()
        score = sum(4 for term in query_terms if term in sentence_lower)
        for phrase in (
            "hypoglycemia",
            "low glucose",
            "blood glucose",
            "glucagon",
            "15 minutes",
            "conscious",
            "unconscious",
            "seizure",
            "treatment",
            "glucose <70",
        ):
            if phrase in query_lower and phrase in sentence_lower:
                score += 12
        if "48" in query_lower and "hypoglycemia" in sentence_lower:
            score += 20
        ranked.append((score, sentence))
    ranked.sort(key=lambda item: item[0], reverse=True)
    selected = []
    for score, sentence in ranked:
        if score <= 0:
            continue
        if sentence not in selected:
            selected.append(sentence)
        if len(selected) >= limit:
            break
    if not selected:
        selected = [normalized[:700]]
    return selected


def retrieve_medical_knowledge(query: str) -> KnowledgeResult:
    stopwords = {
        "what", "should", "about", "know", "do", "for", "i", "my",
        "is", "are", "can", "please", "tell", "me",
    }
    tokens = {
        token
        for token in re.findall(r"[a-z0-9]+", query.lower())
        if token not in stopwords
    }
    query_lower = query.lower()
    document_chunks = retrieve_document_chunks()
    if document_chunks:
        ranked_documents = []
        for item in document_chunks:
            text_lower = str(item["text"]).lower()
            lexical_score = sum(3 for token in tokens if token in text_lower)
            bigram_score = 0
            query_terms = re.findall(r"[a-z0-9]+", query_lower)
            for index in range(len(query_terms) - 1):
                bigram = f"{query_terms[index]} {query_terms[index + 1]}"
                if bigram in text_lower:
                    bigram_score += 8
            phrase_score = sum(
                5
                for phrase in (
                    "low glucose", "hypoglycemia", "high glucose", "ketone",
                    "fasting", "pregnancy", "insulin", "weight", "glucose",
                )
                if phrase in query_lower and phrase in text_lower
            )
            if "diagnosis" in query_lower and "diagnos" in text_lower:
                phrase_score += 12
            if "time in range" in query_lower and "time in range" in text_lower:
                phrase_score += 20
            if "glucose target" in query_lower and "glucose target" in text_lower:
                phrase_score += 15
            if "pregnancy" in query_lower and "pregnancy" in str(item["title"]).lower():
                phrase_score += 20
            if "insulin" in query_lower and "insulin" in str(item["title"]).lower():
                phrase_score += 20
            if "weight" in query_lower or "obesity" in query_lower:
                if "obesity" in str(item["title"]).lower() or "weight" in str(item["title"]).lower():
                    phrase_score += 20
            if "fasting" in query_lower or "diagnosis" in query_lower:
                if "diagnosis" in str(item["title"]).lower():
                    phrase_score += 20
            low_query = any(
                term in query_lower
                for term in ("low glucose", "hypoglycemia", "hypo", "below 50", "below 54", "50", "48")
            )
            if low_query:
                if "hypoglycemia" in text_lower or "hypoglycemia" in str(item["title"]).lower():
                    phrase_score += 30
                if "glucose <70" in text_lower or "15 minutes after initial treatment" in text_lower:
                    phrase_score += 40
                if "glucagon" in text_lower:
                    phrase_score += 12
                if "diagnosis" in str(item["title"]).lower() and "hypoglycemia" not in text_lower:
                    phrase_score -= 15
                if "pregnancy" in str(item["title"]).lower():
                    phrase_score -= 40
                if "ketoacidosis" in text_lower and "dka" not in query_lower and "ketoacidosis" not in query_lower:
                    phrase_score -= 25
            ranked_documents.append((lexical_score + bigram_score + phrase_score, item))
        ranked_documents.sort(key=lambda entry: entry[0], reverse=True)
        matches = [item for score, item in ranked_documents if score > 0][:3]
        if matches:
            clean_snippets: list[str] = []
            for item in matches:
                relevant_sentences = select_relevant_sentences(
                    str(item["text"]),
                    query_lower,
                    limit=2,
                )
                for sentence in relevant_sentences:
                    sentence = sentence.encode("ascii", "ignore").decode("ascii").strip()
                    if sentence and len(sentence) >= 35:
                        clean_snippets.append(
                            f"{item['title']} (page {item['page']}): {sentence}"
                        )
                        break
                if clean_snippets and len(clean_snippets) >= 3:
                    break
            evidence = "\n\n".join(clean_snippets[:3])
            if not evidence:
                fallback_snippets = []
                for item in matches:
                    snippet = re.sub(r"\s+", " ", str(item["text"]))
                    snippet = snippet.encode("ascii", "ignore").decode("ascii")
                    snippet = snippet[:700].strip()
                    if snippet:
                        fallback_snippets.append(
                            f"{item['title']} (page {item['page']}): {snippet}"
                        )
                evidence = "\n\n".join(fallback_snippets[:3])
            severe_low = (
                "50" in query_lower
                or "48" in query_lower
                or "54 mg" in query_lower
                or "severe hypoglycemia" in query_lower
            )
            emergency_high = any(
                word in query_lower
                for word in ("confusion", "unconscious", "seizure", "fainting", "vomiting", "dka")
            )
            if severe_low:
                answer = (
                    "This is a potentially urgent low-glucose scenario. Follow the "
                    "person's clinician-approved low-glucose plan. If the person is "
                    "conscious and able to swallow, the 15-15 approach may be used only "
                    "if it is in that written plan: take fast-acting carbohydrate, then "
                    "recheck after about 15 minutes. If confused, unconscious, seizing, "
                    "unable to swallow, or repeatedly low, seek urgent emergency help; "
                    "use prescribed glucagon only according to training and the written plan.\n\n"
                    "Retrieved official guidance:\n"
                    f"{evidence}\n\n"
                    "This is general evidence support, not a diagnosis or medication dose."
                )
            elif emergency_high:
                answer = (
                    "Because severe symptoms are mentioned, seek urgent medical help "
                    "rather than relying on this app. Do not change insulin or medication "
                    "without the clinician-approved plan.\n\n"
                    "Retrieved official guidance:\n"
                    f"{evidence}"
                )
            else:
                answer = (
                    "Based on the retrieved official ADA/WHO guidance:\n\n"
                    f"{evidence}\n\n"
                    "Use this with the person's clinician-approved care plan. "
                    "The retrieved passages are evidence references, not a diagnosis "
                    "or an instruction to change medication."
                )
            sources = [
                f"{item['source']} - {item['title']} ({item['year']}), page {item['page']} - {item['url']}"
                for item in matches
            ]
            if any(token in {"low", "hypoglycemia", "hypo", "forecast"} for token in tokens):
                sources.append(
                    "American Diabetes Association (ADA), Low Blood Glucose — "
                    "https://diabetes.org/living-with-diabetes/hypoglycemia-low-blood-glucose"
                )
            return KnowledgeResult(answer=answer, sources=sources)

    ranked = sorted(
        KNOWLEDGE,
        key=lambda item: len(tokens.intersection(item["keywords"])),
        reverse=True,
    )
    matches = [item for item in ranked if tokens.intersection(item["keywords"])]
    if matches:
        return KnowledgeResult(
            answer=" ".join(item["text"] for item in matches[:2]),
            sources=[f"{item['source']} — {item['url']}" for item in matches[:2]],
        )
    return KnowledgeResult(
        answer=(
            "No curated article matched this question. Ask about glucose monitoring, "
            "low glucose safety, or high glucose safety. This application does not "
            "replace professional medical advice."
        ),
        sources=[
            "ADA, WHO, and IDF curated safety guidance; "
            "ask about glucose monitoring, low glucose, high glucose, ketones, or Type 1 care"
        ],
    )
