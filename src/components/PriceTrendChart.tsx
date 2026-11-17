import React, { useMemo, useState } from "react";
import type {
  ForecastModelType,
  ForecastPoint,
  HistoricalPoint,
  ModelComparisonEntry,
} from "../types/market";
import {
  formatCompactNaira,
  formatNaira,
  formatPeriodLabel,
  getShortModelLabel,
} from "../utils/formatters";

interface PriceTrendChartProps {
  history: HistoricalPoint[];
  forecast: ForecastPoint[];
  commodityName: string;
  unit: string;
  marketName: string;
  modelLabel: string;
  activeModelType?: ForecastModelType;
  comparisonModels?: ModelComparisonEntry[];
  showModelOverlay?: boolean;
}

interface CombinedPoint {
  date: string;
  kind: "history" | "forecast";
  observed: number | null;
  trend: number | null;
  fitted: number | null;
  predicted: number | null;
  lower95: number | null;
  upper95: number | null;
  seasonalFactor: number | null;
  isCustom: boolean;
}

const OVERLAY_STYLES: Record<string, { strokeClass: string; dotClass: string; shortName: string }> = {
  sarima: {
    strokeClass: "stroke-indigo-600 dark:stroke-indigo-400",
    dotClass: "bg-indigo-600 dark:bg-indigo-400",
    shortName: "Seasonal ARIMA",
  },
  prophet_gam: {
    strokeClass: "stroke-amber-600 dark:stroke-amber-400",
    dotClass: "bg-amber-600 dark:bg-amber-400",
    shortName: "Prophet GAM",
  },
  ridge_seasonal: {
    strokeClass: "stroke-sky-600 dark:stroke-sky-400",
    dotClass: "bg-sky-600 dark:bg-sky-400",
    shortName: "Ridge Baseline",
  },
};

export const PriceTrendChart: React.FC<PriceTrendChartProps> = ({
  history,
  forecast,
  commodityName,
  unit,
  marketName,
  modelLabel,
  activeModelType,
  comparisonModels = [],
  showModelOverlay = false,
}) => {
  const [showTrend, setShowTrend] = useState(true);
  const [showFitted, setShowFitted] = useState(false);
  const [showBand, setShowBand] = useState(true);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const combined = useMemo<CombinedPoint[]>(() => {
    const histPts: CombinedPoint[] = history.map((h) => ({
      date: h.date,
      kind: "history",
      observed: h.price_ngn,
      trend: h.trend_ngn,
      fitted: h.fitted_ngn,
      predicted: null,
      lower95: null,
      upper95: null,
      seasonalFactor: h.seasonal_factor,
      isCustom: Boolean(h.is_custom),
    }));

    const fcPts: CombinedPoint[] = forecast.map((f) => ({
      date: f.date,
      kind: "forecast",
      observed: null,
      trend: null,
      fitted: null,
      predicted: f.predicted_ngn,
      lower95: f.lower95_ngn,
      upper95: f.upper95_ngn,
      seasonalFactor: null,
      isCustom: false,
    }));

    return [...histPts, ...fcPts];
  }, [history, forecast]);

  const overlaySeries = useMemo(() => {
    if (!showModelOverlay || comparisonModels.length === 0) return [];
    const targetIds = ["sarima", "prophet_gam", "ridge_seasonal"];
    return comparisonModels
      .filter((m) => targetIds.includes(m.modelType) && m.modelType !== activeModelType)
      .map((m) => ({
        modelType: m.modelType,
        style: OVERLAY_STYLES[m.modelType],
        forecast: m.forecast,
      }));
  }, [showModelOverlay, comparisonModels, activeModelType]);

  const width = 920;
  const height = 340;
  const pad = { top: 20, right: 40, bottom: 38, left: 68 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const { minY, maxY, yTicks } = useMemo(() => {
    const vals: number[] = [];
    for (const pt of combined) {
      if (pt.observed !== null) vals.push(pt.observed);
      if (pt.trend !== null && showTrend) vals.push(pt.trend);
      if (pt.predicted !== null) vals.push(pt.predicted);
      if (pt.lower95 !== null && showBand) vals.push(pt.lower95);
      if (pt.upper95 !== null && showBand) vals.push(pt.upper95);
    }
    for (const ov of overlaySeries) {
      for (const f of ov.forecast) {
        vals.push(f.predicted_ngn);
      }
    }
    const rawMin = vals.length ? Math.min(...vals) : 0;
    const rawMax = vals.length ? Math.max(...vals) : 1000;
    const span = Math.max(rawMax - rawMin, 1000);
    const lo = Math.max(0, Math.floor((rawMin - span * 0.08) / 1000) * 1000);
    const hi = Math.ceil((rawMax + span * 0.08) / 1000) * 1000;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => lo + (hi - lo) * t);
    return { minY: lo, maxY: hi, yTicks: ticks };
  }, [combined, showTrend, showBand, overlaySeries]);

  const xFor = (i: number) => {
    if (combined.length <= 1) return pad.left;
    return pad.left + (i / (combined.length - 1)) * plotW;
  };

  const yFor = (val: number) => {
    const ratio = (val - minY) / Math.max(maxY - minY, 1);
    return pad.top + plotH - ratio * plotH;
  };

  const buildPath = (extractor: (pt: CombinedPoint) => number | null) => {
    let d = "";
    combined.forEach((pt, idx) => {
      const v = extractor(pt);
      if (v === null) return;
      const x = xFor(idx).toFixed(1);
      const y = yFor(v).toFixed(1);
      d += d === "" || (idx > 0 && extractor(combined[idx - 1]) === null) ? `M ${x} ${y}` : ` L ${x} ${y}`;
    });
    return d;
  };

  const historyPath = buildPath((p) => p.observed);
  const trendPath = buildPath((p) => p.trend);
  const fittedPath = buildPath((p) => p.fitted);

  const lastHistIdx = history.length - 1;
  const forecastPath = useMemo(() => {
    if (history.length === 0 || forecast.length === 0) return "";
    const pts = [
      `${xFor(lastHistIdx).toFixed(1)},${yFor(history[lastHistIdx].price_ngn).toFixed(1)}`,
      ...forecast.map((f, j) => `${xFor(history.length + j).toFixed(1)},${yFor(f.predicted_ngn).toFixed(1)}`),
    ];
    return `M ${pts.join(" L ")}`;
  }, [history, forecast, lastHistIdx, minY, maxY]);

  const bandPolygon = useMemo(() => {
    if (history.length === 0 || forecast.length === 0) return "";
    const anchorX = xFor(lastHistIdx).toFixed(1);
    const anchorY = yFor(history[lastHistIdx].price_ngn).toFixed(1);
    const upper = forecast.map(
      (f, j) => `${xFor(history.length + j).toFixed(1)},${yFor(f.upper95_ngn).toFixed(1)}`
    );
    const lower = [...forecast]
      .reverse()
      .map(
        (f, revJ) =>
          `${xFor(history.length + (forecast.length - 1 - revJ)).toFixed(1)},${yFor(f.lower95_ngn).toFixed(1)}`
      );
    return `${anchorX},${anchorY} ${upper.join(" ")} ${lower.join(" ")}`;
  }, [history, forecast, lastHistIdx, minY, maxY]);

  const xTickIndices = useMemo(() => {
    if (combined.length === 0) return [];
    const step = Math.max(1, Math.floor(combined.length / 7));
    const indices: number[] = [];
    for (let i = 0; i < combined.length; i += step) {
      indices.push(i);
    }
    const lastIdx = combined.length - 1;
    if (indices.length > 0 && indices[indices.length - 1] !== lastIdx) {
      const gap = lastIdx - indices[indices.length - 1];
      if (gap < Math.max(4, Math.floor(step * 0.65))) {
        indices[indices.length - 1] = lastIdx;
      } else {
        indices.push(lastIdx);
      }
    }
    return indices;
  }, [combined.length]);

  const activePoint = hoverIdx !== null ? combined[hoverIdx] : combined[combined.length - 1];
  const activeIdx = hoverIdx !== null ? hoverIdx : combined.length - 1;

  return (
    <section
      data-testid="price-trend-chart"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Price Trajectory &amp; {forecast.length}-Month Forecast
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {commodityName} ({unit}) · {marketName} · {modelLabel}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowTrend((v) => !v)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
              showTrend
                ? "bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            12-Mo Trend
          </button>
          <button
            type="button"
            onClick={() => setShowFitted((v) => !v)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
              showFitted
                ? "bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            Model Fit
          </button>
          <button
            type="button"
            onClick={() => setShowBand((v) => !v)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
              showBand
                ? "bg-emerald-700 text-white border-emerald-700 dark:bg-emerald-600 dark:border-emerald-600"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            95% Confidence Band
          </button>
        </div>
      </div>

      {/* Live readout bar for inspected month */}
      {activePoint && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 mb-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 text-xs">
          <div className="flex items-center gap-3">
            <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
              {formatPeriodLabel(activePoint.date)}
            </span>
            <span className="text-slate-400 dark:text-slate-500" aria-hidden="true">·</span>
            <span className="font-medium text-slate-600 dark:text-slate-300">
              {activePoint.kind === "history"
                ? activePoint.isCustom
                  ? "Live Survey Entry (Custom)"
                  : "Observed Market Price"
                : "Projected Forecast"}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:gap-4 font-mono tabular-nums">
            {activePoint.observed !== null && (
              <span>
                <span className="text-slate-500 dark:text-slate-400">Price: </span>
                <strong className="text-slate-900 dark:text-slate-100">{formatNaira(activePoint.observed)}</strong>
              </span>
            )}
            {activePoint.trend !== null && showTrend && (
              <span>
                <span className="text-slate-500 dark:text-slate-400">Trend: </span>
                <strong className="text-slate-700 dark:text-slate-200">{formatNaira(activePoint.trend)}</strong>
              </span>
            )}
            {activePoint.seasonalFactor !== null && (
              <span>
                <span className="text-slate-500 dark:text-slate-400">Seasonal Idx: </span>
                <strong className="text-slate-700 dark:text-slate-200">{activePoint.seasonalFactor.toFixed(2)}x</strong>
              </span>
            )}
            {activePoint.predicted !== null && (
              <span>
                <span className="text-slate-500 dark:text-slate-400">Forecast: </span>
                <strong className="text-emerald-700 dark:text-emerald-400">{formatNaira(activePoint.predicted)}</strong>
              </span>
            )}
            {activePoint.lower95 !== null && activePoint.upper95 !== null && showBand && (
              <span>
                <span className="text-slate-500 dark:text-slate-400">95% CI: </span>
                <strong className="text-slate-700 dark:text-slate-200">
                  {formatNaira(activePoint.lower95)} – {formatNaira(activePoint.upper95)}
                </strong>
              </span>
            )}
          </div>
        </div>
      )}

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          className="w-full h-auto min-w-[600px] select-none"
          role="img"
          aria-label={`Price trend and forecast chart for ${commodityName} at ${marketName}`}
          data-testid="price-trend-chart"
          onMouseLeave={() => setHoverIdx(null)}
        >
          {/* Horizontal gridlines & Y ticks */}
          {yTicks.map((tick, idx) => {
            const y = yFor(tick);
            return (
              <g key={idx}>
                <line
                  x1={pad.left}
                  y1={y}
                  x2={width - pad.right}
                  y2={y}
                  className="stroke-slate-200 dark:stroke-slate-800"
                  strokeWidth="1"
                />
                <text
                  x={pad.left - 10}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-500 dark:fill-slate-400 text-[11px] font-mono tabular-nums"
                >
                  {formatCompactNaira(tick)}
                </text>
              </g>
            );
          })}

          {/* Forecast horizon background zone */}
          {history.length > 0 && forecast.length > 0 && (
            <rect
              x={xFor(lastHistIdx)}
              y={pad.top}
              width={Math.max(0, xFor(combined.length - 1) - xFor(lastHistIdx))}
              height={plotH}
              className="fill-emerald-50/70 dark:fill-emerald-950/35"
            />
          )}

          {/* Divider line between actuals and forecast */}
          {history.length > 0 && forecast.length > 0 && (
            <line
              x1={xFor(lastHistIdx)}
              y1={pad.top}
              x2={xFor(lastHistIdx)}
              y2={pad.top + plotH}
              className="stroke-emerald-700 dark:stroke-emerald-400"
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity={0.5}
            />
          )}

          {/* 95% confidence band */}
          {showBand && bandPolygon && (
            <polygon
              points={bandPolygon}
              className="fill-emerald-600/15 dark:fill-emerald-400/15"
            />
          )}

          {/* 12-mo trendline */}
          {showTrend && trendPath && (
            <path
              d={trendPath}
              fill="none"
              className="stroke-slate-500 dark:stroke-slate-400"
              strokeWidth="1.75"
              strokeDasharray="4 4"
            />
          )}

          {/* In-sample model fit */}
          {showFitted && fittedPath && (
            <path
              d={fittedPath}
              fill="none"
              className="stroke-amber-600 dark:stroke-amber-400"
              strokeWidth="1.5"
              strokeOpacity={0.85}
            />
          )}

          {/* Observed price line */}
          {historyPath && (
            <path
              d={historyPath}
              fill="none"
              className="stroke-slate-900 dark:stroke-slate-100"
              strokeWidth="2.25"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {/* Custom live survey point markers */}
          {history.map((h, idx) =>
            h.is_custom ? (
              <circle
                key={`custom-${h.date}-${idx}`}
                cx={xFor(idx)}
                cy={yFor(h.price_ngn)}
                r="4.5"
                className="fill-emerald-600 dark:fill-emerald-400 stroke-white dark:stroke-slate-900"
                strokeWidth="2"
              />
            ) : null
          )}

          {/* Comparison model overlay trajectories */}
          {overlaySeries.map((ov) => {
            if (history.length === 0 || ov.forecast.length === 0) return null;
            const pts = [
              `${xFor(lastHistIdx).toFixed(1)},${yFor(history[lastHistIdx].price_ngn).toFixed(1)}`,
              ...ov.forecast.map(
                (f, j) => `${xFor(history.length + j).toFixed(1)},${yFor(f.predicted_ngn).toFixed(1)}`
              ),
            ];
            return (
              <path
                key={ov.modelType}
                d={`M ${pts.join(" L ")}`}
                fill="none"
                className={ov.style?.strokeClass ?? "stroke-indigo-600"}
                strokeWidth="1.75"
                strokeDasharray="3 3"
                strokeOpacity={0.85}
              />
            );
          })}

          {/* Forecast trajectory */}
          {forecastPath && (
            <path
              d={forecastPath}
              fill="none"
              className="stroke-emerald-700 dark:stroke-emerald-400"
              strokeWidth="2.25"
              strokeDasharray="6 4"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {/* X-axis ticks */}
          {xTickIndices.map((idx, tickPos) => (
            <text
              key={idx}
              x={xFor(idx)}
              y={height - 10}
              textAnchor={
                tickPos === xTickIndices.length - 1
                  ? "end"
                  : tickPos === 0
                  ? "start"
                  : "middle"
              }
              className="fill-slate-500 dark:fill-slate-400 text-[11px] font-mono"
            >
              {formatPeriodLabel(combined[idx].date)}
            </text>
          ))}

          {/* Active hover vertical hairline & marker */}
          {activePoint && (
            <g>
              <line
                x1={xFor(activeIdx)}
                y1={pad.top}
                x2={xFor(activeIdx)}
                y2={pad.top + plotH}
                className="stroke-slate-400 dark:stroke-slate-600"
                strokeWidth="1"
              />
              {activePoint.observed !== null && (
                <circle
                  cx={xFor(activeIdx)}
                  cy={yFor(activePoint.observed)}
                  r="4.5"
                  className="fill-slate-900 dark:fill-slate-100 stroke-white dark:stroke-slate-900"
                  strokeWidth="2"
                />
              )}
              {activePoint.predicted !== null && (
                <circle
                  cx={xFor(activeIdx)}
                  cy={yFor(activePoint.predicted)}
                  r="4.5"
                  className="fill-emerald-700 dark:fill-emerald-400 stroke-white dark:stroke-slate-900"
                  strokeWidth="2"
                />
              )}
            </g>
          )}

          {/* Invisible hover columns for crisp snapping */}
          {combined.map((pt, idx) => {
            const colW = plotW / Math.max(combined.length, 1);
            return (
              <rect
                key={pt.date}
                x={xFor(idx) - colW / 2}
                y={pad.top}
                width={Math.max(colW, 4)}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(idx)}
              />
            );
          })}
        </svg>
      </div>

      {/* Clean horizontal legend */}
      <div className="flex flex-wrap items-center gap-4 sm:gap-5 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
        <span className="inline-flex items-center gap-2">
          <span className="w-4 h-0.5 bg-slate-900 dark:bg-slate-100 inline-block" />
          Observed Price (₦)
        </span>
        {showTrend && (
          <span className="inline-flex items-center gap-2">
            <span className="w-4 h-0 border-t-2 border-dashed border-slate-500 dark:border-slate-400 inline-block" />
            12-Mo Moving Trend
          </span>
        )}
        {showFitted && (
          <span className="inline-flex items-center gap-2">
            <span className="w-4 h-0.5 bg-amber-600 dark:bg-amber-400 inline-block" />
            In-Sample Model Fit
          </span>
        )}
        <span className="inline-flex items-center gap-2">
          <span className="w-4 h-0 border-t-2 border-dashed border-emerald-700 dark:border-emerald-400 inline-block" />
          Python Forecast ({activeModelType ? getShortModelLabel(activeModelType) : modelLabel})
        </span>
        {overlaySeries.map((ov) => (
          <span key={`legend-${ov.modelType}`} className="inline-flex items-center gap-2">
            <span className={`w-3.5 h-0.5 ${ov.style?.dotClass ?? "bg-indigo-600"} inline-block`} />
            {ov.style?.shortName ?? ov.modelType}
          </span>
        ))}
        {history.some((h) => h.is_custom) && (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 dark:bg-emerald-400 inline-block" />
            Live Survey Entry
          </span>
        )}
        {showBand && (
          <span className="inline-flex items-center gap-2">
            <span className="w-3.5 h-3 bg-emerald-600/20 border border-emerald-600/30 dark:bg-emerald-400/20 dark:border-emerald-400/30 rounded-xs inline-block" />
            95% Confidence Interval
          </span>
        )}
      </div>
    </section>
  );
};
