import React, { useEffect, useState } from "react";
import { Download, Plus, Search, Trash2, Upload } from "lucide-react";
import type {
  CommodityMeta,
  CustomPriceRecord,
  LedgerResponse,
  MarketMeta,
} from "../types/market";
import { parseCustomPriceCsv } from "../utils/csvParser";
import { buildCsvUploadTemplate } from "../utils/forecastHelpers";
import { formatNaira, formatPeriodLabel } from "../utils/formatters";
import { parseJsonResponse } from "../utils/safeFetchJson";
import { MarketSelectOptions } from "./MarketSelectOptions";

interface DataLedgerViewProps {
  commodities: CommodityMeta[];
  markets: MarketMeta[];
  customRecords: CustomPriceRecord[];
  onAddCustomRecords: (records: CustomPriceRecord[]) => Promise<void> | void;
  onDeleteCustomRecord?: (id: string) => Promise<void> | void;
  onClearCustomRecords: () => Promise<void> | void;
}

export const DataLedgerView: React.FC<DataLedgerViewProps> = ({
  commodities,
  markets,
  customRecords,
  onAddCustomRecords,
  onDeleteCustomRecord,
  onClearCustomRecords,
}) => {
  const [commodityFilter, setCommodityFilter] = useState("all");
  const [marketFilter, setMarketFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [ledgerData, setLedgerData] = useState<LedgerResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const [entryDate, setEntryDate] = useState("2026-11-01");
  const [entryCommodity, setEntryCommodity] = useState(commodities[0]?.id ?? "rice_ofada");
  const [entryMarket, setEntryMarket] = useState(markets[0]?.id ?? "mile12_lagos");
  const [entryPrice, setEntryPrice] = useState("");
  const [formMsg, setFormMsg] = useState<string | null>(null);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);

  const limit = 20;

  useEffect(() => {
    let active = true;
    const fetchLedger = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/ledger", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            commodityId: commodityFilter,
            marketId: marketFilter,
            year: yearFilter,
            search,
            limit,
            offset,
            customRecords,
          }),
        });
        const data = await parseJsonResponse<LedgerResponse>(res, "loading market price ledger");
        if (active) setLedgerData(data);
      } catch {
        // Keep previously loaded ledger rows on transient network/proxy HTML response
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchLedger();
    return () => {
      active = false;
    };
  }, [commodityFilter, marketFilter, yearFilter, search, offset, customRecords]);

  const handleAddSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericPrice = Number(entryPrice);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
      setFormMsg("Enter a valid date in YYYY-MM-DD format.");
      return;
    }
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      setFormMsg("Enter a valid price in Nigerian Naira (₦).");
      return;
    }

    const comm = commodities.find((c) => c.id === entryCommodity);
    const mkt = markets.find((m) => m.id === entryMarket);
    if (!comm || !mkt) return;

    await onAddCustomRecords([
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
    setFormMsg(`Logged ${formatNaira(numericPrice)} for ${comm.name} at ${mkt.name}.`);
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const text = String(reader.result ?? "");
      const parsed = parseCustomPriceCsv(text, commodities, markets);
      setCsvErrors(parsed.errors);
      if (parsed.records.length > 0) {
        await onAddCustomRecords(parsed.records);
        setFormMsg(`Imported ${parsed.records.length} observation(s) into SQLite & Python engine.`);
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

  const rows = ledgerData?.rows ?? [];
  const total = ledgerData?.total ?? 0;

  return (
    <div className="space-y-5">
      {/* Custom Observation & CSV Importer */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Log Market Survey Observation or Import CSV
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Add field price surveys from local Nigerian markets; the Python analytics engine immediately re-runs decomposition, model benchmarks, and threshold alerts.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>CSV Template</span>
            </button>
            <label className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg cursor-pointer transition-colors whitespace-nowrap shrink-0">
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Upload CSV</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvUpload}
                className="sr-only"
              />
            </label>
            {customRecords.length > 0 && (
              <button
                type="button"
                onClick={() => void onClearCustomRecords()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/60 hover:bg-red-100 dark:hover:bg-red-950 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Clear {customRecords.length} Custom</span>
              </button>
            )}
          </div>
        </div>

        <form onSubmit={handleAddSingle} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <div>
            <label htmlFor="obs-date" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Period Date
            </label>
            <input
              id="obs-date"
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>
          <div>
            <label htmlFor="obs-comm" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Commodity
            </label>
            <select
              id="obs-comm"
              value={entryCommodity}
              onChange={(e) => setEntryCommodity(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              {commodities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.unit})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="obs-mkt" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Market
            </label>
            <select
              id="obs-mkt"
              value={entryMarket}
              onChange={(e) => setEntryMarket(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <MarketSelectOptions markets={markets} />
            </select>
          </div>
          <div>
            <label htmlFor="obs-price" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Price (₦ NGN)
            </label>
            <input
              id="obs-price"
              type="number"
              min={100}
              step={50}
              placeholder="e.g. 92500"
              value={entryPrice}
              onChange={(e) => setEntryPrice(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Add Observation</span>
          </button>
        </form>

        {formMsg && (
          <p className="mt-3 text-xs text-emerald-800 dark:text-emerald-400 font-medium">{formMsg}</p>
        )}
        {csvErrors.length > 0 && (
          <div className="mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 text-xs text-red-800 dark:text-red-300 space-y-1">
            {csvErrors.map((err, i) => (
              <p key={i}>{err}</p>
            ))}
          </div>
        )}
      </section>

      {/* Filterable Data Ledger */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Market Price Data Ledger
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Showing {rows.length} of {total.toLocaleString()} monthly records
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-initial min-w-[180px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                type="search"
                aria-label="Search market ledger"
                placeholder="Search state, crop, date..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setOffset(0);
                }}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <select
              aria-label="Filter ledger by commodity"
              value={commodityFilter}
              onChange={(e) => {
                setCommodityFilter(e.target.value);
                setOffset(0);
              }}
              className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg"
            >
              <option value="all">All Commodities</option>
              {commodities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter ledger by market"
              value={marketFilter}
              onChange={(e) => {
                setMarketFilter(e.target.value);
                setOffset(0);
              }}
              className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg"
            >
              <option value="all">All Markets ({markets.length})</option>
              <MarketSelectOptions markets={markets} />
            </select>

            <select
              aria-label="Filter ledger by year"
              value={yearFilter}
              onChange={(e) => {
                setYearFilter(e.target.value);
                setOffset(0);
              }}
              className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg"
            >
              <option value="all">All Years</option>
              <option value="2026">2026</option>
              <option value="2025">2025</option>
              <option value="2024">2024</option>
              <option value="2023">2023</option>
              <option value="2022">2022</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <th className="py-2.5 pr-3">Period</th>
                <th className="py-2.5 px-3">Commodity</th>
                <th className="py-2.5 px-3">Unit</th>
                <th className="py-2.5 px-3">Market</th>
                <th className="py-2.5 px-3">Region</th>
                <th className="py-2.5 pl-3 text-right">Observed Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="py-3">
                      <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded animate-pulse w-full" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 dark:text-slate-400">
                    No market observations match your current filters. Clear search or choose another year.
                  </td>
                </tr>
              ) : (
                rows.map((r, idx) => (
                  <tr
                    key={`${r.date}-${r.commodity_id}-${r.market_id}-${idx}`}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {formatPeriodLabel(r.date)}
                      {r.is_custom && (
                        <span className="ml-1.5 text-[11px] font-sans font-medium text-emerald-700 dark:text-emerald-400">
                          · Custom
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-slate-100">{r.commodity_name}</td>
                    <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">{r.unit}</td>
                    <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">{r.market_name}</td>
                    <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">
                      {r.state} · {r.region}
                    </td>
                    <td className="py-2.5 pl-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                      <span className="inline-flex items-center gap-2">
                        <span>{formatNaira(r.price_ngn)}</span>
                        {r.is_custom && r.custom_id && onDeleteCustomRecord && (
                          <button
                            type="button"
                            onClick={() => void onDeleteCustomRecord(r.custom_id!)}
                            aria-label={`Remove custom entry ${r.commodity_name} on ${r.date}`}
                            className="p-1 text-slate-400 hover:text-red-700 dark:hover:text-red-400 rounded transition-colors"
                          >
                            <Trash2 className="w-3 h-3" aria-hidden="true" />
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
          <span className="font-mono tabular-nums">
            Page {Math.floor(offset / limit) + 1} of {Math.max(1, Math.ceil(total / limit))}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
              className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={offset + limit >= total}
              onClick={() => setOffset(offset + limit)}
              className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
