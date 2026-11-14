import type { AnalysisResponse, CustomPriceRecord } from "../types/market";

export interface CsvParseResult {
  records: CustomPriceRecord[];
  errors: string[];
}

export function parseCustomPriceCsv(
  csvText: string,
  knownCommodities: { id: string; name: string; category: string; unit: string }[],
  knownMarkets: { id: string; name: string; state: string; region: string }[]
): CsvParseResult {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return { records: [], errors: ["CSV must include a header row and at least one data row."] };
  }

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const dateIdx = headers.indexOf("date");
  const priceIdx = headers.indexOf("price_ngn");
  const commIdIdx = headers.indexOf("commodity_id");
  const commNameIdx = headers.indexOf("commodity_name");
  const mktIdIdx = headers.indexOf("market_id");
  const mktNameIdx = headers.indexOf("market_name");

  if (dateIdx === -1 || priceIdx === -1) {
    return {
      records: [],
      errors: ["CSV header must contain at least 'date' (YYYY-MM-DD) and 'price_ngn' columns."],
    };
  }

  const records: CustomPriceRecord[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const dateVal = cols[dateIdx] ?? "";
    const priceVal = Number(cols[priceIdx]);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
      errors.push(`Row ${i + 1}: invalid date '${dateVal}' (expected YYYY-MM-DD).`);
      continue;
    }
    if (!Number.isFinite(priceVal) || priceVal <= 0) {
      errors.push(`Row ${i + 1}: invalid price_ngn '${cols[priceIdx] ?? ""}'.`);
      continue;
    }

    const rawCid = commIdIdx >= 0 ? cols[commIdIdx] : "";
    const rawCname = commNameIdx >= 0 ? cols[commNameIdx] : "";
    const matchedComm =
      knownCommodities.find((c) => c.id === rawCid) ??
      knownCommodities.find((c) => c.name.toLowerCase() === rawCname.toLowerCase()) ??
      knownCommodities[0];

    const rawMid = mktIdIdx >= 0 ? cols[mktIdIdx] : "";
    const rawMname = mktNameIdx >= 0 ? cols[mktNameIdx] : "";
    const matchedMkt =
      knownMarkets.find((m) => m.id === rawMid) ??
      knownMarkets.find((m) => m.name.toLowerCase() === rawMname.toLowerCase()) ??
      knownMarkets[0];

    if (!matchedComm || !matchedMkt) {
      errors.push(`Row ${i + 1}: unable to resolve commodity or market.`);
      continue;
    }

    records.push({
      date: dateVal,
      commodity_id: rawCid || matchedComm.id,
      commodity_name: rawCname || matchedComm.name,
      category: matchedComm.category,
      unit: matchedComm.unit,
      market_id: rawMid || matchedMkt.id,
      market_name: rawMname || matchedMkt.name,
      state: matchedMkt.state,
      region: matchedMkt.region,
      price_ngn: Math.round(priceVal),
    });
  }

  return { records, errors };
}

export function buildAnalysisReportCsv(analysis: AnalysisResponse): string {
  const header = [
    "record_type",
    "date",
    "commodity",
    "unit",
    "market",
    "price_or_forecast_ngn",
    "trend_ngn",
    "seasonal_factor",
    "lower95_ngn",
    "upper95_ngn",
  ].join(",");

  const histRows = analysis.history.map((h) =>
    [
      "observed",
      h.date,
      `"${analysis.meta.commodityName}"`,
      `"${analysis.meta.unit}"`,
      `"${analysis.meta.marketName}"`,
      h.price_ngn,
      h.trend_ngn ?? "",
      h.seasonal_factor,
      "",
      "",
    ].join(",")
  );

  const fcRows = analysis.forecast.map((f) =>
    [
      "forecast",
      f.date,
      `"${analysis.meta.commodityName}"`,
      `"${analysis.meta.unit}"`,
      `"${analysis.meta.marketName}"`,
      f.predicted_ngn,
      "",
      "",
      f.lower95_ngn,
      f.upper95_ngn,
    ].join(",")
  );

  return [header, ...histRows, ...fcRows].join("\n");
}
