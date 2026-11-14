"""
Pure-Python PDF 1.4 Generator for NaijaPrice Tracker Formal Commodity Intelligence Briefs.
Uses standard PDF Type1 fonts (Helvetica, Helvetica-Bold, Courier) with exact xref offsets
and automatic multi-page pagination—zero external Python dependencies required.
"""

from datetime import datetime
import textwrap


def _pdf_escape(text: str) -> str:
    """Escape special characters and coerce non-WinAnsi characters (like Naira U+20A6) safely."""
    safe = (
        str(text)
        .replace("\u20a6", "NGN ")
        .replace("\u2014", "--")
        .replace("\u2013", "-")
        .replace("\u00b7", "|")
        .replace("\u2264", "<=")
        .replace("\u2265", ">=")
    )
    ascii_safe = safe.encode("latin-1", "replace").decode("latin-1")
    return ascii_safe.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _fmt_ngn(value) -> str:
    if value is None:
        return "-"
    try:
        return f"NGN {round(float(value)):,}"
    except (TypeError, ValueError):
        return "-"


def _fmt_pct(value, plus=True) -> str:
    if value is None:
        return "-"
    try:
        v = float(value)
        sign = "+" if plus and v > 0 else ""
        return f"{sign}{v:.1f}%"
    except (TypeError, ValueError):
        return "-"


class _Canvas:
    """Minimal multi-page PDF 1.4 layout builder (US Letter 612x792pt)."""

    PAGE_W = 612
    PAGE_H = 792
    MARGIN_L = 44
    MARGIN_R = 44
    CONTENT_W = 612 - 88
    BOTTOM_LIMIT = 56

    def __init__(self, title: str):
        self.title = title
        self.pages = [[]]
        self.y = self.PAGE_H - 46

    def _ops(self):
        return self.pages[-1]

    def new_page(self):
        self.pages.append([])
        self.y = self.PAGE_H - 52
        self.draw_text("NAIJAPRICE TRACKER | COMMODITY INTELLIGENCE BRIEF (CONT.)", self.MARGIN_L, self.y, font="F2", size=8, color=(0.45, 0.50, 0.56))
        self.y -= 10
        self.draw_line(self.MARGIN_L, self.y, self.PAGE_W - self.MARGIN_R, self.y, color=(0.86, 0.89, 0.92), width=0.75)
        self.y -= 18

    def ensure_space(self, needed_pt: float):
        if self.y - needed_pt < self.BOTTOM_LIMIT:
            self.new_page()

    def draw_rect(self, x, y, w, h, fill=None, stroke=None, width=0.75):
        parts = ["q"]
        if fill:
            parts.append(f"{fill[0]:.3f} {fill[1]:.3f} {fill[2]:.3f} rg")
        if stroke:
            parts.append(f"{stroke[0]:.3f} {stroke[1]:.3f} {stroke[2]:.3f} RG {width:.2f} w")
        parts.append(f"{x:.2f} {y:.2f} {w:.2f} {h:.2f} re")
        if fill and stroke:
            parts.append("B")
        elif fill:
            parts.append("f")
        else:
            parts.append("S")
        parts.append("Q")
        self._ops().append("\n".join(parts))

    def draw_line(self, x1, y1, x2, y2, color=(0.85, 0.88, 0.92), width=0.75):
        self._ops().append(
            f"q {color[0]:.3f} {color[1]:.3f} {color[2]:.3f} RG {width:.2f} w "
            f"{x1:.2f} {y1:.2f} m {x2:.2f} {y2:.2f} l S Q"
        )

    def draw_text(self, text, x, y, font="F1", size=10, color=(0.06, 0.09, 0.16)):
        esc = _pdf_escape(text)
        self._ops().append(
            f"BT /{font} {size:.1f} Tf {color[0]:.3f} {color[1]:.3f} {color[2]:.3f} rg "
            f"1 0 0 1 {x:.2f} {y:.2f} Tm ({esc}) Tj ET"
        )

    def draw_text_right(self, text, x_right, y, font="F1", size=10, color=(0.06, 0.09, 0.16)):
        # Approximate character width for Helvetica/Courier to right-align cleanly
        char_w = size * (0.58 if font == "F3" else 0.50)
        est_w = len(_pdf_escape(text)) * char_w
        self.draw_text(text, max(self.MARGIN_L, x_right - est_w), y, font=font, size=size, color=color)

    def draw_wrapped(self, text, x, width_pt, font="F1", size=9.5, leading=13.5, color=(0.20, 0.25, 0.33)):
        max_chars = max(24, int(width_pt / (size * 0.48)))
        lines = textwrap.wrap(str(text), width=max_chars)
        for line in lines:
            self.ensure_space(leading + 4)
            self.draw_text(line, x, self.y, font=font, size=size, color=color)
            self.y -= leading

    def draw_section_heading(self, title: str):
        self.ensure_space(28)
        self.y -= 6
        self.draw_text(title, self.MARGIN_L, self.y, font="F2", size=11.5, color=(0.06, 0.09, 0.16))
        self.y -= 6
        self.draw_line(self.MARGIN_L, self.y, self.PAGE_W - self.MARGIN_R, self.y, color=(0.08, 0.50, 0.24), width=1.0)
        self.y -= 14

    def build_pdf_bytes(self) -> bytes:
        total_pages = len(self.pages)
        # Add footer page numbers to all pages
        generated_stamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
        for idx, ops in enumerate(self.pages, start=1):
            ops.append(
                f"q 0.850 0.880 0.920 RG 0.60 w {self.MARGIN_L:.2f} 38.00 m {self.PAGE_W - self.MARGIN_R:.2f} 38.00 l S Q"
            )
            footer_left = _pdf_escape(f"NaijaPrice Tracker | Generated {generated_stamp}")
            footer_right = _pdf_escape(f"Page {idx} of {total_pages}")
            ops.append(
                f"BT /F1 8.0 Tf 0.400 0.450 0.520 rg 1 0 0 1 {self.MARGIN_L:.2f} 24.00 Tm ({footer_left}) Tj ET"
            )
            ops.append(
                f"BT /F1 8.0 Tf 0.400 0.450 0.520 rg 1 0 0 1 {self.PAGE_W - self.MARGIN_R - 55:.2f} 24.00 Tm ({footer_right}) Tj ET"
            )

        objects = []

        def add_obj(body: str) -> int:
            objects.append(body)
            return len(objects)

        # 1: Catalog, 2: Pages (placeholders updated after page objects)
        catalog_id = add_obj("")
        pages_id = add_obj("")
        f1_id = add_obj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
        f2_id = add_obj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")
        f3_id = add_obj("<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>")

        page_ids = []
        for ops in self.pages:
            stream = "\n".join(ops)
            stream_bytes = stream.encode("latin-1", "replace")
            content_id = add_obj(
                f"<< /Length {len(stream_bytes)} >>\nstream\n{stream}\nendstream"
            )
            page_id = add_obj(
                f"<< /Type /Page /Parent {pages_id} 0 R "
                f"/MediaBox [0 0 {self.PAGE_W} {self.PAGE_H}] "
                f"/Resources << /Font << /F1 {f1_id} 0 R /F2 {f2_id} 0 R /F3 {f3_id} 0 R >> >> "
                f"/Contents {content_id} 0 R >>"
            )
            page_ids.append(page_id)

        kids_str = " ".join(f"{pid} 0 R" for pid in page_ids)
        objects[catalog_id - 1] = f"<< /Type /Catalog /Pages {pages_id} 0 R >>"
        objects[pages_id - 1] = f"<< /Type /Pages /Kids [{kids_str}] /Count {len(page_ids)} >>"

        out = bytearray(b"%PDF-1.4\n")
        offsets = [0]
        for idx, body in enumerate(objects, start=1):
            offsets.append(len(out))
            out.extend(f"{idx} 0 obj\n{body}\nendobj\n".encode("latin-1", "replace"))

        xref_pos = len(out)
        out.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
        out.extend(b"0000000000 65535 f \n")
        for off in offsets[1:]:
            out.extend(f"{off:010d} 00000 n \n".encode("ascii"))
        out.extend(
            (
                f"trailer\n<< /Size {len(objects) + 1} /Root {catalog_id} 0 R >>\n"
                f"startxref\n{xref_pos}\n%%EOF\n"
            ).encode("ascii")
        )
        return bytes(out)


MODEL_NAMES = {
    "ridge_seasonal": "Ridge + Seasonal Dummies",
    "poly_seasonal": "Polynomial + Fourier Harmonics",
    "holt_winters": "Holt-Winters Multiplicative",
}


def generate_commodity_brief_pdf(
    analysis: dict,
    watchlist_name: str = "",
    watchlist_items: list | None = None,
    alerts: list | None = None,
) -> bytes:
    meta = analysis.get("meta", {})
    kpis = analysis.get("kpis", {})
    season = analysis.get("seasonality", {})
    backtest = analysis.get("backtest", {})
    arb = analysis.get("arbitrage", {})
    insights = analysis.get("insights", {})
    forecast = analysis.get("forecast", [])
    markets = analysis.get("marketComparison", [])
    model_label = MODEL_NAMES.get(analysis.get("modelType", ""), str(analysis.get("modelType", "")))

    c = _Canvas("NaijaPrice Tracker Commodity Intelligence Brief")

    # Formal Header Banner
    c.draw_rect(c.MARGIN_L, c.y - 46, c.CONTENT_W, 56, fill=(0.96, 0.98, 0.97), stroke=(0.82, 0.88, 0.85))
    c.draw_rect(c.MARGIN_L, c.y + 6, c.CONTENT_W, 4, fill=(0.08, 0.50, 0.24))
    c.draw_text("NAIJAPRICE TRACKER | FORMAL COMMODITY INTELLIGENCE BRIEF", c.MARGIN_L + 12, c.y - 8, font="F2", size=8.5, color=(0.08, 0.50, 0.24))
    c.draw_text(
        f"{meta.get('commodityName', '')} ({meta.get('unit', '')}) -- {meta.get('marketName', '')}",
        c.MARGIN_L + 12,
        c.y - 25,
        font="F2",
        size=13.5,
        color=(0.06, 0.09, 0.16),
    )
    c.draw_text(
        f"Location: {meta.get('state', '')}, {meta.get('region', '')}  |  Series: {meta.get('observations', 0)} months ending {meta.get('latestDate', '')}  |  Model: {model_label}",
        c.MARGIN_L + 12,
        c.y - 39,
        font="F1",
        size=8.5,
        color=(0.32, 0.38, 0.46),
    )
    c.y -= 66

    # Executive Metrics Grid (4 clean boxes)
    box_w = (c.CONTENT_W - 18) / 4.0
    cards = [
        ("LATEST SPOT PRICE", _fmt_ngn(kpis.get("latestPriceNgn")), f"{_fmt_pct(kpis.get('momPct'))} MoM | {_fmt_pct(kpis.get('yoyPct'))} YoY"),
        (f"{len(forecast)}-MO PROJECTION", _fmt_ngn(kpis.get("projectedEndNgn")), f"{_fmt_pct(kpis.get('projectedChangePct'))} vs spot"),
        ("SEASONAL PEAK / TROUGH", f"{season.get('peakMonth', '-')} / {season.get('troughMonth', '-')}", f"Strength {season.get('strengthPct', 0):.0f}% | Spread {season.get('seasonalSpreadPct', 0):.1f}%"),
        ("HOLDOUT BACKTEST", f"{backtest.get('mape', 0):.2f}% MAPE", f"RMSE {_fmt_ngn(backtest.get('rmse'))}"),
    ]
    for i, (lbl, val, sub) in enumerate(cards):
        bx = c.MARGIN_L + i * (box_w + 6)
        c.draw_rect(bx, c.y - 46, box_w, 48, fill=(1.0, 1.0, 1.0), stroke=(0.86, 0.89, 0.93))
        c.draw_text(lbl, bx + 8, c.y - 10, font="F2", size=7.2, color=(0.40, 0.45, 0.52))
        c.draw_text(val, bx + 8, c.y - 26, font="F2", size=11.0, color=(0.06, 0.09, 0.16))
        c.draw_text(sub, bx + 8, c.y - 39, font="F1", size=7.5, color=(0.35, 0.41, 0.49))
    c.y -= 62

    # Decision Guidance & Methodology
    c.draw_section_heading(f"1. Decision Brief & Quantitative Assessment ({insights.get('traderSignal', 'Market Note')})")
    c.draw_text("Trader Procurement Guidance:", c.MARGIN_L, c.y, font="F2", size=9.5, color=(0.08, 0.50, 0.24))
    c.y -= 13
    c.draw_wrapped(insights.get("traderSummary", ""), c.MARGIN_L, c.CONTENT_W)
    c.y -= 4
    c.draw_text("Statistical & Academic Methodology Note:", c.MARGIN_L, c.y, font="F2", size=9.5, color=(0.15, 0.23, 0.35))
    c.y -= 13
    c.draw_wrapped(insights.get("studentNote", ""), c.MARGIN_L, c.CONTENT_W)

    # Forecast Schedule Table
    c.draw_section_heading(f"2. {len(forecast)}-Month Price Forecast Schedule ({model_label})")
    col_x = [c.MARGIN_L, c.MARGIN_L + 170, c.MARGIN_L + 330, c.MARGIN_L + 520]
    c.draw_rect(c.MARGIN_L, c.y - 4, c.CONTENT_W, 17, fill=(0.95, 0.96, 0.98))
    c.draw_text("Period", col_x[0] + 6, c.y + 1, font="F2", size=8.5)
    c.draw_text_right("Point Forecast", col_x[1] + 75, c.y + 1, font="F2", size=8.5)
    c.draw_text_right("Lower 95% CI", col_x[2] + 75, c.y + 1, font="F2", size=8.5)
    c.draw_text_right("Upper 95% CI", col_x[3], c.y + 1, font="F2", size=8.5)
    c.y -= 18

    for fc in forecast:
        c.ensure_space(16)
        c.draw_text(str(fc.get("date", "")), col_x[0] + 6, c.y, font="F1", size=8.8)
        c.draw_text_right(_fmt_ngn(fc.get("predicted_ngn")), col_x[1] + 75, c.y, font="F3", size=8.8, color=(0.08, 0.50, 0.24))
        c.draw_text_right(_fmt_ngn(fc.get("lower95_ngn")), col_x[2] + 75, c.y, font="F3", size=8.8)
        c.draw_text_right(_fmt_ngn(fc.get("upper95_ngn")), col_x[3], c.y, font="F3", size=8.8)
        c.y -= 4
        c.draw_line(c.MARGIN_L, c.y, c.PAGE_W - c.MARGIN_R, c.y, color=(0.92, 0.94, 0.96), width=0.5)
        c.y -= 11

    # Cross-Market Arbitrage Table
    c.draw_section_heading(
        f"3. Cross-Market Regional Comparison (National Spread: {_fmt_ngn(arb.get('spreadNgn'))} / {_fmt_pct(arb.get('spreadPct'), plus=False)})"
    )
    m_x = [c.MARGIN_L + 6, c.MARGIN_L + 225, c.MARGIN_L + 390, c.MARGIN_L + 520]
    c.draw_rect(c.MARGIN_L, c.y - 4, c.CONTENT_W, 17, fill=(0.95, 0.96, 0.98))
    c.draw_text("Nigerian Market", m_x[0], c.y + 1, font="F2", size=8.5)
    c.draw_text("State / Region", m_x[1], c.y + 1, font="F2", size=8.5)
    c.draw_text_right("Spot Price", m_x[2] + 45, c.y + 1, font="F2", size=8.5)
    c.draw_text_right("vs National Avg", m_x[3], c.y + 1, font="F2", size=8.5)
    c.y -= 18

    for mkt in markets:
        c.ensure_space(16)
        c.draw_text(str(mkt.get("marketName", "")), m_x[0], c.y, font="F1", size=8.8)
        c.draw_text(f"{mkt.get('state', '')} ({mkt.get('region', '')})", m_x[1], c.y, font="F1", size=8.5, color=(0.35, 0.41, 0.49))
        c.draw_text_right(_fmt_ngn(mkt.get("price_ngn")), m_x[2] + 45, c.y, font="F3", size=8.8)
        c.draw_text_right(_fmt_pct(mkt.get("vsNationalAvgPct")), m_x[3], c.y, font="F3", size=8.8)
        c.y -= 4
        c.draw_line(c.MARGIN_L, c.y, c.PAGE_W - c.MARGIN_R, c.y, color=(0.92, 0.94, 0.96), width=0.5)
        c.y -= 11

    # Monitored Watchlist Performance Highlights
    if watchlist_items:
        label = watchlist_name or "Monitored Watchlist"
        c.draw_section_heading(f"4. Personalized Watchlist Highlights: {label}")
        w_x = [c.MARGIN_L + 4, c.MARGIN_L + 135, c.MARGIN_L + 295, c.MARGIN_L + 365, c.MARGIN_L + 450, c.MARGIN_L + 522]
        c.draw_rect(c.MARGIN_L, c.y - 4, c.CONTENT_W, 17, fill=(0.95, 0.96, 0.98))
        c.draw_text("Commodity", w_x[0], c.y + 1, font="F2", size=8.2)
        c.draw_text("Market", w_x[1], c.y + 1, font="F2", size=8.2)
        c.draw_text_right("Spot", w_x[2], c.y + 1, font="F2", size=8.2)
        c.draw_text_right("MoM / YoY", w_x[3], c.y + 1, font="F2", size=8.2)
        c.draw_text_right("6M Forecast", w_x[4], c.y + 1, font="F2", size=8.2)
        c.draw_text_right("Phase", w_x[5], c.y + 1, font="F2", size=8.2)
        c.y -= 18

        for item in watchlist_items:
            c.ensure_space(16)
            comm_txt = str(item.get("commodityName", ""))[:22]
            mkt_txt = str(item.get("marketName", ""))[:25]
            c.draw_text(comm_txt, w_x[0], c.y, font="F1", size=8.2)
            c.draw_text(mkt_txt, w_x[1], c.y, font="F1", size=8.2, color=(0.32, 0.38, 0.46))
            c.draw_text_right(_fmt_ngn(item.get("latestPriceNgn")), w_x[2], c.y, font="F3", size=8.0)
            c.draw_text_right(f"{_fmt_pct(item.get('momPct'))}/{_fmt_pct(item.get('yoyPct'))}", w_x[3], c.y, font="F3", size=7.8)
            c.draw_text_right(_fmt_ngn(item.get("projectedEndNgn")), w_x[4], c.y, font="F3", size=8.0, color=(0.08, 0.50, 0.24))
            c.draw_text_right(str(item.get("seasonalPhase", "-")), w_x[5], c.y, font="F1", size=8.0)
            c.y -= 4
            c.draw_line(c.MARGIN_L, c.y, c.PAGE_W - c.MARGIN_R, c.y, color=(0.92, 0.94, 0.96), width=0.5)
            c.y -= 11

    # Active Threshold Deviation Alerts
    if alerts:
        c.draw_section_heading(f"5. Active Price Threshold Alerts ({len(alerts)} Triggered)")
        for al in alerts:
            c.ensure_space(28)
            sev = str(al.get("severity", "warning")).upper()
            rule_name = str(al.get("ruleName", "Threshold Alert"))
            c.draw_text(
                f"[{sev}] {rule_name} -- {_fmt_pct(al.get('deviationPct'))} vs {al.get('baselineLabel', 'Baseline')}",
                c.MARGIN_L,
                c.y,
                font="F2",
                size=8.8,
                color=(0.75, 0.14, 0.14) if sev == "CRITICAL" else (0.72, 0.41, 0.04),
            )
            c.y -= 12
            c.draw_wrapped(al.get("message", ""), c.MARGIN_L + 8, c.CONTENT_W - 8, size=8.5, leading=11.5)
            c.y -= 4

    return c.build_pdf_bytes()
