import assert from "node:assert/strict";
import test from "node:test";
import { parseJsonResponse } from "./safeFetchJson.ts";

test("parseJsonResponse parses valid JSON payloads", async () => {
  const res = new Response(JSON.stringify({ ok: true, count: 42 }), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
  const data = await parseJsonResponse<{ ok: boolean; count: number }>(res, "testing");
  assert.equal(data.ok, true);
  assert.equal(data.count, 42);
});

test("parseJsonResponse rejects HTML DOCTYPE pages with clean error instead of SyntaxError", async () => {
  const html = "<!DOCTYPE html><html><body>502 Bad Gateway</body></html>";
  const res = new Response(html, {
    status: 502,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
  await assert.rejects(
    () => parseJsonResponse(res, "fetching live market data"),
    /unexpected HTML page \(HTTP 502\) while fetching live market data/
  );
});

test("parseJsonResponse rejects HTTP 200 HTML SPA fallback cleanly", async () => {
  const html = "<!doctype html><html><head></head><body><div id='root'></div></body></html>";
  const res = new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
  await assert.rejects(
    () => parseJsonResponse(res, "loading analysis"),
    /unexpected HTML page \(HTTP 200\) while loading analysis/
  );
});

test("parseJsonResponse handles empty body cleanly", async () => {
  const res = new Response("", { status: 500 });
  await assert.rejects(
    () => parseJsonResponse(res, "loading metadata"),
    /Request failed \(500\) while loading metadata/
  );
});
