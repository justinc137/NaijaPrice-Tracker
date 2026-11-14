import React from "react";
import { AlertTriangle, ArrowUpRight, BellRing, X } from "lucide-react";
import type { PriceAlert } from "../types/market";
import { formatNaira, formatPercent } from "../utils/formatters";

interface AlertBannerProps {
  alerts: PriceAlert[];
  onInspectAlert: (commodityId: string, marketId: string) => void;
  onDismissAlert: (alertKey: string) => void;
  onDismissAll: () => void;
  onOpenRules: () => void;
}

export function getAlertDismissKey(alert: PriceAlert): string {
  return `${alert.id}_${alert.latestPriceNgn}`;
}

export const AlertBanner: React.FC<AlertBannerProps> = ({
  alerts,
  onInspectAlert,
  onDismissAlert,
  onDismissAll,
  onOpenRules,
}) => {
  if (alerts.length === 0) return null;

  const hasCritical = alerts.some((a) => a.severity === "critical");
  const visible = alerts.slice(0, 3);

  return (
    <section
      role="status"
      aria-label="Triggered price deviation alerts"
      className={`no-print rounded-xl border p-4 ${
        hasCritical
          ? "bg-red-50/70 border-red-200"
          : "bg-amber-50/70 border-amber-200"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          {hasCritical ? (
            <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" aria-hidden="true" />
          ) : (
            <BellRing className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
          )}
          <h2 className="text-xs font-semibold text-slate-900">
            {alerts.length} Price Deviation Alert{alerts.length === 1 ? "" : "s"} Triggered
          </h2>
          <span className="text-xs text-slate-600">
            · Monitored commodities deviating beyond configured thresholds
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <button
            type="button"
            onClick={onOpenRules}
            className="font-medium text-emerald-800 hover:underline whitespace-nowrap"
          >
            Manage Alert Rules →
          </button>
          <button
            type="button"
            onClick={onDismissAll}
            className="font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
          >
            Dismiss all
          </button>
        </div>
      </div>

      <div className="divide-y divide-slate-200/70 bg-white border border-slate-200/80 rounded-lg px-3.5">
        {visible.map((al) => {
          const isCritical = al.severity === "critical";
          return (
            <div
              key={al.id}
              className="py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs"
            >
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <span
                  className={`font-semibold uppercase tracking-wide text-[11px] ${
                    isCritical ? "text-red-700" : "text-amber-700"
                  }`}
                >
                  {isCritical ? "Critical" : "Warning"}
                </span>
                <span className="text-slate-300" aria-hidden="true">·</span>
                <span className="font-semibold text-slate-900">
                  {al.commodityName}
                </span>
                <span className="text-slate-500">at {al.marketName}</span>
                <span className="text-slate-300" aria-hidden="true">·</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  {formatNaira(al.latestPriceNgn)}
                </span>
                <span className="font-mono tabular-nums text-slate-600">
                  ({formatPercent(al.deviationPct)} vs {al.baselineLabel}{" "}
                  {formatNaira(al.baselineNgn)})
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onInspectAlert(al.commodityId, al.marketId)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 rounded-md transition-colors"
                >
                  <span>Inspect</span>
                  <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onDismissAlert(getAlertDismissKey(al))}
                  aria-label={`Dismiss alert for ${al.commodityName} at ${al.marketName}`}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-md transition-colors"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {alerts.length > 3 && (
        <p className="text-[11px] text-slate-600 mt-2">
          +{alerts.length - 3} more alert(s) visible under Watchlists → Threshold Alerts.
        </p>
      )}
    </section>
  );
};
