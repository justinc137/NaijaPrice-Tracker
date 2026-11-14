import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  BookmarkCheck,
  CalendarRange,
  FileSpreadsheet,
  Menu,
  Table2,
  X,
} from "lucide-react";
import { AlertBanner, getAlertDismissKey } from "./components/AlertBanner";
import { DataLedgerView } from "./components/DataLedgerView";
import { MarketArbitrageView } from "./components/MarketArbitrageView";
import { PriceTrendChart } from "./components/PriceTrendChart";
import { ReportsPythonView } from "./components/ReportsPythonView";
import { SeasonalProfileChart } from "./components/SeasonalProfileChart";
import { SeasonalityMatrixView } from "./components/SeasonalityMatrixView";
import { WatchlistView, type NewAlertRulePayload } from "./components/WatchlistView";
import type {
  AlertRule,
  AlertsResponse,
  AnalysisResponse,
  CustomPriceRecord,
  DatasetMetaResponse,
  ForecastModelType,
  PriceAlert,
  WatchlistGroup,
  WatchlistItem,
  WatchlistsResponse,
  WorkspaceTab,
} from "./types/market";
import {
  formatNaira,
  formatPercent,
  formatPeriodLabel,
  getModelLabel,
} from "./utils/formatters";

const CUSTOM_STORAGE_KEY = "naijaprice_custom_records_v1";
const WATCHLIST_ACTIVE_KEY = "naijaprice_active_watchlist_v1";
const DISMISSED_ALERTS_KEY = "naijaprice_dismissed_alerts_v1";

const NAV_ITEMS: { id: WorkspaceTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "overview", label: "Price & Forecast", icon: BarChart3 },
  { id: "watchlists", label: "Watchlists", icon: BookmarkCheck },
  { id: "seasonality", label: "Seasonality Matrix", icon: CalendarRange },
  { id: "arbitrage", label: "Market Arbitrage", icon: ArrowLeftRight },
  { id: "ledger", label: "Data Ledger", icon: Table2 },
  { id: "reports", label: "Reports & Python", icon: FileSpreadsheet },
];

export default function App() {
  const [meta, setMeta] = useState<DatasetMetaResponse | null>(null);
  const [commodityId, setCommodityId] = useState<string>("rice_ofada");
  const [marketId, setMarketId] = useState<string>("mile12_lagos");
  const [forecastMonths, setForecastMonths] = useState<number>(6);
  const [modelType, setModelType] = useState<ForecastModelType>("ridge_seasonal");
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [customRecords, setCustomRecords] = useState<CustomPriceRecord[]>(() => {
    try {
      const saved = localStorage.getItem(CUSTOM_STORAGE_KEY);
      return saved ? (JSON.parse(saved) as CustomPriceRecord[]) : [];
    } catch {
      return [];
    }
  });

  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [watchlists, setWatchlists] = useState<WatchlistGroup[]>([]);
  const [activeWatchlistId, setActiveWatchlistId] = useState<string>(() => {
    try {
      return localStorage.getItem(WATCHLIST_ACTIVE_KEY) || "wl_core_market";
    } catch {
      return "wl_core_market";
    }
  });
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [triggeredAlerts, setTriggeredAlerts] = useState<PriceAlert[]>([]);
  const [dismissedAlertKeys, setDismissedAlertKeys] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(DISMISSED_ALERTS_KEY);
      return saved ? (JSON.parse(saved) as string[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(customRecords));
    } catch {
      // Ignore storage quota issues
    }
  }, [customRecords]);

  useEffect(() => {
    try {
      localStorage.setItem(WATCHLIST_ACTIVE_KEY, activeWatchlistId);
    } catch {
      // Ignore storage quota issues
    }
  }, [activeWatchlistId]);

  useEffect(() => {
    try {
      localStorage.setItem(DISMISSED_ALERTS_KEY, JSON.stringify(dismissedAlertKeys));
    } catch {
      // Ignore storage quota issues
    }
  }, [dismissedAlertKeys]);

  useEffect(() => {
    let active = true;
    fetch("/api/meta")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load Nigerian commodity metadata");
        return res.json();
      })
      .then((data: DatasetMetaResponse) => {
        if (!active) return;
        setMeta(data);
      })
      .catch((err) => {
        if (active) setError((err as Error).message);
      });
    return () => {
      active = false;
    };
  }, []);

  const loadAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activeWatchlistId,
          customRecords,
        }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as AlertsResponse;
      setAlertRules(data.rules);
      setTriggeredAlerts(data.alerts);
    } catch {
      // Keep existing alert state on transient failure
    }
  }, [activeWatchlistId, customRecords]);

  const loadWatchlists = useCallback(async () => {
    try {
      const res = await fetch("/api/watchlists/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          forecastMonths,
          modelType,
          customRecords,
        }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as WatchlistsResponse;
      setWatchlists(data.watchlists);
      setActiveWatchlistId((prev) =>
        data.watchlists.some((w) => w.id === prev)
          ? prev
          : data.watchlists[0]?.id ?? ""
      );
      await loadAlerts();
    } catch {
      // Keep existing watchlists on transient failure
    }
  }, [forecastMonths, modelType, customRecords, loadAlerts]);

  useEffect(() => {
    loadWatchlists();
  }, [loadWatchlists]);

  const loadAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commodityId,
          marketId,
          forecastMonths,
          modelType,
          customRecords,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Python analysis engine returned an error.");
      }
      setAnalysis(data as AnalysisResponse);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [commodityId, marketId, forecastMonths, modelType, customRecords]);

  useEffect(() => {
    loadAnalysis();
  }, [loadAnalysis]);

  const handleCreateWatchlist = async (name: string, items: WatchlistItem[]) => {
    const res = await fetch("/api/watchlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        items,
        forecastMonths,
        modelType,
        customRecords,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error || "Failed to create watchlist");
    }
    setWatchlists(data.watchlists);
    if (data.created?.id) {
      setActiveWatchlistId(data.created.id);
    }
    await loadAlerts();
  };

  const handleDeleteWatchlist = async (id: string) => {
    const res = await fetch(`/api/watchlists/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ forecastMonths, modelType, customRecords }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as WatchlistsResponse;
    setWatchlists(data.watchlists);
    setActiveWatchlistId(data.watchlists[0]?.id ?? "");
    await loadAlerts();
  };

  const handleToggleWatchlistItem = async (
    wlId: string,
    targetCommodityId: string,
    targetMarketId: string
  ) => {
    const res = await fetch(`/api/watchlists/${encodeURIComponent(wlId)}/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commodityId: targetCommodityId,
        marketId: targetMarketId,
        forecastMonths,
        modelType,
        customRecords,
      }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as WatchlistsResponse;
    setWatchlists(data.watchlists);
    await loadAlerts();
  };

  const handleCreateAlertRule = async (payload: NewAlertRulePayload) => {
    const res = await fetch("/api/alerts/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        activeWatchlistId,
        customRecords,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error || "Failed to create alert rule");
    }
    setAlertRules(data.rules);
    setTriggeredAlerts(data.alerts);
  };

  const handleToggleAlertRule = async (id: string, enabled: boolean) => {
    const res = await fetch(`/api/alerts/rules/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled, activeWatchlistId, customRecords }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as AlertsResponse;
    setAlertRules(data.rules);
    setTriggeredAlerts(data.alerts);
  };

  const handleDeleteAlertRule = async (id: string) => {
    const res = await fetch(`/api/alerts/rules/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activeWatchlistId, customRecords }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as AlertsResponse;
    setAlertRules(data.rules);
    setTriggeredAlerts(data.alerts);
  };

  const unacknowledgedAlerts = triggeredAlerts.filter(
    (al) => !dismissedAlertKeys.includes(getAlertDismissKey(al))
  );

  const handleAddCustomRecords = (newRows: CustomPriceRecord[]) => {
    setCustomRecords((prev) => [...prev, ...newRows]);
  };

  const handleClearCustomRecords = () => {
    setCustomRecords([]);
  };

  const activeCommodity = meta?.commodities.find((c) => c.id === commodityId);
  const activeMarket = meta?.markets.find((m) => m.id === marketId);
  const activeWatchlist =
    watchlists.find((w) => w.id === activeWatchlistId) ?? watchlists[0] ?? null;
  const isCurrentPairMonitored = Boolean(
    activeWatchlist?.items.some(
      (it) => it.commodityId === commodityId && it.marketId === marketId
    )
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Workspace Sidebar */}
      <aside
        className={`no-print fixed lg:static inset-y-0 left-0 z-40 w-[264px] shrink-0 bg-white border-r border-slate-200 flex flex-col justify-between transition-transform duration-150 lg:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-5 space-y-6 overflow-y-auto">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
                NaijaPrice Tracker
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Nigerian Agro-Market Analytics
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1.5 rounded-md text-slate-500 hover:bg-slate-100"
              aria-label="Close navigation menu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Primary Navigation */}
          <nav aria-label="Primary sections" className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                    isActive
                      ? "bg-emerald-700 text-white"
                      : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>
                    {item.label}
                    {item.id === "watchlists" && unacknowledgedAlerts.length > 0
                      ? ` · ${unacknowledgedAlerts.length} alert${
                          unacknowledgedAlerts.length === 1 ? "" : "s"
                        }`
                      : ""}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Analysis Parameter Controls */}
          <div className="pt-5 border-t border-slate-200 space-y-4">
            <div>
              <label
                htmlFor="commodity-select"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Commodity
              </label>
              <select
                id="commodity-select"
                value={commodityId}
                onChange={(e) => setCommodityId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                {(meta?.commodities ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {activeCommodity && (
                <p className="text-[11px] text-slate-500 mt-1">
                  Unit: {activeCommodity.unit} · {activeCommodity.category}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="market-select"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Nigerian Market
              </label>
              <select
                id="market-select"
                value={marketId}
                onChange={(e) => setMarketId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                {(meta?.markets ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-700 mb-1.5">
                Forecast Horizon
              </span>
              <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-lg">
                {[3, 6, 9, 12].map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setForecastMonths(h)}
                    className={`py-1.5 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap ${
                      forecastMonths === h
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {h}m
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="model-select"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Python Forecasting Model
              </label>
              <select
                id="model-select"
                value={modelType}
                onChange={(e) => setModelType(e.target.value as ForecastModelType)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                <option value="ridge_seasonal">Ridge + Seasonal Dummies</option>
                <option value="poly_seasonal">Polynomial + Fourier Harmonics</option>
                <option value="holt_winters">Holt-Winters Multiplicative</option>
              </select>
            </div>
          </div>
        </div>

        {/* Quiet Dataset Coverage Footer inside Sidebar */}
        <div className="p-4 border-t border-slate-200 text-xs text-slate-500 space-y-1">
          <div className="font-medium text-slate-700">Dataset Coverage</div>
          <div className="font-mono tabular-nums">
            {meta ? `${meta.totalRecords.toLocaleString()} rows · ${meta.dateRange.months} mos` : "Loading dataset..."}
          </div>
          {customRecords.length > 0 && (
            <div className="text-emerald-700 font-medium">
              +{customRecords.length} custom survey row(s)
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb on left, 1 primary action on right */}
        <header className="no-print bg-white border-b border-slate-200 px-5 lg:px-7 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100"
              aria-label="Open navigation menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-xs text-slate-500 truncate">
              <span className="font-medium text-slate-700">Nigerian Markets</span>
              <span aria-hidden="true">/</span>
              <span className="truncate">{activeMarket?.name ?? marketId}</span>
              <span aria-hidden="true">/</span>
              <span className="font-semibold text-slate-900 truncate">
                {activeCommodity?.name ?? commodityId}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab("reports")}
            className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Export Report
          </button>
        </header>

        <main className="flex-1 p-5 lg:p-7 max-w-[1320px] w-full mx-auto space-y-5">
          {unacknowledgedAlerts.length > 0 && (
            <AlertBanner
              alerts={unacknowledgedAlerts}
              onInspectAlert={(cid, mid) => {
                setCommodityId(cid);
                setMarketId(mid);
                setActiveTab("overview");
              }}
              onDismissAlert={(key) =>
                setDismissedAlertKeys((prev) => (prev.includes(key) ? prev : [...prev, key]))
              }
              onDismissAll={() =>
                setDismissedAlertKeys((prev) => [
                  ...new Set([...prev, ...unacknowledgedAlerts.map(getAlertDismissKey)]),
                ])
              }
              onOpenRules={() => setActiveTab("watchlists")}
            />
          )}

          {error && (
            <div
              role="alert"
              className="bg-red-50 border border-red-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3"
            >
              <p className="text-sm text-red-800">{error}</p>
              <button
                type="button"
                onClick={loadAnalysis}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 rounded-lg"
              >
                Retry Python Analysis
              </button>
            </div>
          )}

          {loading && !analysis ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-24 bg-white border border-slate-200 rounded-xl p-4 animate-pulse"
                  />
                ))}
              </div>
              <div className="h-96 bg-white border border-slate-200 rounded-xl animate-pulse" />
            </div>
          ) : (
            analysis && (
              <>
                {activeTab === "overview" && (
                  <div className="space-y-5">
                    {/* 4-Column KPI Strip */}
                    <section
                      aria-label="Key commodity metrics"
                      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
                    >
                      <div className="bg-white border border-slate-200 rounded-xl p-4">
                        <div className="text-xs font-medium text-slate-500">
                          Latest Spot Price · {formatPeriodLabel(analysis.meta.latestDate)}
                        </div>
                        <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1.5">
                          {formatNaira(analysis.kpis.latestPriceNgn)}
                        </div>
                        <div className="text-xs text-slate-600 mt-1.5 font-mono tabular-nums">
                          <span
                            className={
                              analysis.kpis.momPct >= 0 ? "text-amber-700 font-medium" : "text-emerald-700 font-medium"
                            }
                          >
                            {formatPercent(analysis.kpis.momPct)} MoM
                          </span>
                          <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
                          <span>{formatPercent(analysis.kpis.yoyPct)} YoY</span>
                        </div>
                      </div>

                      <div className="bg-white border border-slate-200 rounded-xl p-4">
                        <div className="text-xs font-medium text-slate-500">
                          {forecastMonths}-Month Projection ({getModelLabel(modelType).split(" ")[0]})
                        </div>
                        <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1.5">
                          {formatNaira(analysis.kpis.projectedEndNgn)}
                        </div>
                        <div className="text-xs text-slate-600 mt-1.5 font-mono tabular-nums">
                          <span>{formatPercent(analysis.kpis.projectedChangePct)} vs spot</span>
                          <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
                          <span>12M Avg {formatNaira(analysis.kpis.avg12mNgn)}</span>
                        </div>
                      </div>

                      <div className="bg-white border border-slate-200 rounded-xl p-4">
                        <div className="text-xs font-medium text-slate-500">
                          Seasonal Peak / Trough
                        </div>
                        <div className="text-xl font-bold text-slate-900 mt-1.5">
                          {analysis.seasonality.peakMonth}{" "}
                          <span className="text-slate-400 font-normal">/</span>{" "}
                          {analysis.seasonality.troughMonth}
                        </div>
                        <div className="text-xs text-slate-600 mt-2 font-mono tabular-nums">
                          <span>Strength {analysis.seasonality.strengthPct.toFixed(0)}%</span>
                          <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
                          <span>Spread {analysis.seasonality.seasonalSpreadPct.toFixed(1)}%</span>
                        </div>
                      </div>

                      <div className="bg-white border border-slate-200 rounded-xl p-4">
                        <div className="text-xs font-medium text-slate-500">
                          Python Holdout Backtest ({analysis.backtest.samples}M)
                        </div>
                        <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1.5">
                          {analysis.backtest.mape.toFixed(2)}% MAPE
                        </div>
                        <div className="text-xs text-slate-600 mt-1.5 font-mono tabular-nums">
                          <span>RMSE {formatNaira(analysis.backtest.rmse)}</span>
                          <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
                          <span>CV {analysis.kpis.volatilityPct.toFixed(1)}%</span>
                        </div>
                      </div>
                    </section>

                    {/* Primary Focal Anchor: Interactive Price Trend + Forecast Chart */}
                    <PriceTrendChart
                      history={analysis.history}
                      forecast={analysis.forecast}
                      commodityName={analysis.meta.commodityName}
                      unit={analysis.meta.unit}
                      marketName={analysis.meta.marketName}
                      modelLabel={getModelLabel(analysis.modelType)}
                    />

                    {/* Secondary Row: 12-Month Seasonality + Trader/Student Briefing & Arbitrage */}
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-stretch">
                      <div className="lg:col-span-3 flex flex-col">
                        <SeasonalProfileChart
                          profile={analysis.seasonality.profile}
                          strengthPct={analysis.seasonality.strengthPct}
                          peakMonth={analysis.seasonality.peakMonth}
                          peakDeviationPct={analysis.seasonality.peakDeviationPct}
                          troughMonth={analysis.seasonality.troughMonth}
                          troughDeviationPct={analysis.seasonality.troughDeviationPct}
                          seasonalSpreadPct={analysis.seasonality.seasonalSpreadPct}
                        />
                      </div>

                      <section className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-5">
                        <div className="space-y-4">
                          <div>
                            <div className="text-xs font-medium text-emerald-700">
                              Decision Guidance · {analysis.insights.traderSignal}
                            </div>
                            <h2 className="text-base font-semibold text-slate-900 mt-1">
                              Trader &amp; Student Brief
                            </h2>
                            <p className="text-xs text-slate-600 leading-relaxed mt-1.5">
                              {analysis.insights.traderSummary}
                            </p>
                            <p className="text-xs text-slate-500 leading-relaxed mt-2.5 pt-2.5 border-t border-slate-100">
                              {analysis.insights.studentNote}
                            </p>
                          </div>

                          <div className="pt-3 border-t border-slate-200">
                            <div className="flex items-center justify-between mb-2.5">
                              <h3 className="text-xs font-semibold text-slate-900">
                                Regional Market Spread ({analysis.meta.commodityName})
                              </h3>
                              <button
                                type="button"
                                onClick={() => setActiveTab("arbitrage")}
                                className="text-xs font-medium text-emerald-700 hover:underline"
                              >
                                Full arbitrage →
                              </button>
                            </div>
                            <div className="divide-y divide-slate-100 text-xs">
                              {analysis.marketComparison.slice(0, 4).map((m) => (
                                <div
                                  key={m.marketId}
                                  className="py-2 flex items-center justify-between gap-2"
                                >
                                  <span className="text-slate-700 truncate">
                                    {m.marketName}
                                  </span>
                                  <span className="font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                                    {formatNaira(m.price_ngn)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                          <span className="text-slate-500">National Spread</span>
                          <span className="font-mono tabular-nums font-semibold text-slate-900">
                            {formatNaira(analysis.arbitrage.spreadNgn)} ({formatPercent(analysis.arbitrage.spreadPct, false)})
                          </span>
                        </div>
                      </section>
                    </div>

                    {/* Personalized Watchlist Performance Highlight Panel */}
                    <section
                      aria-label="Monitored watchlist performance"
                      className="bg-white border border-slate-200 rounded-xl p-5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-base font-semibold text-slate-900">
                              Monitored Watchlist Highlights
                            </h2>
                            {activeWatchlist && (
                              <span className="text-xs text-slate-500">
                                · {activeWatchlist.name}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Live spot prices, momentum, and {forecastMonths}-month projections for your selected commodities and markets.
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {watchlists.length > 1 && (
                            <select
                              aria-label="Select active watchlist"
                              value={activeWatchlist?.id ?? ""}
                              onChange={(e) => setActiveWatchlistId(e.target.value)}
                              className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                            >
                              {watchlists.map((wl) => (
                                <option key={wl.id} value={wl.id}>
                                  {wl.name} ({wl.items.length})
                                </option>
                              ))}
                            </select>
                          )}

                          {activeWatchlist && (
                            <button
                              type="button"
                              onClick={() =>
                                handleToggleWatchlistItem(activeWatchlist.id, commodityId, marketId)
                              }
                              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                                isCurrentPairMonitored
                                  ? "bg-emerald-700 text-white border-emerald-700 hover:bg-emerald-800"
                                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                              }`}
                            >
                              {isCurrentPairMonitored
                                ? "Monitored in Watchlist"
                                : "+ Monitor Current Pair"}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setActiveTab("watchlists")}
                            className="px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                          >
                            Manage Watchlists →
                          </button>
                        </div>
                      </div>

                      {!activeWatchlist || activeWatchlist.performance.length === 0 ? (
                        <div className="py-6 text-center text-xs text-slate-500 border-t border-slate-100">
                          No items in your active watchlist yet. Click "+ Monitor Current Pair" or open Manage Watchlists to select commodities and markets.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {activeWatchlist.performance.map((item) => {
                            const isFocused =
                              item.commodityId === commodityId && item.marketId === marketId;
                            const itemAlert = triggeredAlerts.find(
                              (al) =>
                                al.commodityId === item.commodityId &&
                                al.marketId === item.marketId
                            );
                            return (
                              <button
                                key={`${item.commodityId}-${item.marketId}`}
                                type="button"
                                onClick={() => {
                                  setCommodityId(item.commodityId);
                                  setMarketId(item.marketId);
                                }}
                                className={`text-left p-3.5 rounded-lg border transition-colors ${
                                  isFocused
                                    ? "bg-emerald-50/60 border-emerald-300"
                                    : itemAlert
                                    ? "bg-amber-50/40 border-amber-200 hover:bg-amber-50/70"
                                    : "bg-slate-50/60 border-slate-200 hover:bg-slate-100/70"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="text-xs font-semibold text-slate-900 truncate">
                                      {item.commodityName}
                                    </div>
                                    <div className="text-[11px] text-slate-500 truncate mt-0.5">
                                      {item.marketName} · {item.unit}
                                    </div>
                                  </div>
                                  <div className="text-right font-mono tabular-nums shrink-0">
                                    <div className="text-sm font-bold text-slate-900">
                                      {formatNaira(item.latestPriceNgn)}
                                    </div>
                                    <div
                                      className={`text-[11px] font-medium ${
                                        item.momPct >= 0 ? "text-amber-700" : "text-emerald-700"
                                      }`}
                                    >
                                      {formatPercent(item.momPct)} MoM
                                    </div>
                                  </div>
                                </div>

                                {itemAlert && (
                                  <div
                                    className={`mt-2 flex items-center gap-1.5 text-[11px] font-medium ${
                                      itemAlert.severity === "critical"
                                        ? "text-red-700"
                                        : "text-amber-700"
                                    }`}
                                  >
                                    <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" />
                                    <span className="truncate">
                                      {itemAlert.severity === "critical" ? "Critical" : "Alert"}:{" "}
                                      {formatPercent(itemAlert.deviationPct)} vs {itemAlert.baselineLabel}
                                    </span>
                                  </div>
                                )}

                                <div className="mt-2.5 pt-2 border-t border-slate-200/80 flex items-center justify-between text-[11px]">
                                  <span className="text-slate-600">
                                    {item.seasonalPhase} · {item.traderSignal}
                                  </span>
                                  <span className="font-mono tabular-nums text-emerald-700 font-medium">
                                    {forecastMonths}M: {formatNaira(item.projectedEndNgn)}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  </div>
                )}

                {activeTab === "watchlists" && meta && (
                  <WatchlistView
                    commodities={meta.commodities}
                    markets={meta.markets}
                    watchlists={watchlists}
                    activeWatchlistId={activeWatchlist?.id ?? ""}
                    forecastMonths={forecastMonths}
                    alertRules={alertRules}
                    triggeredAlerts={triggeredAlerts}
                    onSelectWatchlist={(id) => setActiveWatchlistId(id)}
                    onCreateWatchlist={handleCreateWatchlist}
                    onDeleteWatchlist={handleDeleteWatchlist}
                    onToggleItem={handleToggleWatchlistItem}
                    onInspectPair={(cid, mid) => {
                      setCommodityId(cid);
                      setMarketId(mid);
                      setActiveTab("overview");
                    }}
                    onCreateAlertRule={handleCreateAlertRule}
                    onToggleAlertRule={handleToggleAlertRule}
                    onDeleteAlertRule={handleDeleteAlertRule}
                  />
                )}

                {activeTab === "seasonality" && (
                  <SeasonalityMatrixView
                    matrix={analysis.seasonalityMatrix}
                    marketName={analysis.meta.marketName}
                    selectedCommodityId={commodityId}
                    onSelectCommodity={(cid) => {
                      setCommodityId(cid);
                      setActiveTab("overview");
                    }}
                  />
                )}

                {activeTab === "arbitrage" && (
                  <MarketArbitrageView
                    commodityName={analysis.meta.commodityName}
                    unit={analysis.meta.unit}
                    latestDate={analysis.meta.latestDate}
                    nationalAvgNgn={analysis.kpis.nationalAvgNgn}
                    marketComparison={analysis.marketComparison}
                    arbitrage={analysis.arbitrage}
                    selectedMarketId={marketId}
                    onSelectMarket={(mid) => setMarketId(mid)}
                  />
                )}

                {activeTab === "ledger" && meta && (
                  <DataLedgerView
                    commodities={meta.commodities}
                    markets={meta.markets}
                    customRecords={customRecords}
                    onAddCustomRecords={handleAddCustomRecords}
                    onClearCustomRecords={handleClearCustomRecords}
                  />
                )}

                {activeTab === "reports" && (
                  <ReportsPythonView
                    analysis={analysis}
                    activeWatchlist={activeWatchlist}
                    alerts={triggeredAlerts}
                  />
                )}
              </>
            )
          )}
        </main>
      </div>
    </div>
  );
}
