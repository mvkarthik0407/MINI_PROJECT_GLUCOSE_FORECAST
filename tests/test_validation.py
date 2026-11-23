import unittest
from datetime import datetime, timezone

from fastapi import HTTPException

from backend.auth import create_access_token, patient_from_token
from backend.llm import gemini_endpoint, llm_is_configured
from backend.main import bounded_argument, storage_timestamp
from backend.schemas import GlucoseReadingInput, PatientProfile
from backend.health import interpret_glucose


class ValidationTests(unittest.TestCase):
    def test_all_glucose_timing_context_options_have_interpretations(self):
        for timing in ("fasting", "before_meal", "after_meal", "bedtime", "symptoms", "routine"):
            with self.subTest(timing=timing):
                result = interpret_glucose(130, timing)
                self.assertIn("interpretation", result)
                self.assertIn("next_steps", result)

    def test_mcp_integer_argument_is_bounded(self):
        self.assertEqual(bounded_argument({"steps": "12"}, "steps", 12, 1, 48), 12)

    def test_mcp_integer_argument_rejects_invalid_values(self):
        for value in ("invalid", 0, 49, True):
            with self.subTest(value=value), self.assertRaises(HTTPException):
                bounded_argument({"steps": value}, "steps", 12, 1, 48)

    def test_glucose_source_and_patient_profile_have_storage_limits(self):
        reading = GlucoseReadingInput(
            measured_at=datetime(2026, 11, 9, 12, 0),
            glucose_mg_dl=105,
            source="cgm",
        )
        self.assertEqual(reading.source, "cgm")
        with self.assertRaises(ValueError):
            PatientProfile(patient_id="", birth_year=1965)

    def test_timezone_aware_timestamp_is_stored_as_utc_without_timezone(self):
        value = datetime(2026, 11, 9, 17, 10, tzinfo=timezone.utc)
        normalized = storage_timestamp(value)
        self.assertEqual(normalized, datetime(2026, 11, 9, 17, 10))
        self.assertIsNone(normalized.tzinfo)

    def test_signed_access_token_round_trips_patient_identity(self):
        import backend.auth as auth

        previous_secret = auth.AUTH_SECRET
        auth.AUTH_SECRET = "test-secret-with-at-least-32-bytes"
        try:
            token = create_access_token("LIB193263", expires_minutes=5)
            self.assertEqual(patient_from_token(token), "LIB193263")
        finally:
            auth.AUTH_SECRET = previous_secret

    def test_llm_is_disabled_without_provider_credentials(self):
        self.assertFalse(llm_is_configured())

    def test_gemini_endpoint_uses_configured_model(self):
        self.assertIn("gemini-2.5-flash", gemini_endpoint())


if __name__ == "__main__":
    unittest.main()
