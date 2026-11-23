import React, { useState, useEffect } from 'react';
import { 
  api, 
  CurrentReading, 
  LatestForecast, 
  Reading, 
  GlucoseStats, 
  AlertItem, 
  ModelInfo 
} from './services/api';
import { audioAlertService } from './services/audioAlerts';
import { Dashboard } from './components/Dashboard';
import { AddReadingModal } from './components/AddReadingModal';
import { AlertsCenter } from './components/AlertsCenter';
import { ChatAssistant } from './components/ChatAssistant';
import { WhatIfSimulator } from './components/WhatIfSimulator';
import { DataSources } from './components/DataSources';
import { ModelInfoModal } from './components/ModelInfoModal';
import { 
  Activity, 
  ShieldAlert, 
  Bot, 
  Sliders, 
  Radio, 
  RefreshCw,
  Heart,
  Plus,
  Info,
  Smartphone,
  X,
  Volume2,
  VolumeX,
  Zap,
  AlertOctagon,
  AlertTriangle
} from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'alerts' | 'chat' | 'whatif' | 'datasources'>('dashboard');
  const [current, setCurrent] = useState<CurrentReading | null>(null);
  const [forecast, setForecast] = useState<LatestForecast | null>(null);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [stats, setStats] = useState<GlucoseStats | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);

  const [isManualModalOpen, setIsManualModalOpen] = useState<boolean>(false);
  const [isModelInfoOpen, setIsModelInfoOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [showPwaBanner, setShowPwaBanner] = useState<boolean>(true);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(audioAlertService.isSoundEnabled());
  const [activeDangerNotice, setActiveDangerNotice] = useState<{
    severity: 'critical' | 'warning';
    headline: string;
    message: string;
  } | null>(null);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    audioAlertService.setSoundEnabled(next);
    if (next) {
      audioAlertService.playAlertSound('low', true);
    }
  };

  const handleConnectStream = async () => {
    setIsConnecting(true);
    try {
      await api.seedDemoData(36, 120);
      await loadData(false);
    } catch (e) {
      console.error('Failed to connect sensor stream:', e);
    } finally {
      setIsConnecting(false);
    }
  };

  // Initialize demo user authentication & data load
  useEffect(() => {
    const initApp = async () => {
      try {
        await api.ensureAuthenticated();

        // Check if sensor data exists or is stale (>20m). If so, auto-connect immediately!
        try {
          const curr = await api.getCurrentReading();
          const fc = await api.getLatestForecast();
          if (!curr || curr.is_stale || !fc?.available) {
            await api.seedDemoData(36, 120);
          }
        } catch {
          await api.seedDemoData(36, 120);
        }

        await loadData();
      } catch (err) {
        console.error('Initialization error:', err);
      } finally {
        setLoading(false);
      }
    };

    initApp();

    // Auto-refresh telemetry every 15 seconds
    const interval = setInterval(() => {
      loadData(false);
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  const loadData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const [currData, fcData, rList, stData, alList, mInfo] = await Promise.allSettled([
        api.getCurrentReading(),
        api.getLatestForecast(),
        api.getReadings('all', 150),
        api.getStats(),
        api.getAlerts(false),
        api.getModelInfo()
      ]);

      if (currData.status === 'fulfilled') setCurrent(currData.value);
      if (fcData.status === 'fulfilled') setForecast(fcData.value);
      if (rList.status === 'fulfilled') setReadings(rList.value);
      if (stData.status === 'fulfilled') setStats(stData.value);
      if (alList.status === 'fulfilled') setAlerts(alList.value);
      if (mInfo.status === 'fulfilled') setModelInfo(mInfo.value);
    } catch (e) {
      console.error('Failed to load telemetry:', e);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // Real-Time Audio Alarm & Notification Supervisor
  useEffect(() => {
    if (!current) {
      setActiveDangerNotice(null);
      return;
    }

    const val = current.value_mg_dl;
    const pts = forecast?.points || [];
    const minForecast = pts.length > 0 ? Math.min(...pts.slice(0, 6).map(p => p.predicted_mg_dl)) : null;
    const maxForecast = pts.length > 0 ? Math.max(...pts.slice(0, 6).map(p => p.predicted_mg_dl)) : null;

    // 1. Critical Low (< 54 mg/dL)
    if (val < 54) {
      audioAlertService.playAlertSound('critical_low');
      audioAlertService.dispatchBrowserNotification(
        '🚨 DANGER: Critical Low Glucose!',
        `Current glucose is ${Math.round(val)} mg/dL. Ingest 15g fast-acting carbs immediately (Rule of 15).`
      );
      setActiveDangerNotice({
        severity: 'critical',
        headline: `🚨 CRITICAL LOW GLUCOSE: ${Math.round(val)} mg/dL`,
        message: 'Immediate action required: Ingest 15g fast-acting carbs (juice/glucose tablets) and re-check in 15 min.'
      });
    }
    // 2. Warning Low (54–69 mg/dL)
    else if (val < 70) {
      audioAlertService.playAlertSound('low');
      audioAlertService.dispatchBrowserNotification(
        '⚠️ Warning: Below Target Glucose',
        `Current glucose is ${Math.round(val)} mg/dL. Monitor closely.`
      );
      setActiveDangerNotice({
        severity: 'warning',
        headline: `⚠️ LOW GLUCOSE: ${Math.round(val)} mg/dL`,
        message: 'Glucose is below 70 mg/dL target. Check symptoms and prepare 15g fast-acting carbohydrates.'
      });
    }
    // 3. Critical High (> 250 mg/dL)
    else if (val > 250) {
      audioAlertService.playAlertSound('critical_high');
      audioAlertService.dispatchBrowserNotification(
        '🚨 DANGER: Critical High Glucose!',
        `Current glucose is ${Math.round(val)} mg/dL. Check ketones and hydrate.`
      );
      setActiveDangerNotice({
        severity: 'critical',
        headline: `🚨 CRITICAL HIGH GLUCOSE: ${Math.round(val)} mg/dL`,
        message: 'Marked hyperglycemia: Check blood/urine ketones and follow your sick-day management protocol.'
      });
    }
    // 4. Warning High (181–250 mg/dL)
    else if (val > 180) {
      audioAlertService.playAlertSound('high');
      setActiveDangerNotice({
        severity: 'warning',
        headline: `⚠️ High Glucose: ${Math.round(val)} mg/dL`,
        message: 'Glucose is above the 180 mg/dL target range. Review trend arrow.'
      });
    }
    // 5. Predictive 30-min Forecast Critical Low (< 54 mg/dL)
    else if (minForecast !== null && minForecast < 54) {
      audioAlertService.playAlertSound('critical_low');
      audioAlertService.dispatchBrowserNotification(
        '🚨 Predictive Alert: Severe Hypoglycemia Projected!',
        `Digital Twin projects glucose dropping to ${Math.round(minForecast)} mg/dL within 30 minutes.`
      );
      setActiveDangerNotice({
        severity: 'critical',
        headline: `🚨 PREDICTED CRITICAL LOW: ~${Math.round(minForecast)} mg/dL in 30m`,
        message: 'Digital Twin forecast projects a severe drop. Prepare fast-acting carbohydrates.'
      });
    }
    // 6. Predictive 30-min Forecast Low (< 70 mg/dL)
    else if (minForecast !== null && minForecast < 70) {
      audioAlertService.playAlertSound('predicted_low');
      audioAlertService.dispatchBrowserNotification(
        '⚠️ Predictive Alert: Glucose Drop Projected',
        `Digital Twin projects glucose reaching ${Math.round(minForecast)} mg/dL in 30 minutes.`
      );
      setActiveDangerNotice({
        severity: 'warning',
        headline: `⚠️ PREDICTED LOW: ~${Math.round(minForecast)} mg/dL in 30m`,
        message: 'Digital Twin forecast projects glucose dropping below 70 mg/dL. Monitor trend.'
      });
    } else {
      setActiveDangerNotice(null);
    }
  }, [current?.value_mg_dl, forecast?.generated_at]);

  const activeAlertsCount = Array.isArray(alerts) ? alerts.filter(a => a.status === 'active').length : 0;

  return (
    <div className="min-h-screen bg-slate-100/90 text-slate-800 flex flex-col font-sans select-none antialiased">
      
      {/* 1. NATIVE MOBILE APP STATUS & HEADER BAR */}
      <header className="sticky top-0 z-30 bg-slate-900 text-white shadow-md border-b border-slate-800/80 pt-safe">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          
          {/* App Branding & Connection Status */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-sm">
              <Heart className="w-4 h-4 fill-white text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-black text-base tracking-tight leading-none text-white">DiaTwin</span>
                <span 
                  className={`w-2 h-2 rounded-full inline-block ${
                    current && !current.is_stale ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'
                  }`} 
                  title={current && !current.is_stale ? 'CGM Stream Connected' : 'Sensor Connecting/Idle'} 
                />
              </div>
              <p className="text-[10px] text-slate-400 font-semibold tracking-wide">T1D Digital Twin</p>
            </div>
          </div>

          {/* Quick Header Actions: Sound, Info, Refresh, Alerts */}
          <div className="flex items-center gap-1">
            {/* Audio Mute/Unmute Toggle */}
            <button
              onClick={toggleSound}
              className={`p-2 rounded-xl active:bg-slate-800 transition-colors ${
                soundEnabled ? 'text-emerald-400 hover:text-emerald-300' : 'text-slate-500 hover:text-slate-400'
              }`}
              title={soundEnabled ? 'Audio Alerts: ON (Tap to Mute)' : 'Audio Alerts: MUTED (Tap to Enable)'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            <button
              onClick={() => setIsModelInfoOpen(true)}
              className="p-2 text-slate-400 hover:text-white rounded-xl active:bg-slate-800 transition-colors"
              title="Model Information"
            >
              <Info className="w-4 h-4" />
            </button>

            <button
              onClick={() => loadData(true)}
              disabled={loading}
              className="p-2 text-slate-400 hover:text-white rounded-xl active:bg-slate-800 transition-colors"
              title="Refresh Telemetry"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            </button>

            {/* Quick Alert Bell with Live Badge */}
            <button
              onClick={() => setActiveTab('alerts')}
              className={`p-2 rounded-xl transition-colors relative ${
                activeAlertsCount > 0 ? 'text-red-400 bg-red-950/60' : 'text-slate-400 hover:text-white'
              }`}
              title="Safety Alerts"
            >
              <ShieldAlert className="w-4 h-4" />
              {activeAlertsCount > 0 && (
                <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              )}
            </button>
          </div>
        </div>

        {/* PWA Home Screen Helper Banner (Dismissible) */}
        {showPwaBanner && (
          <div className="bg-gradient-to-r from-blue-900/90 to-indigo-900/90 px-4 py-2 text-[11px] text-blue-100 flex items-center justify-between border-t border-white/10">
            <div className="flex items-center gap-2">
              <Smartphone className="w-3.5 h-3.5 text-blue-300 flex-shrink-0" />
              <span>Tip: Tap <strong>Share &gt; Add to Home Screen</strong> to install as a full-screen app!</span>
            </div>
            <button onClick={() => setShowPwaBanner(false)} className="text-blue-300 hover:text-white ml-2">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </header>

      {/* Real-Time Floating Audio Danger Notice Banner */}
      {activeDangerNotice && (
        <div className={`px-4 py-2.5 text-xs border-b shadow-xs transition-all ${
          activeDangerNotice.severity === 'critical'
            ? 'bg-red-600 text-white border-red-700 animate-pulse'
            : 'bg-amber-500 text-slate-950 border-amber-600'
        }`}>
          <div className="max-w-lg mx-auto flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {activeDangerNotice.severity === 'critical' ? (
                <AlertOctagon className="w-4 h-4 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              )}
              <div>
                <strong className="block text-[11px] leading-tight">{activeDangerNotice.headline}</strong>
                <span className="text-[10px] opacity-90">{activeDangerNotice.message}</span>
              </div>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={toggleSound}
                className="p-1 rounded-lg bg-black/20 hover:bg-black/30 text-current"
                title="Toggle Mute"
              >
                {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => setActiveDangerNotice(null)}
                className="p-1 rounded-lg bg-black/20 hover:bg-black/30 text-current"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. MAIN SCROLLABLE APP BODY */}
      <main className="flex-1 max-w-lg mx-auto w-full px-3.5 pt-3.5 pb-24">
        {activeTab === 'dashboard' && (
          <Dashboard
            current={current}
            forecast={forecast}
            readings={readings}
            stats={stats}
            onOpenManualModal={() => setIsManualModalOpen(true)}
            onOpenModelInfo={() => setIsModelInfoOpen(true)}
            onConnectStream={handleConnectStream}
            isConnecting={isConnecting}
          />
        )}

        {activeTab === 'alerts' && (
          <div className="max-w-xl mx-auto">
            <AlertsCenter alerts={alerts} onRefresh={() => loadData(false)} />
          </div>
        )}

        {activeTab === 'chat' && (
          <ChatAssistant />
        )}

        {activeTab === 'whatif' && (
          <div className="max-w-xl mx-auto">
            <WhatIfSimulator />
          </div>
        )}

        {activeTab === 'datasources' && (
          <div className="max-w-xl mx-auto">
            <DataSources onDataMutated={() => loadData(false)} />
          </div>
        )}
      </main>

      {/* 3. FLOATING ACTION BUTTON (FAB) FOR INSTANT FINGERSTICK / SYNC */}
      <button
        onClick={() => setIsManualModalOpen(true)}
        className="fixed right-4 bottom-20 z-40 sm:bottom-24 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-full px-4 py-3 shadow-xl flex items-center gap-2 active:scale-95 transition-all border border-white/20"
        title="Record Manual Fingerstick or Sync Twin"
      >
        <Plus className="w-5 h-5 font-bold" />
        <span className="text-xs font-black tracking-wide pr-1">Fingerstick</span>
      </button>

      {/* 4. FIXED BOTTOM NAVIGATION BAR (NATIVE APP TAB BAR) */}
      <nav className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-lg border-t border-slate-200/90 z-30 pb-safe shadow-lg">
        <div className="max-w-lg mx-auto grid grid-cols-5 h-15">
          
          {/* Tab 1: Glucose */}
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex flex-col items-center justify-center transition-colors active:scale-95 ${
              activeTab === 'dashboard' ? 'text-blue-600 font-black' : 'text-slate-400 hover:text-slate-600 font-semibold'
            }`}
          >
            <Activity className={`w-5 h-5 ${activeTab === 'dashboard' ? 'stroke-[2.5]' : 'stroke-2'}`} />
            <span className="text-[10px] mt-1">Glucose</span>
          </button>

          {/* Tab 2: Alerts */}
          <button
            onClick={() => setActiveTab('alerts')}
            className={`flex flex-col items-center justify-center transition-colors active:scale-95 relative ${
              activeTab === 'alerts' ? 'text-red-600 font-black' : 'text-slate-400 hover:text-slate-600 font-semibold'
            }`}
          >
            <div className="relative">
              <ShieldAlert className={`w-5 h-5 ${activeTab === 'alerts' ? 'stroke-[2.5]' : 'stroke-2'}`} />
              {activeAlertsCount > 0 && (
                <span className="absolute -top-1 -right-1.5 w-4 h-4 rounded-full bg-red-600 text-white text-[9px] font-black flex items-center justify-center">
                  {activeAlertsCount}
                </span>
              )}
            </div>
            <span className="text-[10px] mt-1">Alerts</span>
          </button>

          {/* Tab 3: AI Chat */}
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex flex-col items-center justify-center transition-colors active:scale-95 ${
              activeTab === 'chat' ? 'text-blue-600 font-black' : 'text-slate-400 hover:text-slate-600 font-semibold'
            }`}
          >
            <Bot className={`w-5 h-5 ${activeTab === 'chat' ? 'stroke-[2.5]' : 'stroke-2'}`} />
            <span className="text-[10px] mt-1">Assistant</span>
          </button>

          {/* Tab 4: What-If */}
          <button
            onClick={() => setActiveTab('whatif')}
            className={`flex flex-col items-center justify-center transition-colors active:scale-95 ${
              activeTab === 'whatif' ? 'text-indigo-600 font-black' : 'text-slate-400 hover:text-slate-600 font-semibold'
            }`}
          >
            <Sliders className={`w-5 h-5 ${activeTab === 'whatif' ? 'stroke-[2.5]' : 'stroke-2'}`} />
            <span className="text-[10px] mt-1">What-If</span>
          </button>

          {/* Tab 5: Devices / Data Sources */}
          <button
            onClick={() => setActiveTab('datasources')}
            className={`flex flex-col items-center justify-center transition-colors active:scale-95 ${
              activeTab === 'datasources' ? 'text-blue-600 font-black' : 'text-slate-400 hover:text-slate-600 font-semibold'
            }`}
          >
            <Radio className={`w-5 h-5 ${activeTab === 'datasources' ? 'stroke-[2.5]' : 'stroke-2'}`} />
            <span className="text-[10px] mt-1">Devices</span>
          </button>
        </div>
      </nav>

      {/* Modals */}
      <AddReadingModal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        onSuccess={() => loadData(false)}
      />

      <ModelInfoModal
        isOpen={isModelInfoOpen}
        onClose={() => setIsModelInfoOpen(false)}
        info={modelInfo}
      />
    </div>
  );
};

export default App;
