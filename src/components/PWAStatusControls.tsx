import React, { useState } from "react";
import { Download, RefreshCw, Share, WifiOff, X } from "lucide-react";
import { usePWAInstall } from "../hooks/usePWA";

export function PWAInstallButton() {
  const { isInstallable, isIOS, promptInstall } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (!isInstallable && !isIOS) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => (isIOS ? setShowIOSGuide(true) : void promptInstall())}
        className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-xs font-medium text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 rounded-lg transition-colors whitespace-nowrap shrink-0"
      >
        <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span className="hidden sm:inline">Install App</span>
      </button>

      {showIOSGuide && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ios-install-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl max-w-sm w-full p-5 shadow-lg space-y-3">
            <div className="flex items-start justify-between gap-2">
              <h2
                id="ios-install-title"
                className="text-sm font-semibold text-slate-900 dark:text-slate-100"
              >
                Install NaijaPrice Tracker on iOS
              </h2>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                aria-label="Close installation guide"
                className="p-1 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Save NaijaPrice Tracker to your home screen for offline market analysis in low-connectivity areas:
            </p>
            <ol className="text-xs text-slate-700 dark:text-slate-200 space-y-2 list-decimal list-inside">
              <li className="flex items-center gap-1.5">
                <span>Tap the</span>
                <Share className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 inline" aria-hidden="true" />
                <span className="font-medium">Share</span>
                <span>button in Safari.</span>
              </li>
              <li>
                Select <span className="font-medium">Add to Home Screen</span>.
              </li>
            </ol>
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface OfflineIndicatorProps {
  isOnline: boolean;
  cacheMode: "live" | "offline" | "offline-latest";
  lastSyncedAt: number | null;
  cachedSeriesContext?: string | null;
  onRetrySync: () => void;
}

export function OfflineIndicator({
  isOnline,
  cacheMode,
  lastSyncedAt,
  cachedSeriesContext,
  onRetrySync,
}: OfflineIndicatorProps) {
  if (isOnline && cacheMode === "live") {
    return null;
  }

  const syncedLabel = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  const isLatestFallback = cacheMode === "offline-latest";

  return (
    <div
      role="status"
      data-testid="offline-indicator"
      className="no-print bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
    >
      <div className="flex items-center gap-2 text-amber-900 dark:text-amber-100 min-w-0">
        <WifiOff className="w-4 h-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
        <span className="font-medium">
          {!isOnline
            ? cachedSeriesContext
              ? `Offline Mode — Showing latest cached analysis (${cachedSeriesContext}).`
              : "Offline Mode — Serving cached market analysis from local storage."
            : isLatestFallback && cachedSeriesContext
            ? `Low Connectivity — Showing latest cached analysis (${cachedSeriesContext}).`
            : "Low Connectivity — Serving cached market analysis."}
        </span>
        {syncedLabel && (
          <span className="text-amber-700 dark:text-amber-300 font-mono tabular-nums whitespace-nowrap">
            Synced {syncedLabel}
          </span>
        )}
      </div>
      {isOnline && (
        <button
          type="button"
          onClick={onRetrySync}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:text-amber-100 bg-amber-100 dark:bg-amber-900/70 hover:bg-amber-200 dark:hover:bg-amber-900 rounded-md transition-colors whitespace-nowrap"
        >
          <RefreshCw className="w-3 h-3" aria-hidden="true" />
          <span>Refresh Live Data</span>
        </button>
      )}
    </div>
  );
}
