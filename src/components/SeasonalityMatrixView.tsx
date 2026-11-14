import React from "react";
import type { CommoditySeasonalityRow } from "../types/market";

interface SeasonalityMatrixViewProps {
  matrix: CommoditySeasonalityRow[];
  marketName: string;
  selectedCommodityId: string;
  onSelectCommodity: (commodityId: string) => void;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function cellStyle(deviationPct: number): string {
  if (deviationPct >= 15) return "bg-red-700 text-white";
  if (deviationPct >= 6) return "bg-red-100 text-red-900";
  if (deviationPct <= -15) return "bg-emerald-700 text-white";
  if (deviationPct <= -6) return "bg-emerald-100 text-emerald-900";
  return "bg-slate-100 text-slate-700";
}

export const SeasonalityMatrixView: React.FC<SeasonalityMatrixViewProps> = ({
  matrix,
  marketName,
  selectedCommodityId,
  onSelectCommodity,
}) => {
  return (
    <div className="space-y-5">
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Nigerian Commodity Seasonal Calendar — {marketName}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              12-month multiplicative seasonal deviation (%) computed by Python centered moving-average decomposition. Click any row to focus that commodity.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-emerald-700 inline-block" />
              Deep Harvest Trough (&le; -15%)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-emerald-100 border border-emerald-200 inline-block" />
              Harvest Window (-6% to -14%)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-red-100 border border-red-200 inline-block" />
              Lean Tightness (+6% to +14%)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-red-700 inline-block" />
              Peak Lean Spike (&ge; +15%)
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[820px]">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                <th className="py-2.5 pr-4">Commodity</th>
                <th className="py-2.5 px-2 text-right">Strength</th>
                {MONTHS.map((m) => (
                  <th key={m} className="py-2.5 px-1 text-center font-mono">
                    {m}
                  </th>
                ))}
                <th className="py-2.5 pl-3">Optimal Buy / Peak</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {matrix.map((row) => {
                const isSelected = row.commodityId === selectedCommodityId;
                return (
                  <tr
                    key={row.commodityId}
                    className={`transition-colors ${
                      isSelected ? "bg-emerald-50/60" : "hover:bg-slate-50"
                    }`}
                  >
                    <td className="py-2.5 pr-4">
                      <button
                        type="button"
                        onClick={() => onSelectCommodity(row.commodityId)}
                        className="text-left font-medium text-slate-900 hover:text-emerald-700 focus:outline-none focus-visible:underline"
                      >
                        {row.commodityName}
                        <span className="block text-[11px] font-normal text-slate-500">
                          {row.unit}
                        </span>
                      </button>
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-700 font-medium">
                      {row.strengthPct.toFixed(0)}%
                    </td>
                    {row.months.map((m) => (
                      <td key={m.month} className="py-2 px-1 text-center">
                        <div
                          className={`py-1.5 px-1 rounded-sm font-mono tabular-nums text-[11px] font-medium ${cellStyle(
                            m.deviationPct
                          )}`}
                          title={`${row.commodityName} · ${m.monthName}: ${m.deviationPct >= 0 ? "+" : ""}${m.deviationPct.toFixed(1)}% (${m.phase})`}
                        >
                          {m.deviationPct >= 0 ? "+" : ""}
                          {Math.round(m.deviationPct)}%
                        </div>
                      </td>
                    ))}
                    <td className="py-2.5 pl-3 text-slate-600 whitespace-nowrap">
                      <span className="text-emerald-700 font-medium">{row.troughMonth}</span>
                      <span className="mx-1.5 text-slate-400">/</span>
                      <span className="text-red-700 font-medium">{row.peakMonth}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
