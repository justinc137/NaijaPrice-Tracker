import React, { useState } from "react";
import { AlertTriangle, ArrowUpRight, BellRing, BookmarkPlus, Plus, Trash2 } from "lucide-react";
import type {
  AlertBaselineType,
  AlertDirection,
  AlertRule,
  CommodityMeta,
  MarketMeta,
  PriceAlert,
  WatchlistGroup,
  WatchlistItem,
} from "../types/market";
import { formatNaira, formatPercent, formatPeriodLabel } from "../utils/formatters";

export interface NewAlertRulePayload {
  name: string;
  baselineType: AlertBaselineType;
  direction: AlertDirection;
  thresholdPct: number;
  watchlistId: string;
  commodityId: string;
  marketId: string;
}

interface WatchlistViewProps {
  commodities: CommodityMeta[];
  markets: MarketMeta[];
  watchlists: WatchlistGroup[];
  activeWatchlistId: string;
  forecastMonths: number;
  alertRules: AlertRule[];
  triggeredAlerts: PriceAlert[];
  onSelectWatchlist: (id: string) => void;
  onCreateWatchlist: (name: string, items: WatchlistItem[]) => Promise<void>;
  onDeleteWatchlist: (id: string) => Promise<void>;
  onToggleItem: (watchlistId: string, commodityId: string, marketId: string) => Promise<void>;
  onInspectPair: (commodityId: string, marketId: string) => void;
  onCreateAlertRule: (payload: NewAlertRulePayload) => Promise<void>;
  onToggleAlertRule: (id: string, enabled: boolean) => Promise<void>;
  onDeleteAlertRule: (id: string) => Promise<void>;
}

export const WatchlistView: React.FC<WatchlistViewProps> = ({
  commodities,
  markets,
  watchlists,
  activeWatchlistId,
  forecastMonths,
  alertRules,
  triggeredAlerts,
  onSelectWatchlist,
  onCreateWatchlist,
  onDeleteWatchlist,
  onToggleItem,
  onInspectPair,
  onCreateAlertRule,
  onToggleAlertRule,
  onDeleteAlertRule,
}) => {
  const activeWatchlist =
    watchlists.find((w) => w.id === activeWatchlistId) ?? watchlists[0] ?? null;

  const [newName, setNewName] = useState("");
  const [selectedCommodities, setSelectedCommodities] = useState<string[]>([
    commodities[0]?.id ?? "rice_ofada",
  ]);
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>([
    markets[0]?.id ?? "mile12_lagos",
  ]);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [quickCommodity, setQuickCommodity] = useState(commodities[0]?.id ?? "rice_ofada");
  const [quickMarket, setQuickMarket] = useState(markets[0]?.id ?? "mile12_lagos");

  const [ruleName, setRuleName] = useState("");
  const [ruleBaseline, setRuleBaseline] = useState<AlertBaselineType>("avg_12m");
  const [ruleDirection, setRuleDirection] = useState<AlertDirection>("both");
  const [ruleThresholdPct, setRuleThresholdPct] = useState<number>(12);
  const [ruleCommodity, setRuleCommodity] = useState<string>("all");
  const [ruleMarket, setRuleMarket] = useState<string>("all");
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [ruleSaving, setRuleSaving] = useState(false);

  const handleCreateRuleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = ruleName.trim();
    if (!clean) {
      setRuleError("Enter a descriptive rule name (for example, Lagos Tomato Spike).");
      return;
    }
    if (!Number.isFinite(ruleThresholdPct) || ruleThresholdPct <= 0 || ruleThresholdPct > 200) {
      setRuleError("Threshold percentage must be between 1% and 200%.");
      return;
    }
    setRuleError(null);
    setRuleSaving(true);
    try {
      await onCreateAlertRule({
        name: clean,
        baselineType: ruleBaseline,
        direction: ruleDirection,
        thresholdPct: ruleThresholdPct,
        watchlistId: "all",
        commodityId: ruleCommodity,
        marketId: ruleMarket,
      });
      setRuleName("");
    } catch (err) {
      setRuleError((err as Error).message);
    } finally {
      setRuleSaving(false);
    }
  };

  const toggleCommodityChoice = (cid: string) => {
    setSelectedCommodities((prev) =>
      prev.includes(cid) ? prev.filter((id) => id !== cid) : [...prev, cid]
    );
  };

  const toggleMarketChoice = (mid: string) => {
    setSelectedMarkets((prev) =>
      prev.includes(mid) ? prev.filter((id) => id !== mid) : [...prev, mid]
    );
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) {
      setFormError("Enter a watchlist name (for example, South-West Staples).");
      return;
    }
    if (selectedCommodities.length === 0 || selectedMarkets.length === 0) {
      setFormError("Select at least one commodity and one Nigerian market.");
      return;
    }

    setFormError(null);
    setSubmitting(true);
    try {
      const pairs: WatchlistItem[] = [];
      for (const cid of selectedCommodities) {
        for (const mid of selectedMarkets) {
          pairs.push({ commodityId: cid, marketId: mid });
        }
      }
      await onCreateWatchlist(trimmed, pairs);
      setNewName("");
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWatchlist) return;
    const alreadyExists = activeWatchlist.items.some(
      (it) => it.commodityId === quickCommodity && it.marketId === quickMarket
    );
    if (alreadyExists) return;
    await onToggleItem(activeWatchlist.id, quickCommodity, quickMarket);
  };

  const previewCount = selectedCommodities.length * selectedMarkets.length;

  return (
    <div className="space-y-5">
      {/* Active Watchlist Selector & Monitored Performance Table */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Personalized Market Watchlists
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Monitor custom combinations of Nigerian commodities and markets. Active watchlist highlights appear on the dashboard and in formal PDF reports.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {watchlists.map((wl) => {
              const isSelected = wl.id === activeWatchlist?.id;
              return (
                <button
                  key={wl.id}
                  type="button"
                  onClick={() => onSelectWatchlist(wl.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                    isSelected
                      ? "bg-emerald-700 text-white border-emerald-700 dark:bg-emerald-600 dark:border-emerald-600"
                      : "bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  {wl.name} ({wl.items.length})
                </button>
              );
            })}
          </div>
        </div>

        {activeWatchlist ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <form onSubmit={handleQuickAdd} className="flex flex-wrap items-end gap-2.5 w-full sm:w-auto">
                <div className="flex-1 sm:flex-initial min-w-[140px]">
                  <label htmlFor="wl-quick-comm" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Add Commodity
                  </label>
                  <select
                    id="wl-quick-comm"
                    value={quickCommodity}
                    onChange={(e) => setQuickCommodity(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg"
                  >
                    {commodities.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 sm:flex-initial min-w-[140px]">
                  <label htmlFor="wl-quick-mkt" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Market
                  </label>
                  <select
                    id="wl-quick-mkt"
                    value={quickMarket}
                    onChange={(e) => setQuickMarket(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg"
                  >
                    {markets.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Add Pair</span>
                </button>
              </form>

              <button
                type="button"
                onClick={() => onDeleteWatchlist(activeWatchlist.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/60 hover:bg-red-100 dark:hover:bg-red-950 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Delete "{activeWatchlist.name}"</span>
              </button>
            </div>

            {activeWatchlist.performance.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800">
                No commodities are currently monitored in "{activeWatchlist.name}". Use the controls above to add a commodity-market pair.
              </div>
            ) : (
              <div className="overflow-x-auto pt-2">
                <table className="w-full text-left border-collapse min-w-[780px] text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                      <th className="py-2.5 pr-3">Commodity</th>
                      <th className="py-2.5 px-3">Market</th>
                      <th className="py-2.5 px-3 text-right">Spot Price</th>
                      <th className="py-2.5 px-3 text-right">MoM</th>
                      <th className="py-2.5 px-3 text-right">YoY</th>
                      <th className="py-2.5 px-3 text-right">{forecastMonths}M Forecast</th>
                      <th className="py-2.5 px-3">Seasonal Phase</th>
                      <th className="py-2.5 pl-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {activeWatchlist.performance.map((row) => (
                      <tr key={`${row.commodityId}-${row.marketId}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="py-2.5 pr-3">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">{row.commodityName}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {row.unit} · {formatPeriodLabel(row.latestDate)}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="text-slate-800 dark:text-slate-200">{row.marketName}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {row.state} · {row.region}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                          {formatNaira(row.latestPriceNgn)}
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right font-mono tabular-nums font-medium ${
                            row.momPct >= 0
                              ? "text-amber-700 dark:text-amber-400"
                              : "text-emerald-700 dark:text-emerald-400"
                          }`}
                        >
                          {formatPercent(row.momPct)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {formatPercent(row.yoyPct)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                            {formatNaira(row.projectedEndNgn)}
                          </span>
                          <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                            {formatPercent(row.projectedChangePct)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                          <span
                            className={`font-medium ${
                              row.seasonalPhase === "Harvest Glut"
                                ? "text-emerald-700 dark:text-emerald-400"
                                : row.seasonalPhase === "Lean Peak"
                                ? "text-red-700 dark:text-red-400"
                                : "text-slate-700 dark:text-slate-300"
                            }`}
                          >
                            {row.seasonalPhase}
                          </span>
                          <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                            {row.traderSignal}
                          </span>
                        </td>
                        <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onInspectPair(row.commodityId, row.marketId)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 rounded-md transition-colors"
                            >
                              <span>Inspect</span>
                              <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onToggleItem(activeWatchlist.id, row.commodityId, row.marketId)
                              }
                              aria-label={`Remove ${row.commodityName} at ${row.marketName}`}
                              className="p-1.5 text-slate-400 hover:text-red-700 dark:hover:text-red-400 rounded-md transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800">
            No watchlists saved yet. Create a personalized watchlist below to track Nigerian commodities and markets.
          </div>
        )}
      </section>

      {/* Create New Watchlist Builder */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Create New Personalized Watchlist
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Choose a name, check any combination of commodities and Nigerian markets, and persist it to the local database.
          </p>
        </div>

        <form onSubmit={handleCreate} className="space-y-4">
          <div className="max-w-md">
            <label htmlFor="new-watchlist-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Watchlist Name
            </label>
            <input
              id="new-watchlist-name"
              type="text"
              placeholder="e.g. Lagos & Kano Grain Basket"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Commodities ({selectedCommodities.length} selected)
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedCommodities(
                      selectedCommodities.length === commodities.length
                        ? []
                        : commodities.map((c) => c.id)
                    )
                  }
                  className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
                >
                  {selectedCommodities.length === commodities.length ? "Clear all" : "Select all"}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {commodities.map((c) => {
                  const checked = selectedCommodities.includes(c.id);
                  return (
                    <label
                      key={c.id}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                        checked
                          ? "bg-emerald-50/70 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-700 text-slate-900 dark:text-slate-100 font-medium"
                          : "bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCommodityChoice(c.id)}
                        className="rounded border-slate-300 dark:border-slate-600 text-emerald-700 focus:ring-emerald-600"
                      />
                      <span className="truncate">{c.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Nigerian Markets ({selectedMarkets.length} selected)
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedMarkets(
                      selectedMarkets.length === markets.length
                        ? []
                        : markets.map((m) => m.id)
                    )
                  }
                  className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
                >
                  {selectedMarkets.length === markets.length ? "Clear all" : "Select all"}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {markets.map((m) => {
                  const checked = selectedMarkets.includes(m.id);
                  return (
                    <label
                      key={m.id}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                        checked
                          ? "bg-emerald-50/70 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-700 text-slate-900 dark:text-slate-100 font-medium"
                          : "bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleMarketChoice(m.id)}
                        className="rounded border-slate-300 dark:border-slate-600 text-emerald-700 focus:ring-emerald-600"
                      />
                      <span className="truncate">{m.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {formError && (
            <p role="alert" className="text-xs font-medium text-red-700 dark:text-red-400">
              {formError}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              Creates {previewCount} monitored commodity-market pair(s)
            </span>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <BookmarkPlus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{submitting ? "Saving Watchlist..." : "Create Watchlist"}</span>
            </button>
          </div>
        </form>
      </section>

      {/* Threshold-Based Deviation Alerts & Rule Configurator */}
      <section
        id="alert-rules-section"
        aria-label="Threshold-based price deviation alerts"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 space-y-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Threshold Price Deviation Alerts
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Python continuously compares monitored watchlist items against their trailing 12-month average, linear trendline, or all-time mean.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums font-medium text-slate-700 dark:text-slate-300">
            {triggeredAlerts.length} active alert(s) · {alertRules.filter((r) => r.enabled).length} enabled rule(s)
          </span>
        </div>

        {/* Triggered Alerts Table */}
        {triggeredAlerts.length === 0 ? (
          <div className="py-5 px-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300">
            All monitored commodity prices are currently within configured threshold tolerances.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[780px] text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                  <th className="py-2 pr-3">Severity</th>
                  <th className="py-2 px-3">Commodity &amp; Market</th>
                  <th className="py-2 px-3 text-right">Spot Price</th>
                  <th className="py-2 px-3 text-right">Baseline</th>
                  <th className="py-2 px-3 text-right">Deviation</th>
                  <th className="py-2 px-3">Rule Matched</th>
                  <th className="py-2 pl-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {triggeredAlerts.map((al) => {
                  const isCritical = al.severity === "critical";
                  return (
                    <tr key={al.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-2.5 pr-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 font-semibold ${
                            isCritical
                              ? "text-red-700 dark:text-red-400"
                              : "text-amber-700 dark:text-amber-400"
                          }`}
                        >
                          {isCritical ? (
                            <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                          ) : (
                            <BellRing className="w-3.5 h-3.5" aria-hidden="true" />
                          )}
                          <span>{isCritical ? "Critical" : "Warning"}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{al.commodityName}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {al.marketName} · {al.watchlistName}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                        {formatNaira(al.latestPriceNgn)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        {formatNaira(al.baselineNgn)}
                        <span className="block font-sans text-[11px] text-slate-400 dark:text-slate-500">
                          {al.baselineLabel}
                        </span>
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-mono tabular-nums font-semibold ${
                          al.deviationPct >= 0
                            ? "text-red-700 dark:text-red-400"
                            : "text-emerald-700 dark:text-emerald-400"
                        }`}
                      >
                        {formatPercent(al.deviationPct)}
                        <span className="block text-[11px] font-normal text-slate-500 dark:text-slate-400">
                          z = {al.zScore >= 0 ? "+" : ""}
                          {al.zScore.toFixed(2)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                        {al.ruleName}
                        <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                          Threshold ±{al.thresholdPct}%
                        </span>
                      </td>
                      <td className="py-2.5 pl-3 text-right">
                        <button
                          type="button"
                          onClick={() => onInspectPair(al.commodityId, al.marketId)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 rounded-md transition-colors"
                        >
                          <span>Inspect</span>
                          <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Configure New Alert Rule */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
            Add Threshold Alert Rule
          </h3>
          <form onSubmit={handleCreateRuleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
            <div className="lg:col-span-2">
              <label htmlFor="alert-rule-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Rule Name
              </label>
              <input
                id="alert-rule-name"
                type="text"
                placeholder="e.g. Lagos Tomato Surge"
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label htmlFor="alert-rule-baseline" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Baseline
              </label>
              <select
                id="alert-rule-baseline"
                value={ruleBaseline}
                onChange={(e) => setRuleBaseline(e.target.value as AlertBaselineType)}
                className="w-full px-2.5 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg"
              >
                <option value="avg_12m">12-Mo Average</option>
                <option value="trend">Linear Trendline</option>
                <option value="avg_all">All-Time Mean</option>
              </select>
            </div>

            <div>
              <label htmlFor="alert-rule-direction" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Direction
              </label>
              <select
                id="alert-rule-direction"
                value={ruleDirection}
                onChange={(e) => setRuleDirection(e.target.value as AlertDirection)}
                className="w-full px-2.5 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg"
              >
                <option value="both">Above or Below</option>
                <option value="above">Spike Above (+)</option>
                <option value="below">Dip Below (-)</option>
              </select>
            </div>

            <div>
              <label htmlFor="alert-rule-pct" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Deviation (%)
              </label>
              <input
                id="alert-rule-pct"
                type="number"
                min={1}
                max={200}
                step={1}
                value={ruleThresholdPct}
                onChange={(e) => setRuleThresholdPct(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg"
              />
            </div>

            <button
              type="submit"
              disabled={ruleSaving}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{ruleSaving ? "Saving..." : "Create Alert Rule"}</span>
            </button>

            <div className="sm:col-span-1 lg:col-span-3">
              <label htmlFor="alert-rule-comm" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Commodity Scope
              </label>
              <select
                id="alert-rule-comm"
                value={ruleCommodity}
                onChange={(e) => setRuleCommodity(e.target.value)}
                className="w-full px-2.5 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg"
              >
                <option value="all">All Monitored Commodities</option>
                {commodities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-1 lg:col-span-3">
              <label htmlFor="alert-rule-mkt" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Market Scope
              </label>
              <select
                id="alert-rule-mkt"
                value={ruleMarket}
                onChange={(e) => setRuleMarket(e.target.value)}
                className="w-full px-2.5 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg"
              >
                <option value="all">All Monitored Markets</option>
                {markets.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </form>

          {ruleError && (
            <p role="alert" className="mt-2.5 text-xs font-medium text-red-700 dark:text-red-400">
              {ruleError}
            </p>
          )}
        </div>

        {/* Saved Rules Management Table */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Configured Alert Rules ({alertRules.length})
          </h3>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {alertRules.map((rule) => {
              const commLabel =
                rule.commodityId === "all"
                  ? "All monitored commodities"
                  : commodities.find((c) => c.id === rule.commodityId)?.name ?? rule.commodityId;
              const mktLabel =
                rule.marketId === "all"
                  ? "All monitored markets"
                  : markets.find((m) => m.id === rule.marketId)?.name ?? rule.marketId;
              const baseLabel =
                rule.baselineType === "avg_12m"
                  ? "12M Avg"
                  : rule.baselineType === "trend"
                  ? "Linear Trend"
                  : "All-Time Mean";
              const dirLabel =
                rule.direction === "above"
                  ? `+${rule.thresholdPct}% above`
                  : rule.direction === "below"
                  ? `-${rule.thresholdPct}% below`
                  : `±${rule.thresholdPct}%`;

              return (
                <div
                  key={rule.id}
                  className="py-2.5 flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {rule.name}
                      <span
                        className={`ml-2 text-[11px] font-normal ${
                          rule.enabled
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-slate-400 dark:text-slate-500"
                        }`}
                      >
                        · {rule.enabled ? "Active" : "Paused"}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Trigger {dirLabel} {baseLabel} · {commLabel} · {mktLabel}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onToggleAlertRule(rule.id, !rule.enabled)}
                      className="px-2.5 py-1 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                    >
                      {rule.enabled ? "Pause" : "Enable"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteAlertRule(rule.id)}
                      aria-label={`Delete rule ${rule.name}`}
                      className="p-1.5 text-slate-400 hover:text-red-700 dark:hover:text-red-400 rounded-md transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
};
