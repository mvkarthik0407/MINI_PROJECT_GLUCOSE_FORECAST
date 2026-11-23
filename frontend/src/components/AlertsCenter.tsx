import React, { useState } from 'react';
import { AlertItem, api } from '../services/api';
import { audioAlertService } from '../services/audioAlerts';
import { 
  AlertTriangle, 
  AlertOctagon, 
  Info, 
  Bell, 
  BellOff, 
  Check, 
  Clock, 
  ShieldAlert,
  Volume2,
  VolumeX,
  Play,
  Sparkles,
  Zap
} from 'lucide-react';

interface AlertsCenterProps {
  alerts: AlertItem[];
  onRefresh: () => void;
}

export const AlertsCenter: React.FC<AlertsCenterProps> = ({ alerts, onRefresh }) => {
  const [snoozeMinutes, setSnoozeMinutes] = useState<number>(15);
  const [actingAlertId, setActingAlertId] = useState<number | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(audioAlertService.isSoundEnabled());
  const [lastTestedSound, setLastTestedSound] = useState<string | null>(null);

  const activeAlerts = Array.isArray(alerts) ? alerts.filter(a => a.status === 'active') : [];

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    audioAlertService.setSoundEnabled(next);
    if (next) {
      audioAlertService.playAlertSound('low', true);
    }
  };

  const testAudioSound = (type: 'critical_low' | 'low' | 'critical_high' | 'high' | 'predicted_low') => {
    audioAlertService.unlockAudio();
    audioAlertService.playAlertSound(type, true);
    setLastTestedSound(type);
    setTimeout(() => setLastTestedSound(null), 2500);

    const labels = {
      critical_low: '🚨 Critical Low Alarm (<54 mg/dL)',
      low: '⚠️ Warning Low Chime (54–69 mg/dL)',
      critical_high: '🚨 Critical High Alarm (>250 mg/dL)',
      high: '⚠️ Warning High Chime (>180 mg/dL)',
      predicted_low: '🔮 Forecast Predictive Low Chime'
    };
    audioAlertService.dispatchBrowserNotification('Sound Test', labels[type]);
  };

  const handleAcknowledge = async (id: number) => {
    setActingAlertId(id);
    try {
      await api.acknowledgeAlert(id);
      onRefresh();
    } catch (err) {
      console.error('Failed to acknowledge alert:', err);
    } finally {
      setActingAlertId(null);
    }
  };

  const handleSnooze = async (id: number) => {
    setActingAlertId(id);
    try {
      await api.snoozeAlert(id, snoozeMinutes);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Cannot snooze this alert.');
    } finally {
      setActingAlertId(null);
    }
  };

  return (
    <div className="space-y-4 max-w-xl mx-auto pb-6">
      
      {/* Audio Alarm Synthesizer & Notification Test Center */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
              soundEnabled ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-400'
            }`}>
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="font-black text-slate-800 text-xs flex items-center gap-1.5">
                <span>Audio Alert Synthesizer</span>
                <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${
                  soundEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                }`}>
                  {soundEnabled ? 'SOUND ACTIVE' : 'MUTED'}
                </span>
              </h3>
              <p className="text-[10px] text-slate-400">Web Audio API • 100% Offline • Zero Dependencies</p>
            </div>
          </div>

          <button
            onClick={toggleSound}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              soundEnabled 
                ? 'bg-indigo-600 text-white shadow-xs' 
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span>{soundEnabled ? 'Mute' : 'Unmute'}</span>
          </button>
        </div>

        {/* Live Audio Test Buttons */}
        <div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>Test Sound Alerts (Tap to listen):</span>
            {lastTestedSound && (
              <span className="text-[10px] font-bold text-indigo-600 animate-pulse">
                Playing tone...
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <button
              onClick={() => testAudioSound('critical_low')}
              className="p-2.5 rounded-2xl border border-red-200 bg-red-50/70 hover:bg-red-100/80 active:scale-95 text-left transition-all"
            >
              <div className="text-[11px] font-black text-red-900 flex items-center gap-1">
                <AlertOctagon className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
                <span>Critical Low</span>
              </div>
              <div className="text-[9px] text-red-700 mt-0.5 font-medium">&lt;54 mg/dL (Alarm)</div>
            </button>

            <button
              onClick={() => testAudioSound('low')}
              className="p-2.5 rounded-2xl border border-amber-200 bg-amber-50/70 hover:bg-amber-100/80 active:scale-95 text-left transition-all"
            >
              <div className="text-[11px] font-black text-amber-900 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                <span>Warning Low</span>
              </div>
              <div className="text-[9px] text-amber-700 mt-0.5 font-medium">54–69 mg/dL (Chime)</div>
            </button>

            <button
              onClick={() => testAudioSound('predicted_low')}
              className="p-2.5 rounded-2xl border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100/80 active:scale-95 text-left transition-all"
            >
              <div className="text-[11px] font-black text-indigo-900 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />
                <span>Forecast Low</span>
              </div>
              <div className="text-[9px] text-indigo-700 mt-0.5 font-medium">30m GRU Prediction</div>
            </button>

            <button
              onClick={() => testAudioSound('critical_high')}
              className="p-2.5 rounded-2xl border border-rose-200 bg-rose-50/70 hover:bg-rose-100/80 active:scale-95 text-left transition-all"
            >
              <div className="text-[11px] font-black text-rose-900 flex items-center gap-1">
                <AlertOctagon className="w-3.5 h-3.5 text-rose-600 flex-shrink-0" />
                <span>Critical High</span>
              </div>
              <div className="text-[9px] text-rose-700 mt-0.5 font-medium">&gt;250 mg/dL (Chime)</div>
            </button>

            <button
              onClick={() => testAudioSound('high')}
              className="p-2.5 rounded-2xl border border-orange-200 bg-orange-50/70 hover:bg-orange-100/80 active:scale-95 text-left transition-all"
            >
              <div className="text-[11px] font-black text-orange-900 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-orange-600 flex-shrink-0" />
                <span>Warning High</span>
              </div>
              <div className="text-[9px] text-orange-700 mt-0.5 font-medium">&gt;180 mg/dL (Chime)</div>
            </button>

            <button
              onClick={() => audioAlertService.dispatchBrowserNotification('Permission Check', 'Browser notifications enabled!')}
              className="p-2.5 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-slate-100 active:scale-95 text-left transition-all"
            >
              <div className="text-[11px] font-black text-slate-800 flex items-center gap-1">
                <Bell className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                <span>Enable Push</span>
              </div>
              <div className="text-[9px] text-slate-500 mt-0.5 font-medium">Browser banner</div>
            </button>
          </div>
        </div>
      </div>

      {/* Active Alerts Header */}
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-black text-slate-800 flex items-center gap-2 uppercase tracking-wider">
          <ShieldAlert className="w-4 h-4 text-red-600" />
          <span>Active Safety Alerts ({activeAlerts.length})</span>
        </h3>
        <span className="text-[10px] text-slate-400 font-bold">24/7 Evaluator Active</span>
      </div>

      {/* Active Alerts Feed */}
      {activeAlerts.length === 0 ? (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-600">
              <Check className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-black text-slate-800 text-xs">No Active Alerts</h4>
              <p className="text-[11px] text-slate-500">
                All glucose safety rules & neural forecast intervals are within safe target bounds (70–180 mg/dL).
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {activeAlerts.map(alert => {
            const isCritical = alert.severity === 'critical';
            const isWarning = alert.severity === 'warning';

            return (
              <div
                key={alert.id}
                className={`rounded-3xl border p-4 sm:p-5 shadow-sm transition-all ${
                  isCritical 
                    ? 'bg-red-50/90 border-red-300 ring-2 ring-red-400/30' 
                    : isWarning 
                    ? 'bg-amber-50/90 border-amber-300' 
                    : 'bg-blue-50/90 border-blue-200'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-xl mt-0.5 flex-shrink-0 ${
                      isCritical ? 'bg-red-600 text-white' : isWarning ? 'bg-amber-500 text-white' : 'bg-blue-600 text-white'
                    }`}>
                      {isCritical ? (
                        <AlertOctagon className="w-5 h-5 animate-bounce" />
                      ) : isWarning ? (
                        <AlertTriangle className="w-5 h-5" />
                      ) : (
                        <Info className="w-5 h-5" />
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          isCritical ? 'bg-red-200 text-red-900' : isWarning ? 'bg-amber-200 text-amber-900' : 'bg-blue-200 text-blue-900'
                        }`}>
                          {alert.severity} • {alert.alert_type.replace('_', ' ')}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(alert.triggered_at).toLocaleTimeString()}
                        </span>
                        <span className="text-[9px] font-bold text-slate-700 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                          {alert.source.toUpperCase()}
                        </span>
                      </div>

                      <h4 className="text-sm font-black text-slate-900">
                        {alert.headline}
                      </h4>

                      <p className="text-xs text-slate-700 leading-relaxed font-medium">
                        {alert.message}
                      </p>

                      {alert.clinical_guidance && (
                        <div className="mt-2 p-2.5 bg-white/95 rounded-2xl border border-red-200 text-xs text-red-900 space-y-1">
                          <div className="font-bold flex items-center gap-1.5 text-red-700 text-[11px]">
                            <Volume2 className="w-3.5 h-3.5" />
                            <span>Clinical Safety Guidance (Rule 15-15)</span>
                          </div>
                          <p className="text-[11px] leading-relaxed">{alert.clinical_guidance}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions: Acknowledge & Snooze */}
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    {!isCritical && (
                      <div className="flex items-center gap-1 bg-white rounded-xl border border-slate-200 p-1 shadow-2xs">
                        <select
                          value={snoozeMinutes}
                          onChange={(e) => setSnoozeMinutes(Number(e.target.value))}
                          className="text-[10px] font-bold text-slate-700 bg-transparent px-1 focus:outline-none"
                        >
                          <option value={15}>15m</option>
                          <option value={30}>30m</option>
                        </select>
                        <button
                          onClick={() => handleSnooze(alert.id)}
                          disabled={actingAlertId === alert.id}
                          className="px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1"
                        >
                          <BellOff className="w-3 h-3" />
                          <span>Snooze</span>
                        </button>
                      </div>
                    )}

                    <button
                      onClick={() => handleAcknowledge(alert.id)}
                      disabled={actingAlertId === alert.id}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-1 ${
                        isCritical 
                          ? 'bg-red-600 hover:bg-red-700 text-white' 
                          : 'bg-slate-800 hover:bg-slate-900 text-white'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Dismiss</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
