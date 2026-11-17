import React, { useEffect, useState } from "react";
import { Bell, BellRing, X } from "lucide-react";
import type { CommodityMeta, MarketMeta } from "../types/market";
import type { NewAlertRulePayload } from "./WatchlistView";
import { formatNaira } from "../utils/formatters";

interface QuickPriceAlertPanelProps {
  commodities: CommodityMeta[];
  markets: MarketMeta[];
  activeCommodityId: string;
  activeMarketId: string;
  latestPriceNgn: number;
  notificationPermission: NotificationPermission | "unsupported";
  onRequestBrowserNotifications: () => Promise<void>;
  onCreateAlertRule: (payload: NewAlertRulePayload) => Promise<void>;
  onClose: () => void;
}

export const QuickPriceAlertPanel: React.FC<QuickPriceAlertPanelProps> = ({
  commodities,
  markets,
  activeCommodityId,
  activeMarketId,
  latestPriceNgn,
  notificationPermission,
  onRequestBrowserNotifications,
  onCreateAlertRule,
  onClose,
}) => {
  const [commodityId, setCommodityId] = useState(activeCommodityId);
  const [marketId, setMarketId] = useState(activeMarketId);
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [targetPrice, setTargetPrice] = useState<string>(() =>
    String(Math.round(latestPriceNgn * 1.05))
  );
  const [ruleName, setRuleName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    setCommodityId(activeCommodityId);
    setMarketId(activeMarketId);
    setTargetPrice(String(Math.round(latestPriceNgn)));
  }, [activeCommodityId, activeMarketId, latestPriceNgn]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericTarget = Number(targetPrice);
    if (!Number.isFinite(numericTarget) || numericTarget <= 0) {
      setError("Enter a valid target threshold in Nigerian Naira (₦).");
      return;
    }

    const comm = commodities.find((c) => c.id === commodityId);
    const mkt = markets.find((m) => m.id === marketId);
    const autoName = `${comm?.name ?? commodityId} ${direction === "above" ? "≥" : "≤"} ${formatNaira(
      numericTarget
    )}`;

    setError(null);
    setStatusMsg(null);
    setSaving(true);
    try {
      await onCreateAlertRule({
        name: ruleName.trim() || autoName,
        ruleType: "price_target",
        baselineType: "price_target",
        direction,
        thresholdPct: 0,
        targetPriceNgn: Math.round(numericTarget),
        watchlistId: "all",
        commodityId,
        marketId,
      });
      setRuleName("");
      setStatusMsg(
        `Saved Naira price alert for ${comm?.name ?? commodityId} at ${mkt?.name ?? marketId} (${
          direction === "above" ? "≥" : "≤"
        } ${formatNaira(numericTarget)}).`
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      data-testid="quick-price-alert-panel"
      aria-label="Set commodity price threshold alert"
      className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800/80 rounded-xl p-4 sm:p-5 space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Set Naira (₦) Price Threshold Alert
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Receive instant in-app notifications whenever a commodity hits your exact Naira threshold in a Nigerian market.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {notificationPermission !== "unsupported" && (
            <button
              type="button"
              onClick={onRequestBrowserNotifications}
              disabled={notificationPermission === "granted"}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                notificationPermission === "granted"
                  ? "bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
                  : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              <Bell className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                {notificationPermission === "granted"
                  ? "Browser Alerts Enabled"
                  : notificationPermission === "denied"
                  ? "Browser Alerts Blocked"
                  : "Enable Browser Alerts"}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="Close price alert configurator"
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-md"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end"
      >
        <div>
          <label
            htmlFor="quick-alert-comm"
            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
          >
            Commodity
          </label>
          <select
            id="quick-alert-comm"
            value={commodityId}
            onChange={(e) => setCommodityId(e.target.value)}
            className="w-full px-2.5 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg"
          >
            {commodities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="quick-alert-mkt"
            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
          >
            Market
          </label>
          <select
            id="quick-alert-mkt"
            value={marketId}
            onChange={(e) => setMarketId(e.target.value)}
            className="w-full px-2.5 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg"
          >
            {markets.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="quick-alert-dir"
            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
          >
            Condition
          </label>
          <select
            id="quick-alert-dir"
            value={direction}
            onChange={(e) => setDirection(e.target.value as "above" | "below")}
            className="w-full px-2.5 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg"
          >
            <option value="above">At or above (≥ ₦)</option>
            <option value="below">At or below (≤ ₦)</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="quick-alert-target"
            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
          >
            Threshold Price (₦)
          </label>
          <input
            id="quick-alert-target"
            type="number"
            min={100}
            step={100}
            value={targetPrice}
            onChange={(e) => setTargetPrice(e.target.value)}
            className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>

        <div>
          <label
            htmlFor="quick-alert-name"
            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
          >
            Alert Label (Optional)
          </label>
          <input
            id="quick-alert-name"
            type="text"
            placeholder="e.g. Mile 12 Ceiling"
            value={ruleName}
            onChange={(e) => setRuleName(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <BellRing className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{saving ? "Saving..." : "Save Alert"}</span>
        </button>
      </form>

      {statusMsg && (
        <p role="status" className="text-xs font-medium text-emerald-800 dark:text-emerald-400">
          {statusMsg}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs font-medium text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </section>
  );
};
