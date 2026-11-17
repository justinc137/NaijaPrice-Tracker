import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  BellRing,
  BookmarkCheck,
  CalendarRange,
  FileSpreadsheet,
  Globe,
  Menu,
  Moon,
  Plus,
  RefreshCw,
  Sun,
  Table2,
  X,
} from "lucide-react";
import { AlertBanner, getAlertDismissKey } from "./components/AlertBanner";
import { DataLedgerView } from "./components/DataLedgerView";
import { LiveMarketFeedView } from "./components/LiveMarketFeedView";
import { LivePriceInputPanel } from "./components/LivePriceInputPanel";
import { MarketArbitrageView } from "./components/MarketArbitrageView";
import { ModelComparisonPanel } from "./components/ModelComparisonPanel";
import { PriceTrendChart } from "./components/PriceTrendChart";
import { QuickPriceAlertPanel } from "./components/QuickPriceAlertPanel";
import { ReportsPythonView } from "./components/ReportsPythonView";
import { SeasonalProfileChart } from "./components/SeasonalProfileChart";
import { SeasonalityMatrixView } from "./components/SeasonalityMatrixView";
import { WatchlistView, type NewAlertRulePayload } from "./components/WatchlistView";
import { OfflineIndicator, PWAInstallButton } from "./components/PWAStatusControls";
import { useOnlineStatus } from "./hooks/usePWA";
import type {
  AlertRule,
  AlertsResponse,
  AnalysisResponse,
  CustomPriceRecord,
  DatasetMetaResponse,
  ForecastModelType,
  LiveFeedSnapshot,
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
  getShortModelLabel,
} from "./utils/formatters";
import { findNewlyTriggeredAlerts, getAlertNotificationKey } from "./utils/forecastHelpers";
import { loadOfflineSnapshot, mirrorJsonToSwCache, saveOfflineSnapshot } from "./utils/offlineCache";
import {
  ROUTE_SEO_LIST,
  applyDocumentSeo,
  getRouteMeta,
  getSlugForTab,
  tabFromPathname,
} from "./utils/seo";

const CUSTOM_STORAGE_KEY = "naijaprice_custom_records_v1";
const WATCHLIST_ACTIVE_KEY = "naijaprice_active_watchlist_v1";
const DISMISSED_ALERTS_KEY = "naijaprice_dismissed_alerts_v1";
const THEME_STORAGE_KEY = "naijaprice_theme";
const OFFLINE_META_KEY = "naijaprice_offline_meta_v1";
const OFFLINE_ANALYSIS_KEY = "naijaprice_offline_analysis_v1";
const OFFLINE_LIVE_FEED_KEY = "naijaprice_offline_live_feed_v1";

const NAV_ITEMS: { id: WorkspaceTab; label: string; slug: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "overview", label: "Price & Forecast", slug: "/price-forecast", icon: BarChart3 },
  { id: "live", label: "Live Feeds", slug: "/live-feeds", icon: Globe },
  { id: "watchlists", label: "Watchlists", slug: "/watchlists", icon: BookmarkCheck },
  { id: "seasonality", label: "Seasonality Matrix", slug: "/seasonality-matrix", icon: CalendarRange },
  { id: "arbitrage", label: "Market Arbitrage", slug: "/market-arbitrage", icon: ArrowLeftRight },
  { id: "ledger", label: "Data Ledger", slug: "/data-ledger", icon: Table2 },
  { id: "reports", label: "Reports & Python", slug: "/reports-python", icon: FileSpreadsheet },
];

export default function App() {
  const [meta, setMeta] = useState<DatasetMetaResponse | null>(null);
  const [commodityId, setCommodityId] = useState<string>("rice_ofada");
  const [marketId, setMarketId] = useState<string>("mile12_lagos");
  const [forecastMonths, setForecastMonths] = useState<number>(6);
  const [modelType, setModelType] = useState<ForecastModelType>("ridge_seasonal");
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(() =>
    typeof window !== "undefined" ? tabFromPathname(window.location.pathname) : "overview"
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === "dark" || saved === "light") return saved;
      return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {
      return "light";
    }
  });

  const [customRecords, setCustomRecords] = useState<CustomPriceRecord[]>(() => {
    try {
      const saved = localStorage.getItem(CUSTOM_STORAGE_KEY);
      return saved ? (JSON.parse(saved) as CustomPriceRecord[]) : [];
    } catch {
      return [];
    }
  });

  const isOnline = useOnlineStatus();
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(() => {
    const snap = loadOfflineSnapshot<AnalysisResponse>(OFFLINE_ANALYSIS_KEY);
    return snap?.value ?? null;
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [cacheMode, setCacheMode] = useState<"live" | "offline" | "offline-latest">("live");
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(() => {
    const snap = loadOfflineSnapshot<AnalysisResponse>(OFFLINE_ANALYSIS_KEY);
    return snap?.savedAt ?? null;
  });

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
  const [toastAlerts, setToastAlerts] = useState<PriceAlert[]>([]);
  const knownAlertKeysRef = useRef<Set<string>>(new Set());
  const alertsInitializedRef = useRef(false);
  const [showLiveInput, setShowLiveInput] = useState(false);
  const [showQuickAlert, setShowQuickAlert] = useState(false);
  const [showModelOverlay, setShowModelOverlay] = useState(false);
  const [liveSnapshot, setLiveSnapshot] = useState<LiveFeedSnapshot | null>(() => {
    const snap = loadOfflineSnapshot<LiveFeedSnapshot>(OFFLINE_LIVE_FEED_KEY);
    return snap?.value ?? null;
  });
  const [liveFetching, setLiveFetching] = useState(false);
  const [liveSyncing, setLiveSyncing] = useState(false);
  const [liveFetchError, setLiveFetchError] = useState<string | null>(null);
  const [liveSyncFeedback, setLiveSyncFeedback] = useState<string | null>(null);
  const [autoRefreshMinutes, setAutoRefreshMinutes] = useState<number>(0);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >(() =>
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "unsupported"
  );
  const [dismissedAlertKeys, setDismissedAlertKeys] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(DISMISSED_ALERTS_KEY);
      return saved ? (JSON.parse(saved) as string[]) : [];
    } catch {
      return [];
    }
  });

  // Auto-dismiss live alert toasts after 12 seconds
  useEffect(() => {
    if (toastAlerts.length === 0) return;
    const timer = window.setTimeout(() => {
      setToastAlerts([]);
    }, 12000);
    return () => window.clearTimeout(timer);
  }, [toastAlerts]);

  // Sync dark mode class on <html> and persist
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage quota issues
    }
  }, [theme]);

  // Listen to browser back/forward history changes for clean URL routing
  useEffect(() => {
    const onPopState = () => {
      setActiveTab(tabFromPathname(window.location.pathname));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigateToTab = useCallback((tab: WorkspaceTab, hash?: string) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
    const targetSlug = getSlugForTab(tab);
    const targetUrl = hash ? `${targetSlug}${hash}` : targetSlug;
    if (window.location.pathname !== targetSlug || (hash && window.location.hash !== hash)) {
      window.history.pushState({ tab }, "", targetUrl);
    }
    if (hash) {
      requestAnimationFrame(() => {
        const el = document.getElementById(hash.replace(/^#/, ""));
        el?.scrollIntoView({ behavior: "smooth" });
      });
    }
  }, []);

  const handleSpaLinkClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    tab: WorkspaceTab,
    hash?: string
  ) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }
    e.preventDefault();
    navigateToTab(tab, hash);
  };

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
    const cachedMeta = loadOfflineSnapshot<DatasetMetaResponse>(OFFLINE_META_KEY);
    if (cachedMeta) {
      setMeta((prev) => prev ?? cachedMeta.value);
    }
    fetch("/api/meta")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load Nigerian commodity metadata");
        return res.json();
      })
      .then((data: DatasetMetaResponse) => {
        if (!active) return;
        setMeta(data);
        saveOfflineSnapshot(OFFLINE_META_KEY, data);
        void mirrorJsonToSwCache("/api/meta", "", data);
      })
      .catch((err) => {
        if (active && !cachedMeta) {
          setError((err as Error).message);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  // Load persisted custom survey observations from SQLite on startup
  useEffect(() => {
    let active = true;
    fetch("/api/observations")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { observations?: CustomPriceRecord[] } | null) => {
        if (!active || !data || !Array.isArray(data.observations)) return;
        setCustomRecords(data.observations);
      })
      .catch(() => {
        // Keep local fallback when offline
      });
    return () => {
      active = false;
    };
  }, []);

  // Load cached SQLite live market snapshot on startup
  useEffect(() => {
    let active = true;
    fetch("/api/live-feed")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { snapshot?: LiveFeedSnapshot | null } | null) => {
        if (!active || !data || !data.snapshot) return;
        setLiveSnapshot(data.snapshot);
        saveOfflineSnapshot(OFFLINE_LIVE_FEED_KEY, data.snapshot);
        void mirrorJsonToSwCache("/api/live-feed", "", data);
      })
      .catch(() => {
        // Keep cached offline snapshot
      });
    return () => {
      active = false;
    };
  }, []);

  const handleRequestBrowserNotifications = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      setNotificationPermission(perm);
    } catch {
      // Ignore permission request cancellation
    }
  }, []);

  const applyAlertUpdate = useCallback((nextAlerts: PriceAlert[], emitNotifications: boolean) => {
    if (!alertsInitializedRef.current) {
      alertsInitializedRef.current = true;
      knownAlertKeysRef.current = new Set(nextAlerts.map(getAlertNotificationKey));
      setTriggeredAlerts(nextAlerts);
      return;
    }

    if (emitNotifications) {
      const newlyTriggered = findNewlyTriggeredAlerts(
        [],
        nextAlerts,
        knownAlertKeysRef.current
      );
      if (newlyTriggered.length > 0) {
        setToastAlerts((prev) => {
          const existingIds = new Set(prev.map(getAlertNotificationKey));
          const additions = newlyTriggered.filter(
            (a) => !existingIds.has(getAlertNotificationKey(a))
          );
          return [...additions, ...prev].slice(0, 4);
        });
        if (
          typeof window !== "undefined" &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          for (const al of newlyTriggered.slice(0, 2)) {
            try {
              new Notification(`NaijaPrice Alert: ${al.commodityName}`, {
                body: al.message,
                icon: "/pwa-192x192.png",
              });
            } catch {
              // Ignore restricted notification context
            }
          }
        }
      }
    }

    for (const al of nextAlerts) {
      knownAlertKeysRef.current.add(getAlertNotificationKey(al));
    }
    setTriggeredAlerts(nextAlerts);
  }, []);

  const loadAlerts = useCallback(async (emitNotifications = false) => {
    try {
      const payload = {
        activeWatchlistId,
        customRecords,
      };
      const res = await fetch("/api/alerts/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return;
      const data = (await res.json()) as AlertsResponse;
      setAlertRules(data.rules);
      applyAlertUpdate(data.alerts, emitNotifications);
      if (!res.headers.get("X-NaijaPrice-Cache")) {
        void mirrorJsonToSwCache("/api/alerts/evaluate", JSON.stringify(payload), data);
      }
    } catch {
      // Keep existing alert state on transient failure
    }
  }, [activeWatchlistId, customRecords, applyAlertUpdate]);

  const loadWatchlists = useCallback(async () => {
    try {
      const payload = {
        forecastMonths,
        modelType,
        customRecords,
      };
      const res = await fetch("/api/watchlists/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return;
      const data = (await res.json()) as WatchlistsResponse;
      setWatchlists(data.watchlists);
      setActiveWatchlistId((prev) =>
        data.watchlists.some((w) => w.id === prev)
          ? prev
          : data.watchlists[0]?.id ?? ""
      );
      if (!res.headers.get("X-NaijaPrice-Cache")) {
        void mirrorJsonToSwCache("/api/watchlists/list", JSON.stringify(payload), data);
      }
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
      const cacheHeader = res.headers.get("X-NaijaPrice-Cache");
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Python analysis engine returned an error.");
      }
      setAnalysis(data as AnalysisResponse);
      if (cacheHeader === "offline-latest") {
        setCacheMode("offline-latest");
      } else if (cacheHeader === "offline") {
        setCacheMode("offline");
      } else {
        setCacheMode("live");
        const now = Date.now();
        setLastSyncedAt(now);
        saveOfflineSnapshot(OFFLINE_ANALYSIS_KEY, data);
        void mirrorJsonToSwCache(
          "/api/analyze",
          JSON.stringify({
            commodityId,
            marketId,
            forecastMonths,
            modelType,
            customRecords,
          }),
          data
        );
      }
    } catch (err) {
      const snap = loadOfflineSnapshot<AnalysisResponse>(OFFLINE_ANALYSIS_KEY);
      if (snap?.value) {
        setAnalysis(snap.value);
        setCacheMode("offline-latest");
        setLastSyncedAt(snap.savedAt);
        setError(null);
      } else {
        setError((err as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }, [commodityId, marketId, forecastMonths, modelType, customRecords]);

  useEffect(() => {
    loadAnalysis();
  }, [loadAnalysis]);

  useEffect(() => {
    if (isOnline && cacheMode !== "live") {
      void loadAnalysis();
      void loadWatchlists();
    }
  }, [isOnline, cacheMode, loadAnalysis, loadWatchlists]);

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
    applyAlertUpdate(data.alerts, true);
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
    applyAlertUpdate(data.alerts, enabled);
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
    applyAlertUpdate(data.alerts, false);
  };

  const unacknowledgedAlerts = triggeredAlerts.filter(
    (al) => !dismissedAlertKeys.includes(getAlertDismissKey(al))
  );

  const handleAddCustomRecords = async (newRows: CustomPriceRecord[]) => {
    const res = await fetch("/api/observations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records: newRows }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error || "Failed to save market observation");
    }
    const updatedObs = (data.observations ?? []) as CustomPriceRecord[];
    setCustomRecords(updatedObs);
    // Evaluate alerts immediately against newly submitted observations so notifications fire cleanly
    const evalPayload = { activeWatchlistId, customRecords: updatedObs };
    const evalRes = await fetch("/api/alerts/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(evalPayload),
    });
    if (evalRes.ok) {
      const evalData = (await evalRes.json()) as AlertsResponse;
      setAlertRules(evalData.rules);
      applyAlertUpdate(evalData.alerts, true);
    }
  };

  const handleDeleteCustomRecord = async (id: string) => {
    const res = await fetch(`/api/observations/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) return;
    const data = (await res.json()) as { observations?: CustomPriceRecord[] };
    if (Array.isArray(data.observations)) {
      setCustomRecords(data.observations);
    }
  };

  const handleClearCustomRecords = async () => {
    const res = await fetch("/api/observations", { method: "DELETE" });
    if (res.ok) {
      setCustomRecords([]);
    }
  };

  const handleFetchLiveFeed = useCallback(async () => {
    setLiveFetching(true);
    setLiveFetchError(null);
    setLiveSyncFeedback(null);
    try {
      const res = await fetch("/api/live-feed/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthsBack: 3 }),
      });
      const data = await res.json();
      if (!res.ok || data.error || !data.snapshot) {
        throw new Error(data.error || "Unable to fetch external live market feeds.");
      }
      const nextSnap = data.snapshot as LiveFeedSnapshot;
      setLiveSnapshot(nextSnap);
      saveOfflineSnapshot(OFFLINE_LIVE_FEED_KEY, nextSnap);
      void mirrorJsonToSwCache("/api/live-feed", "", { snapshot: nextSnap });
    } catch (err) {
      setLiveFetchError((err as Error).message);
    } finally {
      setLiveFetching(false);
    }
  }, []);

  useEffect(() => {
    if (autoRefreshMinutes <= 0) return;
    const timer = window.setInterval(() => {
      void handleFetchLiveFeed();
    }, autoRefreshMinutes * 60_000);
    return () => window.clearInterval(timer);
  }, [autoRefreshMinutes, handleFetchLiveFeed]);

  const handleSyncLiveFeedToModel = async (
    targetMarketId: string,
    commodityIds?: string[]
  ) => {
    setLiveSyncing(true);
    setLiveFetchError(null);
    setLiveSyncFeedback(null);
    try {
      const res = await fetch("/api/live-feed/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetMarketId, commodityIds }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to sync live market quotes into forecast model.");
      }
      const updatedObs = (data.observations ?? []) as CustomPriceRecord[];
      setCustomRecords(updatedObs);
      setMarketId(targetMarketId);
      const count = Number(data.syncedCount ?? 0);
      const targetName =
        meta?.markets.find((m) => m.id === targetMarketId)?.name ?? targetMarketId;
      setLiveSyncFeedback(
        `Synced ${count} live wholesale-normalized observation${count === 1 ? "" : "s"} into ${targetName}.`
      );
      const evalPayload = { activeWatchlistId, customRecords: updatedObs };
      const evalRes = await fetch("/api/alerts/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(evalPayload),
      });
      if (evalRes.ok) {
        const evalData = (await evalRes.json()) as AlertsResponse;
        setAlertRules(evalData.rules);
        applyAlertUpdate(evalData.alerts, true);
      }
    } catch (err) {
      setLiveFetchError((err as Error).message);
    } finally {
      setLiveSyncing(false);
    }
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

  // Sync page <title>, meta description, canonical URL, OpenGraph, and JSON-LD schema
  useEffect(() => {
    applyDocumentSeo(activeTab, activeCommodity?.name, activeMarket?.name);
  }, [activeTab, activeCommodity?.name, activeMarket?.name]);

  const routeMeta = getRouteMeta(activeTab, activeCommodity?.name, activeMarket?.name);

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/50 dark:bg-black/70 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Workspace Sidebar */}
      <aside
        className={`no-print fixed lg:static inset-y-0 left-0 z-40 w-[264px] shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between transition-transform duration-150 lg:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-5 space-y-6 overflow-y-auto">
          <div className="flex items-center justify-between gap-2">
            <a
              href="/price-forecast"
              onClick={(e) => handleSpaLinkClick(e, "overview")}
              className="flex items-center gap-2.5 min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded-md"
            >
              <img
                src="/brand-mark.svg"
                alt="NaijaPrice Tracker Nigerian agro-market analytics logo"
                width={28}
                height={28}
                loading="eager"
                decoding="async"
                className="w-7 h-7 rounded-md shrink-0"
              />
              <div className="min-w-0">
                <span className="block font-display text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
                  NaijaPrice Tracker
                </span>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                  Nigerian Agro-Market Analytics
                </span>
              </div>
            </a>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Close navigation menu"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {/* Primary Navigation (Semantic Internal Links) */}
          <nav aria-label="Primary sections" className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <a
                  key={item.id}
                  href={item.slug}
                  aria-current={isActive ? "page" : undefined}
                  onClick={(e) => handleSpaLinkClick(e, item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                    isActive
                      ? "bg-emerald-700 text-white dark:bg-emerald-600"
                      : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
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
                </a>
              );
            })}
          </nav>

          {/* Analysis Parameter Controls */}
          <div className="pt-5 border-t border-slate-200 dark:border-slate-800 space-y-4">
            <div>
              <label
                htmlFor="commodity-select"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Commodity
              </label>
              <select
                id="commodity-select"
                value={commodityId}
                onChange={(e) => setCommodityId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                {(meta?.commodities ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {activeCommodity && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Unit: {activeCommodity.unit} · {activeCommodity.category}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="market-select"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Nigerian Market
              </label>
              <select
                id="market-select"
                value={marketId}
                onChange={(e) => setMarketId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                {(meta?.markets ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Forecast Horizon
              </span>
              <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                {[3, 6, 9, 12].map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setForecastMonths(h)}
                    className={`py-1.5 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap ${
                      forecastMonths === h
                        ? "bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 shadow-sm"
                        : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
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
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Python Forecasting Model
              </label>
              <select
                id="model-select"
                value={modelType}
                onChange={(e) => setModelType(e.target.value as ForecastModelType)}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                <optgroup label="Basic Forecasting Models">
                  <option value="ridge_seasonal">Ridge + Seasonal Dummies</option>
                  <option value="poly_seasonal">Polynomial + Fourier Harmonics</option>
                  <option value="holt_winters">Holt-Winters Multiplicative</option>
                </optgroup>
                <optgroup label="Advanced Time-Series Models">
                  <option value="sarima">Seasonal ARIMA (1,1,1)(1,1,0)[12]</option>
                  <option value="prophet_gam">Prophet GAM (Changepoints + Fourier)</option>
                </optgroup>
              </select>
            </div>
          </div>
        </div>

        {/* Quiet Dataset Coverage Footer inside Sidebar */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 space-y-1">
          <div className="font-medium text-slate-700 dark:text-slate-300">Dataset Coverage</div>
          <div className="font-mono tabular-nums">
            {meta ? `${meta.totalRecords.toLocaleString()} rows · ${meta.dateRange.months} mos` : "Loading dataset..."}
          </div>
          {customRecords.length > 0 && (
            <div className="text-emerald-700 dark:text-emerald-400 font-medium">
              +{customRecords.length} custom survey row(s)
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb on left, theme toggle + Export Report on right */}
        <header className="no-print bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-5 lg:px-7 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
              aria-label="Open navigation menu"
            >
              <Menu className="w-4 h-4" aria-hidden="true" />
            </button>
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 sm:gap-2 text-xs text-slate-500 dark:text-slate-400 min-w-0 truncate">
              <a
                href="/price-forecast"
                onClick={(e) => handleSpaLinkClick(e, "overview")}
                className="font-medium text-slate-700 dark:text-slate-300 hover:underline shrink-0"
              >
                Nigerian Markets
              </a>
              <span aria-hidden="true">/</span>
              <span className="truncate hidden sm:inline">{activeMarket?.name ?? marketId}</span>
              <span aria-hidden="true" className="hidden sm:inline">/</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                {activeCommodity?.name ?? commodityId}
              </span>
            </nav>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton />

            <button
              type="button"
              onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap"
            >
              {theme === "dark" ? (
                <Sun className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">{theme === "dark" ? "Light" : "Dark"}</span>
            </button>

            <a
              href="/reports-python"
              onClick={(e) => handleSpaLinkClick(e, "reports")}
              className="px-3 sm:px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Export Report
            </a>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-5 lg:p-7 max-w-[1320px] w-full mx-auto space-y-5">
          {/* Single Page H1 + Quick Actions (Live Price Input & Price Alert) */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                {routeMeta.h1}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {routeMeta.description}
              </p>
            </div>

            {activeTab === "overview" && meta && analysis && (
              <div className="no-print flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleFetchLiveFeed()}
                  disabled={liveFetching}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 ${
                      liveFetching ? "animate-spin" : ""
                    }`}
                    aria-hidden="true"
                  />
                  <span>{liveFetching ? "Fetching..." : "Fetch Live Feed"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowLiveInput((v) => !v);
                    setShowQuickAlert(false);
                  }}
                  aria-expanded={showLiveInput}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                    showLiveInput
                      ? "bg-emerald-700 text-white border-emerald-700 dark:bg-emerald-600 dark:border-emerald-600"
                      : "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Log Live Price</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowQuickAlert((v) => !v);
                    setShowLiveInput(false);
                  }}
                  aria-expanded={showQuickAlert}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                    showQuickAlert
                      ? "bg-amber-600 text-white border-amber-600"
                      : "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  <BellRing className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Set Price Alert</span>
                </button>
              </div>
            )}
          </div>

          <OfflineIndicator
            isOnline={isOnline}
            cacheMode={cacheMode}
            lastSyncedAt={lastSyncedAt}
            cachedSeriesContext={
              analysis &&
              (analysis.meta.commodityId !== commodityId || analysis.meta.marketId !== marketId)
                ? `${analysis.meta.commodityName} · ${analysis.meta.marketName}`
                : null
            }
            onRetrySync={() => {
              void loadAnalysis();
              void loadWatchlists();
            }}
          />

          {unacknowledgedAlerts.length > 0 && (
            <AlertBanner
              alerts={unacknowledgedAlerts}
              onInspectAlert={(cid, mid) => {
                setCommodityId(cid);
                setMarketId(mid);
                navigateToTab("overview");
              }}
              onDismissAlert={(key) =>
                setDismissedAlertKeys((prev) => (prev.includes(key) ? prev : [...prev, key]))
              }
              onDismissAll={() =>
                setDismissedAlertKeys((prev) => [
                  ...new Set([...prev, ...unacknowledgedAlerts.map(getAlertDismissKey)]),
                ])
              }
              onOpenRules={() => navigateToTab("watchlists", "#alert-rules-section")}
            />
          )}

          {error && (
            <div
              role="alert"
              className="bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3"
            >
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
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
                    className="h-24 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 animate-pulse"
                  />
                ))}
              </div>
              <div className="h-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl animate-pulse" />
            </div>
          ) : (
            analysis && (
              <>
                {activeTab === "overview" && (
                  <div className="space-y-5">
                    {showLiveInput && meta && (
                      <LivePriceInputPanel
                        commodities={meta.commodities}
                        markets={meta.markets}
                        activeCommodityId={commodityId}
                        activeMarketId={marketId}
                        latestDate={analysis.meta.latestDate}
                        latestPriceNgn={analysis.kpis.latestPriceNgn}
                        onSubmitRecords={handleAddCustomRecords}
                        onClose={() => setShowLiveInput(false)}
                      />
                    )}

                    {showQuickAlert && meta && (
                      <QuickPriceAlertPanel
                        commodities={meta.commodities}
                        markets={meta.markets}
                        activeCommodityId={commodityId}
                        activeMarketId={marketId}
                        latestPriceNgn={analysis.kpis.latestPriceNgn}
                        notificationPermission={notificationPermission}
                        onRequestBrowserNotifications={handleRequestBrowserNotifications}
                        onCreateAlertRule={handleCreateAlertRule}
                        onClose={() => setShowQuickAlert(false)}
                      />
                    )}

                    {/* 4-Column KPI Strip */}
                    <section
                      aria-label="Key commodity metrics"
                      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
                    >
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          Latest Spot Price · {formatPeriodLabel(analysis.meta.latestDate)}
                        </div>
                        <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1.5">
                          {formatNaira(analysis.kpis.latestPriceNgn)}
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 font-mono tabular-nums">
                          <span
                            className={
                              analysis.kpis.momPct >= 0
                                ? "text-amber-700 dark:text-amber-400 font-medium"
                                : "text-emerald-700 dark:text-emerald-400 font-medium"
                            }
                          >
                            {formatPercent(analysis.kpis.momPct)} MoM
                          </span>
                          <span className="mx-1.5 text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
                          <span>{formatPercent(analysis.kpis.yoyPct)} YoY</span>
                        </div>
                      </div>

                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          {forecastMonths}-Month Projection ({getShortModelLabel(modelType)})
                        </div>
                        <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 mt-1.5">
                          {formatNaira(analysis.kpis.projectedEndNgn)}
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 font-mono tabular-nums">
                          <span>{formatPercent(analysis.kpis.projectedChangePct)} vs spot</span>
                          <span className="mx-1.5 text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
                          <span>12M Avg {formatNaira(analysis.kpis.avg12mNgn)}</span>
                        </div>
                      </div>

                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          Seasonal Peak / Trough
                        </div>
                        <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1.5">
                          {analysis.seasonality.peakMonth}{" "}
                          <span className="text-slate-400 dark:text-slate-500 font-normal">/</span>{" "}
                          {analysis.seasonality.troughMonth}
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-300 mt-2 font-mono tabular-nums">
                          <span>Strength {analysis.seasonality.strengthPct.toFixed(0)}%</span>
                          <span className="mx-1.5 text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
                          <span>Spread {analysis.seasonality.seasonalSpreadPct.toFixed(1)}%</span>
                        </div>
                      </div>

                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          Python Holdout Backtest ({analysis.backtest.samples}M)
                        </div>
                        <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1.5">
                          {analysis.backtest.mape.toFixed(2)}% MAPE
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 font-mono tabular-nums">
                          <span>RMSE {formatNaira(analysis.backtest.rmse)}</span>
                          <span className="mx-1.5 text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
                          <span>CV {analysis.kpis.volatilityPct.toFixed(1)}%</span>
                        </div>
                      </div>
                    </section>

                    {liveFetchError && (
                      <div
                        role="alert"
                        className="bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-xs text-red-800 dark:text-red-200"
                      >
                        {liveFetchError}
                      </div>
                    )}

                    {liveSyncFeedback && (
                      <div
                        role="status"
                        className="bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3 text-xs text-emerald-900 dark:text-emerald-200"
                      >
                        {liveSyncFeedback}
                      </div>
                    )}

                    {liveSnapshot && (
                      <section
                        aria-label="Live external macro and WFP market benchmark"
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                          <span className="font-semibold text-slate-900 dark:text-slate-100">
                            Live External Macro
                          </span>
                          {liveSnapshot.fx && (
                            <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                              USD/NGN ₦{liveSnapshot.fx.usdNgn.toLocaleString("en-NG", { maximumFractionDigits: 2 })}
                            </span>
                          )}
                          {liveSnapshot.cpi && (
                            <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                              CPI ({liveSnapshot.cpi.year}): {liveSnapshot.cpi.cpiPct.toFixed(1)}%
                            </span>
                          )}
                          {(() => {
                            const match = liveSnapshot.commoditySummaries.find(
                              (s) => s.mappedCommodityId === commodityId && s.normalizedWholesaleNgn !== null
                            );
                            if (!match) return null;
                            return (
                              <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400 font-medium">
                                WFP {match.commodity}: {formatNaira(match.avgRetailNgn)}/{match.unit} (Equiv. {formatNaira(match.normalizedWholesaleNgn)})
                              </span>
                            );
                          })()}
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          {liveSnapshot.commoditySummaries.some(
                            (s) => s.mappedCommodityId === commodityId && s.normalizedWholesaleNgn !== null
                          ) && (
                            <button
                              type="button"
                              disabled={liveSyncing}
                              onClick={() => void handleSyncLiveFeedToModel(marketId, [commodityId])}
                              className="font-semibold text-emerald-700 dark:text-emerald-400 hover:underline whitespace-nowrap disabled:opacity-60"
                            >
                              {liveSyncing ? "Syncing..." : "Sync Live Quote to Chart"}
                            </button>
                          )}
                          <a
                            href="/live-feeds"
                            onClick={(e) => handleSpaLinkClick(e, "live")}
                            className="font-medium text-slate-600 dark:text-slate-300 hover:underline whitespace-nowrap"
                          >
                            All Live Feeds →
                          </a>
                        </div>
                      </section>
                    )}

                    {/* Primary Focal Anchor: Interactive Price Trend + Forecast Chart */}
                    <PriceTrendChart
                      history={analysis.history}
                      forecast={analysis.forecast}
                      commodityName={analysis.meta.commodityName}
                      unit={analysis.meta.unit}
                      marketName={analysis.meta.marketName}
                      modelLabel={getModelLabel(analysis.modelType)}
                      activeModelType={analysis.modelType}
                      comparisonModels={analysis.modelComparison}
                      showModelOverlay={showModelOverlay}
                    />

                    {/* Model Accuracy Comparison: Basic vs. Advanced (SARIMA & Prophet GAM) */}
                    {analysis.modelComparison && analysis.modelComparison.length > 0 && (
                      <ModelComparisonPanel
                        models={analysis.modelComparison}
                        activeModel={modelType}
                        forecastMonths={forecastMonths}
                        showChartOverlay={showModelOverlay}
                        onToggleChartOverlay={() => setShowModelOverlay((v) => !v)}
                        onSelectModel={(nextModel) => setModelType(nextModel)}
                      />
                    )}

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

                      <section className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col justify-between space-y-5">
                        <div className="space-y-4">
                          <div>
                            <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                              Decision Guidance · {analysis.insights.traderSignal}
                            </div>
                            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mt-1">
                              Trader &amp; Student Brief
                            </h2>
                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mt-1.5">
                              {analysis.insights.traderSummary}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800">
                              {analysis.insights.studentNote}
                            </p>
                          </div>

                          <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                            <div className="flex items-center justify-between mb-2.5">
                              <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                                Regional Market Spread ({analysis.meta.commodityName})
                              </h3>
                              <a
                                href="/market-arbitrage"
                                onClick={(e) => handleSpaLinkClick(e, "arbitrage")}
                                className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline whitespace-nowrap"
                              >
                                Full arbitrage →
                              </a>
                            </div>
                            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                              {analysis.marketComparison.slice(0, 4).map((m) => (
                                <div
                                  key={m.marketId}
                                  className="py-2 flex items-center justify-between gap-2"
                                >
                                  <span className="text-slate-700 dark:text-slate-300 truncate">
                                    {m.marketName}
                                  </span>
                                  <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                                    {formatNaira(m.price_ngn)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                          <span className="text-slate-500 dark:text-slate-400">National Spread</span>
                          <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                            {formatNaira(analysis.arbitrage.spreadNgn)} ({formatPercent(analysis.arbitrage.spreadPct, false)})
                          </span>
                        </div>
                      </section>
                    </div>

                    {/* Personalized Watchlist Performance Highlight Panel */}
                    <section
                      aria-label="Monitored watchlist performance"
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                              Monitored Watchlist Highlights
                            </h2>
                            {activeWatchlist && (
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                · {activeWatchlist.name}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Live spot prices, momentum, and {forecastMonths}-month projections for your selected commodities and markets.
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {watchlists.length > 1 && (
                            <select
                              aria-label="Select active watchlist"
                              value={activeWatchlist?.id ?? ""}
                              onChange={(e) => setActiveWatchlistId(e.target.value)}
                              className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg"
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
                                  ? "bg-emerald-700 text-white border-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:border-emerald-600"
                                  : "bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                              }`}
                            >
                              {isCurrentPairMonitored
                                ? "Monitored in Watchlist"
                                : "+ Monitor Current Pair"}
                            </button>
                          )}

                          <a
                            href="/watchlists"
                            onClick={(e) => handleSpaLinkClick(e, "watchlists")}
                            className="px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 rounded-lg transition-colors whitespace-nowrap shrink-0"
                          >
                            Manage Watchlists →
                          </a>
                        </div>
                      </div>

                      {!activeWatchlist || activeWatchlist.performance.length === 0 ? (
                        <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800">
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
                                    ? "bg-emerald-50/60 border-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-700"
                                    : itemAlert
                                    ? "bg-amber-50/40 border-amber-200 hover:bg-amber-50/70 dark:bg-amber-950/30 dark:border-amber-800 dark:hover:bg-amber-950/50"
                                    : "bg-slate-50/60 border-slate-200 hover:bg-slate-100/70 dark:bg-slate-800/50 dark:border-slate-700 dark:hover:bg-slate-800"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                                      {item.commodityName}
                                    </div>
                                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                      {item.marketName} · {item.unit}
                                    </div>
                                  </div>
                                  <div className="text-right font-mono tabular-nums shrink-0">
                                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                                      {formatNaira(item.latestPriceNgn)}
                                    </div>
                                    <div
                                      className={`text-[11px] font-medium ${
                                        item.momPct >= 0
                                          ? "text-amber-700 dark:text-amber-400"
                                          : "text-emerald-700 dark:text-emerald-400"
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
                                        ? "text-red-700 dark:text-red-400"
                                        : "text-amber-700 dark:text-amber-400"
                                    }`}
                                  >
                                    <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" />
                                    <span className="truncate">
                                      {itemAlert.severity === "critical" ? "Critical" : "Alert"}:{" "}
                                      {formatPercent(itemAlert.deviationPct)} vs {itemAlert.baselineLabel}
                                    </span>
                                  </div>
                                )}

                                <div className="mt-2.5 pt-2 border-t border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-2 text-[11px]">
                                  <span className="text-slate-600 dark:text-slate-300 truncate">
                                    {item.seasonalPhase} · {item.traderSignal}
                                  </span>
                                  <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400 font-medium shrink-0">
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

                {activeTab === "live" && meta && (
                  <LiveMarketFeedView
                    snapshot={liveSnapshot}
                    markets={meta.markets}
                    activeMarketId={marketId}
                    fetching={liveFetching}
                    syncing={liveSyncing}
                    fetchError={liveFetchError}
                    syncFeedback={liveSyncFeedback}
                    autoRefreshMinutes={autoRefreshMinutes}
                    onChangeAutoRefreshMinutes={setAutoRefreshMinutes}
                    onFetchLiveFeed={handleFetchLiveFeed}
                    onSyncToForecast={handleSyncLiveFeedToModel}
                    onInspectSeries={(cid, mid) => {
                      setCommodityId(cid);
                      setMarketId(mid);
                      navigateToTab("overview");
                    }}
                  />
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
                    notificationPermission={notificationPermission}
                    onRequestBrowserNotifications={handleRequestBrowserNotifications}
                    onSelectWatchlist={(id) => setActiveWatchlistId(id)}
                    onCreateWatchlist={handleCreateWatchlist}
                    onDeleteWatchlist={handleDeleteWatchlist}
                    onToggleItem={handleToggleWatchlistItem}
                    onInspectPair={(cid, mid) => {
                      setCommodityId(cid);
                      setMarketId(mid);
                      navigateToTab("overview");
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
                      navigateToTab("overview");
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
                    onDeleteCustomRecord={handleDeleteCustomRecord}
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

          {/* Clean Internal Linking Footer */}
          <footer className="no-print pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500 dark:text-slate-400">
            <nav aria-label="Workspace sections" className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              {ROUTE_SEO_LIST.map((r) => (
                <a
                  key={r.tab}
                  href={r.slug}
                  onClick={(e) => handleSpaLinkClick(e, r.tab)}
                  className="hover:text-emerald-700 dark:hover:text-emerald-400 hover:underline"
                >
                  {r.navLabel}
                </a>
              ))}
            </nav>
          </footer>
        </main>
      </div>

      {/* Live Threshold Alert Notification Stack */}
      {toastAlerts.length > 0 && (
        <aside
          aria-live="polite"
          aria-label="Real-time price alert notifications"
          data-testid="alert-notification-stack"
          className="no-print fixed bottom-4 right-4 z-50 w-[min(360px,calc(100vw-2rem))] space-y-2"
        >
          {toastAlerts.map((al) => {
            const key = getAlertNotificationKey(al);
            const isCritical = al.severity === "critical";
            return (
              <div
                key={key}
                role="status"
                className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 shadow-lg rounded-xl p-3.5 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {isCritical ? (
                      <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" aria-hidden="true" />
                    ) : (
                      <BellRing className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
                    )}
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                      Threshold Triggered · {al.ruleName}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setToastAlerts((prev) =>
                        prev.filter((item) => getAlertNotificationKey(item) !== key)
                      )
                    }
                    aria-label="Dismiss notification"
                    className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 leading-snug">
                  {al.message}
                </p>

                <div className="flex items-center justify-between pt-1 text-[11px]">
                  <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                    Spot: {formatNaira(al.latestPriceNgn)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setCommodityId(al.commodityId);
                      setMarketId(al.marketId);
                      navigateToTab("overview");
                      setToastAlerts((prev) =>
                        prev.filter((item) => getAlertNotificationKey(item) !== key)
                      );
                    }}
                    className="font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                  >
                    Inspect Market →
                  </button>
                </div>
              </div>
            );
          })}
        </aside>
      )}
    </div>
  );
}
