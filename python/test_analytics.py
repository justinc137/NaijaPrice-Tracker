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

    def test_analyze_supports_all_five_models_and_comparison(self):
        all_models = ["ridge_seasonal", "poly_seasonal", "holt_winters", "sarima", "prophet_gam"]
        for model in all_models:
            res = analyze(self.rows, {
                "commodityId": "beans_oloyin",
                "marketId": "dawanau_kano",
                "forecastMonths": 9,
                "modelType": model,
            })
            self.assertEqual(len(res["forecast"]), 9)
            self.assertGreater(res["kpis"]["latestPriceNgn"], 0)
            for fc in res["forecast"]:
                self.assertLessEqual(fc["lower95_ngn"], fc["predicted_ngn"])
                self.assertGreaterEqual(fc["upper95_ngn"], fc["predicted_ngn"])

        comp = res["modelComparison"]
        self.assertEqual(len(comp), 5)
        families = {m["family"] for m in comp}
        self.assertEqual(families, {"Basic", "Advanced"})
        best_models = [m for m in comp if m["isBest"]]
        self.assertGreaterEqual(len(best_models), 1)
        min_mape = min(m["mape"] for m in comp)
        self.assertEqual(best_models[0]["mape"], min_mape)
        for m in comp:
            self.assertEqual(len(m["forecast"]), 9)

    def test_custom_observations_sqlite_persistence_and_immediate_analysis(self):
        with tempfile.TemporaryDirectory() as tmp:
            db = os.path.join(tmp, "obs_test.db")
            saved = watchlist_store.upsert_custom_observations(
                [
                    {
                        "date": "2026-11-01",
                        "commodity_id": "tomatoes_basket",
                        "commodity_name": "Tomatoes (Fresh Basket)",
                        "category": "Perishables",
                        "unit": "50kg basket",
                        "market_id": "mile12_lagos",
                        "market_name": "Mile 12 Market, Lagos",
                        "state": "Lagos",
                        "region": "South-West",
                        "price_ngn": 145000,
                    }
                ],
                db_path=db,
            )
            self.assertEqual(len(saved), 1)
            obs_id = saved[0]["id"]

            merged_rows = load_dataset(db_path=db)
            res = analyze(merged_rows, {
                "commodityId": "tomatoes_basket",
                "marketId": "mile12_lagos",
                "forecastMonths": 6,
                "modelType": "sarima",
            })
            self.assertEqual(res["meta"]["latestDate"], "2026-11-01")
            self.assertEqual(res["kpis"]["latestPriceNgn"], 145000)
            self.assertTrue(res["history"][-1]["is_custom"])

            after_del = watchlist_store.delete_custom_observation(obs_id, db_path=db)
            self.assertEqual(len(after_del), 0)

    def test_price_target_alert_rules(self):
        from analytics_engine import evaluate_alerts
        with tempfile.TemporaryDirectory() as tmp:
            db = os.path.join(tmp, "price_target_alerts.db")
            # Pair not in starter watchlist (garri_white @ ariaria_aba)
            series = sorted(
                [r for r in self.rows if r["commodity_id"] == "garri_white" and r["market_id"] == "ariaria_aba"],
                key=lambda r: r["date"],
            )
            latest_price = series[-1]["price_ngn"]

            rule_above = watchlist_store.create_alert_rule(
                name="Garri Ceiling Watch",
                direction="above",
                rule_type="price_target",
                target_price_ngn=max(1000, latest_price - 5000),
                commodity_id="garri_white",
                market_id="ariaria_aba",
                db_path=db,
            )
            rule_below = watchlist_store.create_alert_rule(
                name="Garri Floor Watch",
                direction="below",
                rule_type="price_target",
                target_price_ngn=latest_price + 5000,
                commodity_id="garri_white",
                market_id="ariaria_aba",
                db_path=db,
            )

            res = evaluate_alerts(self.rows, db_path=db)
            matched_ids = {a["ruleId"] for a in res["alerts"]}
            self.assertIn(rule_above["id"], matched_ids)
            self.assertIn(rule_below["id"], matched_ids)
            target_alert = next(a for a in res["alerts"] if a["ruleId"] == rule_above["id"])
            self.assertEqual(target_alert["ruleType"], "price_target")
            self.assertEqual(target_alert["baselineType"], "price_target")

            watchlist_store.update_alert_rule(rule_above["id"], enabled=False, db_path=db)
            res_after = evaluate_alerts(self.rows, db_path=db)
            self.assertNotIn(rule_above["id"], {a["ruleId"] for a in res_after["alerts"]})

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

    def test_seo_assets_and_compressed_og_image(self):
        import seo_tools

        sitemap = seo_tools.build_sitemap_xml("http://example.com/")
        self.assertIn("https://example.com/price-forecast", sitemap)
        self.assertIn("https://example.com/watchlists", sitemap)
        self.assertIn("https://example.com/reports-python", sitemap)

        robots = seo_tools.build_robots_txt("https://example.com")
        self.assertIn("Allow: /", robots)
        self.assertIn("Disallow: /api/", robots)
        self.assertIn("Sitemap: https://example.com/sitemap.xml", robots)

        llms = seo_tools.build_llms_txt("https://example.com")
        self.assertIn("# NaijaPrice Tracker", llms)
        self.assertIn("https://example.com/market-arbitrage", llms)

        png_bytes = seo_tools.generate_og_image_png()
        self.assertTrue(png_bytes.startswith(b"\x89PNG\r\n\x1a\n"))
        self.assertLess(len(png_bytes), 65000)

        svg = seo_tools.generate_brand_mark_svg()
        self.assertIn("<svg", svg)
        self.assertLess(len(svg), 1024)

    def test_pwa_icons_and_manifest(self):
        import json
        import struct
        import seo_tools

        manifest = json.loads(seo_tools.build_manifest_json())
        self.assertEqual(manifest["id"], "/")
        self.assertEqual(manifest["display"], "standalone")
        self.assertLessEqual(len(manifest["short_name"]), 12)
        purposes = {ic["sizes"]: ic["purpose"] for ic in manifest["icons"]}
        self.assertIn("192x192", purposes)
        self.assertIn("512x512", purposes)
        self.assertTrue(any(ic["purpose"] == "maskable" for ic in manifest["icons"]))

        for expected_size, maskable in [(180, False), (192, False), (512, False), (512, True)]:
            png_bytes = seo_tools.generate_app_icon_png(expected_size, maskable=maskable)
            self.assertTrue(png_bytes.startswith(b"\x89PNG\r\n\x1a\n"))
            w, h = struct.unpack(">II", png_bytes[16:24])
            self.assertEqual((w, h), (expected_size, expected_size))


if __name__ == "__main__":
    unittest.main()
