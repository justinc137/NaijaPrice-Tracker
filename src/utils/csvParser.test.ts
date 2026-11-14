import test from "node:test";
import assert from "node:assert/strict";
import { parseCustomPriceCsv } from "./csvParser";

const commodities = [
  { id: "rice_ofada", name: "Rice (Local Ofada)", category: "Grains", unit: "50kg bag" },
];
const markets = [
  { id: "mile12_lagos", name: "Mile 12 Market, Lagos", state: "Lagos", region: "South-West" },
];

test("parseCustomPriceCsv parses valid custom price rows", () => {
  const csv = [
    "date,commodity_id,market_id,price_ngn",
    "2026-11-01,rice_ofada,mile12_lagos,92500",
  ].join("\n");

  const res = parseCustomPriceCsv(csv, commodities, markets);
  assert.equal(res.errors.length, 0);
  assert.equal(res.records.length, 1);
  assert.equal(res.records[0].price_ngn, 92500);
  assert.equal(res.records[0].commodity_name, "Rice (Local Ofada)");
});

test("parseCustomPriceCsv reports invalid date and missing columns", () => {
  const badHeaders = "period,amount\n2026-11-01,5000";
  const r1 = parseCustomPriceCsv(badHeaders, commodities, markets);
  assert.equal(r1.records.length, 0);
  assert.ok(r1.errors.length > 0);

  const badDate = "date,price_ngn\n11/01/2026,5000";
  const r2 = parseCustomPriceCsv(badDate, commodities, markets);
  assert.equal(r2.records.length, 0);
  assert.ok(r2.errors[0].includes("invalid date"));
});
