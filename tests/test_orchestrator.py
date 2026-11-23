import unittest

from backend.orchestrator import route_message


class RouteMessageTests(unittest.TestCase):
    def test_knowledge_question_containing_know_is_not_treated_as_now(self):
        self.assertEqual(
            route_message("What should I know about low glucose?"),
            "retrieve_medical_knowledge",
        )

    def test_current_glucose_question_uses_risk_tool(self):
        self.assertEqual(
            route_message("What is my current glucose?"),
            "get_patient_risk_status",
        )

    def test_what_if_question_uses_simulation_tool(self):
        self.assertEqual(
            route_message("What if glucose changes by 20?"),
            "run_what_if_simulation",
        )

    def test_low_glucose_action_question_uses_safety_knowledge(self):
        self.assertEqual(
            route_message("What if my glucose levels are low, what can I do to get normal?"),
            "retrieve_medical_knowledge",
        )

    def test_forecast_safety_question_uses_forecast_tool(self):
        self.assertEqual(
            route_message("My forecast is low, what should I do?"),
            "predict_future_glucose",
        )

    def test_pregnancy_question_uses_medical_knowledge(self):
        self.assertEqual(
            route_message("What are the pregnancy glucose recommendations?"),
            "retrieve_medical_knowledge",
        )

    def test_general_glucose_guidance_question_uses_medical_knowledge(self):
        self.assertEqual(
            route_message("What exercise is useful for improving my glucose control?"),
            "retrieve_medical_knowledge",
        )

    def test_lower_than_48_question_uses_medical_knowledge(self):
        self.assertEqual(
            route_message(
                "what if my glucose level lower than 48, what precautions should I take?"
            ),
            "retrieve_medical_knowledge",
        )

    def test_below_50_safety_question_uses_medical_knowledge(self):
        self.assertEqual(
            route_message(
                "What if my glucose values is below than the 50, what precautions should I take?"
            ),
            "retrieve_medical_knowledge",
        )


if __name__ == "__main__":
    unittest.main()
