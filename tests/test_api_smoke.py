import unittest

from fastapi.testclient import TestClient

from backend.main import app


class ApiSmokeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_health_and_root_contracts(self):
        health = self.client.get("/health")
        self.assertEqual(health.status_code, 200)
        self.assertEqual(health.json(), {"status": "ok"})
        self.assertEqual(health.headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(health.headers["X-Frame-Options"], "DENY")
        self.assertEqual(health.headers["Referrer-Policy"], "no-referrer")

        root = self.client.get("/")
        self.assertEqual(root.status_code, 200)
        self.assertIn("text/html", root.headers["content-type"])

    def test_readiness_contract(self):
        response = self.client.get("/ready")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ready")
        self.assertEqual(response.json()["database"], "ok")

    def test_mcp_discovery_is_public(self):
        response = self.client.get("/api/mcp/tools")
        self.assertEqual(response.status_code, 200)
        names = {item["name"] for item in response.json()["tools"]}
        self.assertIn("get_patient_risk_status", names)
        self.assertIn("retrieve_medical_knowledge", names)

    def test_react_ui_api_register_seed_and_forecast_contract(self):
        registered = self.client.post(
            "/api/v1/auth/register",
            json={
                "email": "react-ui-audit@example.com",
                "password": "AuditPass123!",
                "age": 30,
                "gender": "female",
            },
        )
        self.assertEqual(registered.status_code, 200)
        token = registered.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        seeded = self.client.post(
            "/api/v1/demo/seed?num_readings=36&target_value=120",
            headers=headers,
        )
        self.assertEqual(seeded.status_code, 200)

        forecast = self.client.get("/api/v1/forecast/latest", headers=headers)
        self.assertEqual(forecast.status_code, 200)
        self.assertTrue(forecast.json()["is_available"])
        self.assertEqual(len(forecast.json()["predicted_values_mg_dl"]), 12)

    def test_cgm_sync_current_reading_remains_exactly_entered_value(self):
        registered = self.client.post(
            "/api/v1/auth/register",
            json={
                "email": "exact-cgm-value@example.com",
                "password": "AuditPass123!",
                "age": 30,
                "gender": "female",
            },
        )
        headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}
        synced = self.client.post(
            "/api/v1/readings/cgm-sync",
            headers=headers,
            json={"value": 115, "unit": "mg/dL"},
        )
        self.assertEqual(synced.status_code, 200)
        current = self.client.get("/api/v1/readings/current", headers=headers)
        self.assertEqual(current.status_code, 200)
        self.assertEqual(current.json()["value_mg_dl"], 115)

    def test_entered_115_stays_near_115_for_first_three_forecast_steps(self):
        registered = self.client.post(
            "/api/v1/auth/register",
            json={
                "email": "flat-forecast-115@example.com",
                "password": "AuditPass123!",
                "age": 30,
                "gender": "female",
            },
        )
        headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}
        self.client.post(
            "/api/v1/readings/cgm-sync",
            headers=headers,
            json={"value": 115, "unit": "mg/dL"},
        )
        forecast = self.client.get("/api/v1/forecast/latest", headers=headers)
        values = forecast.json()["predicted_values_mg_dl"]
        self.assertGreaterEqual(len(values), 3)
        self.assertTrue(all(abs(value - 115) <= 3 for value in values[:3]))

    def test_knowledge_endpoint_requires_patient_identity(self):
        response = self.client.get("/api/knowledge", params={"query": "low glucose"})
        self.assertEqual(response.status_code, 401)

        response = self.client.get(
            "/api/knowledge",
            params={"query": "low glucose"},
            headers={"X-Patient-ID": "LIB193263"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["sources"])

    def test_forecast_knowledge_returns_official_source(self):
        response = self.client.get(
            "/api/knowledge",
            params={"query": "forecast precautions for low glucose"},
            headers={"X-Patient-ID": "LIB193263"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("diabetes.org", "\n".join(response.json()["sources"]))

    def test_below_50_chat_question_returns_low_glucose_safety_rag(self):
        response = self.client.post(
            "/api/v1/auth/register",
            json={
                "email": "below-50-rag@example.com",
                "password": "AuditPass123!",
                "age": 30,
                "gender": "female",
            },
        )
        headers = {"Authorization": f"Bearer {response.json()['access_token']}"}
        chat = self.client.post(
            "/api/v1/chat",
            headers=headers,
            json={
                "message": "What if my glucose values is below than the 50, what precautions should I take?"
            },
        )
        self.assertEqual(chat.status_code, 200)
        body = chat.json()
        self.assertIn("15-15", body["response"])
        self.assertIn("emergency", body["response"].lower())
        self.assertTrue(body["sources_used"])

    def test_lower_than_48_chat_returns_hypoglycemia_evidence_not_pregnancy(self):
        response = self.client.post(
            "/api/v1/auth/register",
            json={
                "email": "lower-48-rag@example.com",
                "password": "AuditPass123!",
                "age": 30,
                "gender": "female",
            },
        )
        headers = {"Authorization": f"Bearer {response.json()['access_token']}"}
        chat = self.client.post(
            "/api/v1/chat",
            headers=headers,
            json={
                "message": "what if my glucose level lower than 48, what precautions should I take?"
            },
        )
        body = chat.json()
        answer = body["response"].lower()
        self.assertNotIn("pregnancy", answer)
        self.assertIn("hypogly", answer)
        self.assertIn("emergency", answer)
        self.assertTrue(body["sources_used"])

    def test_chat_returns_document_grounded_actionable_low_glucose_guidance(self):
        response = self.client.post(
            "/api/chat",
            json={"message": "What should I do for low glucose?"},
            headers={"X-Patient-ID": "LIB193263"},
        )
        self.assertEqual(response.status_code, 200)
        answer = response.json()["response"].lower()
        self.assertIn("hypogly", answer)
        self.assertTrue(response.json()["sources"])

    def test_chat_persists_and_returns_patient_scoped_history(self):
        response = self.client.post(
            "/api/chat",
            json={"message": "What should I know about low glucose?"},
            headers={"X-Patient-ID": "LIB193263"},
        )
        self.assertEqual(response.status_code, 200)
        history = self.client.get(
            "/api/chat/history",
            headers={"X-Patient-ID": "LIB193263"},
        )
        self.assertEqual(history.status_code, 200)
        self.assertGreaterEqual(len(history.json()), 2)
        self.assertEqual(history.json()[-2]["role"], "user")
        self.assertEqual(history.json()[-1]["role"], "assistant")

    def test_chat_history_clear_requires_identity(self):
        response = self.client.delete("/api/chat/history")
        self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
