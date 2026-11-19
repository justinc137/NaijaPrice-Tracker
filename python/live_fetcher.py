"""
NaijaPrice Tracker - Real-Time External Market Data Fetcher
Pure Python 3.10 stdlib module (urllib.request + csv + json) fetching live data from:
  1. HDX / World Food Programme (WFP) Nigeria Food Prices Dataset (via CKAN API + CSV)
  2. ExchangeRate-API Open Access Spot FX (USD / NGN / GBP / EUR)
  3. World Bank Open Data API (Nigeria Annual CPI Inflation FP.CPI.TOTL.ZG)
"""

import csv
import io
import json
import re
import statistics
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone

CKAN_WFP_PACKAGE_URL = (
    "https://data.humdata.org/api/3/action/package_show?id=wfp-food-prices-for-nigeria"
)
FX_API_URL = "https://open.er-api.com/v6/latest/USD"
WORLDBANK_CPI_URL = (
    "https://api.worldbank.org/v2/country/NGA/indicator/FP.CPI.TOTL.ZG?format=json&per_page=8"
)
HTTP_HEADERS = {
    "User-Agent": "NaijaPriceTracker/1.0 (https://naijaprice-tracker.app)",
    "Accept": "application/json, text/csv;q=0.9, */*;q=0.8",
}

COMMODITY_CATALOG = {
    "rice_ofada": {
        "name": "Rice (Local Ofada)",
        "category": "Grains & Cereals",
        "unit": "50kg bag",
        "target_qty": 50.0,
        "target_base": "kg",
    },
    "garri_white": {
        "name": "Garri (White)",
        "category": "Tubers & Processed",
        "unit": "50kg bag",
        "target_qty": 50.0,
        "target_base": "kg",
    },
    "beans_oloyin": {
        "name": "Beans (Oloyin Brown)",
        "category": "Legumes",
        "unit": "100kg bag",
        "target_qty": 100.0,
        "target_base": "kg",
    },
    "maize_yellow": {
        "name": "Maize (Yellow)",
        "category": "Grains & Cereals",
        "unit": "100kg bag",
        "target_qty": 100.0,
        "target_base": "kg",
    },
    "tomatoes_basket": {
        "name": "Tomatoes (Fresh)",
        "category": "Perishables",
        "unit": "45kg basket",
        "target_qty": 45.0,
        "target_base": "kg",
    },
    "yam_tuber": {
        "name": "Yam (Puna / White)",
        "category": "Tubers & Processed",
        "unit": "100kg bundle",
        "target_qty": 100.0,
        "target_base": "kg",
    },
    "palm_oil": {
        "name": "Palm Oil",
        "category": "Oils & Fats",
        "unit": "25L jerrycan",
        "target_qty": 25.0,
        "target_base": "l",
    },
    "onions_sokoto": {
        "name": "Onions (Red Sokoto)",
        "category": "Perishables",
        "unit": "100kg bag",
        "target_qty": 100.0,
        "target_base": "kg",
    },
}

try:
    from generate_dataset import MARKETS as _DATASET_MARKETS
except ImportError:
    _DATASET_MARKETS = [
        {"id": "mile12_lagos", "name": "Mile 12 Market, Lagos", "state": "Lagos", "region": "South-West"},
        {"id": "bodija_ibadan", "name": "Bodija Market, Ibadan", "state": "Oyo", "region": "South-West"},
        {"id": "lafenwa_abeokuta", "name": "Lafenwa Market, Abeokuta", "state": "Ogun", "region": "South-West"},
        {"id": "ariaria_aba", "name": "Relief Market, Aba", "state": "Abia", "region": "South-East"},
        {"id": "ochanja_onitsha", "name": "Ochanja Market, Onitsha", "state": "Anambra", "region": "South-East"},
        {"id": "ogbete_enugu", "name": "Ogbete Main Market, Enugu", "state": "Enugu", "region": "South-East"},
        {"id": "oilmill_portharcourt", "name": "Oil Mill Market, Port Harcourt", "state": "Rivers", "region": "South-South"},
        {"id": "oba_benin", "name": "Oba Market, Benin City", "state": "Edo", "region": "South-South"},
        {"id": "watt_calabar", "name": "Watt Market, Calabar", "state": "Cross River", "region": "South-South"},
        {"id": "wuse_abuja", "name": "Wuse Market, Abuja", "state": "FCT Abuja", "region": "North-Central"},
        {"id": "terminus_jos", "name": "Terminus Market, Jos", "state": "Plateau", "region": "North-Central"},
        {"id": "zakibiam_benue", "name": "Zaki Biam Yam Market, Benue", "state": "Benue", "region": "North-Central"},
        {"id": "dawanau_kano", "name": "Dawanau Market, Kano", "state": "Kano", "region": "North-West"},
        {"id": "kawo_kaduna", "name": "Kawo Market, Kaduna", "state": "Kaduna", "region": "North-West"},
        {"id": "sokoto_central", "name": "Sokoto Central Market, Sokoto", "state": "Sokoto", "region": "North-West"},
        {"id": "monday_maiduguri", "name": "Monday Market, Maiduguri", "state": "Borno", "region": "North-East"},
        {"id": "gombe_main", "name": "Gombe Main Market, Gombe", "state": "Gombe", "region": "North-East"},
        {"id": "jimeta_yola", "name": "Jimeta Modern Market, Yola", "state": "Adamawa", "region": "North-East"},
    ]

MARKET_CATALOG = {
    m["id"]: {
        "id": m["id"],
        "name": m["name"],
        "state": m["state"],
        "region": m["region"],
    }
    for m in _DATASET_MARKETS
}

_UNIT_RE = re.compile(r"^\s*([0-9]+(?:\.[0-9]+)?)\s*([a-zA-Z]+)\s*$")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def parse_unit_quantity(unit_str: str) -> tuple[float, str]:
    """Parse WFP unit string like '2.7 KG', 'KG', '500 G', 'L' into (amount, base_unit)."""
    cleaned = (unit_str or "").strip()
    upper = cleaned.upper()
    if upper in ("KG", "KGS", "KILOGRAM", "KILOGRAMS"):
        return 1.0, "kg"
    if upper in ("L", "LT", "LTR", "LITER", "LITRE", "LITERS", "LITRES"):
        return 1.0, "l"
    if upper in ("G", "GM", "GRAM", "GRAMS"):
        return 0.001, "kg"

    match = _UNIT_RE.match(cleaned)
    if not match:
        return 1.0, "unit"

    val = float(match.group(1))
    u = match.group(2).upper()
    if u in ("KG", "KGS"):
        return val, "kg"
    if u in ("G", "GM", "GRAM", "GRAMS"):
        return val / 1000.0, "kg"
    if u in ("L", "LT", "LTR"):
        return val, "l"
    if u in ("ML",):
        return val / 1000.0, "l"
    return val, u.lower()


def map_wfp_commodity(commodity_name: str) -> str | None:
    """Map WFP Nigeria commodity label to NaijaPrice Tracker internal commodity_id."""
    c = (commodity_name or "").strip().lower()
    if not c:
        return None
    if c == "rice (local)" or ("rice" in c and "local" in c):
        return "rice_ofada"
    if c in ("beans (red)", "beans (white)") or "cowpeas" in c:
        return "beans_oloyin"
    if c in ("maize flour", "maize", "maize (yellow)", "maize (white)"):
        return "maize_yellow"
    if c == "tomatoes" or c.startswith("tomato"):
        return "tomatoes_basket"
    if c == "yam" or c.startswith("yam "):
        return "yam_tuber"
    if c == "oil (palm)" or "palm oil" in c:
        return "palm_oil"
    if c == "onions" or c.startswith("onion"):
        return "onions_sokoto"
    if "gari" in c or "garri" in c:
        return "garri_white"
    return None


def normalize_to_wholesale_ngn(
    price_ngn: float, unit_str: str, mapped_commodity_id: str | None
) -> tuple[float | None, float | None]:
    """
    Convert a WFP retail quote into NaijaPrice Tracker's wholesale unit equivalent.
    Returns (normalized_ngn, scale_factor) or (None, None) if unmapped/incompatible unit.
    """
    if not mapped_commodity_id or mapped_commodity_id not in COMMODITY_CATALOG:
        return None, None
    spec = COMMODITY_CATALOG[mapped_commodity_id]
    qty, base = parse_unit_quantity(unit_str)
    if qty <= 0 or base != spec["target_base"]:
        return None, None
    factor = spec["target_qty"] / qty
    normalized = round((price_ngn * factor) / 50.0) * 50.0
    return float(max(50.0, normalized)), round(factor, 3)


def _http_get_text(url: str, timeout: int = 25) -> str:
    req = urllib.request.Request(url, headers=HTTP_HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
        return raw.decode("utf-8", errors="replace")


def _http_get_json(url: str, timeout: int = 15, provider_label: str = "external provider"):
    raw = _http_get_text(url, timeout=timeout)
    stripped = raw.lstrip()
    if not stripped or stripped.startswith("<"):
        raise ValueError(f"{provider_label} returned an HTML/non-JSON response.")
    return json.loads(stripped)


def fetch_fx_rates(timeout: int = 12) -> dict:
    """Fetch live USD/NGN/GBP/EUR exchange rates from ExchangeRate-API."""
    data = _http_get_json(FX_API_URL, timeout=timeout, provider_label="ExchangeRate-API")
    if data.get("result") != "success":
        raise ValueError("FX provider returned unsuccessful status.")
    rates = data.get("rates") or {}
    usd_ngn = float(rates.get("NGN") or 0)
    gbp_per_usd = float(rates.get("GBP") or 0)
    eur_per_usd = float(rates.get("EUR") or 0)
    if usd_ngn <= 0:
        raise ValueError("USD/NGN rate missing from FX response.")
    return {
        "usdNgn": round(usd_ngn, 2),
        "gbpNgn": round(usd_ngn / gbp_per_usd, 2) if gbp_per_usd > 0 else None,
        "eurNgn": round(usd_ngn / eur_per_usd, 2) if eur_per_usd > 0 else None,
        "updatedAtUtc": data.get("time_last_update_utc") or "",
        "provider": "ExchangeRate-API (open.er-api.com)",
    }


def fetch_worldbank_cpi(timeout: int = 12) -> dict:
    """Fetch Nigeria annual consumer price inflation (%) from World Bank Open Data."""
    payload = _http_get_json(WORLDBANK_CPI_URL, timeout=timeout, provider_label="World Bank API")
    if not isinstance(payload, list) or len(payload) < 2 or not isinstance(payload[1], list):
        raise ValueError("Unexpected World Bank CPI payload structure.")
    for entry in payload[1]:
        val = entry.get("value")
        if val is not None:
            return {
                "year": str(entry.get("date") or ""),
                "cpiPct": round(float(val), 2),
                "indicator": "FP.CPI.TOTL.ZG",
                "provider": "World Bank Open Data (NGA)",
            }
    raise ValueError("No recent non-null Nigeria CPI value returned by World Bank API.")


def resolve_wfp_csv_resource(timeout: int = 15) -> dict:
    """Resolve the live WFP Nigeria Food Prices CSV resource URL from HDX CKAN API."""
    pkg = _http_get_json(CKAN_WFP_PACKAGE_URL, timeout=timeout, provider_label="HDX CKAN API")
    if not pkg.get("success"):
        raise ValueError("HDX CKAN API returned unsuccessful response.")
    result = pkg.get("result") or {}
    resources = result.get("resources") or []
    csv_res = next(
        (r for r in resources if str(r.get("format", "")).upper() == "CSV" and r.get("url")),
        None,
    )
    if not csv_res:
        raise ValueError("No CSV resource found in HDX WFP Nigeria Food Prices package.")
    return {
        "csvUrl": csv_res["url"],
        "lastModified": csv_res.get("last_modified") or result.get("metadata_modified") or "",
        "datasetDate": result.get("dataset_date") or "",
        "datasetTitle": result.get("title") or "Nigeria - Food Prices",
        "organization": (result.get("organization") or {}).get("title") or "WFP",
    }


def parse_wfp_csv_rows(
    csv_text: str, months_back: int = 3, fx_usd_ngn: float | None = None
) -> list[dict]:
    """
    Parse WFP Food Prices CSV text into cleaned recent Nigerian market quote records.
    Skips HXL tag rows ('#...') and filters to the most recent `months_back` calendar months.
    """
    reader = csv.DictReader(io.StringIO(csv_text))
    valid_rows = []
    for row in reader:
        d = str(row.get("date") or "").strip()
        if not d or d.startswith("#") or not _DATE_RE.match(d):
            continue
        currency = str(row.get("currency") or "").strip().upper()
        if currency != "NGN":
            continue
        try:
            price = float(row.get("price") or 0)
        except (TypeError, ValueError):
            continue
        if price <= 0:
            continue

        try:
            usd_raw = float(row.get("usdprice") or 0)
        except (TypeError, ValueError):
            usd_raw = 0.0

        if usd_raw <= 0 and fx_usd_ngn and fx_usd_ngn > 0:
            usd_val = round(price / fx_usd_ngn, 2)
        elif fx_usd_ngn and fx_usd_ngn > 0:
            usd_val = round(price / fx_usd_ngn, 2)
        else:
            usd_val = round(usd_raw, 2)

        commodity = str(row.get("commodity") or "").strip()
        unit = str(row.get("unit") or "").strip()
        mapped_id = map_wfp_commodity(commodity)
        norm_ngn, scale_factor = normalize_to_wholesale_ngn(price, unit, mapped_id)
        mapped_spec = COMMODITY_CATALOG.get(mapped_id) if mapped_id else None

        valid_rows.append({
            "date": d,
            "state": str(row.get("admin1") or "Nigeria").strip(),
            "lga": str(row.get("admin2") or "").strip(),
            "market": str(row.get("market") or "").strip(),
            "category": str(row.get("category") or "").strip(),
            "commodity": commodity,
            "mappedCommodityId": mapped_id,
            "mappedCommodityName": mapped_spec["name"] if mapped_spec else None,
            "wholesaleUnit": mapped_spec["unit"] if mapped_spec else None,
            "unit": unit,
            "priceType": str(row.get("pricetype") or "Retail").strip(),
            "priceNgn": round(price, 2),
            "usdPrice": usd_val,
            "normalizedWholesaleNgn": norm_ngn,
            "unitScaleFactor": scale_factor,
        })

    if not valid_rows:
        return []

    distinct_months = sorted({r["date"][:7] for r in valid_rows})
    keep_months = set(distinct_months[-max(1, months_back):])
    recent = [r for r in valid_rows if r["date"][:7] in keep_months]
    recent.sort(key=lambda r: (r["date"], 0 if r["mappedCommodityId"] else 1, r["commodity"], r["market"]), reverse=True)
    # Re-sort cleanly: date desc, mapped first, commodity asc, market asc
    recent.sort(
        key=lambda r: (
            -int(r["date"].replace("-", "")),
            0 if r["mappedCommodityId"] else 1,
            r["commodity"],
            r["market"],
        )
    )
    return recent


def build_live_feed_payload(
    wfp_rows: list[dict],
    fx_data: dict | None = None,
    cpi_data: dict | None = None,
    resource_meta: dict | None = None,
    fetched_at: str | None = None,
    quote_limit: int = 180,
) -> dict:
    """Aggregate recent WFP Nigeria rows + macro FX/CPI into a UI & sync ready snapshot."""
    ts = fetched_at or datetime.now(timezone.utc).isoformat()
    latest_date = max((r["date"] for r in wfp_rows), default=None)
    states_covered = sorted({r["state"] for r in wfp_rows if r["state"]})
    markets_covered = sorted({r["market"] for r in wfp_rows if r["market"]})

    # Group by WFP commodity name for summary aggregation (prioritize latest month)
    latest_month = latest_date[:7] if latest_date else None
    summary_source = (
        [r for r in wfp_rows if r["date"][:7] == latest_month]
        if latest_month
        else list(wfp_rows)
    )
    by_commodity = defaultdict(list)
    for r in summary_source:
        by_commodity[r["commodity"]].append(r)

    # Deduplicate mappedCommodityId keeping primary local staple variant (e.g. Beans (red) / (white) -> keep whichever has most quotes)
    summaries = []
    for comm_name, items in by_commodity.items():
        # Filter to the modal unit for this commodity so averages are unit-consistent
        unit_counts = defaultdict(int)
        for it in items:
            unit_counts[it["unit"]] += 1
        primary_unit = max(unit_counts.items(), key=lambda kv: kv[1])[0]
        unit_items = [it for it in items if it["unit"] == primary_unit]

        mapped_id = unit_items[0]["mappedCommodityId"]
        mapped_spec = COMMODITY_CATALOG.get(mapped_id) if mapped_id else None
        avg_retail = statistics.mean(it["priceNgn"] for it in unit_items)
        min_retail = min(it["priceNgn"] for it in unit_items)
        max_retail = max(it["priceNgn"] for it in unit_items)
        avg_usd = statistics.mean(it["usdPrice"] for it in unit_items)
        norm_vals = [it["normalizedWholesaleNgn"] for it in unit_items if it["normalizedWholesaleNgn"] is not None]
        avg_norm = round(statistics.mean(norm_vals) / 50.0) * 50.0 if norm_vals else None
        scale_factor = unit_items[0]["unitScaleFactor"]

        summaries.append({
            "commodity": comm_name,
            "category": unit_items[0]["category"],
            "mappedCommodityId": mapped_id,
            "mappedCommodityName": mapped_spec["name"] if mapped_spec else None,
            "wholesaleUnit": mapped_spec["unit"] if mapped_spec else None,
            "latestDate": max(it["date"] for it in unit_items),
            "unit": primary_unit,
            "avgRetailNgn": round(avg_retail, 0),
            "minRetailNgn": round(min_retail, 0),
            "maxRetailNgn": round(max_retail, 0),
            "avgUsdPrice": round(avg_usd, 2),
            "normalizedWholesaleNgn": float(avg_norm) if avg_norm is not None else None,
            "unitScaleFactor": scale_factor,
            "quoteCount": len(unit_items),
            "states": sorted({it["state"] for it in unit_items}),
        })

    # Sort summaries: mapped commodities first, then major staples/fuel by quoteCount desc
    summaries.sort(
        key=lambda s: (
            0 if s["mappedCommodityId"] else 1,
            -s["quoteCount"],
            s["commodity"],
        )
    )

    # Deduplicate quotes by (date, market, commodity) and cap cleanly
    seen_q = set()
    quotes = []
    for r in wfp_rows:
        qkey = (r["date"], r["market"], r["commodity"])
        if qkey in seen_q:
            continue
        seen_q.add(qkey)
        quotes.append(r)
        if len(quotes) >= quote_limit:
            break

    return {
        "fetchedAt": ts,
        "latestSurveyDate": latest_date,
        "totalRecentQuotes": len(wfp_rows),
        "statesCovered": states_covered,
        "marketsCoveredCount": len(markets_covered),
        "fx": fx_data,
        "cpi": cpi_data,
        "sourceMeta": resource_meta
        or {
            "datasetTitle": "Nigeria - Food Prices",
            "organization": "WFP",
            "lastModified": "",
            "csvUrl": "",
        },
        "commoditySummaries": summaries,
        "quotes": quotes,
    }


def fetch_all_live_feeds(months_back: int = 3) -> dict:
    """
    Execute live HTTP fetches against ExchangeRate-API, World Bank CPI, and HDX/WFP Nigeria.
    Fails fast only if all feeds fail; individual optional macro feeds degrade cleanly to None.
    """
    fx_data = None
    cpi_data = None
    warnings = []

    try:
        fx_data = fetch_fx_rates()
    except Exception as exc:
        warnings.append(f"FX feed unavailable: {exc}")

    try:
        cpi_data = fetch_worldbank_cpi()
    except Exception as exc:
        warnings.append(f"World Bank CPI feed unavailable: {exc}")

    resource_meta = resolve_wfp_csv_resource()
    csv_text = _http_get_text(resource_meta["csvUrl"], timeout=35)
    fx_rate = fx_data["usdNgn"] if fx_data else None
    wfp_rows = parse_wfp_csv_rows(csv_text, months_back=months_back, fx_usd_ngn=fx_rate)
    if not wfp_rows:
        raise ValueError("WFP Nigeria CSV parsed zero valid recent NGN price records.")

    payload = build_live_feed_payload(
        wfp_rows=wfp_rows,
        fx_data=fx_data,
        cpi_data=cpi_data,
        resource_meta=resource_meta,
    )
    if warnings:
        payload["warnings"] = warnings
    return payload


def build_sync_observations(
    snapshot: dict,
    target_market_id: str = "mile12_lagos",
    commodity_ids: list[str] | None = None,
) -> list[dict]:
    """
    Convert mapped live WFP commodity summaries into NaijaPrice `custom_observations` records
    dated to YYYY-MM-01 for the selected target Nigerian market.
    """
    if not snapshot:
        raise ValueError("No live market snapshot available to sync.")
    market = MARKET_CATALOG.get(target_market_id)
    if not market:
        raise ValueError(f"Unknown target market '{target_market_id}'.")

    allowed = set(commodity_ids) if commodity_ids else None
    summaries = snapshot.get("commoditySummaries") or []
    quotes = snapshot.get("quotes") or []
    target_state_norm = market["state"].replace("FCT ", "").strip().lower()

    # Collect state-specific quotes from the latest survey month when available for higher local precision
    latest_month = str(snapshot.get("latestSurveyDate") or "")[:7]
    state_quotes_by_cid = defaultdict(list)
    for q in quotes:
        cid = q.get("mappedCommodityId")
        norm_price = q.get("normalizedWholesaleNgn")
        if not cid or norm_price is None or norm_price <= 0:
            continue
        if allowed is not None and cid not in allowed:
            continue
        q_state = str(q.get("state") or "").strip().lower()
        q_date = str(q.get("date") or "")
        if latest_month and not q_date.startswith(latest_month):
            continue
        if q_state == target_state_norm or target_state_norm in q_state:
            state_quotes_by_cid[cid].append(float(norm_price))

    # Pick highest-quote summary per mappedCommodityId (e.g. Beans (red) vs Beans (white))
    best_by_cid = {}
    for s in summaries:
        cid = s.get("mappedCommodityId")
        norm_price = s.get("normalizedWholesaleNgn")
        if not cid or norm_price is None or norm_price <= 0:
            continue
        if allowed is not None and cid not in allowed:
            continue
        prev = best_by_cid.get(cid)
        if prev is None or s.get("quoteCount", 0) > prev.get("quoteCount", 0):
            best_by_cid[cid] = s

    observations = []
    for cid, s in best_by_cid.items():
        spec = COMMODITY_CATALOG[cid]
        survey_date = str(s.get("latestDate") or snapshot.get("latestSurveyDate") or "")[:10]
        if len(survey_date) < 7:
            continue
        month_start = f"{survey_date[:7]}-01"
        state_vals = state_quotes_by_cid.get(cid)
        if state_vals:
            raw_ngn = statistics.mean(state_vals)
            price_ngn = float(max(50.0, round(raw_ngn / 50.0) * 50.0))
        else:
            price_ngn = float(round(s["normalizedWholesaleNgn"]))
        observations.append({
            "date": month_start,
            "commodity_id": cid,
            "commodity_name": spec["name"],
            "category": spec["category"],
            "unit": spec["unit"],
            "market_id": market["id"],
            "market_name": market["name"],
            "state": market["state"],
            "region": market["region"],
            "price_ngn": price_ngn,
        })

    observations.sort(key=lambda r: r["commodity_id"])
    return observations
