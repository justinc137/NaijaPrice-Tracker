import React, { useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import type { MarketComparisonItem } from "../types/market";
import { formatNaira, formatPercent } from "../utils/formatters";
import {
  NIGERIAN_GEOPOLITICAL_ZONES,
  computeCorridorArbitrage,
} from "../utils/marketHelpers";

interface MarketArbitrageViewProps {
  commodityName: string;
  unit: string;
  latestDate: string;
  nationalAvgNgn: number;
  marketComparison: MarketComparisonItem[];
  arbitrage: {
    cheapest: MarketComparisonItem | null;
    priciest: MarketComparisonItem | null;
    spreadNgn: number;
    spreadPct: number;
  };
  selectedMarketId: string;
  onSelectMarket: (marketId: string) => void;
}

export const MarketArbitrageView: React.FC<MarketArbitrageViewProps> = ({
  commodityName,
  unit,
  latestDate,
  nationalAvgNgn,
  marketComparison,
  arbitrage,
  selectedMarketId,
  onSelectMarket,
}) => {
  const [zoneFilter, setZoneFilter] = useState<string>("all");
  const [originId, setOriginId] = useState<string>(
    arbitrage.cheapest?.marketId ?? marketComparison[0]?.marketId ?? ""
  );
  const [destinationId, setDestinationId] = useState<string>(
    arbitrage.priciest?.marketId ??
      marketComparison[marketComparison.length - 1]?.marketId ??
      ""
  );
  const [quantityUnits, setQuantityUnits] = useState<number>(50);
  const [transportPerUnit, setTransportPerUnit] = useState<number>(3500);

  // Sync default origin/destination when commodity changes or best spread shifts
  useEffect(() => {
    setOriginId(arbitrage.cheapest?.marketId ?? marketComparison[0]?.marketId ?? "");
    setDestinationId(
      arbitrage.priciest?.marketId ??
        marketComparison[marketComparison.length - 1]?.marketId ??
        ""
    );
  }, [arbitrage.cheapest?.marketId, arbitrage.priciest?.marketId, marketComparison]);

  const availableZones = useMemo(() => {
    const present = new Set(marketComparison.map((m) => m.region));
    return NIGERIAN_GEOPOLITICAL_ZONES.filter((z) => present.has(z));
  }, [marketComparison]);

  const visibleMarkets = useMemo(() => {
    if (zoneFilter === "all") return marketComparison;
    return marketComparison.filter((m) => m.region === zoneFilter);
  }, [marketComparison, zoneFilter]);

  const corridor = useMemo(
    () =>
      computeCorridorArbitrage(
        marketComparison,
        originId,
        destinationId,
        quantityUnits,
        transportPerUnit
      ),
    [marketComparison, originId, destinationId, quantityUnits, transportPerUnit]
  );

  const groupedComparison = useMemo(() => {
    const byRegion = new Map<string, MarketComparisonItem[]>();
    for (const item of marketComparison) {
      const list = byRegion.get(item.region);
      if (list) list.push(item);
      else byRegion.set(item.region, [item]);
    }
    return availableZones.map((zone) => ({
      zone,
      items: byRegion.get(zone) ?? [],
    }));
  }, [marketComparison, availableZones]);

  const maxPrice = Math.max(1, ...marketComparison.map((m) => m.price_ngn));
  const isCustomCorridor =
    originId !== (arbitrage.cheapest?.marketId ?? "") ||
    destinationId !== (arbitrage.priciest?.marketId ?? "");

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Market price ranking & geopolitical zone filter */}
        <section className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Cross-Market Price Ranking — {commodityName}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {marketComparison.length} Nigerian markets · Unit: {unit} · Latest {latestDate} · National mean{" "}
                {formatNaira(nationalAvgNgn)}
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-700 dark:text-slate-300">
              Max Spread {formatNaira(arbitrage.spreadNgn)} (
              {formatPercent(arbitrage.spreadPct, false)})
            </span>
          </div>

          {/* Geopolitical Zone Filter */}
          <div className="flex flex-wrap items-center gap-1.5 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setZoneFilter("all")}
              className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
                zoneFilter === "all"
                  ? "bg-emerald-700 text-white border-emerald-700 dark:bg-emerald-600 dark:border-emerald-600"
                  : "bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              All Zones ({marketComparison.length})
            </button>
            {availableZones.map((zone) => {
              const count = marketComparison.filter((m) => m.region === zone).length;
              const active = zoneFilter === zone;
              return (
                <button
                  key={zone}
                  type="button"
                  onClick={() => setZoneFilter(zone)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
                    active
                      ? "bg-emerald-700 text-white border-emerald-700 dark:bg-emerald-600 dark:border-emerald-600"
                      : "bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  {zone} ({count})
                </button>
              );
            })}
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {visibleMarkets.map((mkt) => {
              const widthPct = Math.max(12, (mkt.price_ngn / maxPrice) * 100);
              const isSelected = mkt.marketId === selectedMarketId;
              const isCheapest = arbitrage.cheapest?.marketId === mkt.marketId;
              const isPriciest = arbitrage.priciest?.marketId === mkt.marketId;

              return (
                <div
                  key={mkt.marketId}
                  className={`py-3 px-2.5 -mx-2.5 rounded-lg transition-colors ${
                    isSelected
                      ? "bg-slate-50 dark:bg-slate-800/70"
                      : "hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectMarket(mkt.marketId)}
                        className="text-sm font-semibold text-slate-900 dark:text-slate-100 hover:text-emerald-700 dark:hover:text-emerald-400 text-left"
                      >
                        {mkt.marketName}
                      </button>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {mkt.state} · {mkt.region}
                      </span>
                      {isSelected && (
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          · Selected
                        </span>
                      )}
                      {isCheapest && (
                        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          · Lowest Origin
                        </span>
                      )}
                      {isPriciest && (
                        <span className="text-xs font-medium text-red-700 dark:text-red-400">
                          · Highest Destination
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 font-mono tabular-nums text-xs">
                      <span
                        className={
                          mkt.vsNationalAvgPct <= 0
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-amber-700 dark:text-amber-400"
                        }
                      >
                        {formatPercent(mkt.vsNationalAvgPct)} vs avg
                      </span>
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {formatNaira(mkt.price_ngn)}
                      </span>
                    </div>
                  </div>

                  <div className="w-full h-2 bg-slate-200/70 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${widthPct}%` }}
                      className={`h-full rounded-full ${
                        isCheapest
                          ? "bg-emerald-600 dark:bg-emerald-500"
                          : isPriciest
                          ? "bg-red-600 dark:bg-red-500"
                          : "bg-slate-700 dark:bg-slate-400"
                      }`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Trader Inter-State Arbitrage Margin Calculator */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Trade Corridor Calculator
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Evaluate net margin across any origin-to-destination Nigerian market corridor.
                </p>
              </div>
              {isCustomCorridor && (
                <button
                  type="button"
                  onClick={() => {
                    setOriginId(arbitrage.cheapest?.marketId ?? "");
                    setDestinationId(arbitrage.priciest?.marketId ?? "");
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-md whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="w-3 h-3" aria-hidden="true" />
                  <span>Best Spread</span>
                </button>
              )}
            </div>

            <div className="space-y-3 border-b border-slate-200 dark:border-slate-800 pb-4 my-4">
              <div>
                <label
                  htmlFor="arb-origin"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Buy Origin Market
                </label>
                <select
                  id="arb-origin"
                  value={originId}
                  onChange={(e) => setOriginId(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  {groupedComparison.map((grp) => (
                    <optgroup key={grp.zone} label={grp.zone}>
                      {grp.items.map((m) => (
                        <option key={m.marketId} value={m.marketId}>
                          {m.marketName} ({formatNaira(m.price_ngn)})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="arb-destination"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Sell Destination Market
                </label>
                <select
                  id="arb-destination"
                  value={destinationId}
                  onChange={(e) => setDestinationId(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  {groupedComparison.map((grp) => (
                    <optgroup key={grp.zone} label={grp.zone}>
                      {grp.items.map((m) => (
                        <option key={m.marketId} value={m.marketId}>
                          {m.marketName} ({formatNaira(m.price_ngn)})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div className="pt-1 space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Origin Unit Price</span>
                  <span className="font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
                    {formatNaira(corridor.origin?.price_ngn)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Destination Unit Price</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                    {formatNaira(corridor.destination?.price_ngn)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Gross Corridor Spread</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                    {formatNaira(corridor.grossSpreadNgn)} ({formatPercent(corridor.grossSpreadPct)})
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="arb-qty"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Shipment Volume ({unit}s)
                </label>
                <input
                  id="arb-qty"
                  type="number"
                  min={1}
                  max={5000}
                  value={quantityUnits}
                  onChange={(e) => setQuantityUnits(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
              <div>
                <label
                  htmlFor="arb-freight"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Logistics &amp; Levy Cost per Unit (₦)
                </label>
                <input
                  id="arb-freight"
                  type="number"
                  min={0}
                  step={250}
                  value={transportPerUnit}
                  onChange={(e) => setTransportPerUnit(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">Net Margin / Unit</span>
              <span
                className={`font-mono tabular-nums font-semibold ${
                  corridor.netPerUnitNgn >= 0
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-red-700 dark:text-red-400"
                }`}
              >
                {formatNaira(corridor.netPerUnitNgn)} ({formatPercent(corridor.roiPct)} ROI)
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Estimated Net Return ({quantityUnits} units)
              </span>
              <span
                className={`text-lg font-mono tabular-nums font-bold ${
                  corridor.totalNetReturnNgn >= 0
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-red-700 dark:text-red-400"
                }`}
              >
                {formatNaira(corridor.totalNetReturnNgn)}
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
