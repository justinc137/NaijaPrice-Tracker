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
            CREATE TABLE IF NOT EXISTS alert_rules (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                watchlist_id TEXT NOT NULL DEFAULT 'all',
                commodity_id TEXT NOT NULL DEFAULT 'all',
                market_id TEXT NOT NULL DEFAULT 'all',
                baseline_type TEXT NOT NULL,
                direction TEXT NOT NULL,
                threshold_pct REAL NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            )
            """
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
                    "avg_12m",
                    "above",
                    12.0,
                    1,
                    now,
                ),
                (
                    "ar_trend_dev",
                    "Trendline Deviation Watch",
                    "all",
                    "all",
                    "all",
                    "trend",
                    "both",
                    10.0,
                    1,
                    now,
                ),
            ]
            conn.executemany(
                """
                INSERT OR IGNORE INTO alert_rules
                (id, name, watchlist_id, commodity_id, market_id, baseline_type, direction, threshold_pct, enabled, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                starter_rules,
            )
            conn.execute(
                "INSERT OR REPLACE INTO watchlist_meta (key, value) VALUES ('alerts_seeded', '1')"
            )
        conn.commit()


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
                   baseline_type, direction, threshold_pct, enabled, created_at
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
                "baselineType": r["baseline_type"],
                "direction": r["direction"],
                "thresholdPct": float(r["threshold_pct"]),
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
    db_path: str = DEFAULT_DB_PATH,
) -> dict:
    init_db(db_path)
    clean_name = str(name).strip()
    if not clean_name:
        raise ValueError("Alert rule name is required.")
    if baseline_type not in ("avg_12m", "avg_all", "trend"):
        raise ValueError("baselineType must be avg_12m, avg_all, or trend.")
    if direction not in ("above", "below", "both"):
        raise ValueError("direction must be above, below, or both.")
    pct = float(threshold_pct)
    if pct <= 0 or pct > 200:
        raise ValueError("thresholdPct must be between 0.1 and 200.")

    rule_id = f"ar_{uuid.uuid4().hex[:10]}"
    now = datetime.now(timezone.utc).isoformat()
    with _connect(db_path) as conn:
        conn.execute(
            """
            INSERT INTO alert_rules
            (id, name, watchlist_id, commodity_id, market_id, baseline_type, direction, threshold_pct, enabled, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
            """,
            (
                rule_id,
                clean_name,
                watchlist_id or "all",
                commodity_id or "all",
                market_id or "all",
                baseline_type,
                direction,
                pct,
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
        "baselineType": baseline_type,
        "direction": direction,
        "thresholdPct": pct,
        "enabled": True,
        "createdAt": now,
    }


def update_alert_rule(
    rule_id: str,
    enabled: bool | None = None,
    threshold_pct: float | None = None,
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
        conn.commit()


def delete_alert_rule(rule_id: str, db_path: str = DEFAULT_DB_PATH):
    init_db(db_path)
    with _connect(db_path) as conn:
        conn.execute("DELETE FROM alert_rules WHERE id = ?", (rule_id,))
        conn.commit()

