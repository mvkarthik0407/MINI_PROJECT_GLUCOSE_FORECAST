import { useCallback, useEffect, useRef, useState } from "react";

const initialSimulation = { glucose_delta_mg_dl: 0, steps: 12 };
const timingContexts = [
  ["fasting", "Fasting"],
  ["before_meal", "Before Meal"],
  ["after_meal", "After Meal"],
  ["bedtime", "Bedtime"],
  ["symptoms", "Symptoms"],
  ["routine", "Routine"],
];

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

function TrendGraph({ readings }) {
  if (!readings.length) return <p className="muted">No glucose history available.</p>;
  const width = 720;
  const height = 220;
  const values = readings.map((item) => Number(item.glucose_mg_dl));
  const min = Math.min(40, ...values);
  const max = Math.max(220, ...values);
  const x = (index) => (index / Math.max(readings.length - 1, 1)) * width;
  const y = (value) => height - ((value - min) / Math.max(max - min, 1)) * height;
  const points = readings.map((item, index) => `${x(index)},${y(Number(item.glucose_mg_dl))}`).join(" ");
  return (
    <div className="trend-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Glucose trend graph">
        <line x1="0" x2={width} y1={y(70)} y2={y(70)} className="chart-line low" />
        <line x1="0" x2={width} y1={y(180)} y2={y(180)} className="chart-line high" />
        <polyline points={points} className="chart-series" />
        {readings.map((item, index) => <circle key={`${item.measured_at}-${index}`} cx={x(index)} cy={y(Number(item.glucose_mg_dl))} r="3" className="chart-point" />)}
      </svg>
      <div className="chart-legend"><span>Blue: glucose trend</span><span>Green: 70 mg/dL</span><span>Orange: 180 mg/dL</span></div>
    </div>
  );
}

export default function App() {
  const [patientId, setPatientId] = useState(() => {
    const saved = localStorage.getItem("diabetes-digital-twin-patient-id");
    if (saved) return saved;
    const uniqueId = `DT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
    localStorage.setItem("diabetes-digital-twin-patient-id", uniqueId);
    return uniqueId;
  });
  const [twin, setTwin] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cgmValue, setCgmValue] = useState("");
  const [cgmProvider, setCgmProvider] = useState("");
  const [cgmExternalId, setCgmExternalId] = useState("");
  const [cgmConnections, setCgmConnections] = useState([]);
  const [question, setQuestion] = useState("");
  const [chat, setChat] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [timingContext, setTimingContext] = useState("routine");
  const [readings, setReadings] = useState([]);
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    typeof Notification !== "undefined" && Notification.permission === "granted",
  );
  const notifiedReading = useRef("");
  const [simulation, setSimulation] = useState(initialSimulation);
  const [simulationResult, setSimulationResult] = useState(null);

  const api = useCallback(async (path, options = {}) => {
    const trimmedPatientId = patientId.trim();
    if (!trimmedPatientId) throw new Error("Enter a patient ID before continuing.");
    const response = await fetch(path, {
      ...options,
      headers: {
        "x-patient-id": trimmedPatientId,
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });
    const responseText = await response.text();
    let body = {};
    if (responseText) {
      try {
        body = JSON.parse(responseText);
      } catch {
        body = { detail: responseText };
      }
    }
    if (!response.ok) {
      const detail = typeof body.detail === "string" ? body.detail : "Request failed.";
      throw new Error(detail);
    }
    return body;
  }, [patientId]);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    setMessage("Loading dashboard...");
    try {
      const [digitalTwin, history, glucoseHistory] = await Promise.all([
        api("/api/digital-twin"),
        api("/api/chat/history?limit=20"),
        api("/api/glucose/history?limit=100"),
      ]);
      setTwin(digitalTwin);
      setChatHistory(history);
      setReadings(glucoseHistory);
      setCgmConnections(await api("/api/cgm/connections"));
      const latest = digitalTwin.latest_reading;
      if (digitalTwin.risk?.urgency !== "normal" && latest && notificationsEnabled && notifiedReading.current !== String(latest.measured_at)) {
        new Notification(`Glucose alert: ${formatStatus(digitalTwin.risk.status)}`, {
          body: `${formatGlucose(latest.glucose_mg_dl)}. Follow your clinician-approved care plan.`,
        });
        notifiedReading.current = String(latest.measured_at);
      }
      setMessage("Dashboard updated.");
    } catch (requestError) {
      setError(requestError.message);
      setMessage("");
    } finally {
      setBusy(false);
    }
  }, [api]);

  useEffect(() => {
    const registerAndRefresh = async () => {
      await fetch("/api/patients/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ patient_id: patientId }),
      }).catch(() => null);
      await refresh();
    };
    registerAndRefresh();
  }, [patientId, refresh]);

  async function enableNotifications() {
    if (typeof Notification === "undefined") {
      setError("Browser notifications are not supported.");
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationsEnabled(permission === "granted");
    if (permission !== "granted") setError("Browser notification permission was not granted.");
  }

  async function recordCgm() {
    const value = Number(cgmValue);
    if (!Number.isFinite(value) || value < 20 || value > 600) {
      setError("Enter a glucose value between 20 and 600 mg/dL.");
      return;
    }

    setBusy(true);
    try {
      await api("/api/glucose", {
        method: "POST",
        body: JSON.stringify({ measured_at: new Date().toISOString(), glucose_mg_dl: value, source: "cgm" }),
      });
      setCgmValue("");
      await refresh();
      setMessage("CGM reading recorded and Digital Twin updated.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function connectCgm() {
    if (!cgmProvider.trim() || !cgmExternalId.trim()) {
      setError("Enter both a CGM provider and the provider account ID.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/api/cgm/connections", {
        method: "POST",
        body: JSON.stringify({
          provider: cgmProvider.trim(),
          external_patient_id: cgmExternalId.trim(),
        }),
      });
      setCgmConnections(await api("/api/cgm/connections"));
      setCgmExternalId("");
      setMessage("CGM connection registered. The provider adapter can now send signed readings.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function runSimulation() {
    setBusy(true);
    setSimulationResult(null);
    try {
      setSimulationResult(await api("/api/simulate", {
        method: "POST",
        body: JSON.stringify({
          glucose_delta_mg_dl: Number(simulation.glucose_delta_mg_dl),
          steps: Number(simulation.steps),
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

  async function ask() {
    if (!question.trim()) return;
    setBusy(true);
    setChat("Thinking...");
    try {
      const result = await api("/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: question.trim(), timing_context: timingContext }),
      });
      setChat(result.response);
      setQuestion("");
      setChatHistory(await api("/api/chat/history?limit=20"));
    } catch (requestError) {
      setChat(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function clearChatHistory() {
    if (!window.confirm("Clear this patient's saved chatbot conversation?")) return;
    setBusy(true);
    try {
      await api("/api/chat/history", { method: "DELETE" });
      setChatHistory([]);
      setChat("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  const predictions = twin?.predictions || [];
  const alerts = twin?.alerts || [];
  const currentAlert = twin?.risk && twin.risk.urgency !== "normal" ? twin : null;

  return (
    <main>
      <header><h1>Diabetes Digital Twin</h1><div className="muted">Personalized glucose monitoring and prediction</div></header>
      <section><div className="row"><input value={patientId} onChange={(event) => setPatientId(event.target.value)} aria-label="Patient ID" /><button onClick={refresh} disabled={busy}>Refresh dashboard</button></div><p className={error ? "error" : "muted"} aria-live="polite">{error || message}</p></section>
      <section><h2>Current CGM reading</h2><p className="muted">Demo ingestion only; this is not a live vendor connection.</p><div className="row"><label>Glucose (mg/dL)<input type="number" min="20" max="600" value={cgmValue} onChange={(event) => setCgmValue(event.target.value)} /></label><button onClick={recordCgm} disabled={busy}>Record CGM reading</button></div></section>
      <section><h2>Connect a CGM provider</h2><p className="muted">Register your provider account here. A configured vendor adapter sends readings to the secured webhook; webhook secrets stay on the server.</p><div className="row"><label>Provider<input value={cgmProvider} onChange={(event) => setCgmProvider(event.target.value)} placeholder="dexcom-adapter" /></label><label>Provider account ID<input value={cgmExternalId} onChange={(event) => setCgmExternalId(event.target.value)} placeholder="account or device user ID" /></label><button onClick={connectCgm} disabled={busy}>Connect CGM</button></div>{cgmConnections.length > 0 && <ul>{cgmConnections.map((item) => <li key={`${item.provider}-${item.external_patient_id}`}>{item.provider}: {item.external_patient_id} ({item.active ? "active" : "inactive"})</li>)}</ul>}</section>
      <section><h2>Current state</h2><div className="cards"><div className="card"><div className="muted">Latest glucose</div><div className="value">{formatGlucose(twin?.latest_reading?.glucose_mg_dl)}</div></div><div className="card"><div className="muted">Risk status</div><div className="value status">{formatStatus(twin?.risk?.status)}</div></div><div className="card"><div className="muted">Patient</div><div className="value">{twin?.patient?.patient_id || "--"}</div></div></div><p>{twin?.recommendation?.recommendation || "No recommendation available."}</p></section>
      {currentAlert && <section className={`alert-banner ${twin.risk.urgency}`} role="alert"><h2>Glucose alert: {formatStatus(twin.risk.status)}</h2><p>{formatGlucose(twin.latest_reading?.glucose_mg_dl)}. {twin.recommendation?.recommendation}</p><p className="muted">Seek urgent medical help for severe or worsening symptoms. Do not change medication based only on this application.</p><div className="row"><button onClick={enableNotifications} disabled={notificationsEnabled}>{notificationsEnabled ? "Browser alerts enabled" : "Enable browser alerts"}</button></div></section>}
      <section><h2>Glucose trend</h2><p className="muted">Recorded glucose measurements over time. The graph shows readings, not diagnoses.</p><TrendGraph readings={readings} /></section>
      <section><h2>Forecast</h2><ul>{predictions.length ? predictions.map((item) => <li key={item.measured_at}>{formatDate(item.measured_at)} — <b>{formatGlucose(item.glucose_mg_dl)}</b> ({formatStatus(item.status)})</li>) : <li>No forecast available.</li>}</ul></section>
      <section><h2>What-if simulation</h2><p className="muted">Hypothetical only; these results are not actual measurements or proven causal outcomes.</p><div className="row"><label>Glucose change (mg/dL)<input type="number" min="-500" max="500" value={simulation.glucose_delta_mg_dl} onChange={(event) => setSimulation({ ...simulation, glucose_delta_mg_dl: event.target.value })} /></label><label>Forecast steps<input type="number" min="1" max="48" value={simulation.steps} onChange={(event) => setSimulation({ ...simulation, steps: event.target.value })} /></label><button onClick={runSimulation} disabled={busy}>Run simulation</button></div>{simulationResult && <ul>{simulationResult.original.map((item, index) => <li key={item.measured_at}>{formatDate(item.measured_at)} — original <b>{Number(item.glucose_mg_dl).toFixed(1)}</b>; hypothetical <b>{Number(simulationResult.hypothetical[index].glucose_mg_dl).toFixed(1)}</b> mg/dL</li>)}</ul>}</section>
      <section><h2>Alerts</h2><ul>{alerts.length ? alerts.map((item, index) => <li key={`${item.created_at}-${index}`}><b>{item.predicted ? "Forecast " : ""}{item.urgency}</b>: {item.message}</li>) : <li>No alerts.</li>}</ul></section>
      <section><h2>Healthcare chatbot</h2><p className="muted">Choose the timing or context to help interpret your question.</p><div className="timing-context" role="group" aria-label="Timing and context">{timingContexts.map(([value, label]) => <button key={value} type="button" className={timingContext === value ? "context-selected" : "context-button"} onClick={() => setTimingContext(value)}>{label}</button>)}</div><div className="row"><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about your latest glucose or forecast" aria-label="Chat question" /><button onClick={ask} disabled={busy}>Ask</button>{chatHistory.length > 0 && <button className="secondary" onClick={clearChatHistory} disabled={busy}>Clear conversation</button>}</div><p id="chat-output" aria-live="polite">{chat}</p>{chatHistory.length > 0 && <div className="chat-history"><h3>Recent conversation</h3>{chatHistory.map((item, index) => <div className={`chat-message ${item.role}`} key={`${item.created_at}-${index}`}><strong>{item.role === "user" ? "You" : "Assistant"}</strong><div>{item.content}</div><small>{formatDate(item.created_at)}</small></div>)}</div>}</section>
      <footer>Estimates support monitoring and do not replace professional medical advice or emergency care.</footer>
    </main>
  );
}
