import React, { useEffect, useState } from "react";
import { Download, Plus, Upload, X } from "lucide-react";
import type { CommodityMeta, CustomPriceRecord, MarketMeta } from "../types/market";
import { parseCustomPriceCsv } from "../utils/csvParser";
import { buildCsvUploadTemplate } from "../utils/forecastHelpers";
import { formatNaira } from "../utils/formatters";

interface LivePriceInputPanelProps {
  commodities: CommodityMeta[];
  markets: MarketMeta[];
  activeCommodityId: string;
  activeMarketId: string;
  latestDate: string;
  latestPriceNgn: number;
  onSubmitRecords: (records: CustomPriceRecord[]) => Promise<void>;
  onClose: () => void;
}

export const LivePriceInputPanel: React.FC<LivePriceInputPanelProps> = ({
  commodities,
  markets,
  activeCommodityId,
  activeMarketId,
  latestDate,
  latestPriceNgn,
  onSubmitRecords,
  onClose,
}) => {
  const [entryDate, setEntryDate] = useState("2026-11-01");
  const [entryCommodity, setEntryCommodity] = useState(activeCommodityId);
  const [entryMarket, setEntryMarket] = useState(activeMarketId);
  const [entryPrice, setEntryPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    setEntryCommodity(activeCommodityId);
    setEntryMarket(activeMarketId);
  }, [activeCommodityId, activeMarketId]);

  useEffect(() => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(latestDate)) {
      const [yrStr, moStr] = latestDate.split("-");
      const yr = Number(yrStr);
      const mo = Number(moStr);
      const nextMo = mo === 12 ? 1 : mo + 1;
      const nextYr = mo === 12 ? yr + 1 : yr;
      setEntryDate(`${nextYr}-${String(nextMo).padStart(2, "0")}-01`);
    }
  }, [latestDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericPrice = Number(entryPrice);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
      setErrors(["Enter a valid survey date in YYYY-MM-DD format."]);
      return;
    }
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      setErrors(["Enter a valid positive market price in Nigerian Naira (₦)."]);
      return;
    }

    const comm = commodities.find((c) => c.id === entryCommodity);
    const mkt = markets.find((m) => m.id === entryMarket);
    if (!comm || !mkt) return;

    setErrors([]);
    setFeedback(null);
    setSaving(true);
    try {
      await onSubmitRecords([
        {
          date: entryDate,
          commodity_id: comm.id,
          commodity_name: comm.name,
          category: comm.category,
          unit: comm.unit,
          market_id: mkt.id,
          market_name: mkt.name,
          state: mkt.state,
          region: mkt.region,
          price_ngn: Math.round(numericPrice),
        },
      ]);
      setEntryPrice("");
      setFeedback(
        `Saved ${formatNaira(numericPrice)} for ${comm.name} at ${mkt.name} (${entryDate}). Charts, forecasts, and threshold alerts updated.`
      );
    } catch (err) {
      setErrors([(err as Error).message]);
    } finally {
      setSaving(false);
    }
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const text = String(reader.result ?? "");
      const parsed = parseCustomPriceCsv(text, commodities, markets);
      setErrors(parsed.errors);
      if (parsed.records.length > 0) {
        setSaving(true);
        try {
          await onSubmitRecords(parsed.records);
          setFeedback(
            `Imported ${parsed.records.length} live observation(s) into SQLite & Python analytics.`
          );
        } catch (err) {
          setErrors((prev) => [...prev, (err as Error).message]);
        } finally {
          setSaving(false);
        }
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleDownloadTemplate = () => {
    const csv = buildCsvUploadTemplate(commodities, markets, entryCommodity, entryMarket);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "naijaprice_live_survey_template.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section
      data-testid="live-price-input-panel"
      aria-label="Real-time market price entry"
      className="bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800/80 rounded-xl p-4 sm:p-5 space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Real-Time Market Survey Entry &amp; CSV Import
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Submit a live field price or upload a CSV batch to immediately recalculate seasonality, all 5 forecasting models, and alert triggers.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>CSV Template</span>
          </button>

          <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg cursor-pointer transition-colors whitespace-nowrap shrink-0">
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Upload CSV</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleCsvUpload}
              className="sr-only"
            />
          </label>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close real-time price entry panel"
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-md"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
      >
        <div>
          <label
            htmlFor="live-obs-date"
            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
          >
            Survey Date
          </label>
          <input
            id="live-obs-date"
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>

        <div>
          <label
            htmlFor="live-obs-comm"
            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
          >
            Commodity
          </label>
          <select
            id="live-obs-comm"
            value={entryCommodity}
            onChange={(e) => setEntryCommodity(e.target.value)}
            className="w-full px-2.5 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
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
            htmlFor="live-obs-mkt"
            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
          >
            Nigerian Market
          </label>
          <select
            id="live-obs-mkt"
            value={entryMarket}
            onChange={(e) => setEntryMarket(e.target.value)}
            className="w-full px-2.5 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
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
            htmlFor="live-obs-price"
            className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
          >
            Observed Price (₦ NGN)
          </label>
          <input
            id="live-obs-price"
            type="number"
            min={100}
            step={50}
            placeholder={`Current: ${Math.round(latestPriceNgn)}`}
            value={entryPrice}
            onChange={(e) => setEntryPrice(e.target.value)}
            className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{saving ? "Saving..." : "Submit Live Price"}</span>
        </button>
      </form>

      {feedback && (
        <p role="status" className="text-xs font-medium text-emerald-800 dark:text-emerald-400">
          {feedback}
        </p>
      )}
      {errors.length > 0 && (
        <div
          role="alert"
          className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 text-xs text-red-800 dark:text-red-300 space-y-1"
        >
          {errors.map((err, i) => (
            <p key={i}>{err}</p>
          ))}
        </div>
      )}
    </section>
  );
};
