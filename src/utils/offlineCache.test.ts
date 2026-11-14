import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildSwCacheKeyUrl,
  hashCachePayload,
  isCacheableApiRequest,
} from "./offlineCache.ts";

describe("offlineCache utilities", () => {
  it("computes deterministic 16-char hex hashes for request payloads", () => {
    const payload = JSON.stringify({
      commodityId: "rice_ofada",
      marketId: "mile12_lagos",
      forecastMonths: 6,
      modelType: "ridge_seasonal",
    });
    const h1 = hashCachePayload(payload);
    const h2 = hashCachePayload(payload);
    const h3 = hashCachePayload(payload.replace("rice_ofada", "beans_oloyin"));

    assert.equal(h1.length, 16);
    assert.equal(h1, h2);
    assert.notEqual(h1, h3);
  });

  it("constructs synthetic GET cache keys for POST analysis queries", () => {
    const key = buildSwCacheKeyUrl(
      "/api/analyze",
      '{"commodityId":"rice_ofada"}',
      "https://naijaprice-tracker.app"
    );
    assert.match(key, /^https:\/\/naijaprice-tracker\.app\/__sw_cache\/api\/analyze\?h=[0-9a-f]{16}$/);
  });

  it("caches read/analytics endpoints and excludes mutating endpoints", () => {
    assert.equal(isCacheableApiRequest("GET", "/api/meta"), true);
    assert.equal(isCacheableApiRequest("POST", "/api/analyze"), true);
    assert.equal(isCacheableApiRequest("POST", "/api/watchlists/list"), true);
    assert.equal(isCacheableApiRequest("POST", "/api/alerts/evaluate"), true);
    assert.equal(isCacheableApiRequest("POST", "/api/watchlists"), false);
    assert.equal(isCacheableApiRequest("DELETE", "/api/watchlists/123"), false);
    assert.equal(isCacheableApiRequest("POST", "/api/export/pdf"), false);
  });
});
