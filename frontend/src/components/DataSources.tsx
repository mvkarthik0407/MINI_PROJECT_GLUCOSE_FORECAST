import React, { useState } from 'react';
import { api } from '../services/api';
import { 
  Radio, 
  Upload, 
  Play, 
  Square, 
  Zap, 
  RefreshCw, 
  CheckCircle2, 
  FileSpreadsheet,
  Cpu
} from 'lucide-react';

interface DataSourcesProps {
  onDataMutated: () => void;
}

export const DataSources: React.FC<DataSourcesProps> = ({ onDataMutated }) => {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [demoStatus, setDemoStatus] = useState<string>('idle');
  const [notification, setNotification] = useState<string | null>(null);

  const handleSeed = async () => {
    setLoadingAction('seed');
    try {
      await api.seedDemoData(3);
      setNotification('Successfully seeded 3 hours (36 readings) of continuous CGM data.');
      onDataMutated();
    } catch (err: any) {
      alert(err.message || 'Failed to seed data');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleTrigger = async (profile: 'hypo' | 'hyper' | 'rapid_fall' | 'signal_loss') => {
    setLoadingAction(`trigger_${profile}`);
    try {
      await api.triggerDemoAlert(profile);
      setNotification(`Triggered demo test condition: ${profile.toUpperCase()}`);
      onDataMutated();
    } catch (err: any) {
      alert(err.message || 'Failed to trigger condition');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleStartReplay = async () => {
    setLoadingAction('start');
    try {
      await api.startDemoReplay(60);
      setDemoStatus('running');
      setNotification('Accelerated streaming replay started (1 second = 1 minute simulated).');
    } catch (err: any) {
      alert(err.message || 'Failed to start replay');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleStopReplay = async () => {
    setLoadingAction('stop');
    try {
      await api.stopDemoReplay();
      setDemoStatus('idle');
      setNotification('Accelerated streaming replay stopped.');
    } catch (err: any) {
      alert(err.message || 'Failed to stop replay');
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Radio className="w-5 h-5 text-blue-600" />
            <span>Glucose Ingestion Channels & Demo Test Bench</span>
          </h3>
          <p className="text-xs text-slate-500">
            Official vendor connector stubs (Dexcom, Libre), CSV ingestion, and test cohort streaming.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
          <span className="text-xs font-bold text-slate-700">CGM Connector: Ready</span>
        </div>
      </div>

      {notification && (
        <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 text-xs rounded-xl flex items-center justify-between">
          <span>{notification}</span>
          <button onClick={() => setNotification(null)} className="font-bold text-blue-900 ml-2">Dismiss</button>
        </div>
      )}

      {/* Replay Controls & Seed */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Seed 3h Contiguous Data */}
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-blue-600" />
              <span>MetaboNet Test Cohort Seed</span>
            </h4>
            <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-semibold">3-Hour Grid</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Seeds 36 consecutive 5-minute CGM readings from held-out test patients to activate the 24-step GRU neural network.
          </p>
          <button
            onClick={handleSeed}
            disabled={loadingAction === 'seed'}
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingAction === 'seed' ? 'animate-spin' : ''}`} />
            <span>Seed 3h Active CGM Stream</span>
          </button>
        </div>

        {/* Accelerated Replay */}
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Play className="w-4 h-4 text-purple-600" />
              <span>Real-Time Replay Engine</span>
            </h4>
            <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${demoStatus === 'running' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>
              Status: {demoStatus.toUpperCase()}
            </span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Simulates a live patient session at 60x speed, broadcasting a new CGM reading every 5 seconds.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleStartReplay}
              disabled={loadingAction === 'start' || demoStatus === 'running'}
              className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Start 60x Stream</span>
            </button>
            <button
              onClick={handleStopReplay}
              disabled={loadingAction === 'stop' || demoStatus === 'idle'}
              className="flex-1 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Stop Stream</span>
            </button>
          </div>
        </div>
      </div>

      {/* Emergency & Alert Profile Triggers */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
          <Zap className="w-4 h-4 text-amber-500" />
          <span>Simulate Safety Alert Scenarios</span>
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <button
            onClick={() => handleTrigger('hypo')}
            className="p-3 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl text-left transition-all space-y-1"
          >
            <div className="text-xs font-bold text-red-800">Hypoglycemia</div>
            <div className="text-[10px] text-red-600">Simulate reading &lt;54 mg/dL</div>
          </button>
          <button
            onClick={() => handleTrigger('hyper')}
            className="p-3 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl text-left transition-all space-y-1"
          >
            <div className="text-xs font-bold text-rose-800">Hyperglycemia</div>
            <div className="text-[10px] text-rose-600">Simulate reading &gt;250 mg/dL</div>
          </button>
          <button
            onClick={() => handleTrigger('rapid_fall')}
            className="p-3 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl text-left transition-all space-y-1"
          >
            <div className="text-xs font-bold text-amber-800">Rapid Fall</div>
            <div className="text-[10px] text-amber-600">Rate &ge; -2.5 mg/dL/min</div>
          </button>
          <button
            onClick={() => handleTrigger('signal_loss')}
            className="p-3 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl text-left transition-all space-y-1"
          >
            <div className="text-xs font-bold text-slate-800">Signal Loss</div>
            <div className="text-[10px] text-slate-600">Simulate gap &gt;25 minutes</div>
          </button>
        </div>
      </div>

      {/* Official Vendor Connector Architecture Stubs */}
      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-2">
        <div className="font-bold text-slate-800 flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>Vendor API Compliance Guarantee</span>
        </div>
        <p>
          DiaTwin adheres to vendor API terms of service. It implements a documented <code>GlucoseSource</code> interface ready for official partner OAuth2 APIs (Dexcom Developer API, Abbott LibreLinkUp Partner Cloud). It strictly rejects unauthenticated or reverse-engineered scraping endpoints.
        </p>
      </div>
    </div>
  );
};
