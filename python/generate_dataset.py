"""
Deterministic dataset generator for NaijaPrice Tracker.
Generates realistic monthly wholesale/retail agricultural commodity prices (NGN)
across 18 major Nigerian markets spanning all 6 geopolitical zones from Jan 2022
to Oct 2026 (58 months), reflecting regional transport spreads, macro inflation
dynamics, and crop-specific Nigerian harvest vs. lean-season price cycles.
"""

import csv
import math
import os
from datetime import date

COMMODITIES = [
    {
        "id": "rice_ofada",
        "name": "Rice (Local Ofada)",
        "unit": "50kg bag",
        "category": "Grains & Cereals",
        "base_price_2022": 29500,
        "annual_growth": 0.24,
        # Peak lean: Jul-Sep; Harvest glut: Nov-Jan
        "peak_month": 8,
        "seasonal_amp": 0.14,
        "noise_amp": 0.025,
    },
    {
        "id": "garri_white",
        "name": "Garri (White)",
        "unit": "50kg bag",
        "category": "Tubers & Processed",
        "base_price_2022": 15800,
        "annual_growth": 0.23,
        # Peak lean: May-Jul (rains affect drying); Harvest/dry processing: Dec-Feb
        "peak_month": 6,
        "seasonal_amp": 0.16,
        "noise_amp": 0.03,
    },
    {
        "id": "beans_oloyin",
        "name": "Beans (Oloyin Brown)",
        "unit": "100kg bag",
        "category": "Legumes",
        "base_price_2022": 46000,
        "annual_growth": 0.28,
        # Peak lean: Jul-Sep; Harvest glut: Nov-Jan
        "peak_month": 8,
        "seasonal_amp": 0.22,
        "noise_amp": 0.035,
    },
    {
        "id": "maize_yellow",
        "name": "Maize (Yellow)",
        "unit": "100kg bag",
        "category": "Grains & Cereals",
        "base_price_2022": 22500,
        "annual_growth": 0.25,
        # Peak lean: Jun-Jul; Harvest: Sep-Nov
        "peak_month": 6,
        "seasonal_amp": 0.19,
        "noise_amp": 0.03,
    },
    {
        "id": "tomatoes_basket",
        "name": "Tomatoes (Fresh)",
        "unit": "45kg basket",
        "category": "Perishables",
        "base_price_2022": 18500,
        "annual_growth": 0.22,
        # Sharp lean spike in May-Jul (tuta absoluta / wet season); glut Jan-Mar
        "peak_month": 6,
        "seasonal_amp": 0.44,
        "noise_amp": 0.06,
    },
    {
        "id": "yam_tuber",
        "name": "Yam (Puna / White)",
        "unit": "100kg bundle",
        "category": "Tubers & Processed",
        "base_price_2022": 26000,
        "annual_growth": 0.24,
        # Lean: May-Jul before New Yam; Harvest: Aug-Nov
        "peak_month": 6,
        "seasonal_amp": 0.26,
        "noise_amp": 0.035,
    },
    {
        "id": "palm_oil",
        "name": "Palm Oil",
        "unit": "25L jerrycan",
        "category": "Oils & Fats",
        "base_price_2022": 21000,
        "annual_growth": 0.26,
        # Peak fruiting glut: Mar-May; Lean: Oct-Dec
        "peak_month": 11,
        "seasonal_amp": 0.18,
        "noise_amp": 0.025,
    },
    {
        "id": "onions_sokoto",
        "name": "Onions (Red Sokoto)",
        "unit": "100kg bag",
        "category": "Perishables",
        "base_price_2022": 28000,
        "annual_growth": 0.24,
        # Lean: Sep-Nov; Dry-season harvest: Feb-Apr
        "peak_month": 10,
        "seasonal_amp": 0.34,
        "noise_amp": 0.045,
    },
]

MARKETS = [
    # South-West
    {
        "id": "mile12_lagos",
        "name": "Mile 12 Market, Lagos",
        "state": "Lagos",
        "region": "South-West",
        "logistics_factor": 1.12,
    },
    {
        "id": "bodija_ibadan",
        "name": "Bodija Market, Ibadan",
        "state": "Oyo",
        "region": "South-West",
        "logistics_factor": 1.03,
    },
    {
        "id": "lafenwa_abeokuta",
        "name": "Lafenwa Market, Abeokuta",
        "state": "Ogun",
        "region": "South-West",
        "logistics_factor": 1.02,
    },
    # South-East
    {
        "id": "ariaria_aba",
        "name": "Relief Market, Aba",
        "state": "Abia",
        "region": "South-East",
        "logistics_factor": 1.05,
    },
    {
        "id": "ochanja_onitsha",
        "name": "Ochanja Market, Onitsha",
        "state": "Anambra",
        "region": "South-East",
        "logistics_factor": 1.04,
    },
    {
        "id": "ogbete_enugu",
        "name": "Ogbete Main Market, Enugu",
        "state": "Enugu",
        "region": "South-East",
        "logistics_factor": 1.01,
    },
    # South-South
    {
        "id": "oilmill_portharcourt",
        "name": "Oil Mill Market, Port Harcourt",
        "state": "Rivers",
        "region": "South-South",
        "logistics_factor": 1.14,
    },
    {
        "id": "oba_benin",
        "name": "Oba Market, Benin City",
        "state": "Edo",
        "region": "South-South",
        "logistics_factor": 1.00,
    },
    {
        "id": "watt_calabar",
        "name": "Watt Market, Calabar",
        "state": "Cross River",
        "region": "South-South",
        "logistics_factor": 1.06,
    },
    # North-Central
    {
        "id": "wuse_abuja",
        "name": "Wuse Market, Abuja",
        "state": "FCT Abuja",
        "region": "North-Central",
        "logistics_factor": 1.07,
    },
    {
        "id": "terminus_jos",
        "name": "Terminus Market, Jos",
        "state": "Plateau",
        "region": "North-Central",
        "logistics_factor": 0.92,
    },
    {
        "id": "zakibiam_benue",
        "name": "Zaki Biam Yam Market, Benue",
        "state": "Benue",
        "region": "North-Central",
        "logistics_factor": 0.90,
    },
    # North-West
    {
        "id": "dawanau_kano",
        "name": "Dawanau Market, Kano",
        "state": "Kano",
        "region": "North-West",
        "logistics_factor": 0.89,
    },
    {
        "id": "kawo_kaduna",
        "name": "Kawo Market, Kaduna",
        "state": "Kaduna",
        "region": "North-West",
        "logistics_factor": 0.94,
    },
    {
        "id": "sokoto_central",
        "name": "Sokoto Central Market, Sokoto",
        "state": "Sokoto",
        "region": "North-West",
        "logistics_factor": 0.91,
    },
    # North-East
    {
        "id": "monday_maiduguri",
        "name": "Monday Market, Maiduguri",
        "state": "Borno",
        "region": "North-East",
        "logistics_factor": 0.95,
    },
    {
        "id": "gombe_main",
        "name": "Gombe Main Market, Gombe",
        "state": "Gombe",
        "region": "North-East",
        "logistics_factor": 0.91,
    },
    {
        "id": "jimeta_yola",
        "name": "Jimeta Modern Market, Yola",
        "state": "Adamawa",
        "region": "North-East",
        "logistics_factor": 0.93,
    },
]

# Crop-region production advantages (lower local price near origin belt)
ORIGIN_AFFINITY = {
    ("rice_ofada", "lafenwa_abeokuta"): 0.88,
    ("rice_ofada", "bodija_ibadan"): 0.92,
    ("rice_ofada", "zakibiam_benue"): 0.93,
    ("rice_ofada", "mile12_lagos"): 0.96,
    ("rice_ofada", "ochanja_onitsha"): 0.97,
    ("garri_white", "oba_benin"): 0.89,
    ("garri_white", "ariaria_aba"): 0.91,
    ("garri_white", "lafenwa_abeokuta"): 0.92,
    ("garri_white", "ogbete_enugu"): 0.93,
    ("garri_white", "watt_calabar"): 0.93,
    ("garri_white", "bodija_ibadan"): 0.94,
    ("beans_oloyin", "monday_maiduguri"): 0.88,
    ("beans_oloyin", "gombe_main"): 0.90,
    ("beans_oloyin", "dawanau_kano"): 0.91,
    ("beans_oloyin", "sokoto_central"): 0.91,
    ("beans_oloyin", "oilmill_portharcourt"): 1.07,
    ("maize_yellow", "kawo_kaduna"): 0.89,
    ("maize_yellow", "gombe_main"): 0.90,
    ("maize_yellow", "dawanau_kano"): 0.92,
    ("maize_yellow", "zakibiam_benue"): 0.92,
    ("maize_yellow", "jimeta_yola"): 0.92,
    ("maize_yellow", "terminus_jos"): 0.94,
    ("tomatoes_basket", "dawanau_kano"): 0.85,
    ("tomatoes_basket", "kawo_kaduna"): 0.86,
    ("tomatoes_basket", "terminus_jos"): 0.88,
    ("tomatoes_basket", "gombe_main"): 0.89,
    ("tomatoes_basket", "mile12_lagos"): 1.08,
    ("tomatoes_basket", "watt_calabar"): 1.09,
    ("tomatoes_basket", "oilmill_portharcourt"): 1.10,
    ("yam_tuber", "zakibiam_benue"): 0.82,
    ("yam_tuber", "terminus_jos"): 0.91,
    ("yam_tuber", "jimeta_yola"): 0.92,
    ("yam_tuber", "wuse_abuja"): 0.93,
    ("yam_tuber", "ogbete_enugu"): 0.93,
    ("yam_tuber", "mile12_lagos"): 1.06,
    ("yam_tuber", "sokoto_central"): 1.08,
    ("palm_oil", "oba_benin"): 0.85,
    ("palm_oil", "ariaria_aba"): 0.86,
    ("palm_oil", "watt_calabar"): 0.87,
    ("palm_oil", "oilmill_portharcourt"): 0.90,
    ("palm_oil", "ochanja_onitsha"): 0.91,
    ("palm_oil", "dawanau_kano"): 1.15,
    ("palm_oil", "monday_maiduguri"): 1.16,
    ("palm_oil", "sokoto_central"): 1.17,
    ("onions_sokoto", "sokoto_central"): 0.81,
    ("onions_sokoto", "dawanau_kano"): 0.86,
    ("onions_sokoto", "kawo_kaduna"): 0.89,
    ("onions_sokoto", "monday_maiduguri"): 0.90,
    ("onions_sokoto", "mile12_lagos"): 1.09,
    ("onions_sokoto", "watt_calabar"): 1.11,
    ("onions_sokoto", "oilmill_portharcourt"): 1.12,
}


def deterministic_noise(c_idx: int, m_idx: int, t_idx: int) -> float:
    seed = math.sin((c_idx + 1) * 12.9898 + (m_idx + 1) * 78.233 + (t_idx + 1) * 37.719) * 43758.5453
    frac = seed - math.floor(seed)
    return (frac * 2.0) - 1.0


def generate_rows():
    rows = []
    start_year, start_month = 2022, 1
    total_months = 58  # Jan 2022 -> Oct 2026

    for t in range(total_months):
        year = start_year + (start_month - 1 + t) // 12
        month = ((start_month - 1 + t) % 12) + 1
        period = date(year, month, 1).isoformat()

        # Macro step reflecting mid-2023 fuel/FX adjustment + 2024-2026 stabilization curve
        macro_multiplier = 1.0
        if t >= 17:  # Jun 2023 onwards
            months_post = t - 17
            macro_multiplier += 0.16 * (1 - math.exp(-months_post / 8.0))

        for c_idx, c in enumerate(COMMODITIES):
            years_elapsed = t / 12.0
            trend_price = c["base_price_2022"] * ((1 + c["annual_growth"]) ** years_elapsed) * macro_multiplier

            # Asymmetric seasonal curve (sharp lean peak, broader harvest trough)
            angle = 2 * math.pi * ((month - c["peak_month"]) / 12.0)
            seasonal_wave = (
                0.78 * math.cos(angle)
                + 0.22 * math.cos(2 * angle)
            )
            seasonal_factor = 1.0 + c["seasonal_amp"] * seasonal_wave

            for m_idx, m in enumerate(MARKETS):
                affinity = ORIGIN_AFFINITY.get((c["id"], m["id"]), 1.0)
                noise = 1.0 + c["noise_amp"] * deterministic_noise(c_idx, m_idx, t)
                raw_price = trend_price * seasonal_factor * m["logistics_factor"] * affinity * noise
                # Round to nearest 50 Naira for realistic market pricing
                price_ngn = int(round(raw_price / 50.0) * 50)

                rows.append({
                    "date": period,
                    "year": year,
                    "month": month,
                    "commodity_id": c["id"],
                    "commodity_name": c["name"],
                    "category": c["category"],
                    "unit": c["unit"],
                    "market_id": m["id"],
                    "market_name": m["name"],
                    "state": m["state"],
                    "region": m["region"],
                    "price_ngn": price_ngn,
                })
    return rows


def main():
    out_dir = os.path.join(os.path.dirname(__file__), "data")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "nigerian_commodity_prices.csv")

    rows = generate_rows()
    fieldnames = [
        "date",
        "year",
        "month",
        "commodity_id",
        "commodity_name",
        "category",
        "unit",
        "market_id",
        "market_name",
        "state",
        "region",
        "price_ngn",
    ]
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Generated {len(rows)} rows at {out_path}")


if __name__ == "__main__":
    main()
