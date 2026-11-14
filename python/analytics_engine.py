"""
NaijaPrice Tracker - Python Analytics & Forecasting Engine
Pure Python 3.10 implementation of:
  - CSV time-series ingestion & normalization
  - Centered 12-month moving-average multiplicative seasonal decomposition
  - Ridge Linear + Seasonal Regression (Gaussian elimination solver)
  - Polynomial + Fourier Harmonic Regression
  - Multiplicative Holt-Winters Exponential Smoothing
  - 6-Month Holdout Backtesting (MAE, RMSE, MAPE)
  - Cross-Market Nigerian Arbitrage Spread Analysis
"""

import base64
import csv
import json
import math
import os
import statistics
import sys
from collections import defaultdict
from datetime import date

import pdf_report
import watchlist_store

DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "nigerian_commodity_prices.csv")
MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def load_dataset(custom_records=None):
    rows = []
    if os.path.exists(DATA_PATH):
        with open(DATA_PATH, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for r in reader:
                rows.append({
                    "date": r["date"],
                    "year": int(r["year"]),
                    "month": int(r["month"]),
                    "commodity_id": r["commodity_id"],
                    "commodity_name": r["commodity_name"],
                    "category": r["category"],
                    "unit": r["unit"],
                    "market_id": r["market_id"],
                    "market_name": r["market_name"],
                    "state": r["state"],
                    "region": r["region"],
                    "price_ngn": float(r["price_ngn"]),
                    "is_custom": False,
                })

    if custom_records:
        # Merge or override matching (date, commodity_id, market_id)
        index = {(r["date"], r["commodity_id"], r["market_id"]): i for i, r in enumerate(rows)}
        for cr in custom_records:
            d = str(cr["date"])[:10]
            parts = d.split("-")
            yr = int(parts[0])
            mo = int(parts[1])
            key = (d, cr["commodity_id"], cr["market_id"])
            entry = {
                "date": d,
                "year": yr,
                "month": mo,
                "commodity_id": cr["commodity_id"],
                "commodity_name": cr["commodity_name"],
                "category": cr.get("category", "Custom"),
                "unit": cr.get("unit", "bag"),
                "market_id": cr["market_id"],
                "market_name": cr["market_name"],
                "state": cr.get("state", "Nigeria"),
                "region": cr.get("region", "Custom"),
                "price_ngn": float(cr["price_ngn"]),
                "is_custom": True,
            }
            if key in index:
                rows[index[key]] = entry
            else:
                index[key] = len(rows)
                rows.append(entry)

    rows.sort(key=lambda r: (r["date"], r["commodity_id"], r["market_id"]))
    return rows


def add_months(iso_date: str, offset: int) -> str:
    yr, mo, _ = map(int, iso_date.split("-"))
    total = (yr * 12 + (mo - 1)) + offset
    new_yr = total // 12
    new_mo = (total % 12) + 1
    return date(new_yr, new_mo, 1).isoformat()


def solve_linear_system(A, b):
    """Gaussian elimination with partial pivoting for small dense matrices."""
    n = len(b)
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for col in range(n):
        pivot_row = max(range(col, n), key=lambda r: abs(M[r][col]))
        M[col], M[pivot_row] = M[pivot_row], M[col]
        pivot = M[col][col]
        if abs(pivot) < 1e-12:
            pivot = 1e-12
        for j in range(col, n + 1):
            M[col][j] /= pivot
        for r in range(n):
            if r != col:
                factor = M[r][col]
                for j in range(col, n + 1):
                    M[r][j] -= factor * M[col][j]
    return [M[i][n] for i in range(n)]


def fit_ridge_regression(X, y, alpha=1.0):
    """Fits Ridge Regression (L2 penalty excluding intercept at index 0)."""
    n_samples = len(X)
    n_features = len(X[0])
    XtX = [[0.0] * n_features for _ in range(n_features)]
    Xty = [0.0] * n_features

    for i in range(n_samples):
        xi = X[i]
        yi = y[i]
        for j in range(n_features):
            Xty[j] += xi[j] * yi
            for k in range(n_features):
                XtX[j][k] += xi[j] * xi[k]

    for j in range(1, n_features):
        XtX[j][j] += alpha

    return solve_linear_system(XtX, Xty)


def predict_linear(X, weights):
    return [sum(xi[j] * weights[j] for j in range(len(weights))) for xi in X]


def features_ridge_seasonal(t_vals, months, total_len):
    rows = []
    scale = max(total_len, 1)
    for t, m in zip(t_vals, months):
        feat = [1.0, t / scale]
        for target_m in range(2, 13):
            feat.append(1.0 if m == target_m else 0.0)
        rows.append(feat)
    return rows


def features_poly_fourier(t_vals, months, total_len):
    rows = []
    scale = max(total_len, 1)
    for t, m in zip(t_vals, months):
        ts = t / scale
        ang1 = 2.0 * math.pi * m / 12.0
        ang2 = 4.0 * math.pi * m / 12.0
        rows.append([
            1.0,
            ts,
            ts * ts,
            math.sin(ang1),
            math.cos(ang1),
            math.sin(ang2),
            math.cos(ang2),
        ])
    return rows


def fit_predict_holt_winters(prices, horizon):
    """Multiplicative Holt-Winters with 12-month seasonality."""
    n = len(prices)
    season_len = 12
    if n < 24:
        # Fallback to damped trend if series too short
        avg = statistics.mean(prices)
        return [avg] * n, [avg] * horizon

    alpha, beta, gamma = 0.35, 0.12, 0.28
    level = statistics.mean(prices[:season_len])
    second_avg = statistics.mean(prices[season_len : 2 * season_len])
    trend = (second_avg - level) / season_len
    seasonals = [prices[i] / level for i in range(season_len)]

    fitted = []
    for i in range(n):
        s_idx = i % season_len
        pred = (level + trend) * seasonals[s_idx]
        fitted.append(pred)
        val = prices[i]
        last_level = level
        level = alpha * (val / max(seasonals[s_idx], 1e-6)) + (1 - alpha) * (level + trend)
        trend = beta * (level - last_level) + (1 - beta) * trend
        seasonals[s_idx] = gamma * (val / max(level, 1e-6)) + (1 - gamma) * seasonals[s_idx]

    forecasts = []
    for h in range(1, horizon + 1):
        s_idx = (n + h - 1) % season_len
        forecasts.append((level + h * trend) * seasonals[s_idx])

    return fitted, forecasts


def run_forecast_model(series, horizon, model_type):
    n = len(series)
    prices = [r["price_ngn"] for r in series]
    months = [r["month"] for r in series]
    t_vals = list(range(n))

    last_date = series[-1]["date"]
    future_dates = [add_months(last_date, h) for h in range(1, horizon + 1)]
    future_months = [int(d.split("-")[1]) for d in future_dates]
    future_t = list(range(n, n + horizon))

    if model_type == "holt_winters":
        fitted, future_preds = fit_predict_holt_winters(prices, horizon)
    else:
        y_log = [math.log(max(p, 1.0)) for p in prices]
        if model_type == "poly_seasonal":
            X_train = features_poly_fourier(t_vals, months, n)
            X_future = features_poly_fourier(future_t, future_months, n)
            weights = fit_ridge_regression(X_train, y_log, alpha=0.35)
        else:
            # Default: ridge_seasonal
            X_train = features_ridge_seasonal(t_vals, months, n)
            X_future = features_ridge_seasonal(future_t, future_months, n)
            weights = fit_ridge_regression(X_train, y_log, alpha=0.25)

        fitted = [math.exp(v) for v in predict_linear(X_train, weights)]
        future_preds = [math.exp(v) for v in predict_linear(X_future, weights)]

    # Compute residual standard error in log space for realistic multiplicative CI
    log_residuals = [
        math.log(max(p, 1.0)) - math.log(max(f, 1.0))
        for p, f in zip(prices, fitted)
    ]
    sigma = statistics.pstdev(log_residuals) if len(log_residuals) > 1 else 0.05
    sigma = max(sigma, 0.02)

    forecast_points = []
    for h, (d, pred) in enumerate(zip(future_dates, future_preds), start=1):
        band = 1.96 * sigma * math.sqrt(1.0 + h / 10.0)
        forecast_points.append({
            "date": d,
            "month": int(d.split("-")[1]),
            "predicted_ngn": round(pred, 0),
            "lower95_ngn": round(pred * math.exp(-band), 0),
            "upper95_ngn": round(pred * math.exp(band), 0),
        })

    # Holdout Backtest on last 6 months
    holdout = min(6, max(3, n // 5))
    backtest = {"mae": 0.0, "rmse": 0.0, "mape": 0.0, "samples": holdout}
    if n > holdout + 12:
        train_slice = series[:-holdout]
        test_slice = series[-holdout:]
        tr_prices = [r["price_ngn"] for r in train_slice]
        tr_months = [r["month"] for r in train_slice]
        tr_t = list(range(len(train_slice)))
        te_months = [r["month"] for r in test_slice]
        te_t = list(range(len(train_slice), n))

        if model_type == "holt_winters":
            _, te_preds = fit_predict_holt_winters(tr_prices, holdout)
        else:
            tr_y = [math.log(max(p, 1.0)) for p in tr_prices]
            if model_type == "poly_seasonal":
                w_bt = fit_ridge_regression(features_poly_fourier(tr_t, tr_months, len(train_slice)), tr_y, alpha=0.35)
                te_preds = [math.exp(v) for v in predict_linear(features_poly_fourier(te_t, te_months, len(train_slice)), w_bt)]
            else:
                w_bt = fit_ridge_regression(features_ridge_seasonal(tr_t, tr_months, len(train_slice)), tr_y, alpha=0.25)
                te_preds = [math.exp(v) for v in predict_linear(features_ridge_seasonal(te_t, te_months, len(train_slice)), w_bt)]

        actuals = [r["price_ngn"] for r in test_slice]
        abs_errs = [abs(a - p) for a, p in zip(actuals, te_preds)]
        sq_errs = [(a - p) ** 2 for a, p in zip(actuals, te_preds)]
        pct_errs = [abs(a - p) / max(a, 1.0) * 100.0 for a, p in zip(actuals, te_preds)]
        backtest = {
            "mae": round(statistics.mean(abs_errs), 0),
            "rmse": round(math.sqrt(statistics.mean(sq_errs)), 0),
            "mape": round(statistics.mean(pct_errs), 2),
            "samples": holdout,
        }

    return fitted, forecast_points, backtest


def seasonal_decomposition(series):
    """Centered 12-month moving average multiplicative decomposition."""
    n = len(series)
    prices = [r["price_ngn"] for r in series]
    months = [r["month"] for r in series]

    # 2x12 centered moving average
    cma = [None] * n
    if n >= 13:
        ma12 = [None] * n
        for i in range(5, n - 6):
            # 12 points: i-5 to i+6
            ma12[i] = sum(prices[i - 5 : i + 7]) / 12.0
        for i in range(6, n - 6):
            if ma12[i - 1] is not None and ma12[i] is not None:
                cma[i] = (ma12[i - 1] + ma12[i]) / 2.0

    # Fallback linear trend for edges so chart trendline is continuous
    t_vals = list(range(n))
    mean_t = statistics.mean(t_vals)
    mean_p = statistics.mean(prices)
    denom = sum((t - mean_t) ** 2 for t in t_vals) or 1.0
    slope = sum((t - mean_t) * (p - mean_p) for t, p in zip(t_vals, prices)) / denom
    intercept = mean_p - slope * mean_t

    month_ratios = defaultdict(list)
    for i in range(n):
        tr = cma[i] if cma[i] is not None else (intercept + slope * i)
        if tr > 0:
            month_ratios[months[i]].append(prices[i] / tr)

    raw_indices = {}
    for m in range(1, 13):
        vals = month_ratios.get(m, [1.0])
        raw_indices[m] = statistics.mean(vals)

    mean_idx = statistics.mean(raw_indices.values()) or 1.0
    norm_indices = {m: raw_indices[m] / mean_idx for m in range(1, 13)}

    seasonal_profile = []
    for m in range(1, 13):
        idx = norm_indices[m]
        pct_dev = (idx - 1.0) * 100.0
        phase = "Lean Peak" if pct_dev >= 6.0 else ("Harvest Glut" if pct_dev <= -6.0 else "Neutral")
        seasonal_profile.append({
            "month": m,
            "monthName": MONTH_NAMES[m - 1],
            "index": round(idx, 4),
            "deviationPct": round(pct_dev, 2),
            "phase": phase,
        })

    # Decompose full series
    decomposed = []
    detrended_vals = []
    residual_vals = []
    for i, r in enumerate(series):
        tr = cma[i]
        s_idx = norm_indices[r["month"]]
        if tr is not None and tr > 0:
            detrended = r["price_ngn"] / tr
            resid = r["price_ngn"] / (tr * s_idx)
            detrended_vals.append(detrended)
            residual_vals.append(resid)
        else:
            resid = None
        decomposed.append({
            "date": r["date"],
            "year": r["year"],
            "month": r["month"],
            "price_ngn": round(r["price_ngn"], 0),
            "trend_ngn": round(tr, 0) if tr is not None else None,
            "seasonal_factor": round(s_idx, 4),
            "residual": round(resid, 4) if resid is not None else None,
            "is_custom": r.get("is_custom", False),
        })

    # Seasonality strength: 1 - Var(R) / Var(S*R)
    strength = 0.0
    if len(detrended_vals) > 3:
        var_det = statistics.pvariance(detrended_vals)
        var_res = statistics.pvariance(residual_vals)
        if var_det > 1e-9:
            strength = max(0.0, min(1.0, 1.0 - (var_res / var_det)))

    peak_item = max(seasonal_profile, key=lambda x: x["index"])
    trough_item = min(seasonal_profile, key=lambda x: x["index"])
    spread_pct = ((peak_item["index"] - trough_item["index"]) / max(trough_item["index"], 1e-6)) * 100.0

    return {
        "profile": seasonal_profile,
        "decomposed": decomposed,
        "strengthPct": round(strength * 100.0, 1),
        "peakMonth": peak_item["monthName"],
        "peakDeviationPct": peak_item["deviationPct"],
        "troughMonth": trough_item["monthName"],
        "troughDeviationPct": trough_item["deviationPct"],
        "seasonalSpreadPct": round(spread_pct, 1),
    }


def compute_meta(rows):
    commodities = {}
    markets = {}
    dates = set()
    for r in rows:
        dates.add(r["date"])
        if r["commodity_id"] not in commodities:
            commodities[r["commodity_id"]] = {
                "id": r["commodity_id"],
                "name": r["commodity_name"],
                "category": r["category"],
                "unit": r["unit"],
            }
        if r["market_id"] not in markets:
            markets[r["market_id"]] = {
                "id": r["market_id"],
                "name": r["market_name"],
                "state": r["state"],
                "region": r["region"],
            }

    sorted_dates = sorted(dates)
    return {
        "commodities": list(commodities.values()),
        "markets": list(markets.values()),
        "dateRange": {
            "start": sorted_dates[0] if sorted_dates else None,
            "end": sorted_dates[-1] if sorted_dates else None,
            "months": len(sorted_dates),
        },
        "totalRecords": len(rows),
    }


def analyze(rows, payload):
    commodity_id = payload.get("commodityId", "rice_ofada")
    market_id = payload.get("marketId", "mile12_lagos")
    horizon = int(payload.get("forecastMonths", 6))
    horizon = max(1, min(12, horizon))
    model_type = payload.get("modelType", "ridge_seasonal")

    series = [
        r for r in rows
        if r["commodity_id"] == commodity_id and r["market_id"] == market_id
    ]
    series.sort(key=lambda r: r["date"])

    if not series:
        return {"error": f"No data found for commodity={commodity_id} in market={market_id}"}

    meta_info = {
        "commodityId": commodity_id,
        "commodityName": series[-1]["commodity_name"],
        "category": series[-1]["category"],
        "unit": series[-1]["unit"],
        "marketId": market_id,
        "marketName": series[-1]["market_name"],
        "state": series[-1]["state"],
        "region": series[-1]["region"],
        "observations": len(series),
        "latestDate": series[-1]["date"],
    }

    latest_price = series[-1]["price_ngn"]
    prev_price = series[-2]["price_ngn"] if len(series) >= 2 else latest_price
    yoy_price = series[-13]["price_ngn"] if len(series) >= 13 else series[0]["price_ngn"]

    mom_pct = ((latest_price - prev_price) / max(prev_price, 1.0)) * 100.0
    yoy_pct = ((latest_price - yoy_price) / max(yoy_price, 1.0)) * 100.0

    last_12 = [r["price_ngn"] for r in series[-12:]]
    high_12m = max(last_12)
    low_12m = min(last_12)
    avg_12m = statistics.mean(last_12)
    cv_12m = (statistics.pstdev(last_12) / max(avg_12m, 1.0)) * 100.0 if len(last_12) > 1 else 0.0

    decomp = seasonal_decomposition(series)
    fitted, forecast_points, backtest = run_forecast_model(series, horizon, model_type)

    # Merge fitted values into historical records
    history = []
    for i, item in enumerate(decomp["decomposed"]):
        history.append({
            **item,
            "fitted_ngn": round(fitted[i], 0),
        })

    # Cross-market arbitrage for this commodity on latest date
    latest_date = series[-1]["date"]
    market_rows = [
        r for r in rows
        if r["commodity_id"] == commodity_id and r["date"] == latest_date
    ]
    if not market_rows:
        # fallback to each market's latest observation
        by_mkt = {}
        for r in rows:
            if r["commodity_id"] == commodity_id:
                if r["market_id"] not in by_mkt or r["date"] > by_mkt[r["market_id"]]["date"]:
                    by_mkt[r["market_id"]] = r
        market_rows = list(by_mkt.values())

    nat_avg = statistics.mean([r["price_ngn"] for r in market_rows]) if market_rows else latest_price
    market_comparison = []
    for r in sorted(market_rows, key=lambda x: x["price_ngn"]):
        prev_mkt_rows = [
            pr for pr in rows
            if pr["commodity_id"] == commodity_id and pr["market_id"] == r["market_id"] and pr["date"] < r["date"]
        ]
        prev_mkt_price = prev_mkt_rows[-1]["price_ngn"] if prev_mkt_rows else r["price_ngn"]
        mkt_mom = ((r["price_ngn"] - prev_mkt_price) / max(prev_mkt_price, 1.0)) * 100.0
        spread_vs_avg = ((r["price_ngn"] - nat_avg) / max(nat_avg, 1.0)) * 100.0
        market_comparison.append({
            "marketId": r["market_id"],
            "marketName": r["market_name"],
            "state": r["state"],
            "region": r["region"],
            "price_ngn": round(r["price_ngn"], 0),
            "momPct": round(mkt_mom, 2),
            "vsNationalAvgPct": round(spread_vs_avg, 2),
            "date": r["date"],
        })

    cheapest_mkt = market_comparison[0] if market_comparison else None
    priciest_mkt = market_comparison[-1] if market_comparison else None
    arbitrage_margin_ngn = (priciest_mkt["price_ngn"] - cheapest_mkt["price_ngn"]) if (cheapest_mkt and priciest_mkt) else 0
    arbitrage_margin_pct = (
        (arbitrage_margin_ngn / max(cheapest_mkt["price_ngn"], 1.0)) * 100.0
        if cheapest_mkt else 0.0
    )

    # Multi-commodity heatmap across all 12 months for this market
    commodity_seasonality_matrix = []
    mkt_commodities = sorted({r["commodity_id"] for r in rows if r["market_id"] == market_id})
    for cid in mkt_commodities:
        c_series = sorted(
            [r for r in rows if r["commodity_id"] == cid and r["market_id"] == market_id],
            key=lambda r: r["date"],
        )
        if c_series:
            c_decomp = seasonal_decomposition(c_series)
            commodity_seasonality_matrix.append({
                "commodityId": cid,
                "commodityName": c_series[-1]["commodity_name"],
                "unit": c_series[-1]["unit"],
                "strengthPct": c_decomp["strengthPct"],
                "peakMonth": c_decomp["peakMonth"],
                "troughMonth": c_decomp["troughMonth"],
                "months": c_decomp["profile"],
            })

    # Trader & student decision guidance
    current_month = series[-1]["month"]
    curr_seasonal = next((p for p in decomp["profile"] if p["month"] == current_month), decomp["profile"][0])
    next_fc = forecast_points[-1]["predicted_ngn"] if forecast_points else latest_price
    projected_change_pct = ((next_fc - latest_price) / max(latest_price, 1.0)) * 100.0

    if curr_seasonal["phase"] == "Harvest Glut":
        trader_signal = "Accumulate / Stock Inventory"
        trader_summary = (
            f"{meta_info['commodityName']} is currently in a seasonal harvest trough "
            f"({curr_seasonal['deviationPct']:+.1f}% vs. annual trend). Historical seasonal patterns "
            f"show prices rising toward {decomp['peakMonth']} ({decomp['peakDeviationPct']:+.1f}%)."
        )
    elif curr_seasonal["phase"] == "Lean Peak":
        trader_signal = "Sell Down / Avoid Bulk Lock-In"
        trader_summary = (
            f"Current pricing reflects lean-season tightness ({curr_seasonal['deviationPct']:+.1f}% seasonal premium). "
            f"Traders should procure just-in-time until supply normalizes near {decomp['troughMonth']}."
        )
    else:
        trader_signal = "Balanced Procurement"
        trader_summary = (
            f"Prices sit near the neutral seasonal baseline ({curr_seasonal['deviationPct']:+.1f}%). "
            f"Watch the {horizon}-month projection ({projected_change_pct:+.1f}%) and regional spread from "
            f"{cheapest_mkt['marketName'] if cheapest_mkt else 'origin belts'}."
        )

    student_note = (
        f"Classical multiplicative decomposition attributes {decomp['strengthPct']:.1f}% of detrended price "
        f"variance to recurring 12-month seasonality (spread {decomp['seasonalSpreadPct']:.1f}% between "
        f"{decomp['troughMonth']} and {decomp['peakMonth']}). On a {backtest['samples']}-month holdout test, "
        f"the selected model achieved {backtest['mape']:.2f}% MAPE (RMSE ₦{backtest['rmse']:,.0f})."
    )

    return {
        "meta": meta_info,
        "kpis": {
            "latestPriceNgn": round(latest_price, 0),
            "momPct": round(mom_pct, 2),
            "yoyPct": round(yoy_pct, 2),
            "high12mNgn": round(high_12m, 0),
            "low12mNgn": round(low_12m, 0),
            "avg12mNgn": round(avg_12m, 0),
            "volatilityPct": round(cv_12m, 2),
            "nationalAvgNgn": round(nat_avg, 0),
            "projectedEndNgn": round(next_fc, 0),
            "projectedChangePct": round(projected_change_pct, 2),
        },
        "seasonality": decomp,
        "history": history,
        "forecast": forecast_points,
        "backtest": backtest,
        "modelType": model_type,
        "marketComparison": market_comparison,
        "arbitrage": {
            "cheapest": cheapest_mkt,
            "priciest": priciest_mkt,
            "spreadNgn": round(arbitrage_margin_ngn, 0),
            "spreadPct": round(arbitrage_margin_pct, 2),
        },
        "seasonalityMatrix": commodity_seasonality_matrix,
        "insights": {
            "traderSignal": trader_signal,
            "traderSummary": trader_summary,
            "studentNote": student_note,
        },
    }


def ledger(rows, payload):
    commodity_id = payload.get("commodityId", "all")
    market_id = payload.get("marketId", "all")
    year_filter = payload.get("year", "all")
    search = str(payload.get("search", "")).strip().lower()
    limit = int(payload.get("limit", 50))
    offset = int(payload.get("offset", 0))

    filtered = []
    for r in reversed(rows):
        if commodity_id != "all" and r["commodity_id"] != commodity_id:
            continue
        if market_id != "all" and r["market_id"] != market_id:
            continue
        if year_filter != "all" and str(r["year"]) != str(year_filter):
            continue
        if search:
            hay = f"{r['commodity_name']} {r['market_name']} {r['state']} {r['region']} {r['date']}".lower()
            if search not in hay:
                continue
        filtered.append(r)

    total = len(filtered)
    page_rows = filtered[offset : offset + limit]
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "rows": page_rows,
    }


def evaluate_watchlists(rows, forecast_months=6, model_type="ridge_seasonal"):
    watchlists = watchlist_store.list_watchlists()
    horizon = max(1, min(12, int(forecast_months)))
    cache = {}
    enriched = []

    for wl in watchlists:
        perf_items = []
        for it in wl["items"]:
            cid = it["commodityId"]
            mid = it["marketId"]
            key = (cid, mid)
            if key not in cache:
                series = sorted(
                    [r for r in rows if r["commodity_id"] == cid and r["market_id"] == mid],
                    key=lambda r: r["date"],
                )
                if not series:
                    cache[key] = None
                else:
                    latest = series[-1]
                    prev = series[-2] if len(series) >= 2 else latest
                    yoy = series[-13] if len(series) >= 13 else series[0]
                    mom_pct = ((latest["price_ngn"] - prev["price_ngn"]) / max(prev["price_ngn"], 1.0)) * 100.0
                    yoy_pct = ((latest["price_ngn"] - yoy["price_ngn"]) / max(yoy["price_ngn"], 1.0)) * 100.0
                    decomp = seasonal_decomposition(series)
                    _, fc_pts, _ = run_forecast_model(series, horizon, model_type)
                    proj_end = fc_pts[-1]["predicted_ngn"] if fc_pts else latest["price_ngn"]
                    proj_pct = ((proj_end - latest["price_ngn"]) / max(latest["price_ngn"], 1.0)) * 100.0
                    curr_prof = next(
                        (p for p in decomp["profile"] if p["month"] == latest["month"]),
                        decomp["profile"][0],
                    )
                    phase = curr_prof["phase"]
                    signal = (
                        "Accumulate"
                        if phase == "Harvest Glut"
                        else ("Sell Down" if phase == "Lean Peak" else "Balanced")
                    )
                    cache[key] = {
                        "commodityId": cid,
                        "commodityName": latest["commodity_name"],
                        "unit": latest["unit"],
                        "marketId": mid,
                        "marketName": latest["market_name"],
                        "state": latest["state"],
                        "region": latest["region"],
                        "latestDate": latest["date"],
                        "latestPriceNgn": round(latest["price_ngn"], 0),
                        "momPct": round(mom_pct, 2),
                        "yoyPct": round(yoy_pct, 2),
                        "projectedEndNgn": round(proj_end, 0),
                        "projectedChangePct": round(proj_pct, 2),
                        "seasonalPhase": phase,
                        "traderSignal": signal,
                    }
            if cache[key] is not None:
                perf_items.append(cache[key])

        enriched.append({
            "id": wl["id"],
            "name": wl["name"],
            "createdAt": wl["createdAt"],
            "items": wl["items"],
            "performance": perf_items,
        })

    return {"watchlists": enriched}


def _series_baselines(series):
    """Compute historical baselines (prior 12M avg, all-time avg, linear trend at latest t, z-score)."""
    prices = [r["price_ngn"] for r in series]
    n = len(prices)
    latest = prices[-1]

    prior_12 = prices[-13:-1] if n >= 13 else (prices[:-1] if n > 1 else prices)
    avg_12m = statistics.mean(prior_12)
    avg_all = statistics.mean(prices)
    stdev_all = statistics.pstdev(prices) if n > 1 else 0.0
    z_score = ((latest - avg_all) / stdev_all) if stdev_all > 1e-6 else 0.0

    # OLS linear trend evaluated at latest index (n - 1)
    if n >= 2:
        t_vals = list(range(n))
        mean_t = statistics.mean(t_vals)
        denom = sum((t - mean_t) ** 2 for t in t_vals) or 1.0
        slope = sum((t - mean_t) * (p - avg_all) for t, p in zip(t_vals, prices)) / denom
        intercept = avg_all - slope * mean_t
        trend_latest = max(1.0, intercept + slope * (n - 1))
    else:
        trend_latest = latest

    return {
        "latest": latest,
        "avg_12m": avg_12m,
        "avg_all": avg_all,
        "trend": trend_latest,
        "z_score": z_score,
    }


def evaluate_alerts(rows, active_watchlist_id=None, db_path=None):
    wl_kwargs = {"db_path": db_path} if db_path else {}
    watchlists = watchlist_store.list_watchlists(**wl_kwargs)
    rules = watchlist_store.list_alert_rules(**wl_kwargs)

    # Index series by (commodity_id, market_id)
    series_map = defaultdict(list)
    for r in rows:
        series_map[(r["commodity_id"], r["market_id"])].append(r)
    for key in series_map:
        series_map[key].sort(key=lambda r: r["date"])

    # Gather monitored pairs across watchlists
    monitored_by_wl = {}
    all_monitored = {}
    for wl in watchlists:
        monitored_by_wl[wl["id"]] = wl
        for it in wl["items"]:
            pair = (it["commodityId"], it["marketId"])
            if pair not in all_monitored:
                all_monitored[pair] = wl["name"]

    alerts = []
    seen_alert_keys = set()

    for rule in rules:
        if not rule["enabled"]:
            continue

        # Scope candidate pairs
        wl_scope = rule["watchlistId"]
        if wl_scope != "all" and wl_scope in monitored_by_wl:
            candidates = [
                (it["commodityId"], it["marketId"], monitored_by_wl[wl_scope]["name"])
                for it in monitored_by_wl[wl_scope]["items"]
            ]
        elif active_watchlist_id and wl_scope == "active" and active_watchlist_id in monitored_by_wl:
            candidates = [
                (it["commodityId"], it["marketId"], monitored_by_wl[active_watchlist_id]["name"])
                for it in monitored_by_wl[active_watchlist_id]["items"]
            ]
        else:
            candidates = [(cid, mid, wl_name) for (cid, mid), wl_name in all_monitored.items()]

        for cid, mid, wl_name in candidates:
            if rule["commodityId"] != "all" and cid != rule["commodityId"]:
                continue
            if rule["marketId"] != "all" and mid != rule["marketId"]:
                continue

            series = series_map.get((cid, mid))
            if not series:
                continue

            b = _series_baselines(series)
            base_key = rule["baselineType"]
            baseline_val = b.get(base_key, b["avg_12m"])
            dev_pct = ((b["latest"] - baseline_val) / max(baseline_val, 1.0)) * 100.0

            triggered = False
            if rule["direction"] == "above" and dev_pct >= rule["thresholdPct"]:
                triggered = True
            elif rule["direction"] == "below" and dev_pct <= -rule["thresholdPct"]:
                triggered = True
            elif rule["direction"] == "both" and abs(dev_pct) >= rule["thresholdPct"]:
                triggered = True

            if not triggered:
                continue

            dedup_key = (rule["id"], cid, mid)
            if dedup_key in seen_alert_keys:
                continue
            seen_alert_keys.add(dedup_key)

            severity = (
                "critical"
                if abs(dev_pct) >= max(rule["thresholdPct"] * 1.5, 22.0)
                else "warning"
            )
            latest_row = series[-1]
            baseline_label = (
                "12-Month Average"
                if base_key == "avg_12m"
                else ("Linear Trend" if base_key == "trend" else "All-Time Mean")
            )
            direction_word = "above" if dev_pct >= 0 else "below"
            alerts.append({
                "id": f"{rule['id']}_{cid}_{mid}",
                "ruleId": rule["id"],
                "ruleName": rule["name"],
                "watchlistName": wl_name,
                "commodityId": cid,
                "commodityName": latest_row["commodity_name"],
                "unit": latest_row["unit"],
                "marketId": mid,
                "marketName": latest_row["market_name"],
                "state": latest_row["state"],
                "latestDate": latest_row["date"],
                "latestPriceNgn": round(b["latest"], 0),
                "baselineType": base_key,
                "baselineLabel": baseline_label,
                "baselineNgn": round(baseline_val, 0),
                "deviationPct": round(dev_pct, 2),
                "thresholdPct": rule["thresholdPct"],
                "zScore": round(b["z_score"], 2),
                "severity": severity,
                "message": (
                    f"{latest_row['commodity_name']} at {latest_row['market_name']} "
                    f"is {abs(dev_pct):.1f}% {direction_word} its {baseline_label} "
                    f"(₦{round(b['latest']):,} vs ₦{round(baseline_val):,})."
                ),
            })

    alerts.sort(key=lambda a: (0 if a["severity"] == "critical" else 1, -abs(a["deviationPct"])))
    critical_count = sum(1 for a in alerts if a["severity"] == "critical")
    warning_count = sum(1 for a in alerts if a["severity"] == "warning")
    return {
        "rules": rules,
        "alerts": alerts,
        "summary": {
            "totalTriggered": len(alerts),
            "criticalCount": critical_count,
            "warningCount": warning_count,
        },
    }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing command"}))
        sys.exit(1)

    cmd = sys.argv[1]
    raw_input = sys.stdin.read().strip()
    payload = json.loads(raw_input) if raw_input else {}
    custom_records = payload.get("customRecords")
    rows = load_dataset(custom_records)

    if cmd == "meta":
        result = compute_meta(rows)
    elif cmd == "analyze":
        result = analyze(rows, payload)
    elif cmd == "ledger":
        result = ledger(rows, payload)
    elif cmd == "watchlist_list":
        result = evaluate_watchlists(
            rows,
            forecast_months=payload.get("forecastMonths", 6),
            model_type=payload.get("modelType", "ridge_seasonal"),
        )
    elif cmd == "watchlist_create":
        created = watchlist_store.create_watchlist(
            payload.get("name", ""),
            payload.get("items", []),
        )
        res = evaluate_watchlists(
            rows,
            forecast_months=payload.get("forecastMonths", 6),
            model_type=payload.get("modelType", "ridge_seasonal"),
        )
        result = {"created": created, **res}
    elif cmd == "watchlist_update":
        watchlist_store.update_watchlist(
            payload.get("id", ""),
            name=payload.get("name"),
            items=payload.get("items"),
        )
        result = evaluate_watchlists(
            rows,
            forecast_months=payload.get("forecastMonths", 6),
            model_type=payload.get("modelType", "ridge_seasonal"),
        )
    elif cmd == "watchlist_toggle":
        added = watchlist_store.toggle_watchlist_item(
            payload.get("watchlistId", ""),
            payload.get("commodityId", ""),
            payload.get("marketId", ""),
        )
        res = evaluate_watchlists(
            rows,
            forecast_months=payload.get("forecastMonths", 6),
            model_type=payload.get("modelType", "ridge_seasonal"),
        )
        result = {"added": added, **res}
    elif cmd == "watchlist_delete":
        watchlist_store.delete_watchlist(payload.get("id", ""))
        result = evaluate_watchlists(
            rows,
            forecast_months=payload.get("forecastMonths", 6),
            model_type=payload.get("modelType", "ridge_seasonal"),
        )
    elif cmd == "alerts_evaluate":
        result = evaluate_alerts(rows, active_watchlist_id=payload.get("activeWatchlistId"))
    elif cmd == "alert_rule_create":
        created = watchlist_store.create_alert_rule(
            name=payload.get("name", ""),
            baseline_type=payload.get("baselineType", "avg_12m"),
            direction=payload.get("direction", "both"),
            threshold_pct=payload.get("thresholdPct", 12.0),
            watchlist_id=payload.get("watchlistId", "all"),
            commodity_id=payload.get("commodityId", "all"),
            market_id=payload.get("marketId", "all"),
        )
        res = evaluate_alerts(rows, active_watchlist_id=payload.get("activeWatchlistId"))
        result = {"created": created, **res}
    elif cmd == "alert_rule_update":
        watchlist_store.update_alert_rule(
            payload.get("id", ""),
            enabled=payload.get("enabled"),
            threshold_pct=payload.get("thresholdPct"),
        )
        result = evaluate_alerts(rows, active_watchlist_id=payload.get("activeWatchlistId"))
    elif cmd == "alert_rule_delete":
        watchlist_store.delete_alert_rule(payload.get("id", ""))
        result = evaluate_alerts(rows, active_watchlist_id=payload.get("activeWatchlistId"))
    elif cmd == "export_pdf":
        analysis_data = payload.get("analysis") or analyze(rows, payload)
        wl_name = payload.get("watchlistName", "")
        wl_items = payload.get("watchlistItems") or []
        alerts_list = payload.get("alerts") or []
        pdf_bytes = pdf_report.generate_commodity_brief_pdf(
            analysis_data,
            watchlist_name=wl_name,
            watchlist_items=wl_items,
            alerts=alerts_list,
        )
        meta_info = analysis_data.get("meta", {})
        slug = f"{meta_info.get('commodityId', 'commodity')}_{meta_info.get('marketId', 'market')}"
        result = {
            "filename": f"naijaprice_brief_{slug}.pdf",
            "pdfBase64": base64.b64encode(pdf_bytes).decode("ascii"),
        }
    else:
        result = {"error": f"Unknown command: {cmd}"}

    print(json.dumps(result))


if __name__ == "__main__":
    main()
