export type ForecastModelType =
  | "ridge_seasonal"
  | "poly_seasonal"
  | "holt_winters"
  | "sarima"
  | "prophet_gam";

export type WorkspaceTab =
  | "overview"
  | "live"
  | "watchlists"
  | "seasonality"
  | "arbitrage"
  | "ledger"
  | "reports";

export interface CommodityMeta {
  id: string;
  name: string;
  category: string;
  unit: string;
}

export interface MarketMeta {
  id: string;
  name: string;
  state: string;
  region: string;
}

export interface DatasetMetaResponse {
  commodities: CommodityMeta[];
  markets: MarketMeta[];
  dateRange: {
    start: string | null;
    end: string | null;
    months: number;
  };
  totalRecords: number;
}

export interface HistoricalPoint {
  date: string;
  year: number;
  month: number;
  price_ngn: number;
  trend_ngn: number | null;
  seasonal_factor: number;
  residual: number | null;
  fitted_ngn: number;
  is_custom: boolean;
}

export interface ForecastPoint {
  date: string;
  month: number;
  predicted_ngn: number;
  lower95_ngn: number;
  upper95_ngn: number;
}

export interface SeasonalProfileItem {
  month: number;
  monthName: string;
  index: number;
  deviationPct: number;
  phase: "Lean Peak" | "Harvest Glut" | "Neutral";
}

export interface MarketComparisonItem {
  marketId: string;
  marketName: string;
  state: string;
  region: string;
  price_ngn: number;
  momPct: number;
  vsNationalAvgPct: number;
  date: string;
}

export interface CommoditySeasonalityRow {
  commodityId: string;
  commodityName: string;
  unit: string;
  strengthPct: number;
  peakMonth: string;
  troughMonth: string;
  months: SeasonalProfileItem[];
}

export interface ModelComparisonForecastPoint {
  date: string;
  predicted_ngn: number;
}

export interface ModelComparisonEntry {
  modelType: ForecastModelType;
  label: string;
  family: "Basic" | "Advanced";
  mae: number;
  rmse: number;
  mape: number;
  samples: number;
  projectedEndNgn: number;
  projectedChangePct: number;
  isBest: boolean;
  forecast: ModelComparisonForecastPoint[];
}

export interface AnalysisResponse {
  meta: {
    commodityId: string;
    commodityName: string;
    category: string;
    unit: string;
    marketId: string;
    marketName: string;
    state: string;
    region: string;
    observations: number;
    latestDate: string;
  };
  kpis: {
    latestPriceNgn: number;
    momPct: number;
    yoyPct: number;
    high12mNgn: number;
    low12mNgn: number;
    avg12mNgn: number;
    volatilityPct: number;
    nationalAvgNgn: number;
    projectedEndNgn: number;
    projectedChangePct: number;
  };
  seasonality: {
    profile: SeasonalProfileItem[];
    strengthPct: number;
    peakMonth: string;
    peakDeviationPct: number;
    troughMonth: string;
    troughDeviationPct: number;
    seasonalSpreadPct: number;
  };
  history: HistoricalPoint[];
  forecast: ForecastPoint[];
  backtest: {
    mae: number;
    rmse: number;
    mape: number;
    samples: number;
  };
  modelType: ForecastModelType;
  modelComparison?: ModelComparisonEntry[];
  marketComparison: MarketComparisonItem[];
  arbitrage: {
    cheapest: MarketComparisonItem | null;
    priciest: MarketComparisonItem | null;
    spreadNgn: number;
    spreadPct: number;
  };
  seasonalityMatrix: CommoditySeasonalityRow[];
  insights: {
    traderSignal: string;
    traderSummary: string;
    studentNote: string;
  };
}

export interface CustomPriceRecord {
  id?: string;
  date: string;
  commodity_id: string;
  commodity_name: string;
  category: string;
  unit: string;
  market_id: string;
  market_name: string;
  state: string;
  region: string;
  price_ngn: number;
  createdAt?: string;
}

export interface LedgerRow extends CustomPriceRecord {
  year: number;
  month: number;
  is_custom: boolean;
  custom_id?: string | null;
}

export interface LedgerResponse {
  total: number;
  limit: number;
  offset: number;
  rows: LedgerRow[];
}

export interface WatchlistItem {
  commodityId: string;
  marketId: string;
}

export interface WatchlistPerformanceItem {
  commodityId: string;
  commodityName: string;
  unit: string;
  marketId: string;
  marketName: string;
  state: string;
  region: string;
  latestDate: string;
  latestPriceNgn: number;
  momPct: number;
  yoyPct: number;
  projectedEndNgn: number;
  projectedChangePct: number;
  seasonalPhase: "Lean Peak" | "Harvest Glut" | "Neutral";
  traderSignal: string;
}

export interface WatchlistGroup {
  id: string;
  name: string;
  createdAt: string;
  items: WatchlistItem[];
  performance: WatchlistPerformanceItem[];
}

export interface WatchlistsResponse {
  watchlists: WatchlistGroup[];
}

export type AlertRuleType = "deviation_pct" | "price_target";
export type AlertBaselineType = "avg_12m" | "avg_all" | "trend" | "price_target";
export type AlertDirection = "both" | "above" | "below";
export type AlertSeverity = "warning" | "critical";

export interface AlertRule {
  id: string;
  name: string;
  watchlistId: string;
  commodityId: string;
  marketId: string;
  ruleType?: AlertRuleType;
  baselineType: AlertBaselineType;
  direction: AlertDirection;
  thresholdPct: number;
  targetPriceNgn?: number | null;
  enabled: boolean;
  createdAt: string;
}

export interface PriceAlert {
  id: string;
  ruleId: string;
  ruleName: string;
  ruleType?: AlertRuleType;
  watchlistName: string;
  commodityId: string;
  commodityName: string;
  unit: string;
  marketId: string;
  marketName: string;
  state: string;
  latestDate: string;
  latestPriceNgn: number;
  baselineType: AlertBaselineType;
  baselineLabel: string;
  baselineNgn: number;
  targetPriceNgn?: number | null;
  deviationPct: number;
  thresholdPct: number;
  zScore: number;
  severity: AlertSeverity;
  message: string;
}

export interface AlertsResponse {
  rules: AlertRule[];
  alerts: PriceAlert[];
  summary: {
    totalTriggered: number;
    criticalCount: number;
    warningCount: number;
  };
}

export interface LiveFxRates {
  usdNgn: number;
  gbpNgn: number | null;
  eurNgn: number | null;
  updatedAtUtc: string;
  provider: string;
}

export interface WorldBankCpiInfo {
  year: string;
  cpiPct: number;
  indicator: string;
  provider: string;
}

export interface LiveSourceMeta {
  datasetTitle: string;
  organization: string;
  lastModified: string;
  datasetDate?: string;
  csvUrl: string;
}

export interface LiveCommoditySummary {
  commodity: string;
  category: string;
  mappedCommodityId: string | null;
  mappedCommodityName: string | null;
  wholesaleUnit: string | null;
  latestDate: string;
  unit: string;
  avgRetailNgn: number;
  minRetailNgn: number;
  maxRetailNgn: number;
  avgUsdPrice: number;
  normalizedWholesaleNgn: number | null;
  unitScaleFactor: number | null;
  quoteCount: number;
  states: string[];
}

export interface LiveMarketQuote {
  date: string;
  state: string;
  lga: string;
  market: string;
  category: string;
  commodity: string;
  mappedCommodityId: string | null;
  mappedCommodityName: string | null;
  wholesaleUnit: string | null;
  unit: string;
  priceType: string;
  priceNgn: number;
  usdPrice: number;
  normalizedWholesaleNgn: number | null;
  unitScaleFactor: number | null;
}

export interface LiveFeedSnapshot {
  fetchedAt: string;
  latestSurveyDate: string | null;
  totalRecentQuotes: number;
  statesCovered: string[];
  marketsCoveredCount: number;
  fx: LiveFxRates | null;
  cpi: WorldBankCpiInfo | null;
  sourceMeta: LiveSourceMeta;
  commoditySummaries: LiveCommoditySummary[];
  quotes: LiveMarketQuote[];
  warnings?: string[];
}



