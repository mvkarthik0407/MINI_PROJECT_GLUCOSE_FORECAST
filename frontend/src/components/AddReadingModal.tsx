import React, { useState } from 'react';
import { api } from '../services/api';
import { X, AlertCircle, Sparkles, ChevronDown } from 'lucide-react';

interface AddReadingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AddReadingModal: React.FC<AddReadingModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [entryMode, setEntryMode] = useState<'cgm' | 'fingerstick'>('cgm');
  const [unit, setUnit] = useState<'mg/dL' | 'mmol/L'>('mg/dL');
  const [value, setValue] = useState<string>('110');
  const [syncTwin, setSyncTwin] = useState<boolean>(true);
  const [meterFlag, setMeterFlag] = useState<string>('');
  const [contextTag, setContextTag] = useState<string>('after meal');
  const [timestamp, setTimestamp] = useState<string>(
    new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  );
  const [deviceLabel, setDeviceLabel] = useState<string>('Contour Next Gen');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [backdateWarning, setBackdateWarning] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleUnitToggle = (newUnit: 'mg/dL' | 'mmol/L') => {
    if (newUnit === unit) return;
    if (value && !isNaN(Number(value))) {
      const num = Number(value);
      if (newUnit === 'mmol/L') {
        setValue((num / 18.016).toFixed(1));
      } else {
        setValue(Math.round(num * 18.016).toString());
      }
    }
    setUnit(newUnit);
  };

  const handleMeterFlagSelect = (flag: 'LO' | 'HI') => {
    if (meterFlag === flag) {
      setMeterFlag('');
      setValue('110');
    } else {
      setMeterFlag(flag);
      if (flag === 'LO') {
        setValue(unit === 'mg/dL' ? '20' : (20 / 18.016).toFixed(1));
      } else if (flag === 'HI') {
        setValue(unit === 'mg/dL' ? '600' : (600 / 18.016).toFixed(1));
      }
    }
  };

  const adjustValue = (delta: number) => {
    setMeterFlag('');
    const currentNum = parseFloat(value) || 100;
    const step = unit === 'mmol/L' ? delta * 0.1 : delta;
    const nextVal = Math.max(unit === 'mmol/L' ? 1.1 : 20, Math.min(unit === 'mmol/L' ? 33.3 : 600, currentNum + step));
    setValue(unit === 'mmol/L' ? nextVal.toFixed(1) : Math.round(nextVal).toString());
  };

  const quickPresets = unit === 'mg/dL' ? [70, 95, 115, 140, 180, 220] : [3.9, 5.3, 6.4, 7.8, 10.0, 12.2];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate timestamp
    const enteredDate = new Date(timestamp);
    const now = new Date();
    if (enteredDate > now) {
      setError('Future readings cannot be recorded. Please select current or past time.');
      return;
    }

    const diffHours = (now.getTime() - enteredDate.getTime()) / (1000 * 3600);
    if (diffHours > 24 && !backdateWarning) {
      setBackdateWarning(true);
      return;
    }

    // Validate numeric value
    const numVal = parseFloat(value);
    if (isNaN(numVal) && !meterFlag) {
      setError('Please enter a valid numeric glucose reading or select LO/HI.');
      return;
    }

    // Convert to mg/dL for range check
    const mgdl = unit === 'mmol/L' ? numVal * 18.016 : numVal;
    if (mgdl < 20 || mgdl > 600) {
      setError(`Value out of physiological range (20 - 600 mg/dL). Entered: ${mgdl.toFixed(1)} mg/dL.`);
      return;
    }

    setLoading(true);
    try {
      if (entryMode === 'cgm') {
        await api.syncCgmReading(numVal, unit);
      } else {
        await api.addManualReading({
          value: numVal,
          unit: unit,
          timestamp: new Date(timestamp).toISOString(),
          context_tag: contextTag,
          meter_flag: meterFlag || undefined,
          device_label: deviceLabel,
          sync_twin: syncTwin
        });
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to submit reading.');
    } finally {
      setLoading(false);
    }
  };

  const contextTags = [
    { id: 'fasting', label: 'Fasting' },
    { id: 'before meal', label: 'Before Meal' },
    { id: 'after meal', label: 'After Meal' },
    { id: 'bedtime', label: 'Bedtime' },
    { id: 'symptoms', label: 'Symptoms' },
    { id: 'other', label: 'Routine' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/70 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden max-h-[92vh] flex flex-col animate-in slide-in-from-bottom duration-200">
        
        {/* Mobile Drag Pill */}
        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mt-3 mb-1 sm:hidden flex-shrink-0" />

        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
              entryMode === 'cgm' ? 'bg-indigo-100 text-indigo-700' : 'bg-purple-100 text-purple-700'
            }`}>
              {entryMode === 'cgm' ? '📡' : '🩸'}
            </div>
            <div>
              <h3 className="font-black text-slate-800 text-base leading-tight">
                {entryMode === 'cgm' ? 'Enter Glucose (Twin Forecast)' : 'Log Capillary Fingerstick'}
              </h3>
              <p className="text-[11px] text-slate-400 font-medium">
                {entryMode === 'cgm' ? 'Directly drives 30m & 60m GRU Neural Forecast' : 'Recorded for patient diary & calibration'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Source Mode Switcher */}
        <div className="px-5 pt-3">
          <div className="grid grid-cols-2 bg-slate-100 p-1 rounded-2xl gap-1">
            <button
              type="button"
              onClick={() => setEntryMode('cgm')}
              className={`py-2 px-3 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                entryMode === 'cgm' 
                  ? 'bg-white text-indigo-700 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>📡 CGM & Forecast</span>
            </button>
            <button
              type="button"
              onClick={() => setEntryMode('fingerstick')}
              className={`py-2 px-3 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                entryMode === 'fingerstick' 
                  ? 'bg-white text-purple-700 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>🩸 Fingerstick</span>
            </button>
          </div>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {backdateWarning && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl text-xs space-y-2">
              <div className="font-bold flex items-center gap-1.5 text-amber-700">
                <AlertCircle className="w-4 h-4" />
                <span>Reading Backdated &gt; 24 Hours</span>
              </div>
              <p>You are recording a reading older than 24 hours. Confirm to record in historical audit log?</p>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setBackdateWarning(false); handleSubmit({ preventDefault: () => {} } as any); }}
                  className="px-4 py-1.5 bg-amber-600 text-white rounded-xl font-bold text-xs"
                >
                  Confirm & Save
                </button>
                <button
                  type="button"
                  onClick={() => setBackdateWarning(false)}
                  className="px-4 py-1.5 bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Unit Switcher & Meter Flags */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => handleUnitToggle('mg/dL')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  unit === 'mg/dL' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'
                }`}
              >
                mg/dL
              </button>
              <button
                type="button"
                onClick={() => handleUnitToggle('mmol/L')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  unit === 'mmol/L' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'
                }`}
              >
                mmol/L
              </button>
            </div>

            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => handleMeterFlagSelect('LO')}
                className={`px-3 py-1.5 text-xs font-black rounded-xl border transition-all ${
                  meterFlag === 'LO' 
                    ? 'bg-red-600 text-white border-red-600 shadow-sm' 
                    : 'bg-slate-50 text-red-600 border-red-200 hover:bg-red-50'
                }`}
              >
                LO (&lt;20)
              </button>
              <button
                type="button"
                onClick={() => handleMeterFlagSelect('HI')}
                className={`px-3 py-1.5 text-xs font-black rounded-xl border transition-all ${
                  meterFlag === 'HI' 
                    ? 'bg-rose-700 text-white border-rose-700 shadow-sm' 
                    : 'bg-slate-50 text-rose-700 border-rose-200 hover:bg-rose-50'
                }`}
              >
                HI (&gt;600)
              </button>
            </div>
          </div>

          {/* Large Ergonomic Touch Value Controller */}
          <div className="bg-slate-50/80 p-4 rounded-3xl border border-slate-200/80 flex flex-col items-center justify-center space-y-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Glucose Level ({unit})
            </div>

            <div className="flex items-center justify-center gap-4 w-full">
              <button
                type="button"
                onClick={() => adjustValue(-5)}
                className="w-12 h-12 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-center text-2xl font-bold text-slate-700 active:scale-95 transition-transform"
              >
                -
              </button>

              <input
                type="number"
                step={unit === 'mmol/L' ? '0.1' : '1'}
                value={value}
                onChange={(e) => { setValue(e.target.value); setMeterFlag(''); }}
                className="w-32 text-center text-4xl font-black text-slate-900 bg-transparent focus:outline-none tracking-tight"
                required
              />

              <button
                type="button"
                onClick={() => adjustValue(5)}
                className="w-12 h-12 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-center text-2xl font-bold text-slate-700 active:scale-95 transition-transform"
              >
                +
              </button>
            </div>

            {/* Quick Preset Pills */}
            <div className="flex items-center gap-1.5 flex-wrap justify-center pt-1">
              {quickPresets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => { setValue(preset.toString()); setMeterFlag(''); }}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg bg-white border border-slate-200 text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Context Tag Chips */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-2">Timing / Context</label>
            <div className="grid grid-cols-3 gap-2">
              {contextTags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => setContextTag(tag.id)}
                  className={`py-2 px-1 text-xs font-bold rounded-xl border text-center transition-all ${
                    contextTag === tag.id
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {tag.label}
                </button>
              ))}
            </div>
          </div>

          {/* Timestamp & Meter Model */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">Time Measured</label>
              <input
                type="datetime-local"
                value={timestamp}
                onChange={(e) => setTimestamp(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">Meter Label</label>
              <input
                type="text"
                value={deviceLabel}
                onChange={(e) => setDeviceLabel(e.target.value)}
                placeholder="e.g. Contour Next"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 bg-white"
              />
            </div>
          </div>

          {/* Twin Synchronization Option (Fingerstick Mode) */}
          {entryMode === 'fingerstick' && (
            <div className="p-3 bg-indigo-50/80 border border-indigo-100 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                <div>
                  <span className="text-xs font-bold text-slate-800 block">Sync Digital Twin Forecast</span>
                  <span className="text-[10px] text-slate-500">Recalculate 6-step forecast from this reading</span>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={syncTwin}
                  onChange={(e) => setSyncTwin(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>
          )}

          <div className="pt-2 pb-2">
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3.5 text-white rounded-2xl font-black text-sm shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${
                entryMode === 'cgm' || syncTwin 
                  ? 'bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99]' 
                  : 'bg-purple-600 hover:bg-purple-700 active:scale-[0.99]'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>
                {loading 
                  ? 'Recalculating Twin Forecast...' 
                  : entryMode === 'cgm' 
                    ? 'Update Glucose & Recalculate Forecast' 
                    : syncTwin 
                      ? 'Save Fingerstick & Update Forecast' 
                      : 'Save Fingerstick to Diary'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
