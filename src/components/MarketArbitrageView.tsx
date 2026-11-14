import React, { useState } from "react";
import type { MarketComparisonItem } from "../types/market";
import { formatNaira, formatPercent } from "../utils/formatters";

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
  const [quantityUnits, setQuantityUnits] = useState<number>(50);
  const [transportPerUnit, setTransportPerUnit] = useState<number>(3500);

  const maxPrice = Math.max(1, ...marketComparison.map((m) => m.price_ngn));
  const grossSpread = arbitrage.spreadNgn;
  const netPerUnit = grossSpread - transportPerUnit;
  const totalNetProfit = netPerUnit * quantityUnits;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Market price ranking & visual spread bars */}
        <section className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Cross-Market Price Ranking — {commodityName}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Unit: {unit} · Latest snapshot {latestDate} · National mean {formatNaira(nationalAvgNgn)}
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-700">
              Max Spread {formatNaira(arbitrage.spreadNgn)} ({formatPercent(arbitrage.spreadPct, false)})
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {marketComparison.map((mkt) => {
              const widthPct = Math.max(12, (mkt.price_ngn / maxPrice) * 100);
              const isSelected = mkt.marketId === selectedMarketId;
              const isCheapest = arbitrage.cheapest?.marketId === mkt.marketId;
              const isPriciest = arbitrage.priciest?.marketId === mkt.marketId;

              return (
                <div
                  key={mkt.marketId}
                  className={`py-3 px-2.5 -mx-2.5 rounded-lg transition-colors ${
                    isSelected ? "bg-slate-50" : "hover:bg-slate-50/60"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectMarket(mkt.marketId)}
                        className="text-sm font-semibold text-slate-900 hover:text-emerald-700 text-left"
                      >
                        {mkt.marketName}
                      </button>
                      <span className="text-xs text-slate-500">
                        {mkt.state} · {mkt.region}
                      </span>
                      {isSelected && (
                        <span className="text-xs font-medium text-slate-700">
                          · Selected
                        </span>
                      )}
                      {isCheapest && (
                        <span className="text-xs font-medium text-emerald-700">
                          · Lowest Origin
                        </span>
                      )}
                      {isPriciest && (
                        <span className="text-xs font-medium text-red-700">
                          · Highest Destination
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 font-mono tabular-nums text-xs">
                      <span className={mkt.vsNationalAvgPct <= 0 ? "text-emerald-700" : "text-amber-700"}>
                        {formatPercent(mkt.vsNationalAvgPct)} vs avg
                      </span>
                      <span className="text-sm font-semibold text-slate-900">
                        {formatNaira(mkt.price_ngn)}
                      </span>
                    </div>
                  </div>

                  <div className="w-full h-2 bg-slate-200/70 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${widthPct}%` }}
                      className={`h-full rounded-full ${
                        isCheapest
                          ? "bg-emerald-600"
                          : isPriciest
                          ? "bg-red-600"
                          : "bg-slate-700"
                      }`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Trader Inter-State Arbitrage Margin Calculator */}
        <section className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Trade Corridor Calculator
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 mb-4">
              Estimate net trading margin between the lowest-cost supply market and highest-price destination market.
            </p>

            <div className="space-y-3 text-xs border-b border-slate-200 pb-4 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Buy Origin</span>
                <span className="font-medium text-slate-900">
                  {arbitrage.cheapest?.marketName ?? "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Origin Unit Price</span>
                <span className="font-mono tabular-nums font-semibold text-emerald-700">
                  {formatNaira(arbitrage.cheapest?.price_ngn)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Sell Destination</span>
                <span className="font-medium text-slate-900">
                  {arbitrage.priciest?.marketName ?? "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Destination Unit Price</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  {formatNaira(arbitrage.priciest?.price_ngn)}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="arb-qty"
                  className="block text-xs font-medium text-slate-700 mb-1"
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
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
              <div>
                <label
                  htmlFor="arb-freight"
                  className="block text-xs font-medium text-slate-700 mb-1"
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
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-slate-200 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Net Margin / Unit</span>
              <span
                className={`font-mono tabular-nums font-semibold ${
                  netPerUnit >= 0 ? "text-emerald-700" : "text-red-700"
                }`}
              >
                {formatNaira(netPerUnit)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-700">
                Estimated Net Return ({quantityUnits} units)
              </span>
              <span
                className={`text-lg font-mono tabular-nums font-bold ${
                  totalNetProfit >= 0 ? "text-emerald-700" : "text-red-700"
                }`}
              >
                {formatNaira(totalNetProfit)}
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
