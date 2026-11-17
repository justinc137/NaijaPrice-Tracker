import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ModelComparisonEntry, PriceAlert } from "../types/market";
import {
  buildCsvUploadTemplate,
  findNewlyTriggeredAlerts,
  rankModelComparisons,
} from "./forecastHelpers";

function makeAlert(overrides: Partial<PriceAlert>): PriceAlert {
  return {
    id: "ar1_rice_ofada_mile12_lagos",
    ruleId: "ar1",
    ruleName: "Rice Spike",
    ruleType: "price_target",
    watchlistName: "Price Target Watch",
    commodityId: "rice_ofada",
    commodityName: "Ofada Rice (Local)",
    unit: "50kg bag",
    marketId: "mile12_lagos",
    marketName: "Mile 12 Market, Lagos",
    state: "Lagos",
    latestDate: "2026-11-01",
    latestPriceNgn: 112000,
    baselineType: "price_target",
    baselineLabel: "Target Price",
    baselineNgn: 105000,
    targetPriceNgn: 105000,
    deviationPct: 6.67,
    thresholdPct: 0,
    zScore: 1.4,
    severity: "warning",
    message: "Ofada Rice reached ₦112,000",
    ...overrides,
  };
}

describe("forecastHelpers", () => {
  it("detects newly triggered alerts when price crosses threshold or new rule matches", () => {
    const prev = [makeAlert({ id: "a1", latestPriceNgn: 98000 })];
    const next = [
      makeAlert({ id: "a1", latestPriceNgn: 98000 }),
      makeAlert({ id: "a1", latestPriceNgn: 115000 }),
      makeAlert({ id: "a2", commodityId: "beans_oloyin", latestPriceNgn: 120000 }),
    ];

    const fresh = findNewlyTriggeredAlerts(prev, next);
    assert.equal(fresh.length, 2);
    assert.equal(fresh[0].latestPriceNgn, 115000);
    assert.equal(fresh[1].id, "a2");
  });

  it("ranks model comparison entries by ascending MAPE", () => {
    const models: ModelComparisonEntry[] = [
      {
        modelType: "ridge_seasonal",
        label: "Ridge + Seasonal Dummies",
        family: "Basic",
        mae: 4200,
        rmse: 5100,
        mape: 5.4,
        samples: 6,
        projectedEndNgn: 102000,
        projectedChangePct: 4.1,
        isBest: false,
        forecast: [],
      },
      {
        modelType: "sarima",
        label: "Seasonal ARIMA (1,1,1)(1,1,0)[12]",
        family: "Advanced",
        mae: 3100,
        rmse: 3900,
        mape: 3.8,
        samples: 6,
        projectedEndNgn: 104500,
        projectedChangePct: 6.6,
        isBest: true,
        forecast: [],
      },
    ];
    const ranked = rankModelComparisons(models);
    assert.equal(ranked[0].modelType, "sarima");
    assert.equal(ranked[1].modelType, "ridge_seasonal");
  });

  it("builds valid CSV template with header and active commodity/market", () => {
    const csv = buildCsvUploadTemplate(
      [{ id: "tomatoes_basket", name: "Tomatoes", category: "Perishables", unit: "50kg basket" }],
      [{ id: "mile12_lagos", name: "Mile 12", state: "Lagos", region: "South-West" }],
      "tomatoes_basket",
      "mile12_lagos"
    );
    const lines = csv.split("\n");
    assert.equal(lines[0], "date,commodity_id,market_id,price_ngn");
    assert.match(lines[1], /tomatoes_basket,mile12_lagos/);
  });
});
