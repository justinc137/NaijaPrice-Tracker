import test from "node:test";
import assert from "node:assert/strict";
import type { MarketComparisonItem, MarketMeta } from "../types/market";
import { computeCorridorArbitrage, groupMarketsByRegion } from "./marketHelpers";

const SAMPLE_MARKETS: MarketMeta[] = [
  { id: "monday_maiduguri", name: "Monday Market, Maiduguri", state: "Borno", region: "North-East" },
  { id: "mile12_lagos", name: "Mile 12 Market, Lagos", state: "Lagos", region: "South-West" },
  { id: "oilmill_portharcourt", name: "Oil Mill Market, Port Harcourt", state: "Rivers", region: "South-South" },
  { id: "dawanau_kano", name: "Dawanau Market, Kano", state: "Kano", region: "North-West" },
  { id: "zakibiam_benue", name: "Zaki Biam Yam Market, Benue", state: "Benue", region: "North-Central" },
  { id: "ochanja_onitsha", name: "Ochanja Market, Onitsha", state: "Anambra", region: "South-East" },
];

test("groupMarketsByRegion orders Nigerian geopolitical zones canonically", () => {
  const groups = groupMarketsByRegion(SAMPLE_MARKETS);
  assert.deepEqual(
    groups.map((g) => g.region),
    ["South-West", "South-East", "South-South", "North-Central", "North-West", "North-East"]
  );
  assert.equal(groups[2].markets[0].id, "oilmill_portharcourt");
});

test("computeCorridorArbitrage calculates custom origin-to-destination spread and ROI", () => {
  const comparison: MarketComparisonItem[] = [
    {
      marketId: "zakibiam_benue",
      marketName: "Zaki Biam Yam Market, Benue",
      state: "Benue",
      region: "North-Central",
      price_ngn: 55000,
      momPct: -2.0,
      vsNationalAvgPct: -18.5,
      date: "2026-10-01",
    },
    {
      marketId: "ochanja_onitsha",
      marketName: "Ochanja Market, Onitsha",
      state: "Anambra",
      region: "South-East",
      price_ngn: 72000,
      momPct: 1.5,
      vsNationalAvgPct: 6.7,
      date: "2026-10-01",
    },
    {
      marketId: "oilmill_portharcourt",
      marketName: "Oil Mill Market, Port Harcourt",
      state: "Rivers",
      region: "South-South",
      price_ngn: 81000,
      momPct: 3.1,
      vsNationalAvgPct: 20.0,
      date: "2026-10-01",
    },
  ];

  const calc = computeCorridorArbitrage(
    comparison,
    "zakibiam_benue",
    "oilmill_portharcourt",
    40,
    6000
  );
  assert.equal(calc.grossSpreadNgn, 26000);
  assert.equal(calc.netPerUnitNgn, 20000);
  assert.equal(calc.totalNetReturnNgn, 800000);
  assert.ok(Math.abs(calc.roiPct - (20000 / 61000) * 100) < 0.01);
});
