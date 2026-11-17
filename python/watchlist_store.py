"""
SQLite-backed personalized watchlist storage and performance evaluation for NaijaPrice Tracker.
"""

import os
import sqlite3
import uuid
from datetime import datetime, timezone

DEFAULT_DB_PATH = os.path.join(os.path.dirname(__file__), "data", "watchlists.db")


def _connect(db_path: str = DEFAULT_DB_PATH) -> sqlite3.Connection:
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: str = DEFAULT_DB_PATH):
    with _connect(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS watchlists (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS watchlist_items (
                watchlist_id TEXT NOT NULL,
                commodity_id TEXT NOT NULL,
                market_id TEXT NOT NULL,
                PRIMARY KEY (watchlist_id, commodity_id, market_id),
                FOREIGN KEY (watchlist_id) REFERENCES watchlists(id) ON DELETE CASCADE
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS watchlist_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
            """
        )

        seeded = conn.execute("SELECT value FROM watchlist_meta WHERE key = 'seeded'").fetchone()
        if not seeded:
            now = datetime.now(timezone.utc).isoformat()
            default_id = "wl_core_market"
            conn.execute(
                "INSERT OR IGNORE INTO watchlists (id, name, created_at) VALUES (?, ?, ?)",
                (default_id, "Core Market Watch", now),
            )
            starter_pairs = [
                (default_id, "rice_ofada", "mile12_lagos"),
                (default_id, "beans_oloyin", "dawanau_kano"),
                (default_id, "tomatoes_basket", "mile12_lagos"),
            ]
            conn.executemany(
                "INSERT OR IGNORE INTO watchlist_items (watchlist_id, commodity_id, market_id) VALUES (?, ?, ?)",
                starter_pairs,
            )
            conn.execute(
                "INSERT OR REPLACE INTO watchlist_meta (key, value) VALUES ('seeded', '1')"
            )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS custom_observations (
                id TEXT PRIMARY KEY,
                obs_date TEXT NOT NULL,
                commodity_id TEXT NOT NULL,
                commodity_name TEXT NOT NULL,
                category TEXT NOT NULL,
                unit TEXT NOT NULL,
                market_id TEXT NOT NULL,
                market_name TEXT NOT NULL,
                state TEXT NOT NULL,
                region TEXT NOT NULL,
                price_ngn REAL NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(obs_date, commodity_id, market_id)
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS alert_rules (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                watchlist_id TEXT NOT NULL DEFAULT 'all',
                commodity_id TEXT NOT NULL DEFAULT 'all',
                market_id TEXT NOT NULL DEFAULT 'all',
                rule_type TEXT NOT NULL DEFAULT 'deviation_pct',
                baseline_type TEXT NOT NULL DEFAULT 'avg_12m',
                direction TEXT NOT NULL,
                threshold_pct REAL NOT NULL DEFAULT 12.0,
                target_price_ngn REAL DEFAULT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            )
            """
        )

        # Migrate pre-existing alert_rules schema if columns are missing
        existing_cols = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(alert_rules)").fetchall()
        }
        if "rule_type" not in existing_cols:
            conn.execute(
                "ALTER TABLE alert_rules ADD COLUMN rule_type TEXT NOT NULL DEFAULT 'deviation_pct'"
            )
        if "target_price_ngn" not in existing_cols:
            conn.execute(
                "ALTER TABLE alert_rules ADD COLUMN target_price_ngn REAL DEFAULT NULL"
            )

        alerts_seeded = conn.execute(
            "SELECT value FROM watchlist_meta WHERE key = 'alerts_seeded'"
        ).fetchone()
        if not alerts_seeded:
            now = datetime.now(timezone.utc).isoformat()
            starter_rules = [
                (
                    "ar_spike_12m",
                    "Spot Spike vs 12M Average",
                    "all",
                    "all",
                    "all",
                    "deviation_pct",
                    "avg_12m",
                    "above",
                    12.0,
                    None,
                    1,
                    now,
                ),
                (
                    "ar_trend_dev",
                    "Trendline Deviation Watch",
                    "all",
                    "all",
                    "all",
                    "deviation_pct",
                    "trend",
                    "both",
                    10.0,
                    None,
                    1,
                    now,
                ),
            ]
            conn.executemany(
                """
                INSERT OR IGNORE INTO alert_rules
                (id, name, watchlist_id, commodity_id, market_id, rule_type, baseline_type, direction, threshold_pct, target_price_ngn, enabled, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                starter_rules,
            )
            conn.execute(
                "INSERT OR REPLACE INTO watchlist_meta (key, value) VALUES ('alerts_seeded', '1')"
            )
        conn.commit()


def list_custom_observations(db_path: str = DEFAULT_DB_PATH) -> list[dict]:
    init_db(db_path)
    with _connect(db_path) as conn:
        rows = conn.execute(
            """
            SELECT id, obs_date, commodity_id, commodity_name, category, unit,
                   market_id, market_name, state, region, price_ngn, created_at
            FROM custom_observations
            ORDER BY obs_date DESC, created_at DESC
            """
        ).fetchall()
        return [
            {
                "id": r["id"],
                "date": r["obs_date"],
                "commodity_id": r["commodity_id"],
                "commodity_name": r["commodity_name"],
                "category": r["category"],
                "unit": r["unit"],
                "market_id": r["market_id"],
                "market_name": r["market_name"],
                "state": r["state"],
                "region": r["region"],
                "price_ngn": float(r["price_ngn"]),
                "createdAt": r["created_at"],
            }
            for r in rows
        ]


def upsert_custom_observations(records: list[dict], db_path: str = DEFAULT_DB_PATH) -> list[dict]:
    init_db(db_path)
    if not records:
        return list_custom_observations(db_path)
    now = datetime.now(timezone.utc).isoformat()
    with _connect(db_path) as conn:
        for rec in records:
            obs_date = str(rec.get("date", ""))[:10]
            cid = str(rec.get("commodity_id", "")).strip()
            mid = str(rec.get("market_id", "")).strip()
            price = float(rec.get("price_ngn", 0))
            if len(obs_date) != 10 or not cid or not mid or price <= 0:
                raise ValueError("Invalid observation: date (YYYY-MM-DD), commodity_id, market_id, and positive price_ngn are required.")
            obs_id = f"obs_{uuid.uuid4().hex[:10]}"
            conn.execute(
                """
                INSERT INTO custom_observations
                (id, obs_date, commodity_id, commodity_name, category, unit, market_id, market_name, state, region, price_ngn, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(obs_date, commodity_id, market_id) DO UPDATE SET
                    commodity_name = excluded.commodity_name,
                    category = excluded.category,
                    unit = excluded.unit,
                    market_name = excluded.market_name,
                    state = excluded.state,
                    region = excluded.region,
                    price_ngn = excluded.price_ngn,
                    created_at = excluded.created_at
                """,
                (
                    obs_id,
                    obs_date,
                    cid,
                    str(rec.get("commodity_name", cid)),
                    str(rec.get("category", "Custom")),
                    str(rec.get("unit", "bag")),
                    mid,
                    str(rec.get("market_name", mid)),
                    str(rec.get("state", "Nigeria")),
                    str(rec.get("region", "Custom")),
                    round(price),
                    now,
                ),
            )
        conn.commit()
    return list_custom_observations(db_path)


def delete_custom_observation(obs_id: str, db_path: str = DEFAULT_DB_PATH) -> list[dict]:
    init_db(db_path)
    with _connect(db_path) as conn:
        conn.execute("DELETE FROM custom_observations WHERE id = ?", (obs_id,))
        conn.commit()
    return list_custom_observations(db_path)


def clear_custom_observations(db_path: str = DEFAULT_DB_PATH) -> list[dict]:
    init_db(db_path)
    with _connect(db_path) as conn:
        conn.execute("DELETE FROM custom_observations")
        conn.commit()
    return []


def list_watchlists(db_path: str = DEFAULT_DB_PATH) -> list[dict]:
    init_db(db_path)
    with _connect(db_path) as conn:
        wls = conn.execute("SELECT id, name, created_at FROM watchlists ORDER BY created_at ASC").fetchall()
        result = []
        for wl in wls:
            items = conn.execute(
                "SELECT commodity_id, market_id FROM watchlist_items WHERE watchlist_id = ? ORDER BY rowid ASC",
                (wl["id"],),
            ).fetchall()
            result.append({
                "id": wl["id"],
                "name": wl["name"],
                "createdAt": wl["created_at"],
                "items": [
                    {"commodityId": it["commodity_id"], "marketId": it["market_id"]}
                    for it in items
                ],
            })
        return result


def create_watchlist(name: str, items: list[dict], db_path: str = DEFAULT_DB_PATH) -> dict:
    init_db(db_path)
    clean_name = str(name).strip()
    if not clean_name:
        raise ValueError("Watchlist name is required.")
    wl_id = f"wl_{uuid.uuid4().hex[:10]}"
    now = datetime.now(timezone.utc).isoformat()
    with _connect(db_path) as conn:
        conn.execute(
            "INSERT INTO watchlists (id, name, created_at) VALUES (?, ?, ?)",
            (wl_id, clean_name, now),
        )
        unique_pairs = {
            (wl_id, str(it["commodityId"]), str(it["marketId"]))
            for it in items
            if it.get("commodityId") and it.get("marketId")
        }
        if unique_pairs:
            conn.executemany(
                "INSERT OR IGNORE INTO watchlist_items (watchlist_id, commodity_id, market_id) VALUES (?, ?, ?)",
                list(unique_pairs),
            )
        conn.commit()
    return {"id": wl_id, "name": clean_name, "createdAt": now}


def update_watchlist(wl_id: str, name: str | None = None, items: list[dict] | None = None, db_path: str = DEFAULT_DB_PATH):
    init_db(db_path)
    with _connect(db_path) as conn:
        existing = conn.execute("SELECT id FROM watchlists WHERE id = ?", (wl_id,)).fetchone()
        if not existing:
            raise ValueError(f"Watchlist '{wl_id}' not found.")
        if name is not None and str(name).strip():
            conn.execute("UPDATE watchlists SET name = ? WHERE id = ?", (str(name).strip(), wl_id))
        if items is not None:
            conn.execute("DELETE FROM watchlist_items WHERE watchlist_id = ?", (wl_id,))
            unique_pairs = {
                (wl_id, str(it["commodityId"]), str(it["marketId"]))
                for it in items
                if it.get("commodityId") and it.get("marketId")
            }
            if unique_pairs:
                conn.executemany(
                    "INSERT OR IGNORE INTO watchlist_items (watchlist_id, commodity_id, market_id) VALUES (?, ?, ?)",
                    list(unique_pairs),
                )
        conn.commit()


def toggle_watchlist_item(wl_id: str, commodity_id: str, market_id: str, db_path: str = DEFAULT_DB_PATH) -> bool:
    init_db(db_path)
    with _connect(db_path) as conn:
        existing = conn.execute("SELECT id FROM watchlists WHERE id = ?", (wl_id,)).fetchone()
        if not existing:
            raise ValueError(f"Watchlist '{wl_id}' not found.")
        item = conn.execute(
            "SELECT 1 FROM watchlist_items WHERE watchlist_id = ? AND commodity_id = ? AND market_id = ?",
            (wl_id, commodity_id, market_id),
        ).fetchone()
        if item:
            conn.execute(
                "DELETE FROM watchlist_items WHERE watchlist_id = ? AND commodity_id = ? AND market_id = ?",
                (wl_id, commodity_id, market_id),
            )
            added = False
        else:
            conn.execute(
                "INSERT INTO watchlist_items (watchlist_id, commodity_id, market_id) VALUES (?, ?, ?)",
                (wl_id, commodity_id, market_id),
            )
            added = True
        conn.commit()
        return added


def delete_watchlist(wl_id: str, db_path: str = DEFAULT_DB_PATH):
    init_db(db_path)
    with _connect(db_path) as conn:
        conn.execute("DELETE FROM watchlists WHERE id = ?", (wl_id,))
        conn.commit()


def list_alert_rules(db_path: str = DEFAULT_DB_PATH) -> list[dict]:
    init_db(db_path)
    with _connect(db_path) as conn:
        rows = conn.execute(
            """
            SELECT id, name, watchlist_id, commodity_id, market_id,
                   rule_type, baseline_type, direction, threshold_pct, target_price_ngn,
                   enabled, created_at
            FROM alert_rules
            ORDER BY created_at ASC
            """
        ).fetchall()
        return [
            {
                "id": r["id"],
                "name": r["name"],
                "watchlistId": r["watchlist_id"],
                "commodityId": r["commodity_id"],
                "marketId": r["market_id"],
                "ruleType": r["rule_type"] or "deviation_pct",
                "baselineType": r["baseline_type"],
                "direction": r["direction"],
                "thresholdPct": float(r["threshold_pct"]),
                "targetPriceNgn": float(r["target_price_ngn"]) if r["target_price_ngn"] is not None else None,
                "enabled": bool(r["enabled"]),
                "createdAt": r["created_at"],
            }
            for r in rows
        ]


def create_alert_rule(
    name: str,
    baseline_type: str = "avg_12m",
    direction: str = "both",
    threshold_pct: float = 12.0,
    watchlist_id: str = "all",
    commodity_id: str = "all",
    market_id: str = "all",
    rule_type: str = "deviation_pct",
    target_price_ngn: float | None = None,
    db_path: str = DEFAULT_DB_PATH,
) -> dict:
    init_db(db_path)
    clean_name = str(name).strip()
    if not clean_name:
        raise ValueError("Alert rule name is required.")
    if rule_type not in ("deviation_pct", "price_target"):
        raise ValueError("ruleType must be deviation_pct or price_target.")

    if rule_type == "price_target":
        if direction not in ("above", "below"):
            raise ValueError("Price target alerts require direction 'above' or 'below'.")
        if target_price_ngn is None or float(target_price_ngn) <= 0:
            raise ValueError("Target price in Naira must be greater than 0.")
        target_val = round(float(target_price_ngn), 0)
        pct = float(threshold_pct) if threshold_pct else 0.0
        base = "price_target"
    else:
        if baseline_type not in ("avg_12m", "avg_all", "trend"):
            raise ValueError("baselineType must be avg_12m, avg_all, or trend.")
        if direction not in ("above", "below", "both"):
            raise ValueError("direction must be above, below, or both.")
        pct = float(threshold_pct)
        if pct <= 0 or pct > 200:
            raise ValueError("thresholdPct must be between 0.1 and 200.")
        target_val = None
        base = baseline_type

    rule_id = f"ar_{uuid.uuid4().hex[:10]}"
    now = datetime.now(timezone.utc).isoformat()
    with _connect(db_path) as conn:
        conn.execute(
            """
            INSERT INTO alert_rules
            (id, name, watchlist_id, commodity_id, market_id, rule_type, baseline_type, direction, threshold_pct, target_price_ngn, enabled, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
            """,
            (
                rule_id,
                clean_name,
                watchlist_id or "all",
                commodity_id or "all",
                market_id or "all",
                rule_type,
                base,
                direction,
                pct,
                target_val,
                now,
            ),
        )
        conn.commit()
    return {
        "id": rule_id,
        "name": clean_name,
        "watchlistId": watchlist_id or "all",
        "commodityId": commodity_id or "all",
        "marketId": market_id or "all",
        "ruleType": rule_type,
        "baselineType": base,
        "direction": direction,
        "thresholdPct": pct,
        "targetPriceNgn": target_val,
        "enabled": True,
        "createdAt": now,
    }


def update_alert_rule(
    rule_id: str,
    enabled: bool | None = None,
    threshold_pct: float | None = None,
    target_price_ngn: float | None = None,
    db_path: str = DEFAULT_DB_PATH,
):
    init_db(db_path)
    with _connect(db_path) as conn:
        existing = conn.execute("SELECT id FROM alert_rules WHERE id = ?", (rule_id,)).fetchone()
        if not existing:
            raise ValueError(f"Alert rule '{rule_id}' not found.")
        if enabled is not None:
            conn.execute(
                "UPDATE alert_rules SET enabled = ? WHERE id = ?",
                (1 if enabled else 0, rule_id),
            )
        if threshold_pct is not None:
            pct = float(threshold_pct)
            if pct <= 0 or pct > 200:
                raise ValueError("thresholdPct must be between 0.1 and 200.")
            conn.execute(
                "UPDATE alert_rules SET threshold_pct = ? WHERE id = ?",
                (pct, rule_id),
            )
        if target_price_ngn is not None:
            tp = float(target_price_ngn)
            if tp <= 0:
                raise ValueError("targetPriceNgn must be positive.")
            conn.execute(
                "UPDATE alert_rules SET target_price_ngn = ? WHERE id = ?",
                (round(tp, 0), rule_id),
            )
        conn.commit()


def delete_alert_rule(rule_id: str, db_path: str = DEFAULT_DB_PATH):
    init_db(db_path)
    with _connect(db_path) as conn:
        conn.execute("DELETE FROM alert_rules WHERE id = ?", (rule_id,))
        conn.commit()

