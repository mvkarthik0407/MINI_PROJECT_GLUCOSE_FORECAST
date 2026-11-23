export interface Reading {
  id: number;
  value_mg_dl: number;
  original_value: number;
  original_unit: string;
  timestamp: string;
  source: 'cgm' | 'manual';
  device_label?: string;
  context_tag?: string;
  meter_flag?: string;
  is_deleted?: boolean;
}

export interface CurrentReading {
  value_mg_dl: number;
  unit: string;
  timestamp: string;
  source: 'cgm' | 'manual';
  is_stale: boolean;
  age_minutes: number;
  range_category: 'critical_low' | 'low' | 'target' | 'high' | 'critical_high';
  trend_arrow?: string;
  rate_of_change_mgdl_min?: number;
}

export interface ForecastPoint {
  horizon_minutes: number;
  forecast_timestamp: string;
  predicted_mg_dl: number;
  lower_bound_90: number;
  upper_bound_90: number;
}

export interface LatestForecast {
  available: boolean;
  message?: string;
  model_name: string;
  generated_at?: string;
  current_cgm?: number;
  points: ForecastPoint[];
}

export interface GlucoseStats {
  cgm_summary: {
    valid_window_hours: number;
    sufficient_data: boolean;
    data_points: number;
    time_in_range_pct: number;
    time_below_range_pct: number;
    time_above_range_pct: number;
    mean_glucose_mgdl: number;
    glucose_cv_pct: number;
  };
  manual_summary: {
    count: number;
    min_mg_dl: number;
    max_mg_dl: number;
    average_mg_dl: number;
    in_range_count: number;
  };
}

export interface AlertItem {
  id: number;
  alert_type: string;
  severity: 'info' | 'warning' | 'critical';
  headline: string;
  message: string;
  clinical_guidance?: string;
  triggered_at: string;
  status: 'active' | 'acknowledged' | 'snoozed' | 'resolved';
  reading_id?: number;
  glucose_value?: number;
  source: string;
}

export interface ModelInfo {
  model_name: string;
  model_type: string;
  architecture: string;
  input_features: string[];
  grid_step_minutes: number;
  input_steps: number;
  horizon_steps: number;
  uncertainty_method: string;
  coverage_target: string;
  empirical_coverage: number;
  cpu_latency_ms: number;
  disclaimer: string;
  metrics: {
    horizon_30m: { rmse: number; mae: number; mard: number; ceg_a_pct: number; ceg_ab_pct: number };
    horizon_60m: { rmse: number; mae: number; mard: number; ceg_a_pct: number; ceg_ab_pct: number } | null;
  };
}

export function parseUtcTimestamp(ts: string | number | Date): number {
  if (typeof ts === 'number') return ts;
  if (ts instanceof Date) return ts.getTime();
  if (!ts) return Date.now();
  const s = String(ts).trim();
  const hasTz = s.endsWith('Z') || /[+-]\d{2}(:\d{2})?$/.test(s);
  return new Date(hasTz ? s : `${s}Z`).getTime();
}

const API_BASE = '/api/v1';

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('diatwin_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

export const api = {
  // Authentication
  async register(emailOrUsername: string, password: string, age?: number, gender?: string) {
    const email = emailOrUsername.includes('@') ? emailOrUsername : `${emailOrUsername}@diatwin.local`;
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, age, gender })
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Registration failed');
    const data = await res.json();
    if (data.access_token) {
      localStorage.setItem('diatwin_token', data.access_token);
    }
    return data;
  },

  async login(emailOrUsername: string, password: string) {
    const email = emailOrUsername.includes('@') ? emailOrUsername : `${emailOrUsername}@diatwin.local`;
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Login failed');
    const data = await res.json();
    if (data.access_token) {
      localStorage.setItem('diatwin_token', data.access_token);
    }
    return data;
  },

  logout() {
    localStorage.removeItem('diatwin_token');
  },

  isAuthenticated(): boolean {
    return !!localStorage.getItem('diatwin_token');
  },

  async ensureAuthenticated(): Promise<boolean> {
    const token = localStorage.getItem('diatwin_token');
    if (token) {
      try {
        const testRes = await fetch(`${API_BASE}/readings/current`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (testRes.status !== 401) {
          return true; // Token is valid!
        }
      } catch {
        // network issue, proceed
      }
      localStorage.removeItem('diatwin_token');
    }

    // Token invalid or missing: auto-login or register demo user
    try {
      await this.login('demo@diatwin.local', 'DemoPass123!');
      return true;
    } catch {
      try {
        await this.register('demo@diatwin.local', 'DemoPass123!', 32, 'female');
        return true;
      } catch {
        try {
          await this.login('demo@diatwin.local', 'DemoPass123!');
          return true;
        } catch (e) {
          console.error('ensureAuthenticated failed:', e);
          return false;
        }
      }
    }
  },

  // Glucose Readings
  async getCurrentReading(): Promise<CurrentReading | null> {
    const res = await fetch(`${API_BASE}/readings/current`, { headers: getAuthHeaders() });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('Failed to fetch current reading');
    return res.json();
  },

  async getReadings(source: 'all' | 'cgm' | 'manual' = 'all', limit = 288): Promise<Reading[]> {
    const res = await fetch(`${API_BASE}/readings?source=${source}&limit=${limit}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch readings');
    return res.json();
  },

  async addManualReading(reading: {
    value: number;
    unit?: string;
    timestamp?: string;
    context_tag?: string;
    meter_flag?: string;
    device_label?: string;
    sync_twin?: boolean;
  }): Promise<any> {
    const res = await fetch(`${API_BASE}/readings/manual`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(reading)
    });
    if (!res.ok) {
      let errMsg = 'Failed to submit manual reading';
      try {
        const err = await res.json();
        errMsg = err.detail || errMsg;
      } catch {
        errMsg = (await res.text()) || errMsg;
      }
      throw new Error(errMsg);
    }
    return res.json();
  },

  async syncCgmReading(value: number, unit = 'mg/dL'): Promise<any> {
    const res = await fetch(`${API_BASE}/readings/cgm-sync`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ value, unit })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to synchronize CGM stream');
    }
    return res.json();
  },

  // Forecast & What-If
  async getLatestForecast(): Promise<LatestForecast> {
    const res = await fetch(`${API_BASE}/forecast/latest`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch latest forecast');
    const raw = await res.json();

    const points: ForecastPoint[] = [];
    if (raw.is_available && Array.isArray(raw.predicted_values_mg_dl)) {
      const originMs = raw.origin_timestamp ? parseUtcTimestamp(raw.origin_timestamp) : Date.now();
      for (let i = 0; i < raw.predicted_values_mg_dl.length; i++) {
        const horizon = raw.horizons_minutes?.[i] ?? (i + 1) * (raw.step_minutes || 5);
        const forecastTimestamp = new Date(originMs + horizon * 60 * 1000).toISOString();
        points.push({
          horizon_minutes: horizon,
          forecast_timestamp: forecastTimestamp,
          predicted_mg_dl: raw.predicted_values_mg_dl[i],
          lower_bound_90: raw.lower_bounds_90_mg_dl?.[i] ?? (raw.predicted_values_mg_dl[i] - 15),
          upper_bound_90: raw.upper_bounds_90_mg_dl?.[i] ?? (raw.predicted_values_mg_dl[i] + 15)
        });
      }
    }

    return {
      available: raw.is_available ?? false,
      message: raw.disabled_reason,
      model_name: "2-Layer GRU Neural Digital Twin",
      generated_at: raw.origin_timestamp,
      points: points
    };
  },

  async runWhatIf(shift_mgdl: number): Promise<any> {
    const res = await fetch(`${API_BASE}/whatif`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ delta_mg_dl: shift_mgdl, hypothetical_shift_mgdl: shift_mgdl })
    });
    if (!res.ok) throw new Error('Failed to run what-if simulation');
    const raw = await res.json();

    // Map perturbed values to points supporting both schema shapes
    const points: any[] = [];
    const perturbedArr = raw.perturbed_forecast || raw.perturbed_predictions_mg_dl || [];
    const baselineArr = raw.original_forecast || raw.baseline_predictions_mg_dl || [];
    const lowerArr = raw.perturbed_lower_90 || raw.lower_bounds_90_mg_dl || [];
    const upperArr = raw.perturbed_upper_90 || raw.upper_bounds_90_mg_dl || [];
    const horizons = raw.horizons_minutes || [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];

    for (let i = 0; i < perturbedArr.length; i++) {
      const h = horizons[i] ?? (i + 1) * 5;
      const pert = Number(perturbedArr[i]);
      const base = Number(baselineArr[i] ?? pert);
      points.push({
        step_number: i + 1,
        horizon_minutes: h,
        perturbed_prediction_mgdl: pert,
        baseline_prediction_mgdl: base,
        lower_bound_90: lowerArr[i] !== undefined ? Number(lowerArr[i]) : pert - 15,
        upper_bound_90: upperArr[i] !== undefined ? Number(upperArr[i]) : pert + 15,
        delta_change: Math.round(pert - base)
      });
    }
    raw.perturbed_points = points;
    return raw;
  },

  // Stats & Model Info
  async getStats(): Promise<GlucoseStats> {
    const res = await fetch(`${API_BASE}/stats`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch statistics');
    const raw = await res.json();
    const cs = raw.cgm_stats || {};
    const ms = raw.manual_stats || {};

    return {
      cgm_summary: {
        valid_window_hours: raw.days ? raw.days * 24 : 72,
        sufficient_data: cs.is_sufficient ?? false,
        data_points: cs.cgm_reading_count ?? 0,
        time_in_range_pct: cs.time_in_range_pct ?? 0,
        time_below_range_pct: cs.time_below_range_pct ?? 0,
        time_above_range_pct: cs.time_above_range_pct ?? 0,
        mean_glucose_mgdl: cs.mean_glucose_mg_dl ?? 0,
        glucose_cv_pct: cs.glucose_variability_cv ?? 0,
      },
      manual_summary: {
        count: ms.count ?? 0,
        min_mg_dl: ms.min_mg_dl ?? 0,
        max_mg_dl: ms.max_mg_dl ?? 0,
        average_mg_dl: ms.average_mg_dl ?? 0,
        in_range_count: ms.in_range_count ?? 0,
      }
    };
  },

  async getModelInfo(): Promise<ModelInfo> {
    const res = await fetch(`${API_BASE}/model-info`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch model info');
    return res.json();
  },

  // Alerts
  async getAlerts(includeResolved = false): Promise<AlertItem[]> {
    const res = await fetch(`${API_BASE}/alerts?include_resolved=${includeResolved}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch alerts');
    return res.json();
  },

  async acknowledgeAlert(alertId: number): Promise<any> {
    const res = await fetch(`${API_BASE}/alerts/${alertId}/ack`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to acknowledge alert');
    return res.json();
  },

  async snoozeAlert(alertId: number, minutes = 15): Promise<any> {
    const res = await fetch(`${API_BASE}/alerts/${alertId}/snooze`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ duration_minutes: minutes })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to snooze alert');
    }
    return res.json();
  },

  // Demo Replay & Sensor Stream Synchronization
  async seedDemoData(numReadings = 36, targetValue?: number): Promise<any> {
    const params = new URLSearchParams({ num_readings: String(numReadings) });
    if (targetValue !== undefined) params.append('target_value', String(targetValue));
    const res = await fetch(`${API_BASE}/demo/seed?${params.toString()}`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to seed demo data');
    return res.json();
  },

  async triggerDemoAlert(profile: 'hypo' | 'hyper' | 'rapid_fall' | 'signal_loss'): Promise<any> {
    const res = await fetch(`${API_BASE}/demo/trigger?profile=${profile}`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to trigger demo profile');
    return res.json();
  },

  async startDemoReplay(speed = 60): Promise<any> {
    const res = await fetch(`${API_BASE}/demo/start?speed_multiplier=${speed}`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    return res.json();
  },

  async stopDemoReplay(): Promise<any> {
    const res = await fetch(`${API_BASE}/demo/stop`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    return res.json();
  },

  // Chat API (Multi-Agent RAG with verified citations)
  async sendChat(message: string): Promise<{
    session_id?: string;
    response: string;
    citations: Array<{
      organization?: string;
      source?: string;
      title: string;
      url?: string;
      tier?: number;
      last_reviewed_date?: string;
    }>;
    agent_trace: any[];
    intent: string;
    sources_used: string[];
  }> {
    const res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ message })
    });
    if (!res.ok) {
      let errMsg = 'Chat failed';
      try {
        const err = await res.json();
        errMsg = err.detail || errMsg;
      } catch {
        errMsg = (await res.text()) || errMsg;
      }
      throw new Error(errMsg);
    }
    return res.json();
  },

  // Backward compatible streaming wrapper
  async streamChat(message: string, onChunk: (text: string) => void, onComplete: (full: any) => void) {
    try {
      const data = await this.sendChat(message);
      onChunk(data.response);
      onComplete(data);
    } catch (err: any) {
      throw err;
    }
  }
};
