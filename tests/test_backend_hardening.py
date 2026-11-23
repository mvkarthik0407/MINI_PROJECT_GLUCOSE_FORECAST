import unittest
import hashlib
import hmac
import json
from uuid import uuid4
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.main import app


class BackendHardeningTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_forecast_works_after_single_glucose_reading(self):
        patient_id = f"forecast-patient-{uuid4().hex[:10]}"
        headers = {"X-Patient-ID": patient_id}
        self.client.put(
            "/api/patients/me",
            headers=headers,
            json={"patient_id": patient_id, "sex": "F", "birth_year": 2000},
        )
        reading = self.client.post(
            "/api/glucose",
            headers=headers,
            json={
                "measured_at": "2026-11-11T08:00:00Z",
                "glucose_mg_dl": 125,
                "source": "test",
                "timing_context": "fasting",
            },
        )
        self.assertEqual(reading.status_code, 200)
        forecast = self.client.post(
            "/api/predict?steps=6",
            headers=headers,
        )
        self.assertEqual(forecast.status_code, 200)
        self.assertGreaterEqual(len(forecast.json()["predictions"]), 1)

    def test_patient_registration_requires_unique_id(self):
        patient_id = f"DT-{uuid4().hex[:12].upper()}"
        first = self.client.post("/api/patients/register", json={"patient_id": patient_id})
        self.assertEqual(first.status_code, 200)
        duplicate = self.client.post("/api/patients/register", json={"patient_id": patient_id})
        self.assertEqual(duplicate.status_code, 409)

    def test_production_requires_bearer_authentication(self):
        with patch("backend.main.production_authentication_required", return_value=True):
            response = self.client.get(
                "/api/knowledge",
                params={"query": "low glucose"},
                headers={"X-Patient-ID": "LIB193263"},
            )
        self.assertEqual(response.status_code, 401)
        self.assertIn("bearer", response.json()["detail"].lower())

    def test_glucose_input_boundaries_and_alert_creation(self):
        patient_id = "hardening-alert-patient"
        headers = {"X-Patient-ID": patient_id}

        invalid = self.client.post(
            "/api/glucose",
            headers=headers,
            json={
                "measured_at": "2026-11-11T08:00:00Z",
                "glucose_mg_dl": 601,
                "source": "test",
            },
        )
        self.assertEqual(invalid.status_code, 422)

        valid = self.client.post(
            "/api/glucose",
            headers=headers,
            json={
                "measured_at": "2026-11-11T08:00:00Z",
                "glucose_mg_dl": 53,
                "source": "test",
            },
        )
        self.assertEqual(valid.status_code, 200)
        self.assertEqual(valid.json()["urgency"], "critical")

        alerts = self.client.get("/api/alerts", headers=headers)
        self.assertEqual(alerts.status_code, 200)
        self.assertEqual(alerts.json()[0]["category"], "level_2_hypoglycemia")

    def test_mcp_rejects_unknown_tools_and_unbounded_steps(self):
        headers = {"X-Patient-ID": "LIB193263"}
        unknown = self.client.post(
            "/api/mcp/call",
            headers=headers,
            json={"name": "unknown_tool", "arguments": {}},
        )
        self.assertEqual(unknown.status_code, 404)

        invalid_steps = self.client.post(
            "/api/mcp/call",
            headers=headers,
            json={"name": "predict_future_glucose", "arguments": {"steps": 49}},
        )
        self.assertEqual(invalid_steps.status_code, 422)

    def test_chat_history_is_scoped_to_patient_id(self):
        first = self.client.post(
            "/api/chat",
            headers={"X-Patient-ID": "hardening-patient-a"},
            json={"message": "What is my current glucose?"},
        )
        self.assertEqual(first.status_code, 200)

        other_history = self.client.get(
            "/api/chat/history",
            headers={"X-Patient-ID": "hardening-patient-b"},
        )
        self.assertEqual(other_history.status_code, 200)
        self.assertFalse(
            any(item["content"] == "What is my current glucose?" for item in other_history.json())
        )

    def test_cgm_connection_webhook_is_signed_normalized_and_idempotent(self):
        patient_id = f"hardening-cgm-{uuid4().hex}"
        provider = "demo"
        external_id = f"device-user-{uuid4().hex}"
        secret = "local-cgm-webhook-secret"
        payload = {
            "event_id": f"demo-event-{uuid4().hex}",
            "measured_at": "2026-11-11T08:00:00Z",
            "glucose_mg_dl": 125,
        }
        body = json.dumps(payload).encode("utf-8")
        signature = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()

        with patch("backend.main.CGM_WEBHOOK_SECRET", secret):
            connection = self.client.post(
                "/api/cgm/connections",
                headers={"X-Patient-ID": patient_id},
                json={"provider": provider, "external_patient_id": external_id},
            )
            self.assertEqual(connection.status_code, 404)

            self.client.put(
                "/api/patients/me",
                headers={"X-Patient-ID": patient_id},
                json={"patient_id": patient_id},
            )
            connection = self.client.post(
                "/api/cgm/connections",
                headers={"X-Patient-ID": patient_id},
                json={"provider": provider, "external_patient_id": external_id},
            )
            self.assertEqual(connection.status_code, 200)

            headers = {
                "X-CGM-Signature": signature,
                "X-CGM-Provider": provider,
                "X-CGM-Patient-ID": external_id,
                "Content-Type": "application/json",
            }
            accepted = self.client.post("/api/cgm/webhook", headers=headers, content=body)
            self.assertEqual(accepted.status_code, 200)
            self.assertEqual(accepted.json()["status"], "accepted")

            duplicate = self.client.post("/api/cgm/webhook", headers=headers, content=body)
            self.assertEqual(duplicate.status_code, 200)
            self.assertEqual(duplicate.json()["status"], "duplicate")

    def test_cgm_webhook_rejects_invalid_signature(self):
        with patch("backend.main.CGM_WEBHOOK_SECRET", "secret"):
            response = self.client.post(
                "/api/cgm/webhook",
                headers={
                    "X-CGM-Signature": "sha256=invalid",
                    "X-CGM-Provider": "demo",
                    "X-CGM-Patient-ID": "unknown",
                },
                content=b"{}",
            )
        self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
