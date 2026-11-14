import test from "node:test";
import assert from "node:assert/strict";
import {
  formatCompactNaira,
  formatNaira,
  formatPercent,
  formatPeriodLabel,
  getModelLabel,
} from "./formatters";

test("formatNaira formats Nigerian Naira amounts with grouping", () => {
  assert.equal(formatNaira(48500), "₦48,500");
  assert.equal(formatNaira(0), "₦0");
  assert.equal(formatNaira(null), "—");
});

test("formatCompactNaira abbreviates thousands and millions cleanly", () => {
  assert.equal(formatCompactNaira(850), "₦850");
  assert.equal(formatCompactNaira(48500), "₦48.5k");
  assert.equal(formatCompactNaira(1250000), "₦1.25M");
});

test("formatPercent renders explicit sign and 1 decimal place", () => {
  assert.equal(formatPercent(12.34), "+12.3%");
  assert.equal(formatPercent(-5.67), "-5.7%");
  assert.equal(formatPercent(0), "0.0%");
});

test("formatPeriodLabel converts ISO date to Month Year", () => {
  assert.equal(formatPeriodLabel("2026-10-01"), "Oct 2026");
  assert.equal(formatPeriodLabel("2022-01-01"), "Jan 2022");
});

test("getModelLabel returns readable Python model names", () => {
  assert.equal(getModelLabel("ridge_seasonal"), "Ridge + Seasonal Dummies");
  assert.equal(getModelLabel("poly_seasonal"), "Polynomial + Fourier Harmonics");
  assert.equal(getModelLabel("holt_winters"), "Holt-Winters Multiplicative");
});
