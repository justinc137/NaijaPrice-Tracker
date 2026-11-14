import React, { useState } from "react";
import type { SeasonalProfileItem } from "../types/market";

interface SeasonalProfileChartProps {
  profile: SeasonalProfileItem[];
  strengthPct: number;
  peakMonth: string;
  peakDeviationPct: number;
  troughMonth: string;
  troughDeviationPct: number;
  seasonalSpreadPct: number;
}

export const SeasonalProfileChart: React.FC<SeasonalProfileChartProps> = ({
  profile,
  strengthPct,
  peakMonth,
  peakDeviationPct,
  troughMonth,
  troughDeviationPct,
  seasonalSpreadPct,
}) => {
  const [hoveredMonth, setHoveredMonth] = useState<SeasonalProfileItem | null>(null);

  const maxAbs = Math.max(
    10,
    ...profile.map((p) => Math.abs(p.deviationPct))
  );

  const active = hoveredMonth ?? profile.reduce((best, cur) => (cur.index > best.index ? cur : best), profile[0]);

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col justify-between">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              12-Month Seasonality Profile
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Strength {strengthPct.toFixed(1)}% · Peak {peakMonth} ({peakDeviationPct >= 0 ? "+" : ""}
              {peakDeviationPct.toFixed(1)}%) · Trough {troughMonth} ({troughDeviationPct >= 0 ? "+" : ""}
              {troughDeviationPct.toFixed(1)}%)
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-700 dark:text-slate-300 font-medium">
            Spread {seasonalSpreadPct.toFixed(1)}%
          </span>
        </div>

        {active && (
          <div className="px-3 py-2 mb-4 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-medium text-slate-700 dark:text-slate-200">
              {active.monthName} · {active.phase}
            </span>
            <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100 font-semibold">
              Index {active.index.toFixed(3)} ({active.deviationPct >= 0 ? "+" : ""}
              {active.deviationPct.toFixed(1)}% vs trend)
            </span>
          </div>
        )}

        <div className="relative pt-3 pb-1 overflow-x-auto">
          <div className="grid grid-cols-12 gap-1 sm:gap-1.5 items-stretch h-48 min-w-[300px]">
            {profile.map((item) => {
              const isPositive = item.deviationPct >= 0;
              const barPct = Math.max(8, (Math.abs(item.deviationPct) / maxAbs) * 92);
              const barColor =
                item.phase === "Lean Peak"
                  ? "bg-red-600 dark:bg-red-500"
                  : item.phase === "Harvest Glut"
                  ? "bg-emerald-600 dark:bg-emerald-500"
                  : isPositive
                  ? "bg-amber-500 dark:bg-amber-400"
                  : "bg-slate-400 dark:bg-slate-500";

              return (
                <button
                  key={item.month}
                  type="button"
                  onMouseEnter={() => setHoveredMonth(item)}
                  onFocus={() => setHoveredMonth(item)}
                  className="group flex flex-col items-center h-full focus:outline-none"
                  aria-label={`${item.monthName}: ${item.deviationPct.toFixed(1)}% seasonal deviation, ${item.phase}`}
                >
                  {/* Upper positive zone */}
                  <div className="w-full flex-1 flex flex-col justify-end items-center border-b border-slate-300 dark:border-slate-700 pb-0.5">
                    {isPositive && (
                      <>
                        <span className="text-[10px] font-mono tabular-nums text-slate-600 dark:text-slate-300 mb-0.5">
                          +{Math.round(item.deviationPct)}%
                        </span>
                        <div
                          style={{ height: `${barPct}%` }}
                          className={`w-full rounded-t-sm transition-opacity ${barColor} group-hover:opacity-85`}
                        />
                      </>
                    )}
                  </div>

                  {/* Lower negative zone */}
                  <div className="w-full flex-1 flex flex-col justify-start items-center pt-0.5">
                    {!isPositive && (
                      <>
                        <div
                          style={{ height: `${barPct}%` }}
                          className={`w-full rounded-b-sm transition-opacity ${barColor} group-hover:opacity-85`}
                        />
                        <span className="text-[10px] font-mono tabular-nums text-slate-600 dark:text-slate-300 mt-0.5">
                          {Math.round(item.deviationPct)}%
                        </span>
                      </>
                    )}
                  </div>

                  <span className="text-[10px] sm:text-[11px] font-medium text-slate-600 dark:text-slate-400 mt-1.5">
                    {item.monthName}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 dark:bg-emerald-500 inline-block" />
          Harvest Glut (&le; -6%)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-xs bg-red-600 dark:bg-red-500 inline-block" />
          Lean Peak (&ge; +6%)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 dark:bg-amber-400 inline-block" />
          Moderate Seasonal Lift
        </span>
      </div>
    </section>
  );
};
