import React from "react";
import { Check, Layers } from "lucide-react";
import type { ForecastModelType, ModelComparisonEntry } from "../types/market";
import { formatNaira, formatPercent } from "../utils/formatters";
import { rankModelComparisons } from "../utils/forecastHelpers";

interface ModelComparisonPanelProps {
  models: ModelComparisonEntry[];
  activeModel: ForecastModelType;
  forecastMonths: number;
  showChartOverlay: boolean;
  onToggleChartOverlay: () => void;
  onSelectModel: (modelType: ForecastModelType) => void;
}

export const ModelComparisonPanel: React.FC<ModelComparisonPanelProps> = ({
  models,
  activeModel,
  forecastMonths,
  showChartOverlay,
  onToggleChartOverlay,
  onSelectModel,
}) => {
  if (!models || models.length === 0) return null;
  const ranked = rankModelComparisons(models);

  return (
    <section
      data-testid="model-comparison-panel"
      aria-label="Forecasting model accuracy comparison"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Forecasting Model Benchmark (Basic vs. Advanced Time-Series)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Side-by-side {ranked[0]?.samples ?? 6}-month holdout backtest across Seasonal ARIMA, Prophet GAM, and classical baselines. Select any row to switch the active forecast.
          </p>
        </div>

        <button
          type="button"
          onClick={onToggleChartOverlay}
          aria-pressed={showChartOverlay}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
            showChartOverlay
              ? "bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100"
              : "bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
          }`}
        >
          <Layers className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{showChartOverlay ? "Hide Chart Overlay" : "Overlay Models on Chart"}</span>
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[740px] text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
              <th className="py-2.5 pr-3">Python Model</th>
              <th className="py-2.5 px-3">Family</th>
              <th className="py-2.5 px-3 text-right">Holdout MAE</th>
              <th className="py-2.5 px-3 text-right">Holdout RMSE</th>
              <th className="py-2.5 px-3 text-right">Holdout MAPE</th>
              <th className="py-2.5 px-3 text-right">{forecastMonths}M Forecast</th>
              <th className="py-2.5 pl-3 text-right">Selection</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {ranked.map((m) => {
              const isSelected = m.modelType === activeModel;
              return (
                <tr
                  key={m.modelType}
                  className={
                    isSelected
                      ? "bg-emerald-50/60 dark:bg-emerald-950/35"
                      : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  }
                >
                  <td className="py-2.5 pr-3">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {m.label}
                      {m.isBest && (
                        <span className="ml-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                          · Lowest Error
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <span
                      className={`text-[11px] font-medium ${
                        m.family === "Advanced"
                          ? "text-indigo-700 dark:text-indigo-400"
                          : "text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      {m.family}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                    {formatNaira(m.mae)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                    {formatNaira(m.rmse)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                    {m.mape.toFixed(2)}%
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                      {formatNaira(m.projectedEndNgn)}
                    </span>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                      {formatPercent(m.projectedChangePct)}
                    </span>
                  </td>
                  <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                    {isSelected ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Active</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelectModel(m.modelType)}
                        className="px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap"
                      >
                        Use Model
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};
