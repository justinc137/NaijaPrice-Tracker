import assert from "node:assert/strict";
import test from "node:test";
import {
  getRouteMeta,
  getSlugForTab,
  normalizeCanonicalOrigin,
  tabFromPathname,
} from "./seo.ts";

test("tabFromPathname maps clean slugs and root cleanly", () => {
  assert.equal(tabFromPathname("/"), "overview");
  assert.equal(tabFromPathname("/price-forecast"), "overview");
  assert.equal(tabFromPathname("/live-feeds"), "live");
  assert.equal(tabFromPathname("/watchlists/"), "watchlists");
  assert.equal(tabFromPathname("/seasonality-matrix"), "seasonality");
  assert.equal(tabFromPathname("/market-arbitrage"), "arbitrage");
  assert.equal(tabFromPathname("/data-ledger"), "ledger");
  assert.equal(tabFromPathname("/reports-python"), "reports");
  assert.equal(tabFromPathname("/unknown-slug"), "overview");
});

test("getSlugForTab returns lowercase hyphenated clean slugs", () => {
  assert.equal(getSlugForTab("overview"), "/price-forecast");
  assert.equal(getSlugForTab("live"), "/live-feeds");
  assert.equal(getSlugForTab("watchlists"), "/watchlists");
  assert.equal(getSlugForTab("seasonality"), "/seasonality-matrix");
  assert.equal(getSlugForTab("arbitrage"), "/market-arbitrage");
  assert.equal(getSlugForTab("ledger"), "/data-ledger");
  assert.equal(getSlugForTab("reports"), "/reports-python");
});

test("normalizeCanonicalOrigin enforces HTTPS for non-localhost domains", () => {
  assert.equal(
    normalizeCanonicalOrigin("http://naijaprice.example.com/"),
    "https://naijaprice.example.com"
  );
  assert.equal(
    normalizeCanonicalOrigin("http://localhost:3000"),
    "http://localhost:3000"
  );
});

test("getRouteMeta provides distinct title, description, and H1 per view", () => {
  const wl = getRouteMeta("watchlists");
  assert.ok(wl.title.includes("Watchlists"));
  assert.ok(wl.description.length >= 100 && wl.description.length <= 165);
  assert.ok(wl.h1.length > 10);

  const ov = getRouteMeta("overview", "Rice (Local Ofada)", "Mile 12 Market, Lagos");
  assert.ok(ov.h1.includes("Rice (Local Ofada)"));
  assert.ok(ov.h1.includes("Mile 12 Market, Lagos"));
});
