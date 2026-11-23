import React, { useState } from 'react';
import { CurrentReading, LatestForecast, Reading, GlucoseStats, parseUtcTimestamp } from '../services/api';
import { 
  Activity, 
  Clock, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  Sparkles,
  Info,
  Calendar,
  Layers,
  ChevronRight,
  Zap,
  Volume2,
  AlertOctagon
} from 'lucide-react';

interface DashboardProps {
  current: CurrentReading | null;
  forecast: LatestForecast | null;
  readings: Reading[];
  stats: GlucoseStats | null;
  onOpenManualModal: () => void;
  onOpenModelInfo: () => void;
  onConnectStream?: () => void;
  isConnecting?: boolean;
}

export const Dashboard: React.FC<DashboardProps> = ({
  current,
  forecast,
  readings,
  stats,
  onOpenManualModal,
  onOpenModelInfo,
  onConnectStream,
  isConnecting = false
}) => {
  const [timeRangeHours, setTimeRangeHours] = useState<number>(3); // Default 3h for clean mobile view
  const [forecastStepsMode, setForecastStepsMode] = useState<6 | 12>(6); // Default 6 steps for 30 min
  const [selectedPoint, setSelectedPoint] = useState<any | null>(null);

  // Range styling
  const getRangeConfig = (val: number) => {
    if (val < 54) {
      return {
        label: 'CRITICAL LOW',
        bg: 'bg-red-500',
        text: 'text-white',
        border: 'border-red-600',
        cardBg: 'bg-gradient-to-b from-red-600 to-red-700 text-white',
        ring: 'ring-red-400',
        accent: 'text-red-100'
      };
    }
    if (val < 70) {
      return {
        label: 'BELOW TARGET',
        bg: 'bg-amber-500',
        text: 'text-white',
        border: 'border-amber-600',
        cardBg: 'bg-gradient-to-b from-amber-500 to-amber-600 text-white',
        ring: 'ring-amber-300',
        accent: 'text-amber-100'
      };
    }
    if (val <= 180) {
      return {
        label: 'IN TARGET',
        bg: 'bg-emerald-500',
        text: 'text-white',
        border: 'border-emerald-600',
        cardBg: 'bg-gradient-to-b from-emerald-600 to-teal-700 text-white',
        ring: 'ring-emerald-400',
        accent: 'text-emerald-100'
      };
    }
    if (val <= 250) {
      return {
        label: 'ABOVE TARGET',
        bg: 'bg-amber-500',
        text: 'text-white',
        border: 'border-amber-600',
        cardBg: 'bg-gradient-to-b from-amber-600 to-orange-700 text-white',
        ring: 'ring-amber-300',
        accent: 'text-amber-100'
      };
    }
    return {
      label: 'CRITICAL HIGH',
      bg: 'bg-rose-700',
      text: 'text-white',
      border: 'border-rose-800',
      cardBg: 'bg-gradient-to-b from-rose-700 to-red-900 text-white',
      ring: 'ring-rose-400',
      accent: 'text-rose-100'
    };
  };

  const currentCfg = current 
    ? getRangeConfig(current.value_mg_dl) 
    : { label: 'CONNECTING', bg: 'bg-slate-500', text: 'text-white', border: 'border-slate-600', cardBg: 'bg-slate-800 text-white', ring: 'ring-slate-400', accent: 'text-slate-300' };

  // Trend icon
  const renderTrendIcon = (arrow?: string) => {
    if (arrow === '↑↑' || arrow === '↑') return <TrendingUp className="w-8 h-8 text-white animate-pulse" />;
    if (arrow === '↓↓' || arrow === '↓') return <TrendingDown className="w-8 h-8 text-white animate-pulse" />;
    return <Minus className="w-8 h-8 text-white/90" />;
  };

  // SVG Chart Dimensions (Responsive mobile-friendly coordinate space)
  const svgWidth = 600;
  const svgHeight = 270;
  const padding = { top: 24, right: 28, bottom: 42, left: 42 };
  const chartW = svgWidth - padding.left - padding.right;
  const chartH = svgHeight - padding.top - padding.bottom;

  // Chronologically sorted readings using robust UTC parser
  const sortedReadings = [...readings].sort(
    (a, b) => parseUtcTimestamp(a.timestamp) - parseUtcTimestamp(b.timestamp)
  );

  // Anchor "present" to the latest available reading (or current time)
  const lastReadingTime = sortedReadings.length > 0
    ? parseUtcTimestamp(sortedReadings[sortedReadings.length - 1].timestamp)
    : Date.now();

  const anchorTime = lastReadingTime;
  const windowStart = anchorTime - timeRangeHours * 3600 * 1000;

  // Filter visible points within the selected time window (with 15m buffer)
  const visibleReadings = sortedReadings.filter(
    r => parseUtcTimestamp(r.timestamp) >= windowStart - 15 * 60 * 1000
  );

  const tMin = windowStart;
  const tMax = forecast && forecast.available && forecast.points.length > 0
    ? Math.max(anchorTime + 60 * 60 * 1000, parseUtcTimestamp(forecast.points[forecast.points.length - 1].forecast_timestamp))
    : anchorTime + 60 * 60 * 1000;

  const getX = (timestamp: string | number) => {
    const t = parseUtcTimestamp(timestamp);
    if (tMax <= tMin) return padding.left;
    const ratio = Math.max(0, Math.min(1, (t - tMin) / (tMax - tMin)));
    return padding.left + ratio * chartW;
  };

  const cgmPoints = visibleReadings.filter(r => r.source === 'cgm');
  const manualPoints = visibleReadings.filter(r => r.source === 'manual');

  // Dynamic Y bounds to scale properly with patient readings
  const allValues = [
    ...visibleReadings.map(r => r.value_mg_dl),
    ...(forecast && forecast.available ? forecast.points.map(p => p.predicted_mg_dl) : [])
  ];
  const dataMin = allValues.length > 0 ? Math.min(...allValues) : 70;
  const dataMax = allValues.length > 0 ? Math.max(...allValues) : 180;

  const yMin = Math.max(30, Math.min(50, Math.floor((dataMin - 15) / 10) * 10));
  const yMax = Math.min(500, Math.max(220, Math.ceil((dataMax + 25) / 20) * 20));
  const getY = (val: number) => chartH - ((Math.min(Math.max(val, yMin), yMax) - yMin) / (yMax - yMin)) * chartH + padding.top;

  const cgmPath = cgmPoints.length > 1 
    ? cgmPoints.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(p.timestamp).toFixed(1)} ${getY(p.value_mg_dl).toFixed(1)}`).join(' ')
    : '';

  // Forecast polyline path & 90% confidence ribbon
  let forecastPath = '';
  let forecastBandPath = '';
  if (forecast && forecast.available && forecast.points.length > 0) {
    const pts = forecast.points;
    const startX = cgmPoints.length > 0 ? getX(cgmPoints[cgmPoints.length - 1].timestamp) : getX(pts[0].forecast_timestamp);
    const startY = cgmPoints.length > 0 ? getY(cgmPoints[cgmPoints.length - 1].value_mg_dl) : getY(pts[0].predicted_mg_dl);

    forecastPath = `M ${startX.toFixed(1)} ${startY.toFixed(1)} ` + pts.map(p => `L ${getX(p.forecast_timestamp).toFixed(1)} ${getY(p.predicted_mg_dl).toFixed(1)}`).join(' ');

    const upperPts = pts.map(p => `${getX(p.forecast_timestamp).toFixed(1)} ${getY(p.upper_bound_90).toFixed(1)}`);
    const lowerPts = [...pts].reverse().map(p => `${getX(p.forecast_timestamp).toFixed(1)} ${getY(p.lower_bound_90).toFixed(1)}`);
    
    forecastBandPath = `M ${startX.toFixed(1)} ${startY.toFixed(1)} ` + 
      upperPts.map(pt => `L ${pt}`).join(' ') + 
      lowerPts.map(pt => `L ${pt}`).join(' ') + ' Z';
  }

  // 30m forecast summary
  const fc30 = forecast?.points?.[5] || forecast?.points?.[0];

  // X-axis Time Markers (4-5 evenly distributed markers + NOW line)
  const nowX = getX(anchorTime);
  const timeTicks: { time: number; label: string; x: number }[] = [];
  const numTicks = 4;
  for (let i = 0; i <= numTicks; i++) {
    const t = tMin + (i / numTicks) * (tMax - tMin);
    const d = new Date(t);
    const label = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    timeTicks.push({ time: t, label, x: getX(t) });
  }

  return (
    <div className="space-y-4 max-w-xl mx-auto pb-6">
      
      {/* 1. HERO GLUCOSE WIDGET (Mobile Patient App Style) */}
      <div className={`rounded-3xl shadow-lg p-5 relative overflow-hidden transition-all ${currentCfg.cardBg}`}>
        {/* Background decorative curve */}
        <div className="absolute -right-8 -bottom-8 w-44 h-44 rounded-full bg-white/10 blur-xl pointer-events-none" />

        <div className="flex items-center justify-between pb-3 border-b border-white/15">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
            <span className="text-xs font-black uppercase tracking-wider text-white/90">
              {current?.is_stale ? 'STALE SENSOR' : 'LIVE GLUCOSE'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-md text-white">
              {current?.source?.toUpperCase() || 'CGM'} • {current?.is_stale ? '>15m ago' : `${current?.age_minutes ?? 0}m ago`}
            </span>
          </div>
        </div>

        {/* Big Glucose Display */}
        <div className="py-4 flex items-center justify-between">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-6xl sm:text-7xl font-black tracking-tight leading-none text-white drop-shadow-sm">
                {current ? Math.round(current.value_mg_dl) : '--'}
              </span>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-white/80">{current?.unit || 'mg/dL'}</span>
                <span className="text-[10px] font-bold text-white/70">Target: 70-180</span>
              </div>
            </div>

            <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-slate-900 font-black text-xs shadow-xs">
              <span>{currentCfg.label}</span>
            </div>
          </div>

          {/* Trend Indicator Icon */}
          <div className="flex flex-col items-center justify-center bg-white/15 backdrop-blur-md p-3.5 rounded-2xl border border-white/20">
            {renderTrendIcon(current?.trend_arrow)}
            <span className="text-[11px] font-bold text-white mt-1">
              {current?.trend_arrow ? `${current.trend_arrow}` : 'Stable'}
            </span>
            {current?.rate_of_change_mgdl_min !== undefined && current.rate_of_change_mgdl_min !== 0 && (
              <span className="text-[10px] font-medium text-white/80 mt-0.5">
                {current.rate_of_change_mgdl_min > 0 ? '+' : ''}{current.rate_of_change_mgdl_min.toFixed(1)}/m
              </span>
            )}
          </div>
        </div>

        {/* Digital Twin 30-Min Forecast Preview Pill */}
        {fc30 && forecast?.available ? (
          <div className="mt-2 p-3 bg-white/15 backdrop-blur-md rounded-2xl border border-white/20 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-300" />
              <div>
                <span className="font-bold text-white">Twin 30m Forecast: </span>
                <span className="font-black text-white">{Math.round(fc30.predicted_mg_dl)} mg/dL</span>
                <span className="text-[10px] text-white/80 ml-1">
                  [{Math.round(fc30.lower_bound_90)}-{Math.round(fc30.upper_bound_90)}]
                </span>
              </div>
            </div>
            <button 
              onClick={onOpenModelInfo}
              className="text-[10px] font-bold px-2 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-white transition-colors"
            >
              Info
            </button>
          </div>
        ) : (
          <div className="mt-2 p-3 bg-black/30 backdrop-blur-md rounded-2xl border border-white/10 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs text-white">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-300 animate-pulse flex-shrink-0" />
              <span className="text-[11px] text-white/90">
                {forecast?.message || 'CGM sensor signal idle (>20m). Tap to activate real-time stream.'}
              </span>
            </div>
            {onConnectStream && (
              <button
                type="button"
                onClick={onConnectStream}
                disabled={isConnecting}
                className="w-full sm:w-auto px-3.5 py-1.5 bg-amber-400 hover:bg-amber-300 active:scale-95 text-slate-900 rounded-xl text-xs font-black shadow-sm flex items-center justify-center gap-1.5 transition-all flex-shrink-0"
              >
                <Zap className="w-3.5 h-3.5 fill-current" />
                <span>{isConnecting ? 'Connecting...' : 'Connect Sensor'}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* 2. MOBILE CONTINUOUS GLUCOSE CHART */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-4 sm:p-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="font-black text-slate-800 text-sm flex items-center gap-1.5">
              <span>Continuous Profile</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded-md border border-indigo-200">
                +60m GRU
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">Green band: Target (70-180 mg/dL)</p>
          </div>

          {/* Time Range Selector Chips (Mobile Pinch Alternative) */}
          <div className="flex bg-slate-100 p-1 rounded-xl gap-0.5">
            {[1, 3, 6, 24].map((hrs) => (
              <button
                key={hrs}
                onClick={() => setTimeRangeHours(hrs)}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                  timeRangeHours === hrs 
                    ? 'bg-white text-blue-700 shadow-xs' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {hrs}h
              </button>
            ))}
          </div>
        </div>

        {/* Selected Data Point Mobile Pill */}
        {selectedPoint && (
          <div className="mt-2.5 p-2 bg-slate-900 text-white rounded-xl text-xs flex items-center justify-between animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <span className="font-bold text-amber-300 uppercase text-[10px]">
                {selectedPoint.isForecast ? `Forecast (${selectedPoint.horizon_minutes}m)` : selectedPoint.source}
              </span>
              <span className="font-black text-sm">
                {Math.round(selectedPoint.isForecast ? selectedPoint.predicted_mg_dl : selectedPoint.value_mg_dl)} mg/dL
              </span>
              {selectedPoint.isForecast && (
                <span className="text-[10px] text-slate-300">
                  [{Math.round(selectedPoint.lower_bound_90)}-{Math.round(selectedPoint.upper_bound_90)}]
                </span>
              )}
            </div>
            <button onClick={() => setSelectedPoint(null)} className="text-slate-400 hover:text-white text-[11px] font-bold">
              ✕
            </button>
          </div>
        )}

        {/* Responsive Chart Container */}
        <div className="mt-3 relative select-none">
          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-auto">
            {/* Shaded Target Range (70-180 mg/dL) */}
            <rect
              x={padding.left}
              y={getY(180)}
              width={chartW}
              height={Math.max(0, getY(70) - getY(180))}
              fill="#ECFDF5"
              opacity="0.85"
            />
            {/* Target boundary lines */}
            <line x1={padding.left} y1={getY(180)} x2={padding.left + chartW} y2={getY(180)} stroke="#10B981" strokeDasharray="3 3" strokeWidth="1" />
            <line x1={padding.left} y1={getY(70)} x2={padding.left + chartW} y2={getY(70)} stroke="#10B981" strokeDasharray="3 3" strokeWidth="1" />
            
            {/* Critical Low 54 line */}
            <line x1={padding.left} y1={getY(54)} x2={padding.left + chartW} y2={getY(54)} stroke="#EF4444" strokeDasharray="2 2" strokeWidth="1" />

            {/* Y Axis Grid & Labels */}
            {[54, 70, 140, 180, 250].filter(v => v >= yMin && v <= yMax).map((val) => (
              <g key={val}>
                <line x1={padding.left} y1={getY(val)} x2={padding.left + chartW} y2={getY(val)} stroke="#F1F5F9" strokeWidth="1" />
                <text x={padding.left - 6} y={getY(val) + 3} textAnchor="end" fontSize="9" fill="#94A3B8" fontWeight="700">
                  {val}
                </text>
              </g>
            ))}

            {/* X Axis Vertical Gridlines & Time Labels */}
            {timeTicks.map((tick, idx) => (
              <g key={idx}>
                <line x1={tick.x} y1={padding.top} x2={tick.x} y2={padding.top + chartH} stroke="#F1F5F9" strokeWidth="1" strokeDasharray="2 2" />
                <text x={tick.x} y={padding.top + chartH + 16} textAnchor="middle" fontSize="9" fill="#94A3B8" fontWeight="700">
                  {tick.label}
                </text>
              </g>
            ))}

            {/* Shaded 90% Conformal Prediction Ribbon */}
            {forecastBandPath && (
              <path
                d={forecastBandPath}
                fill="#6366F1"
                fillOpacity="0.18"
                stroke="#818CF8"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
            )}

            {/* GRU Forecast Trajectory Line */}
            {forecastPath && (
              <path
                d={forecastPath}
                fill="none"
                stroke="#4F46E5"
                strokeWidth="2.5"
                strokeDasharray="4 4"
              />
            )}

            {/* Continuous CGM Line */}
            {cgmPath && (
              <path
                d={cgmPath}
                fill="none"
                stroke="#2563EB"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Vertical "NOW" Marker Line and Pill */}
            {nowX >= padding.left && nowX <= padding.left + chartW && (
              <g>
                <line
                  x1={nowX}
                  y1={padding.top}
                  x2={nowX}
                  y2={padding.top + chartH}
                  stroke="#3B82F6"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />
                <rect
                  x={nowX - 16}
                  y={padding.top - 14}
                  width="32"
                  height="13"
                  rx="4"
                  fill="#3B82F6"
                />
                <text
                  x={nowX}
                  y={padding.top - 4}
                  textAnchor="middle"
                  fontSize="8"
                  fill="#FFFFFF"
                  fontWeight="900"
                >
                  NOW
                </text>
              </g>
            )}

            {/* CGM Data Dots */}
            {cgmPoints.map((pt) => (
              <circle
                key={pt.id}
                cx={getX(pt.timestamp)}
                cy={getY(pt.value_mg_dl)}
                r="3.5"
                className="fill-blue-600 hover:fill-blue-800 transition-transform active:scale-150 cursor-pointer"
                onClick={() => setSelectedPoint(pt)}
              />
            ))}

            {/* Manual Fingerstick Diamonds (Never connected by line!) */}
            {manualPoints.map((pt) => {
              const cx = getX(pt.timestamp);
              const cy = getY(pt.value_mg_dl);
              return (
                <g key={pt.id} transform={`translate(${cx}, ${cy}) rotate(45)`}
                   className="cursor-pointer"
                   onClick={() => setSelectedPoint(pt)}>
                  <rect
                    x="-5"
                    y="-5"
                    width="10"
                    height="10"
                    fill="#9333EA"
                    stroke="#FFFFFF"
                    strokeWidth="1.5"
                  />
                </g>
              );
            })}

            {/* Forecast Data Dots */}
            {forecast && forecast.available && forecast.points.map((pt, i) => (
              <circle
                key={i}
                cx={getX(pt.forecast_timestamp)}
                cy={getY(pt.predicted_mg_dl)}
                r="3"
                className="fill-indigo-600 hover:fill-indigo-800 active:scale-150 cursor-pointer"
                onClick={() => setSelectedPoint({ ...pt, isForecast: true })}
              />
            ))}

            {/* Empty state message if no readings */}
            {cgmPoints.length === 0 && manualPoints.length === 0 && (
              <text
                x={padding.left + chartW / 2}
                y={padding.top + chartH / 2}
                textAnchor="middle"
                fill="#94A3B8"
                fontSize="11"
                fontWeight="700"
              >
                No readings in this time window. Tap "Connect Sensor" above.
              </text>
            )}
          </svg>
        </div>

        {/* Legend Pills */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[10px] font-bold text-slate-500">
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-1 bg-blue-600 rounded-full" />
            <span>CGM Sensor</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 bg-purple-600 rotate-45 inline-block" />
            <span>Fingerstick</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-1 bg-indigo-600 border-t border-dashed" />
            <span>GRU Twin</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 bg-indigo-100 border border-indigo-300 rounded-xs" />
            <span>90% Bound</span>
          </div>
        </div>
      </div>

      {/* 2.5 UPCOMING 5-MINUTE DISCRETE FORECAST STEPS (TOTAL 6 FOR 30 MIN, 12 FOR 60 MIN) */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-black text-slate-800 text-xs uppercase tracking-wider">
                Digital Twin Forecast Steps
              </h4>
              <p className="text-[10px] text-slate-400 font-medium">
                {forecastStepsMode === 6 ? 'Next 30 Minutes • 6 Steps (Every 5 Min)' : 'Next 60 Minutes • 12 Steps (Every 5 Min)'}
              </p>
            </div>
          </div>

          <div className="flex bg-slate-100 p-1 rounded-xl gap-0.5">
            <button
              onClick={() => setForecastStepsMode(6)}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                forecastStepsMode === 6 ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500'
              }`}
            >
              30m (6 Steps)
            </button>
            <button
              onClick={() => setForecastStepsMode(12)}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                forecastStepsMode === 12 ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500'
              }`}
            >
              60m (12)
            </button>
          </div>
        </div>

        {forecast && forecast.available && forecast.points.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
            {forecast.points.slice(0, forecastStepsMode).map((pt, idx) => {
              const delta = current ? Math.round(pt.predicted_mg_dl - current.value_mg_dl) : 0;
              const clockTime = new Date(pt.forecast_timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              return (
                <div key={idx} className="bg-slate-50/90 rounded-2xl p-3 border border-slate-200/80 space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold">
                    <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded-md font-black">
                      +{pt.horizon_minutes}m
                    </span>
                    <span>{clockTime}</span>
                  </div>

                  <div className="flex items-baseline gap-1.5 pt-0.5">
                    <span className="text-xl font-black text-slate-900 tracking-tight">
                      {Math.round(pt.predicted_mg_dl)}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">mg/dL</span>
                    {delta !== 0 && (
                      <span className={`text-[10px] font-black ml-auto ${delta > 0 ? 'text-amber-600' : 'text-blue-600'}`}>
                        {delta > 0 ? `+${delta}` : delta}
                      </span>
                    )}
                  </div>

                  <div className="text-[9px] text-slate-500 font-semibold pt-1 border-t border-slate-200/60 flex items-center justify-between">
                    <span>90% CI:</span>
                    <strong className="text-slate-700">[{Math.round(pt.lower_bound_90)} - {Math.round(pt.upper_bound_90)}]</strong>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl text-xs text-slate-600 text-center space-y-2.5">
            <p className="font-bold text-slate-800">Digital Twin forecast is waiting for sensor stream.</p>
            <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
              The GRU model requires a contiguous stream to project trajectories. Tap below to enter your current glucose reading and generate the 6-step forecast instantly.
            </p>
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              {onConnectStream && (
                <button
                  type="button"
                  onClick={onConnectStream}
                  disabled={isConnecting}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-900 font-black text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5"
                >
                  <Zap className="w-3.5 h-3.5 fill-current" />
                  <span>{isConnecting ? 'Connecting...' : 'Connect Sensor Stream'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={onOpenManualModal}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Enter Glucose Manually</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. TIME IN RANGE (TIR) - BATTELINO CONSENSUS MOBILE WIDGET */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-black text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-emerald-600" />
            <span>Time in Range (Battelino Standards)</span>
          </h4>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            stats?.cgm_summary?.sufficient_data ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
          }`}>
            {stats?.cgm_summary?.sufficient_data ? 'Sufficient Data' : 'Low Data (<70%)'}
          </span>
        </div>

        {/* Stacked Progress Bar */}
        <div className="h-5 w-full rounded-xl overflow-hidden flex shadow-inner bg-slate-100">
          <div style={{ width: `${stats?.cgm_summary?.time_below_range_pct || 0}%` }} className="bg-red-500" title="Low (<70)" />
          <div style={{ width: `${stats?.cgm_summary?.time_in_range_pct || 0}%` }} className="bg-emerald-500" title="Target (70-180)" />
          <div style={{ width: `${stats?.cgm_summary?.time_above_range_pct || 0}%` }} className="bg-amber-500" title="High (>180)" />
        </div>

        {/* 3 Range Stats Cards */}
        <div className="grid grid-cols-3 gap-2 text-center pt-1">
          <div className="bg-red-50/60 p-2.5 rounded-2xl border border-red-100">
            <div className="text-[10px] font-bold text-red-700">TBR (&lt;70)</div>
            <div className="text-base font-black text-red-600">
              {stats?.cgm_summary?.time_below_range_pct !== undefined ? `${stats.cgm_summary.time_below_range_pct.toFixed(0)}%` : '--'}
            </div>
            <div className="text-[9px] text-red-500 font-medium">Goal &lt;4%</div>
          </div>

          <div className="bg-emerald-50 p-2.5 rounded-2xl border border-emerald-100">
            <div className="text-[10px] font-bold text-emerald-800">TIR (70-180)</div>
            <div className="text-base font-black text-emerald-700">
              {stats?.cgm_summary?.time_in_range_pct !== undefined ? `${stats.cgm_summary.time_in_range_pct.toFixed(0)}%` : '--'}
            </div>
            <div className="text-[9px] text-emerald-600 font-bold">Goal &gt;70%</div>
          </div>

          <div className="bg-amber-50/60 p-2.5 rounded-2xl border border-amber-100">
            <div className="text-[10px] font-bold text-amber-800">TAR (&gt;180)</div>
            <div className="text-base font-black text-amber-600">
              {stats?.cgm_summary?.time_above_range_pct !== undefined ? `${stats.cgm_summary.time_above_range_pct.toFixed(0)}%` : '--'}
            </div>
            <div className="text-[9px] text-amber-500 font-medium">Goal &lt;25%</div>
          </div>
        </div>

        <div className="flex justify-between items-center text-[11px] font-semibold text-slate-500 pt-1 border-t border-slate-100">
          <span>Mean: <strong>{stats?.cgm_summary?.mean_glucose_mgdl ? Math.round(stats.cgm_summary.mean_glucose_mgdl) : '--'} mg/dL</strong></span>
          <span>CV: <strong>{stats?.cgm_summary?.glucose_cv_pct !== undefined ? stats.cgm_summary.glucose_cv_pct.toFixed(1) : '--'}%</strong> (&le;36% stable)</span>
        </div>
      </div>

      {/* 4. MANUAL ENTRIES SUMMARY (Separately tracked for patient diary) */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-4 sm:p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-lg">
            🩸
          </div>
          <div>
            <h4 className="font-black text-slate-800 text-xs">Fingerstick Diary</h4>
            <p className="text-[11px] text-slate-500">
              {stats?.manual_summary?.count || 0} recorded • Avg: {stats?.manual_summary?.count ? Math.round(stats.manual_summary.average_mg_dl) : '--'} mg/dL
            </p>
          </div>
        </div>

        <button
          onClick={onOpenManualModal}
          className="px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl text-xs font-black transition-colors flex items-center gap-1"
        >
          <span>+ Log</span>
        </button>
      </div>

      {/* 5. CLINICAL BOUNDARY NOTICE (Mobile Compact Card) */}
      <div className="p-3.5 bg-slate-100/90 rounded-2xl text-[11px] text-slate-500 space-y-0.5 border border-slate-200">
        <div className="font-bold text-slate-700">Prototype Decision Support Notice</div>
        <p>DiaTwin is an experimental digital twin. Never use for insulin dosing or medical changes.</p>
      </div>

    </div>
  );
};
