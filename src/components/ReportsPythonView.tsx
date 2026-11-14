import React, { useState } from "react";
import { Download, FileCode2, FileSpreadsheet, FileText, Printer } from "lucide-react";
import type { AnalysisResponse, PriceAlert, WatchlistGroup } from "../types/market";
import { buildAnalysisReportCsv } from "../utils/csvParser";
import {
  formatNaira,
  formatPercent,
  formatPeriodLabel,
  getModelLabel,
} from "../utils/formatters";

interface ReportsPythonViewProps {
  analysis: AnalysisResponse;
  activeWatchlist: WatchlistGroup | null;
  alerts: PriceAlert[];
}

export const ReportsPythonView: React.FC<ReportsPythonViewProps> = ({
  analysis,
  activeWatchlist,
  alerts,
}) => {
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const triggerDownload = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleDownloadReportCsv = () => {
    const csv = buildAnalysisReportCsv(analysis);
    const slug = `${analysis.meta.commodityId}_${analysis.meta.marketId}`;
    triggerDownload(`naijaprice_report_${slug}.csv`, csv, "text/csv;charset=utf-8");
  };

  const handleDownloadJson = () => {
    const slug = `${analysis.meta.commodityId}_${analysis.meta.marketId}`;
    triggerDownload(
      `naijaprice_brief_${slug}.json`,
      JSON.stringify(analysis, null, 2),
      "application/json"
    );
  };

  const handleDownloadPdf = async () => {
    setPdfLoading(true);
    setPdfError(null);
    try {
      const res = await fetch("/api/export/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysis,
          watchlistName: activeWatchlist?.name ?? "",
          watchlistItems: activeWatchlist?.performance ?? [],
          alerts,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "Failed to generate PDF brief.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const slug = `${analysis.meta.commodityId}_${analysis.meta.marketId}`;
      const a = document.createElement("a");
      a.href = url;
      a.download = `naijaprice_brief_${slug}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setPdfError((err as Error).message);
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Export Actions Bar */}
      <section className="no-print bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Exportable Decision Brief &amp; Python Source
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Generate a formal PDF commodity intelligence brief, download CSV forecasts, or export the standalone Streamlit + Pandas + Plotly + Scikit-learn app.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={pdfLoading}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <FileText className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{pdfLoading ? "Generating PDF..." : "Download PDF Brief"}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadReportCsv}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Download Forecast CSV</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadJson}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export JSON Brief</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Printer className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Print View</span>
            </button>

            <a
              href="/api/export/streamlit"
              download="streamlit_app.py"
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <FileCode2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Download streamlit_app.py</span>
            </a>
          </div>
        </div>
        {pdfError && (
          <p role="alert" className="text-xs font-medium text-red-700 dark:text-red-400">
            {pdfError}
          </p>
        )}
      </section>

      {/* Printable Market Intelligence Briefing */}
      <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-6">
        <div className="border-b border-slate-200 dark:border-slate-800 pb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
              NaijaPrice Tracker · Market Intelligence Report
            </p>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">
              {analysis.meta.commodityName} ({analysis.meta.unit}) — {analysis.meta.marketName}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {analysis.meta.state}, {analysis.meta.region} · Observations: {analysis.meta.observations} months ending{" "}
              {formatPeriodLabel(analysis.meta.latestDate)} · Model: {getModelLabel(analysis.modelType)}
            </p>
          </div>
          <div className="text-left sm:text-right font-mono tabular-nums">
            <div className="text-xs text-slate-500 dark:text-slate-400">Latest Spot Price</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {formatNaira(analysis.kpis.latestPriceNgn)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Trader Procurement Signal: {analysis.insights.traderSignal}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {analysis.insights.traderSummary}
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Student &amp; Quantitative Methodology Note
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {analysis.insights.studentNote}
            </p>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
            {analysis.forecast.length}-Month Forecast Schedule
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                  <th className="py-2 pr-3">Forecast Month</th>
                  <th className="py-2 px-3 text-right">Point Forecast</th>
                  <th className="py-2 px-3 text-right">Lower 95% Bound</th>
                  <th className="py-2 pl-3 text-right">Upper 95% Bound</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono tabular-nums">
                {analysis.forecast.map((fc) => (
                  <tr key={fc.date}>
                    <td className="py-2 pr-3 font-sans font-medium text-slate-900 dark:text-slate-100">
                      {formatPeriodLabel(fc.date)}
                    </td>
                    <td className="py-2 px-3 text-right font-semibold text-emerald-700 dark:text-emerald-400">
                      {formatNaira(fc.predicted_ngn)}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-600 dark:text-slate-300">
                      {formatNaira(fc.lower95_ngn)}
                    </td>
                    <td className="py-2 pl-3 text-right text-slate-600 dark:text-slate-300">
                      {formatNaira(fc.upper95_ngn)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-200 dark:border-slate-800 text-xs">
          <div>
            <span className="text-slate-500 dark:text-slate-400 block">Holdout MAPE</span>
            <span className="font-mono tabular-nums text-sm font-semibold text-slate-900 dark:text-slate-100">
              {analysis.backtest.mape.toFixed(2)}%
            </span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400 block">Holdout RMSE</span>
            <span className="font-mono tabular-nums text-sm font-semibold text-slate-900 dark:text-slate-100">
              {formatNaira(analysis.backtest.rmse)}
            </span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400 block">Seasonal Peak / Trough</span>
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {analysis.seasonality.peakMonth} / {analysis.seasonality.troughMonth}
            </span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400 block">Arbitrage Spread</span>
            <span className="font-mono tabular-nums text-sm font-semibold text-slate-900 dark:text-slate-100">
              {formatNaira(analysis.arbitrage.spreadNgn)} ({formatPercent(analysis.arbitrage.spreadPct, false)})
            </span>
          </div>
        </div>

        {activeWatchlist && activeWatchlist.performance.length > 0 && (
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
              Monitored Watchlist Highlights: {activeWatchlist.name}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs min-w-[600px]">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                    <th className="py-2 pr-3">Commodity</th>
                    <th className="py-2 px-3">Market</th>
                    <th className="py-2 px-3 text-right">Spot Price</th>
                    <th className="py-2 px-3 text-right">MoM / YoY</th>
                    <th className="py-2 px-3 text-right">Projection</th>
                    <th className="py-2 pl-3 text-right">Seasonal Signal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {activeWatchlist.performance.map((item) => (
                    <tr key={`${item.commodityId}-${item.marketId}`}>
                      <td className="py-2 pr-3 font-medium text-slate-900 dark:text-slate-100">
                        {item.commodityName}
                      </td>
                      <td className="py-2 px-3 text-slate-600 dark:text-slate-300">{item.marketName}</td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                        {formatNaira(item.latestPriceNgn)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        {formatPercent(item.momPct)} / {formatPercent(item.yoyPct)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
                        {formatNaira(item.projectedEndNgn)}
                      </td>
                      <td className="py-2 pl-3 text-right text-slate-700 dark:text-slate-300">
                        {item.seasonalPhase} · {item.traderSignal}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {alerts.length > 0 && (
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
              Active Price Threshold Alerts ({alerts.length})
            </h3>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {alerts.map((al) => (
                <div key={al.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span
                      className={`font-semibold uppercase mr-2 ${
                        al.severity === "critical"
                          ? "text-red-700 dark:text-red-400"
                          : "text-amber-700 dark:text-amber-400"
                      }`}
                    >
                      {al.severity}
                    </span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">{al.ruleName}:</span>{" "}
                    <span className="text-slate-600 dark:text-slate-300">{al.message}</span>
                  </div>
                  <span className="font-mono tabular-nums font-semibold text-slate-800 dark:text-slate-200">
                    {formatPercent(al.deviationPct)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </article>
    </div>
  );
};
