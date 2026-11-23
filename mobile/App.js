import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SecureStore from "expo-secure-store";
import * as Notifications from "expo-notifications";

import { createApi } from "./api.js";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://192.168.0.105:8001";
const TOKEN_KEY = "diabetes-digital-twin-access-token";
const PATIENT_KEY = "diabetes-digital-twin-patient-id";
const tabs = ["Home", "History", "Forecast", "Chat", "Settings"];
const timingOptions = [
  { value: "fasting", label: "Fasting" },
  { value: "before_meal", label: "Before meal" },
  { value: "after_meal", label: "After meal" },
  { value: "bedtime", label: "Bedtime" },
  { value: "symptoms", label: "While symptomatic" },
  { value: "routine", label: "Routine check" },
];

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowAlert: true,
  }),
});

function formatGlucose(value) {
  return value == null ? "--" : `${Number(value).toFixed(1)} mg/dL`;
}

function formatStatus(value) {
  return value ? value.replaceAll("_", " ") : "No data";
}

function formatDate(value) {
  const timestamp = String(value);
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp) ? timestamp : `${timestamp}Z`;
  return new Date(normalized).toLocaleString();
}

function GlucoseChart({ readings, predictions }) {
  const recent = readings.slice(-24);
  const forecast = predictions.slice(0, 12);
  const values = [...recent, ...forecast].map((item) => Number(item.glucose_mg_dl)).filter(Number.isFinite);
  if (!values.length) {
    return <Text style={styles.body}>No glucose readings available for the trend graph.</Text>;
  }
  const min = Math.min(40, ...values);
  const max = Math.max(220, ...values);
  const range = Math.max(max - min, 1);
  const points = values.map((value, index) => ({
    left: `${(index / Math.max(values.length - 1, 1)) * 100}%`,
    bottom: `${((value - min) / range) * 100}%`,
    forecast: index >= recent.length,
  }));
  return (
    <View>
      <View style={styles.chart} accessibilityLabel="Glucose trend graph">
        <View style={[styles.targetLine, { bottom: `${((70 - min) / range) * 100}%` }]} />
        <View style={[styles.highLine, { bottom: `${((180 - min) / range) * 100}%` }]} />
        {points.map((point, index) => (
          <View
            key={`${point.left}-${index}`}
            style={[
              styles.chartPoint,
              { left: point.left, bottom: point.bottom },
              point.forecast && styles.forecastPoint,
            ]}
          />
        ))}
      </View>
      <View style={styles.chartLabels}>
        <Text style={styles.chartLabel}>{max.toFixed(0)} mg/dL</Text>
        <Text style={styles.chartLabel}>70 target low · 180 target high</Text>
        <Text style={styles.chartLabel}>{min.toFixed(0)} mg/dL</Text>
      </View>
      <Text style={styles.body}>Blue: recorded readings · Orange: forecast estimates</Text>
    </View>
  );
}

function Button({ children, onPress, disabled = false, secondary = false }) {
  return (
    <Pressable
      style={[styles.button, secondary && styles.secondaryButton, disabled && styles.disabledButton]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
    >
      <Text style={styles.buttonText}>{children}</Text>
    </Pressable>
  );
}

function Card({ children }) {
  return <View style={styles.card}>{children}</View>;
}

export default function App() {
  const [patientId, setPatientId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [activeTab, setActiveTab] = useState("Home");
  const [twin, setTwin] = useState(null);
  const [readings, setReadings] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [connections, setConnections] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [cgmValue, setCgmValue] = useState("");
  const [glucoseTiming, setGlucoseTiming] = useState("");
  const [glucoseInterpretation, setGlucoseInterpretation] = useState("");
  const [provider, setProvider] = useState("");
  const [externalId, setExternalId] = useState("");
  const [simulationDelta, setSimulationDelta] = useState("0");
  const [simulationSteps, setSimulationSteps] = useState("12");
  const [simulation, setSimulation] = useState(null);
  const [question, setQuestion] = useState("");
  const [chatTiming, setChatTiming] = useState("");
  const [chat, setChat] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const notifiedAlerts = useRef(new Set());

  const api = useMemo(
    () => createApi({ baseUrl: API_URL, patientId, accessToken }),
    [patientId, accessToken],
  );

  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const [digitalTwin, history, alertItems, cgmConnections, savedChat] = await Promise.all([
        api("/api/digital-twin"),
        api("/api/glucose/history?limit=100"),
        api("/api/alerts"),
        api("/api/cgm/connections"),
        api("/api/chat/history?limit=20"),
      ]);
      setTwin(digitalTwin);
      setReadings(history);
      setAlerts(alertItems);
      setConnections(cgmConnections);
      setChatHistory(savedChat);
      setPredictions(digitalTwin.predictions || []);
      setMessage("Dashboard updated.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }, [api]);

  useEffect(() => {
    SecureStore.getItemAsync(TOKEN_KEY).then((savedToken) => {
      if (savedToken) setAccessToken(savedToken);
    });
    Promise.all([
      SecureStore.getItemAsync(PATIENT_KEY),
    ]).then(async ([savedPatientId]) => {
      if (savedPatientId) {
        setPatientId(savedPatientId);
        return;
      }
      const uniqueId = `DT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
      setPatientId(uniqueId);
      await SecureStore.setItemAsync(PATIENT_KEY, uniqueId);
      await fetch(`${API_URL}/api/patients/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ patient_id: uniqueId }),
      }).catch(() => null);
    }).catch(() => {
      setError("Unable to create or restore a unique patient ID.");
    });
    if (Notifications.requestPermissionsAsync) {
      Notifications.requestPermissionsAsync().catch(() => {
        setError("Notification permission was not granted.");
      });
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(refresh);
  }, [refresh]);

  useEffect(() => {
    alerts
      .filter((alert) => alert.urgency === "high" || alert.urgency === "critical")
      .slice(0, 20)
      .forEach((alert) => {
        const key = `${alert.predicted ? "forecast" : "current"}:${alert.created_at}:${alert.category}:${alert.message}`;
        if (notifiedAlerts.current.has(key)) return;
        notifiedAlerts.current.add(key);
        Notifications.scheduleNotificationAsync({
          content: {
            title: alert.predicted ? "Forecast glucose alert" : "Glucose alert",
            body: alert.message,
            sound: "default",
            data: { category: alert.category, predicted: Boolean(alert.predicted) },
          },
          trigger: null,
        }).catch(() => setError("Unable to deliver the glucose alert notification."));
      });
  }, [alerts]);

  async function recordReading() {
    const value = Number(cgmValue);
    if (!Number.isFinite(value) || value < 20 || value > 600) {
      setError("Enter a glucose value between 20 and 600 mg/dL.");
      return;
    }
    if (!glucoseTiming) {
      setError("Select when this glucose reading was taken.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api("/api/glucose", {
        method: "POST",
        body: JSON.stringify({
          measured_at: new Date().toISOString(),
          glucose_mg_dl: value,
          timing_context: glucoseTiming,
          source: "mobile-demo",
        }),
      });
      setCgmValue("");
      setGlucoseTiming("");
      setGlucoseInterpretation(`${result.interpretation}\n${result.next_steps}\n${result.disclaimer}`);
      await refresh();
      setMessage("Reading recorded.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function connectProvider() {
    if (!provider.trim() || !externalId.trim()) {
      setError("Enter both provider and provider account ID.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/api/cgm/connections", {
        method: "POST",
        body: JSON.stringify({
          provider: provider.trim(),
          external_patient_id: externalId.trim(),
        }),
      });
      setExternalId("");
      setConnections(await api("/api/cgm/connections"));
      setMessage("CGM provider connection registered.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function loadForecast() {
    setBusy(true);
    setError("");
    try {
      const result = await api("/api/predict?steps=12", { method: "POST" });
      setPredictions(result.predictions || []);
      setMessage("Forecast updated.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function runSimulation() {
    const delta = Number(simulationDelta);
    const steps = Number(simulationSteps);
    if (!Number.isFinite(delta) || delta < -500 || delta > 500 || !Number.isInteger(steps) || steps < 1 || steps > 48) {
      setError("Use a glucose change from -500 to 500 and 1 to 48 forecast steps.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      setSimulation(await api("/api/simulate", {
        method: "POST",
        body: JSON.stringify({
          glucose_delta_mg_dl: delta,
          steps,
          activity_delta: 0,
          carbohydrate_grams: 0,
        }),
      }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function askChat() {
    if (!question.trim()) return;
    setBusy(true);
    setError("");
    setChat("Thinking...");
    try {
      const result = await api("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          message: question.trim(),
          ...(chatTiming ? { timing_context: chatTiming } : {}),
        }),
      });
      setChat(result.response);
      setQuestion("");
      setChatHistory(await api("/api/chat/history?limit=20"));
    } catch (requestError) {
      setChat("");
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveToken() {
    if (!tokenInput.trim()) {
      setError("Enter an access token or leave it empty for local development.");
      return;
    }
    await SecureStore.setItemAsync(TOKEN_KEY, tokenInput.trim());
    setAccessToken(tokenInput.trim());
    setTokenInput("");
    setMessage("Secure access token saved.");
  }

  async function clearToken() {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setAccessToken("");
    setMessage("Access token removed.");
  }

  async function createNewPatientId() {
    const uniqueId = `DT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/api/patients/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ patient_id: uniqueId }),
      });
      if (!response.ok) throw new Error("Could not register the new patient ID.");
      await SecureStore.setItemAsync(PATIENT_KEY, uniqueId);
      setPatientId(uniqueId);
      setReadings([]);
      setAlerts([]);
      setChatHistory([]);
      setPredictions([]);
      setMessage("New unique patient profile created.");
      await refresh();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  function renderHome() {
    const latest = twin?.latest_reading;
    return (
      <>
        <Card>
          <Text style={styles.sectionTitle}>Current state</Text>
          <Text style={styles.metric}>{formatGlucose(latest?.glucose_mg_dl)}</Text>
          <Text style={styles.status}>{formatStatus(twin?.risk?.status)}</Text>
          <Text style={styles.body}>{twin?.recommendation?.recommendation || "No recommendation available."}</Text>
        </Card>
        <Card>
          <Text style={styles.sectionTitle}>Glucose trend</Text>
          <GlucoseChart readings={readings} predictions={predictions} />
        </Card>
        {(twin?.risk?.urgency && twin.risk.urgency !== "normal") && (
          <Card>
            <Text style={styles.alertTitle}>Glucose alert</Text>
            <Text style={styles.body}>Follow your clinician-approved care plan. Seek urgent help for severe or worsening symptoms.</Text>
          </Card>
        )}
        <Card>
          <Text style={styles.sectionTitle}>Record a demo reading</Text>
          <TextInput style={styles.input} value={cgmValue} onChangeText={setCgmValue} keyboardType="decimal-pad" placeholder="Glucose mg/dL" />
          {!!cgmValue && (
            <>
              <Text style={styles.body}>When was this reading taken?</Text>
              <View style={styles.optionGrid}>
                {timingOptions.map((option) => (
                  <Pressable
                    key={option.value}
                    style={[styles.optionButton, glucoseTiming === option.value && styles.optionButtonActive]}
                    onPress={() => setGlucoseTiming(option.value)}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.optionText, glucoseTiming === option.value && styles.optionTextActive]}>{option.label}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
          <Button onPress={recordReading} disabled={busy}>Record reading</Button>
          {!!glucoseInterpretation && <Text style={styles.chatResponse}>{glucoseInterpretation}</Text>}
        </Card>
        <Card>
          <Text style={styles.sectionTitle}>Connected CGM providers</Text>
          <Text style={styles.body}>A connection becomes live only after a provider-approved adapter sends readings to the secured webhook.</Text>
          {connections.length === 0 && <Text style={styles.body}>No CGM provider connected yet.</Text>}
          {connections.map((connection) => (
            <Text style={styles.connection} key={`${connection.provider}-${connection.external_patient_id}`}>
              {connection.provider}: {connection.external_patient_id} ({connection.active ? "active" : "inactive"})
            </Text>
          ))}
        </Card>
      </>
    );
  }

  function renderHistory() {
    const visibleReadings = readings.slice(-20).reverse();
    return (
      <Card>
        <Text style={styles.sectionTitle}>Recent glucose history</Text>
        {visibleReadings.length === 0 && <Text style={styles.body}>No readings available.</Text>}
        {visibleReadings.map((reading, index) => (
          <View style={styles.historyRow} key={`${reading.measured_at}-${index}`}>
            <Text style={styles.historyValue}>{formatGlucose(reading.glucose_mg_dl)}</Text>
            <Text style={styles.body}>{formatDate(reading.measured_at)}</Text>
          </View>
        ))}
      </Card>
    );
  }

  function renderForecast() {
    return (
      <>
        <Card>
          <Text style={styles.sectionTitle}>Forecast</Text>
          <Text style={styles.body}>Forecasts require at least 48 readings and are estimates, not confirmed medical events.</Text>
          <Button onPress={loadForecast} disabled={busy}>Refresh forecast</Button>
          {predictions.length === 0 && <Text style={styles.body}>No forecast available yet.</Text>}
          {predictions.map((prediction, index) => (
            <View style={styles.historyRow} key={`${prediction.measured_at}-${index}`}>
              <Text style={styles.historyValue}>{formatGlucose(prediction.glucose_mg_dl)}</Text>
              <Text style={styles.body}>{formatDate(prediction.measured_at)} · {formatStatus(prediction.status)}</Text>
            </View>
          ))}
        </Card>
        <Card>
          <Text style={styles.sectionTitle}>What-if simulation</Text>
          <TextInput style={styles.input} value={simulationDelta} onChangeText={setSimulationDelta} keyboardType="numbers-and-punctuation" placeholder="Glucose change mg/dL" />
          <TextInput style={styles.input} value={simulationSteps} onChangeText={setSimulationSteps} keyboardType="number-pad" placeholder="Forecast steps (1-48)" />
          <Button onPress={runSimulation} disabled={busy}>Run simulation</Button>
          {simulation && simulation.original.map((item, index) => (
            <Text style={styles.body} key={`${item.measured_at}-${index}`}>
              {formatDate(item.measured_at)} · original {formatGlucose(item.glucose_mg_dl)} · hypothetical {formatGlucose(simulation.hypothetical[index]?.glucose_mg_dl)}
            </Text>
          ))}
        </Card>
      </>
    );
  }

  function renderChat() {
    return (
      <>
        <Card>
          <Text style={styles.sectionTitle}>Healthcare chatbot</Text>
          <Text style={styles.body}>This assistant provides safety guidance and does not diagnose or prescribe.</Text>
          <Text style={styles.body}>Optional timing context:</Text>
          <View style={styles.optionGrid}>
            {timingOptions.map((option) => (
              <Pressable
                key={option.value}
                style={[styles.optionButton, chatTiming === option.value && styles.optionButtonActive]}
                onPress={() => setChatTiming(chatTiming === option.value ? "" : option.value)}
                accessibilityRole="button"
              >
                <Text style={[styles.optionText, chatTiming === option.value && styles.optionTextActive]}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput style={styles.input} value={question} onChangeText={setQuestion} placeholder="Ask about your glucose" multiline />
          <Button onPress={askChat} disabled={busy}>Ask assistant</Button>
          {!!chat && <Text style={styles.chatResponse}>{chat}</Text>}
        </Card>
        <Card>
          <Text style={styles.sectionTitle}>Recent conversation</Text>
          {chatHistory.length === 0 && <Text style={styles.body}>No saved conversation.</Text>}
          {chatHistory.map((item, index) => (
            <View style={styles.chatItem} key={`${item.created_at}-${index}`}>
              <Text style={styles.chatRole}>{item.role === "user" ? "You" : "Assistant"}</Text>
              <Text style={styles.body}>{item.content}</Text>
            </View>
          ))}
        </Card>
      </>
    );
  }

  function renderSettings() {
    return (
      <>
        <Card>
          <Text style={styles.sectionTitle}>Patient and security</Text>
          <Text style={styles.body}>Your unique patient ID</Text>
          <TextInput style={styles.input} value={patientId} editable={false} placeholder="Generating unique patient ID..." />
          <Button onPress={createNewPatientId} disabled={busy} secondary>Create new patient profile</Button>
          <TextInput style={styles.input} value={tokenInput} onChangeText={setTokenInput} autoCapitalize="none" secureTextEntry placeholder={accessToken ? "Access token saved" : "Bearer access token (production)"} />
          <Button onPress={saveToken} disabled={busy}>Save secure token</Button>
          {accessToken && <Button onPress={clearToken} secondary>Remove secure token</Button>}
          <Text style={styles.body}>Local development uses the patient ID header. Production should use a bearer token issued by your identity provider.</Text>
        </Card>
        <Card>
          <Text style={styles.sectionTitle}>Connect a CGM provider</Text>
          <Text style={styles.body}>A configured vendor adapter sends signed readings to the backend.</Text>
          <TextInput style={styles.input} value={provider} onChangeText={setProvider} placeholder="Provider adapter" />
          <TextInput style={styles.input} value={externalId} onChangeText={setExternalId} placeholder="Provider account ID" />
          <Button onPress={connectProvider} disabled={busy}>Connect provider</Button>
        </Card>
        <Card>
          <Text style={styles.sectionTitle}>Alerts</Text>
          {alerts.length === 0 && <Text style={styles.body}>No alerts.</Text>}
          {alerts.slice(0, 10).map((alert, index) => (
            <Text style={styles.body} key={`${alert.created_at}-${index}`}>{alert.urgency}: {alert.message}</Text>
          ))}
        </Card>
      </>
    );
  }

  const content = activeTab === "Home" ? renderHome() : activeTab === "History" ? renderHistory() : activeTab === "Forecast" ? renderForecast() : activeTab === "Chat" ? renderChat() : renderSettings();

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Diabetes Digital Twin</Text>
          <Text style={styles.subtitle}>Personalized glucose monitoring</Text>
        </View>
        <View style={styles.tabBar}>
          {tabs.map((tab) => (
            <Pressable key={tab} onPress={() => setActiveTab(tab)} style={[styles.tab, activeTab === tab && styles.activeTab]} accessibilityRole="tab">
              <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>{tab}</Text>
            </Pressable>
          ))}
        </View>
        <Button onPress={refresh} disabled={busy} secondary>{busy ? "Loading..." : "Refresh"}</Button>
        {!!error && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}
        {!!message && !error && <Text style={styles.message} accessibilityLiveRegion="polite">{message}</Text>}
        {content}
        {busy && <ActivityIndicator accessibilityLabel="Loading" />}
        <Text style={styles.disclaimer}>Estimates support monitoring and do not replace professional medical advice or emergency care.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f4f7fb" },
  container: { padding: 18, gap: 12 },
  header: { backgroundColor: "#0d477f", borderRadius: 18, padding: 22 },
  title: { color: "#fff", fontSize: 24, fontWeight: "700" },
  subtitle: { color: "#dce8f8", marginTop: 6 },
  tabBar: { flexDirection: "row", backgroundColor: "#fff", borderRadius: 10, padding: 4, justifyContent: "space-between" },
  tab: { paddingVertical: 9, paddingHorizontal: 7, borderRadius: 8 },
  activeTab: { backgroundColor: "#dcecff" },
  tabText: { color: "#58667a", fontSize: 12 },
  activeTabText: { color: "#1769aa", fontWeight: "700" },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 16, gap: 10 },
  sectionTitle: { color: "#172033", fontSize: 18, fontWeight: "700" },
  input: { backgroundColor: "#fff", borderColor: "#c9d3e2", borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 16 },
  button: { backgroundColor: "#087bb7", borderRadius: 8, padding: 13, alignItems: "center" },
  secondaryButton: { backgroundColor: "#58667a" },
  disabledButton: { opacity: 0.55 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  metric: { color: "#172033", fontSize: 30, fontWeight: "700" },
  status: { color: "#1769aa", fontSize: 16, textTransform: "capitalize" },
  body: { color: "#58667a", lineHeight: 21 },
  error: { color: "#a51d2d" },
  message: { color: "#1769aa" },
  alertTitle: { color: "#a51d2d", fontSize: 18, fontWeight: "700" },
  connection: { color: "#1769aa", paddingTop: 4 },
  historyRow: { borderTopColor: "#e1e7ef", borderTopWidth: 1, paddingTop: 9, gap: 3 },
  historyValue: { color: "#172033", fontWeight: "700", fontSize: 16 },
  chatResponse: { color: "#172033", lineHeight: 22 },
  optionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  optionButton: {
    borderWidth: 1,
    borderColor: "#b8c8d9",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  optionButtonActive: { backgroundColor: "#1769aa", borderColor: "#1769aa" },
  optionText: { color: "#3f4d60", fontSize: 12, fontWeight: "600" },
  optionTextActive: { color: "#fff" },
  chatItem: { borderTopColor: "#e1e7ef", borderTopWidth: 1, paddingTop: 9, gap: 3 },
  chatRole: { color: "#1769aa", fontWeight: "700" },
  disclaimer: { color: "#58667a", fontSize: 12, lineHeight: 18, paddingBottom: 12 },
  chart: { height: 190, borderLeftWidth: 1, borderBottomWidth: 1, borderColor: "#c9d3e2", backgroundColor: "#f8fbff", position: "relative", overflow: "hidden" },
  targetLine: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: "#2f855a" },
  highLine: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: "#c05621" },
  chartPoint: { position: "absolute", width: 8, height: 8, marginLeft: -4, marginBottom: -4, borderRadius: 4, backgroundColor: "#1769aa" },
  forecastPoint: { backgroundColor: "#c05621" },
  chartLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  chartLabel: { color: "#58667a", fontSize: 10 },
});
