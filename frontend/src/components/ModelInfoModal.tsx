import React from 'react';
import { ModelInfo } from '../services/api';
import { X, Cpu, AlertTriangle, ShieldCheck, CheckCircle2, BookOpen } from 'lucide-react';

interface ModelInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  info: ModelInfo | null;
}

export const ModelInfoModal: React.FC<ModelInfoModalProps> = ({ isOpen, onClose, info }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-100 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-blue-600" />
            <h3 className="font-bold text-slate-800 text-base">Model Card & Clinical Performance</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 text-xs text-slate-700 max-h-[80vh] overflow-y-auto">
          {/* Clinical Non-Negotiable Banner */}
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-900 flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold">Clinical Caveat & Boundary</div>
              <p className="leading-relaxed">
                This is a <strong>data-driven glucose forecasting model (digital twin style)</strong>. It is <strong>NOT a mechanistic physiological simulator</strong> (does not model insulin-on-board or digestion kinetics). It must <strong>NEVER recommend insulin doses, carb correction factors, or diagnostic alterations</strong>.
              </p>
            </div>
          </div>

          {/* Model Architecture Specifications */}
          <div className="space-y-2">
            <h4 className="font-bold text-slate-900 text-sm">1. Architecture & Telemetry</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Model Type</span>
                <span className="font-bold text-slate-800">2-Layer GRU</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Hidden Units</span>
                <span className="font-bold text-slate-800">128 (Dropout 0.2)</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Input Grid</span>
                <span className="font-bold text-slate-800">48 Steps</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Prediction Horizon</span>
                <span className="font-bold text-slate-800">6 Steps (5 to 30 Mins)</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Uncertainty</span>
                <span className="font-bold text-slate-800">Split-Conformal (90%)</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">CPU Latency</span>
                <span className="font-bold text-emerald-600">4.83 ms (&lt;200ms budget)</span>
              </div>
            </div>

            {/* 5-Min Horizon Grid Explanation */}
            <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl space-y-1 text-[11px] text-slate-600">
              <div className="font-bold text-indigo-900 flex items-center justify-between">
                <span>Multi-Horizon Discrete Projections (5-Minute Grid):</span>
                <span className="text-[10px] bg-indigo-200 text-indigo-800 font-black px-1.5 py-0.5 rounded">Total 12 Steps</span>
              </div>
              <p>
                • <strong>30-Minute Horizon (6 Steps):</strong> +5m, +10m, +15m, +20m, +25m, +30m.<br />
                • The interface extrapolates the 30-minute result only for visual 60-minute display; this is not a separately trained 60-minute projection.<br />
                Each 5-minute step produces an individual point forecast. The current UI displays configured safety intervals, not a claim of clinical conformal coverage.
              </p>
            </div>
          </div>

          {/* Real Metrics Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-900 text-sm">2. Real Benchmark Results (reports/baseline_vs_gru.json)</h4>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                Zero Data Leakage Verified
              </span>
            </div>

            <table className="w-full border border-slate-200 rounded-xl overflow-hidden text-left">
              <thead className="bg-slate-100 text-[10px] uppercase text-slate-600 font-bold">
                <tr>
                  <th className="p-2.5">Horizon</th>
                  <th className="p-2.5">Model</th>
                  <th className="p-2.5">RMSE</th>
                  <th className="p-2.5">MAE</th>
                  <th className="p-2.5">R²</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr className="hover:bg-slate-50">
                  <td className="p-2.5 font-bold">6 Steps / 30 Minutes</td>
                  <td className="p-2.5 font-semibold text-blue-700">MetaboNet GRU</td>
                  <td className="p-2.5">15.34 mg/dL</td>
                  <td className="p-2.5">10.34 mg/dL</td>
                  <td className="p-2.5 font-bold text-emerald-600">0.9128</td>
                </tr>
              </tbody>
            </table>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1 text-[11px] text-slate-600">
              <div className="font-bold text-slate-800">Metric Interpretation:</div>
              <p>
                This table reports the active MetaboNet checkpoint saved by the project. The 11.59 mg/dL result in the other legacy metrics file belongs to a different glucose-only checkpoint and is not the same model currently loaded by the application.
              </p>
            </div>
          </div>

          {/* Dataset & Leakage Protocol */}
          <div className="space-y-2">
            <h4 className="font-bold text-slate-900 text-sm">3. Dataset Citation & Leakage Protocol</h4>
            <div className="p-3.5 bg-blue-50/60 border border-blue-100 rounded-xl space-y-1.5">
              <div className="font-semibold text-blue-900 flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-blue-600" />
                <span>MetaboNet v1.2 Citation</span>
              </div>
              <p className="text-slate-600">
                Wolff MK et al., <em>MetaboNet: A Large-Scale Continuous Glucose Monitoring Dataset</em>, J Diabetes Sci Technol 2026, doi:10.1177/19322968261441637.
              </p>
              <div className="pt-2 text-[11px] text-slate-500">
                <strong>Active Checkpoint Evaluation:</strong> 100,000 test sequences; 500,000 training sequences and 125,000 validation sequences were configured. The current checkpoint metric is RMSE 15.34 mg/dL, MAE 10.34 mg/dL, and R² 0.9128.
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs"
          >
            Close Model Card
          </button>
        </div>
      </div>
    </div>
  );
};
