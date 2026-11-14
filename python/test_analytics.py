import os
import tempfile
import unittest
from analytics_engine import analyze, compute_meta, load_dataset
import pdf_report
import watchlist_store


class TestAnalyticsEngine(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = load_dataset()

    def test_meta_contains_commodities_and_markets(self):
        meta = compute_meta(self.rows)
        self.assertEqual(len(meta["commodities"]), 8)
        self.assertEqual(len(meta["markets"]), 6)
        self.assertGreater(meta["totalRecords"], 2500)

    def test_analyze_ridge_seasonal_forecast_and_seasonality(self):
        res = analyze(self.rows, {
            "commodityId": "tomatoes_basket",
            "marketId": "mile12_lagos",
            "forecastMonths": 6,
            "modelType": "ridge_seasonal",
        })
        self.assertNotIn("error", res)
        self.assertEqual(len(res["forecast"]), 6)
        self.assertEqual(len(res["seasonality"]["profile"]), 12)
        self.assertGreater(res["seasonality"]["strengthPct"], 30.0)
        self.assertLess(res["backtest"]["mape"], 25.0)
        for fc in res["forecast"]:
            self.assertLessEqual(fc["lower95_ngn"], fc["predicted_ngn"])
            self.assertGreaterEqual(fc["upper95_ngn"], fc["predicted_ngn"])

    def test_analyze_supports_all_three_models(self):
        for model in ["ridge_seasonal", "poly_seasonal", "holt_winters"]:
            res = analyze(self.rows, {
                "commodityId": "beans_oloyin",
                "marketId": "dawanau_kano",
                "forecastMonths": 9,
                "modelType": model,
            })
            self.assertEqual(len(res["forecast"]), 9)
            self.assertGreater(res["kpis"]["latestPriceNgn"], 0)

    def test_watchlist_sqlite_crud_persistence(self):
        with tempfile.TemporaryDirectory() as tmp:
            db = os.path.join(tmp, "test_wl.db")
            initial = watchlist_store.list_watchlists(db_path=db)
            self.assertEqual(len(initial), 1)
            self.assertEqual(initial[0]["name"], "Core Market Watch")

            created = watchlist_store.create_watchlist(
                "Northern Grains",
                [{"commodityId": "maize_yellow", "marketId": "dawanau_kano"}],
                db_path=db,
            )
            after_create = watchlist_store.list_watchlists(db_path=db)
            self.assertEqual(len(after_create), 2)

            added = watchlist_store.toggle_watchlist_item(
                created["id"], "palm_oil", "ariaria_aba", db_path=db
            )
            self.assertTrue(added)
            after_toggle = [w for w in watchlist_store.list_watchlists(db_path=db) if w["id"] == created["id"]][0]
            self.assertEqual(len(after_toggle["items"]), 2)

            watchlist_store.delete_watchlist(created["id"], db_path=db)
            after_del = watchlist_store.list_watchlists(db_path=db)
            self.assertEqual(len(after_del), 1)

    def test_generate_formal_pdf_brief(self):
        res = analyze(self.rows, {
            "commodityId": "rice_ofada",
            "marketId": "mile12_lagos",
            "forecastMonths": 12,
            "modelType": "ridge_seasonal",
        })
        wl_items = [
            {
                "commodityName": "Beans (Oloyin Brown)",
                "marketName": "Dawanau Market, Kano",
                "latestPriceNgn": 105000,
                "momPct": -2.1,
                "yoyPct": 19.4,
                "projectedEndNgn": 118500,
                "seasonalPhase": "Harvest Glut",
            }
        ]
        pdf_bytes = pdf_report.generate_commodity_brief_pdf(
            res,
            watchlist_name="Core Market Watch",
            watchlist_items=wl_items,
        )
        self.assertTrue(pdf_bytes.startswith(b"%PDF-1.4"))
        self.assertIn(b"%%EOF", pdf_bytes[-32:])
        self.assertGreater(len(pdf_bytes), 2000)

    def test_alert_rules_and_deviation_detection(self):
        from analytics_engine import evaluate_alerts
        with tempfile.TemporaryDirectory() as tmp:
            db = os.path.join(tmp, "alerts_test.db")
            rules = watchlist_store.list_alert_rules(db_path=db)
            self.assertGreaterEqual(len(rules), 2)

            new_rule = watchlist_store.create_alert_rule(
                name="Extreme Spike Check",
                baseline_type="avg_12m",
                direction="above",
                threshold_pct=10.0,
                commodity_id="rice_ofada",
                market_id="mile12_lagos",
                db_path=db,
            )
            self.assertEqual(new_rule["thresholdPct"], 10.0)

            res = evaluate_alerts(self.rows, db_path=db)
            self.assertGreater(res["summary"]["totalTriggered"], 0)
            self.assertTrue(any(a["ruleId"] == new_rule["id"] for a in res["alerts"]))

            watchlist_store.update_alert_rule(new_rule["id"], enabled=False, db_path=db)
            res_disabled = evaluate_alerts(self.rows, db_path=db)
            self.assertFalse(any(a["ruleId"] == new_rule["id"] for a in res_disabled["alerts"]))

            watchlist_store.delete_alert_rule(new_rule["id"], db_path=db)


if __name__ == "__main__":
    unittest.main()
