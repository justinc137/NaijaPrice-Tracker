import type {
  CommodityMeta,
  MarketMeta,
  ModelComparisonEntry,
  PriceAlert,
} from "../types/market";

export function getAlertNotificationKey(alert: PriceAlert): string {
  return `${alert.id}_${alert.latestPriceNgn}`;
}

export function findNewlyTriggeredAlerts(
  previousAlerts: PriceAlert[],
  nextAlerts: PriceAlert[],
  knownKeys?: Set<string>
): PriceAlert[] {
  const seen = knownKeys
    ? new Set(knownKeys)
    : new Set(previousAlerts.map(getAlertNotificationKey));
  return nextAlerts.filter((al) => !seen.has(getAlertNotificationKey(al)));
}

export function rankModelComparisons(
  models: ModelComparisonEntry[] | undefined
): ModelComparisonEntry[] {
  if (!models || models.length === 0) return [];
  return [...models].sort((a, b) => a.mape - b.mape);
}

export function buildCsvUploadTemplate(
  commodities: CommodityMeta[],
  markets: MarketMeta[],
  activeCommodityId?: string,
  activeMarketId?: string
): string {
  const c1 =
    commodities.find((c) => c.id === activeCommodityId) ??
    commodities[0] ?? { id: "rice_ofada", name: "Ofada Rice (Local)" };
  const m1 =
    markets.find((m) => m.id === activeMarketId) ??
    markets[0] ?? { id: "mile12_lagos", name: "Mile 12 Market, Lagos" };
  const c2 = commodities[1] ?? c1;
  const m2 = markets[1] ?? m1;

  return [
    "date,commodity_id,market_id,price_ngn",
    `2026-11-01,${c1.id},${m1.id},102500`,
    `2026-11-01,${c2.id},${m2.id},96000`,
  ].join("\n");
}
