import type { MarketComparisonItem, MarketMeta } from "../types/market";

export const NIGERIAN_GEOPOLITICAL_ZONES = [
  "South-West",
  "South-East",
  "South-South",
  "North-Central",
  "North-West",
  "North-East",
] as const;

export interface MarketGroup {
  region: string;
  markets: MarketMeta[];
}

export function groupMarketsByRegion(markets: MarketMeta[]): MarketGroup[] {
  const byRegion = new Map<string, MarketMeta[]>();
  for (const m of markets) {
    const key = m.region || "Other";
    const list = byRegion.get(key);
    if (list) {
      list.push(m);
    } else {
      byRegion.set(key, [m]);
    }
  }

  const ordered: MarketGroup[] = [];
  const seen = new Set<string>();
  for (const zone of NIGERIAN_GEOPOLITICAL_ZONES) {
    const items = byRegion.get(zone);
    if (items && items.length > 0) {
      ordered.push({ region: zone, markets: items });
      seen.add(zone);
    }
  }
  for (const [region, items] of byRegion.entries()) {
    if (!seen.has(region) && items.length > 0) {
      ordered.push({ region, markets: items });
    }
  }
  return ordered;
}

export interface CorridorCalculation {
  origin: MarketComparisonItem | null;
  destination: MarketComparisonItem | null;
  grossSpreadNgn: number;
  grossSpreadPct: number;
  netPerUnitNgn: number;
  totalNetReturnNgn: number;
  roiPct: number;
}

export function computeCorridorArbitrage(
  comparison: MarketComparisonItem[],
  originMarketId: string,
  destinationMarketId: string,
  quantityUnits: number,
  transportPerUnit: number
): CorridorCalculation {
  const origin =
    comparison.find((m) => m.marketId === originMarketId) ?? comparison[0] ?? null;
  const destination =
    comparison.find((m) => m.marketId === destinationMarketId) ??
    comparison[comparison.length - 1] ??
    null;

  if (!origin || !destination) {
    return {
      origin: null,
      destination: null,
      grossSpreadNgn: 0,
      grossSpreadPct: 0,
      netPerUnitNgn: 0,
      totalNetReturnNgn: 0,
      roiPct: 0,
    };
  }

  const grossSpreadNgn = destination.price_ngn - origin.price_ngn;
  const grossSpreadPct =
    origin.price_ngn > 0 ? (grossSpreadNgn / origin.price_ngn) * 100 : 0;
  const netPerUnitNgn = grossSpreadNgn - transportPerUnit;
  const safeQty = Math.max(1, quantityUnits);
  const totalNetReturnNgn = netPerUnitNgn * safeQty;
  const landedCost = origin.price_ngn + transportPerUnit;
  const roiPct = landedCost > 0 ? (netPerUnitNgn / landedCost) * 100 : 0;

  return {
    origin,
    destination,
    grossSpreadNgn,
    grossSpreadPct,
    netPerUnitNgn,
    totalNetReturnNgn,
    roiPct,
  };
}
