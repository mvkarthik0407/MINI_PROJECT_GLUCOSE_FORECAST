import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { 
  Sliders, 
  AlertTriangle, 
  ArrowRight, 
  RotateCcw, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Clock,
  Layers
} from 'lucide-react';

export const WhatIfSimulator: React.FC = () => {
  const [shift, setShift] = useState<number>(10);
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAllSteps, setShowAllSteps] = useState<boolean>(false);

  const runSimulation = async (shiftValue: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.runWhatIf(shiftValue);
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Simulation failed.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Run initial simulation on mount with +10 mg/dL default
    runSimulation(shift);
  }, []);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setShift(val);
    runSimulation(val);
  };

  const handleQuickShift = (val: number) => {
    setShift(val);
    runSimulation(val);
  };

  const handleReset = () => {
    setShift(0);
    runSimulation(0);
  };

  const getStatusBadge = (val: number) => {
    if (val < 54) {
      return { label: 'Critical Low', bg: 'bg-red-100 text-red-800 border-red-200' };
    } else if (val < 70) {
      return { label: 'Low', bg: 'bg-amber-100 text-amber-800 border-amber-200' };
    } else if (val <= 180) {
      return { label: 'In Range', bg: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
    } else if (val <= 250) {
      return { label: 'High', bg: 'bg-orange-100 text-orange-800 border-orange-200' };
    } else {
      return { label: 'Very High', bg: 'bg-purple-100 text-purple-800 border-purple-200' };
    }
  };

  const points = result?.perturbed_points || [];
  const displayPoints = showAllSteps ? points : points.slice(0, 6);

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-4 sm:p-6 space-y-6 max-w-3xl mx-auto">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Sliders className="w-4 h-4" />
            </div>
            <span>What-If Trajectory Simulation</span>
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Simulate acute glucose shifts (±50 mg/dL) to inspect the 2-Layer GRU model's discrete step-by-step forecast response.
          </p>
        </div>

        <button
          onClick={handleReset}
          className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all flex items-center gap-1.5 self-start sm:self-auto"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset (0)</span>
        </button>
      </div>

      {/* Safety Notice Banner */}
      <div className="p-3.5 bg-amber-50/90 border border-amber-200 rounded-2xl text-amber-900 text-xs flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
        <div className="space-y-1">
          <div className="font-bold">Educational Exploratory Decision Support Only</div>
          <p className="leading-relaxed text-[11px] text-amber-800">
            This tool demonstrates mathematical sensitivity of the neural forecasting twin. It is <strong>NOT a physiological simulator</strong> (does not model insulin pharmacokinetics or meal digestion) and must <strong>NEVER be used to calculate insulin doses or meal correction</strong>.
          </p>
        </div>
      </div>

      {/* Interactive Controls & Quick Preset Chips */}
      <div className="space-y-4 bg-slate-50/80 p-4 sm:p-5 rounded-2xl border border-slate-100">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-700">Hypothetical Glucose Shift:</span>
          <div className="flex items-center gap-2">
            <span className={`text-base font-black px-3 py-1 rounded-xl shadow-xs ${
              shift > 0 
                ? 'bg-amber-500 text-white' 
                : shift < 0 
                ? 'bg-red-500 text-white' 
                : 'bg-slate-200 text-slate-800'
            }`}>
              {shift > 0 ? `+${shift}` : shift} mg/dL
            </span>
            {loading && <span className="text-[11px] text-indigo-600 font-semibold animate-pulse">Calculating...</span>}
          </div>
        </div>

        {/* Range Slider */}
        <input
          type="range"
          min="-50"
          max="50"
          step="5"
          value={shift}
          onChange={handleSliderChange}
          className="w-full h-2.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
        />

        <div className="flex justify-between text-[10px] text-slate-400 font-bold">
          <span>-50 mg/dL (Acute drop)</span>
          <span>Baseline (0)</span>
          <span>+50 mg/dL (Acute spike)</span>
        </div>

        {/* Quick Click Chips */}
        <div className="pt-2 border-t border-slate-200/60">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            Quick Shift Presets (Tap to Test):
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[-20, -10, -5, 0, 5, 10, 15, 20, 30].map((preset) => (
              <button
                key={preset}
                onClick={() => handleQuickShift(preset)}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                  shift === preset
                    ? 'bg-indigo-600 text-white shadow-xs scale-105'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                {preset > 0 ? `+${preset}` : preset}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-2xl">
          {error}
        </div>
      )}

      {/* Discrete Forecast Steps Display (6-Step / 30m Grid) */}
      {points.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-600" />
                <span>
                  {showAllSteps ? 'Full 12-Step Forecast Trajectory (+5m to +60m)' : 'Next 6 Forecast Values (+5m to +30m)'}
                </span>
              </h4>
              <p className="text-[11px] text-slate-500">
                Discrete 5-minute projections comparing baseline vs. shifted (+{shift} mg/dL) trajectory with 90% confidence bands.
              </p>
            </div>

            <button
              onClick={() => setShowAllSteps(!showAllSteps)}
              className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center gap-1 flex-shrink-0"
            >
              <span>{showAllSteps ? 'Show 6 Steps (30m)' : 'Show All 12 (60m)'}</span>
              {showAllSteps ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>

          {/* Discrete Forecast Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
            {displayPoints.map((pt: any, idx: number) => {
              const pertVal = Math.round(pt.perturbed_prediction_mgdl);
              const baseVal = Math.round(pt.baseline_prediction_mgdl);
              const delta = pertVal - baseVal;
              const status = getStatusBadge(pertVal);
              const stepMin = pt.horizon_minutes || (idx + 1) * 5;

              return (
                <div 
                  key={idx} 
                  className={`p-3 sm:p-3.5 rounded-2xl border transition-all ${
                    idx < 6 ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-50/70 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] mb-1.5">
                    <span className="font-extrabold text-slate-600 flex items-center gap-1">
                      <span className="w-4 h-4 rounded-full bg-slate-100 text-slate-600 inline-flex items-center justify-center text-[10px]">
                        {idx + 1}
                      </span>
                      <span>+{stepMin} min</span>
                    </span>
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md border ${status.bg}`}>
                      {status.label}
                    </span>
                  </div>

                  {/* Perturbed Value */}
                  <div className="flex items-baseline gap-1 my-1">
                    <span className="text-xl sm:text-2xl font-black text-indigo-700 tracking-tight">
                      {pertVal}
                    </span>
                    <span className="text-[10px] text-slate-500 font-bold">mg/dL</span>
                    
                    {delta !== 0 && (
                      <span className={`text-[10px] font-bold ml-auto flex items-center gap-0.5 ${
                        delta > 0 ? 'text-amber-600' : 'text-blue-600'
                      }`}>
                        {delta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {delta > 0 ? `+${delta}` : delta}
                      </span>
                    )}
                  </div>

                  {/* Baseline Comparison */}
                  <div className="text-[10px] text-slate-500 flex justify-between items-center py-1 border-t border-slate-100">
                    <span>Baseline:</span>
                    <span className="font-bold text-slate-700">{baseVal} mg/dL</span>
                  </div>

                  {/* 90% Conformal Band */}
                  <div className="text-[9px] text-slate-400 flex justify-between items-center pt-0.5">
                    <span>90% Band:</span>
                    <span className="font-semibold text-slate-600">
                      [{Math.round(pt.lower_bound_90)}–{Math.round(pt.upper_bound_90)}]
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick Summary Highlights for 30m and 60m */}
          {points.length >= 6 && (
            <div className="p-3.5 bg-indigo-50/60 border border-indigo-100 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                <span className="font-bold text-indigo-950">Key Milestones:</span>
              </div>
              <div className="flex items-center gap-4 text-indigo-900 font-medium">
                <div>
                  <span className="text-indigo-600 font-bold">At +30 min:</span>{' '}
                  <strong>{Math.round(points[5].perturbed_prediction_mgdl)} mg/dL</strong>{' '}
                  <span className="text-[10px] text-indigo-500">(Baseline: {Math.round(points[5].baseline_prediction_mgdl)})</span>
                </div>
                {points[11] && (
                  <div>
                    <span className="text-indigo-600 font-bold">At +60 min:</span>{' '}
                    <strong>{Math.round(points[11].perturbed_prediction_mgdl)} mg/dL</strong>{' '}
                    <span className="text-[10px] text-indigo-500">(Baseline: {Math.round(points[11].baseline_prediction_mgdl)})</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
