import React, { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Globe, RefreshCw, Search } from "lucide-react";
import type {
  LiveCommoditySummary,
  LiveFeedSnapshot,
  MarketMeta,
} from "../types/market";
import { formatNaira, formatPeriodLabel } from "../utils/formatters";

interface LiveMarketFeedViewProps {
  snapshot: LiveFeedSnapshot | null;
  markets: MarketMeta[];
  activeMarketId: string;
  fetching: boolean;
  syncing: boolean;
  fetchError: string | null;
  syncFeedback: string | null;
  autoRefreshMinutes: number;
  onChangeAutoRefreshMinutes: (minutes: number) => void;
  onFetchLiveFeed: () => Promise<void>;
  onSyncToForecast: (
    targetMarketId: string,
    commodityIds?: string[]
  ) => Promise<void>;
  onInspectSeries: (commodityId: string, marketId: string) => void;
}

function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `$${value.toFixed(2)}`;
}

export const LiveMarketFeedView: React.FC<LiveMarketFeedViewProps> = ({
  snapshot,
  markets,
  activeMarketId,
  fetching,
  syncing,
  fetchError,
  syncFeedback,
  autoRefreshMinutes,
  onChangeAutoRefreshMinutes,
  onFetchLiveFeed,
  onSyncToForecast,
  onInspectSeries,
}) => {
  const [targetMarketId, setTargetMarketId] = useState<string>(activeMarketId || "mile12_lagos");
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [commodityFilter, setCommodityFilter] = useState("all");
  const [mappedOnly, setMappedOnly] = useState(false);

  const mappedSummaries = useMemo(() => {
    if (!snapshot) return [] as LiveCommoditySummary[];
    // Keep highest quoteCount summary per mappedCommodityId for clarity
    const best = new Map<string, LiveCommoditySummary>();
    for (const s of snapshot.commoditySummaries) {
      if (!s.mappedCommodityId || s.normalizedWholesaleNgn === null) continue;
      const existing = best.get(s.mappedCommodityId);
      if (!existing || s.quoteCount > existing.quoteCount) {
        best.set(s.mappedCommodityId, s);
      }
    }
    return Array.from(best.values());
  }, [snapshot]);

  const unmappedSummaries = useMemo(() => {
    if (!snapshot) return [] as LiveCommoditySummary[];
    return snapshot.commoditySummaries.filter((s) => !s.mappedCommodityId);
  }, [snapshot]);

  const commodityOptions = useMemo(() => {
    if (!snapshot) return [] as string[];
    return Array.from(new Set(snapshot.quotes.map((q) => q.commodity))).sort();
  }, [snapshot]);

  const filteredQuotes = useMemo(() => {
    if (!snapshot) return [];
    const qLower = search.trim().toLowerCase();
    return snapshot.quotes.filter((item) => {
      if (mappedOnly && !item.mappedCommodityId) return false;
      if (stateFilter !== "all" && item.state !== stateFilter) return false;
      if (commodityFilter !== "all" && item.commodity !== commodityFilter) return false;
      if (qLower) {
        const hay = `${item.commodity} ${item.mappedCommodityName ?? ""} ${item.market} ${item.state} ${item.lga}`.toLowerCase();
        if (!hay.includes(qLower)) return false;
      }
      return true;
    });
  }, [snapshot, mappedOnly, stateFilter, commodityFilter, search]);

  const targetMarketName =
    markets.find((m) => m.id === targetMarketId)?.name ?? targetMarketId;

  return (
    <div className="space-y-5">
      {/* Live Fetch & Model Sync Controls */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Live External Market &amp; Macro Feeds
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Python fetches live WFP Nigeria market price surveys (HDX), USD/NGN spot rates, and World Bank CPI inflation.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <label className="sr-only" htmlFor="live-auto-refresh">
              Auto-refresh schedule
            </label>
            <select
              id="live-auto-refresh"
              value={autoRefreshMinutes}
              onChange={(e) => onChangeAutoRefreshMinutes(Number(e.target.value))}
              className="px-2.5 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <option value={0}>Refresh: Manual</option>
              <option value={5}>Auto-refresh: 5 min</option>
              <option value={15}>Auto-refresh: 15 min</option>
            </select>

            <button
              type="button"
              onClick={() => void onFetchLiveFeed()}
              disabled={fetching}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded-lg transition-colors disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${fetching ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              <span>{fetching ? "Fetching Live Data..." : "Fetch Live Market Data"}</span>
            </button>
          </div>
        </div>

        {fetchError && (
          <div
            role="alert"
            className="mt-4 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg px-3.5 py-2.5 text-xs text-red-800 dark:text-red-200"
          >
            {fetchError}
          </div>
        )}

        {syncFeedback && (
          <div
            role="status"
            className="mt-4 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-900 dark:text-emerald-200"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" aria-hidden="true" />
              <span>{syncFeedback}</span>
            </div>
            <button
              type="button"
              onClick={() =>
                onInspectSeries(
                  mappedSummaries[0]?.mappedCommodityId ?? "rice_ofada",
                  targetMarketId
                )
              }
              className="inline-flex items-center gap-1 font-semibold text-emerald-800 dark:text-emerald-300 hover:underline whitespace-nowrap"
            >
              <span>View Forecast Chart</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </section>

      {!snapshot ? (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center space-y-4">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 mx-auto flex items-center justify-center">
            <Globe className="w-5 h-5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
          </div>
          <div className="max-w-lg mx-auto space-y-1.5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              No External Market Snapshot Cached Yet
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Fetch the latest published World Food Programme (WFP) Nigeria market prices from HDX along with live ExchangeRate-API NGN parity and World Bank CPI inflation data.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onFetchLiveFeed()}
            disabled={fetching}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded-lg transition-colors disabled:opacity-60 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${fetching ? "animate-spin" : ""}`} aria-hidden="true" />
            <span>{fetching ? "Fetching Live Data..." : "Fetch Live Market Data"}</span>
          </button>
        </section>
      ) : (
        <>
          {/* 3-Column Macro & Live Survey Summary Strip */}
          <section
            aria-label="Live macro and market snapshot metrics"
            className="grid grid-cols-1 md:grid-cols-3 gap-4"
          >
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                USD / NGN Spot FX Rate
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1.5">
                {snapshot.fx ? `₦${snapshot.fx.usdNgn.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 font-mono tabular-nums">
                {snapshot.fx ? (
                  <>
                    <span>GBP {formatNaira(snapshot.fx.gbpNgn)}</span>
                    <span className="mx-1.5 text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
                    <span>EUR {formatNaira(snapshot.fx.eurNgn)}</span>
                  </>
                ) : (
                  <span>FX feed unavailable</span>
                )}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Nigeria Annual CPI Inflation
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-amber-700 dark:text-amber-400 mt-1.5">
                {snapshot.cpi ? `${snapshot.cpi.cpiPct.toFixed(2)}%` : "—"}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-300 mt-1.5">
                {snapshot.cpi
                  ? `${snapshot.cpi.year} Official · ${snapshot.cpi.provider}`
                  : "World Bank CPI unavailable"}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                WFP Nigeria Survey Coverage
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 mt-1.5">
                {snapshot.latestSurveyDate ? formatPeriodLabel(snapshot.latestSurveyDate) : "—"}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 font-mono tabular-nums">
                <span>{snapshot.totalRecentQuotes.toLocaleString()} quotes</span>
                <span className="mx-1.5 text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
                <span>{snapshot.marketsCoveredCount} markets</span>
                <span className="mx-1.5 text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
                <span>{snapshot.statesCovered.length} states</span>
              </div>
            </div>
          </section>

          {/* Mapped Commodity Parity & One-Click Forecast Sync */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Wholesale-Normalized Live Commodity Parity
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  WFP retail quotes scaled by exact weight/volume into NaijaPrice wholesale units ({snapshot.statesCovered.join(", ") || "Nigeria"}).
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-slate-600 dark:text-slate-300" htmlFor="sync-target-market">
                  Target Market:
                </label>
                <select
                  id="sync-target-market"
                  value={targetMarketId}
                  onChange={(e) => setTargetMarketId(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  {markets.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => void onSyncToForecast(targetMarketId)}
                  disabled={syncing || mappedSummaries.length === 0}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded-lg transition-colors disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  {syncing ? "Syncing..." : `Sync All (${mappedSummaries.length}) to Model`}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 pr-3 font-medium">NaijaPrice Commodity</th>
                    <th className="py-2.5 px-3 font-medium">WFP Retail Benchmark</th>
                    <th className="py-2.5 px-3 font-medium text-right">Avg Retail (NGN)</th>
                    <th className="py-2.5 px-3 font-medium text-right">USD Parity</th>
                    <th className="py-2.5 px-3 font-medium text-right">Wholesale Equiv.</th>
                    <th className="py-2.5 px-3 font-medium text-right">Quotes</th>
                    <th className="py-2.5 pl-3 font-medium text-right">Forecast Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {mappedSummaries.map((item) => (
                    <tr
                      key={`${item.mappedCommodityId}-${item.commodity}`}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-2.5 pr-3">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {item.mappedCommodityName}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Target unit: {item.wholesaleUnit}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                        <div>{item.commodity}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Per {item.unit} · {item.latestDate}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {formatNaira(item.avgRetailNgn)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        {formatUsd(item.avgUsdPrice)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        <div className="font-semibold text-emerald-700 dark:text-emerald-400">
                          {formatNaira(item.normalizedWholesaleNgn)}
                        </div>
                        {item.unitScaleFactor && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            ×{item.unitScaleFactor.toFixed(1)}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        {item.quoteCount}
                      </td>
                      <td className="py-2.5 pl-3 text-right">
                        <button
                          type="button"
                          disabled={syncing}
                          onClick={() =>
                            item.mappedCommodityId &&
                            void onSyncToForecast(targetMarketId, [item.mappedCommodityId])
                          }
                          className="px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-md transition-colors whitespace-nowrap"
                        >
                          Apply to {targetMarketName.split(",")[0]}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {unmappedSummaries.length > 0 && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Additional Live WFP Nigeria Commodities ({unmappedSummaries.length})
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {unmappedSummaries.slice(0, 8).map((item) => (
                    <div
                      key={`${item.commodity}-${item.unit}`}
                      className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                          {item.commodity}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          Per {item.unit} · {item.quoteCount} quotes
                        </div>
                      </div>
                      <div className="text-right font-mono tabular-nums shrink-0">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {formatNaira(item.avgRetailNgn)}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {formatUsd(item.avgUsdPrice)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Filterable Live WFP Nigeria Quotes Ledger */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Latest WFP Nigeria Market Quotes ({filteredQuotes.length})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Source: {snapshot.sourceMeta.organization} · {snapshot.sourceMeta.datasetTitle}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search
                    className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filter market or item..."
                    aria-label="Search live WFP market quotes"
                    className="pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>

                <select
                  aria-label="Filter by state"
                  value={stateFilter}
                  onChange={(e) => setStateFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg"
                >
                  <option value="all">All States ({snapshot.statesCovered.length})</option>
                  {snapshot.statesCovered.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Filter by WFP commodity"
                  value={commodityFilter}
                  onChange={(e) => setCommodityFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg"
                >
                  <option value="all">All Commodities</option>
                  {commodityOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>

                <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={mappedOnly}
                    onChange={(e) => setMappedOnly(e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-700 text-emerald-700 focus:ring-emerald-600"
                  />
                  <span>Mapped only</span>
                </label>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <th className="py-2 pr-3 font-medium">Survey Date</th>
                    <th className="py-2 px-3 font-medium">Market &amp; State</th>
                    <th className="py-2 px-3 font-medium">WFP Commodity</th>
                    <th className="py-2 px-3 font-medium">Unit</th>
                    <th className="py-2 px-3 font-medium text-right">Retail Quote</th>
                    <th className="py-2 px-3 font-medium text-right">USD Parity</th>
                    <th className="py-2 pl-3 font-medium text-right">Wholesale Equiv.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredQuotes.slice(0, 60).map((q, idx) => (
                    <tr
                      key={`${q.date}-${q.market}-${q.commodity}-${idx}`}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-2 pr-3 font-mono tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {q.date}
                      </td>
                      <td className="py-2 px-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {q.market}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {q.state}{q.lga ? ` · ${q.lga}` : ""}
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {q.commodity}
                        </div>
                        {q.mappedCommodityName && (
                          <div className="text-[11px] text-emerald-700 dark:text-emerald-400">
                            Maps to {q.mappedCommodityName}
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {q.unit} ({q.priceType})
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {formatNaira(q.priceNgn)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {formatUsd(q.usdPrice)}
                      </td>
                      <td className="py-2 pl-3 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                        {q.normalizedWholesaleNgn !== null
                          ? `${formatNaira(q.normalizedWholesaleNgn)} / ${q.wholesaleUnit}`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                  {filteredQuotes.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                        No live WFP market quotes match your current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
};
