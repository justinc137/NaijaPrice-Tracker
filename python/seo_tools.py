"""
NaijaPrice Tracker - Python SEO, Sitemap, llms.txt & Compressed Image Generator
Pure Python 3.10 utilities for:
  - Generating public/sitemap.xml and dynamic sitemap responses
  - Generating public/robots.txt
  - Generating public/llms.txt (llmstxt.org spec)
  - Generating compressed 1200x630 PNG og:image (zlib level-9 + Sub filter)
  - Generating compact vector SVG brand mark & favicon
"""

import json
import math
import os
import struct
import sys
import zlib
from datetime import date

ROUTES = [
    {
        "slug": "/",
        "priority": "1.0",
        "changefreq": "weekly",
        "title": "Price & Forecast",
        "description": "Interactive Nigerian commodity price trends, 12-month seasonality decomposition, and Ridge/Fourier/Holt-Winters forecasting.",
    },
    {
        "slug": "/price-forecast",
        "priority": "0.9",
        "changefreq": "weekly",
        "title": "Commodity Price Trajectory & Forecasting",
        "description": "Analyze spot prices, 12-month moving averages, and 3-to-12 month forecast intervals across Nigerian markets.",
    },
    {
        "slug": "/watchlists",
        "priority": "0.9",
        "changefreq": "daily",
        "title": "Personalized Watchlists & Deviation Alerts",
        "description": "Monitor custom combinations of Nigerian commodities and markets with SQLite-backed threshold alerts.",
    },
    {
        "slug": "/seasonality-matrix",
        "priority": "0.8",
        "changefreq": "monthly",
        "title": "Nigerian Commodity Seasonality Matrix",
        "description": "Compare harvest gluts and lean-season price peaks across 12 calendar months for staple crops.",
    },
    {
        "slug": "/market-arbitrage",
        "priority": "0.8",
        "changefreq": "weekly",
        "title": "Cross-Market Arbitrage & Transport Margin Calculator",
        "description": "Identify origin-to-destination price spreads across Lagos, Kano, Ibadan, Abuja, Aba, and Jos markets.",
    },
    {
        "slug": "/data-ledger",
        "priority": "0.7",
        "changefreq": "weekly",
        "title": "Market Price Data Ledger & CSV Survey Import",
        "description": "Browse 2,784 monthly Nigerian market observations or upload local field survey CSV prices.",
    },
    {
        "slug": "/reports-python",
        "priority": "0.8",
        "changefreq": "weekly",
        "title": "Commodity Intelligence Briefs, PDF Export & Python Source",
        "description": "Download formal PDF market intelligence briefs, forecast CSVs, and the standalone Streamlit/Pandas/Scikit-learn script.",
    },
]


def normalize_base_url(base_url: str) -> str:
    raw = (base_url or "https://naijaprice-tracker.app").strip().rstrip("/")
    if raw.startswith("http://") and "localhost" not in raw and "127.0.0.1" not in raw:
        raw = "https://" + raw[len("http://"):]
    if not raw.startswith(("http://", "https://")):
        raw = "https://" + raw
    return raw


def build_sitemap_xml(base_url: str, lastmod: str | None = None) -> str:
    root = normalize_base_url(base_url)
    mod_date = lastmod or date.today().isoformat()
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for route in ROUTES:
        loc = f"{root}/" if route["slug"] == "/" else f"{root}{route['slug']}"
        lines.extend([
            "  <url>",
            f"    <loc>{loc}</loc>",
            f"    <lastmod>{mod_date}</lastmod>",
            f"    <changefreq>{route['changefreq']}</changefreq>",
            f"    <priority>{route['priority']}</priority>",
            "  </url>",
        ])
    lines.append("</urlset>")
    return "\n".join(lines) + "\n"


def build_robots_txt(base_url: str) -> str:
    root = normalize_base_url(base_url)
    return "\n".join([
        "User-agent: *",
        "Allow: /",
        "Disallow: /api/",
        "",
        f"Sitemap: {root}/sitemap.xml",
        "",
    ])


def build_llms_txt(base_url: str) -> str:
    root = normalize_base_url(base_url)
    lines = [
        "# NaijaPrice Tracker",
        "",
        "> Interactive Nigerian agricultural commodity price analytics, seasonality decomposition, multi-model forecasting, SQLite watchlists, threshold deviation alerts, and exportable PDF market intelligence briefs.",
        "",
        "NaijaPrice Tracker helps Nigerian agro-traders, researchers, and students evaluate wholesale/retail Naira (NGN) commodity trajectories across six regional hubs (Mile 12 Lagos, Dawanau Kano, Bodija Ibadan, Wuse Abuja, Relief Market Aba, and Terminus Market Jos) using a Python analytics engine.",
        "",
        "## Core Workspace Views",
        "",
    ]
    for route in ROUTES:
        if route["slug"] == "/":
            continue
        lines.append(f"- [{route['title']}]({root}{route['slug']}): {route['description']}")

    lines.extend([
        "",
        "## Tracked Commodities (2022–2026 Monthly Series)",
        "",
        "- Rice (Local Ofada) — 50kg bag (Grains & Cereals)",
        "- Garri (White) — 50kg bag (Tubers & Processed)",
        "- Beans (Oloyin Brown) — 100kg bag (Legumes)",
        "- Maize (Yellow) — 100kg bag (Grains & Cereals)",
        "- Tomatoes (Fresh) — 45kg basket (Perishables)",
        "- Yam (Puna / White) — 100kg bundle (Tubers & Processed)",
        "- Palm Oil — 25L jerrycan (Oils & Fats)",
        "- Onions (Red Sokoto) — 100kg bag (Perishables)",
        "",
        "## Quantitative Methodology",
        "",
        "- **Seasonal Decomposition**: Centered 12-month moving-average multiplicative decomposition identifying harvest gluts and lean-season peaks.",
        "- **Forecasting Models**: Ridge Linear + Seasonal Dummies, Polynomial + Fourier Harmonics, and Multiplicative Holt-Winters with 6-month holdout backtesting (MAE, RMSE, MAPE).",
        "- **Alerts & Persistence**: SQLite-backed custom watchlists and threshold alerts comparing spot prices against trailing 12-month averages, OLS trendlines, and all-time means.",
        "",
        "## Machine-Readable & Export Resources",
        "",
        f"- [XML Sitemap]({root}/sitemap.xml): Canonical URL index for all application routes.",
        f"- [Historical Commodity Dataset CSV]({root}/api/export/dataset): 2,784 monthly NGN observations (Jan 2022–Oct 2026).",
        f"- [Standalone Streamlit App (Python)]({root}/api/export/streamlit): Portable Pandas, Plotly, and Scikit-learn companion script.",
        "",
    ])
    return "\n".join(lines)


def _png_chunk(chunk_type: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + chunk_type
        + data
        + struct.pack(">I", zlib.crc32(chunk_type + data) & 0xFFFFFFFF)
    )


def generate_og_image_png(width: int = 1200, height: int = 630) -> bytes:
    """
    Generate a crisp, zlib-compressed 1200x630 RGB PNG social preview card
    using pure Python stdlib (no Pillow dependency required).
    Uses row-template slicing + PNG Sub filter + zlib level 9 (~10-20 KB, <0.1s).
    """
    def rgb(r: int, g: int, b: int) -> bytes:
        return bytes((r, g, b))

    bg = rgb(15, 23, 42)          # slate-900
    card = rgb(30, 41, 59)        # slate-800
    border = rgb(51, 65, 85)      # slate-700
    emerald = rgb(16, 185, 129)   # emerald-500
    emerald_dk = rgb(6, 95, 70)   # emerald-800
    fc_bg = rgb(20, 45, 48)
    grid = rgb(43, 55, 73)
    amber = rgb(245, 158, 11)     # amber-500
    text_light = rgb(248, 250, 252)
    text_muted = rgb(148, 163, 184)
    panel_dark = rgb(22, 34, 52)

    chart_x0, chart_x1 = 120, 1080
    chart_y0, chart_y1 = 230, 520
    split_x = int(chart_x0 + 0.72 * (chart_x1 - chart_x0))

    # Build reusable base rows for fast O(H) construction
    bg_row = bg * width
    card_row = bytearray(bg_row)
    card_row[48 * 3 : (width - 47) * 3] = card * (width - 95)
    card_row[48 * 3 : 50 * 3] = border * 2
    card_row[(width - 49) * 3 : (width - 47) * 3] = border * 2

    stripe_row = bytearray(bg_row)
    stripe_row[48 * 3 : (width - 47) * 3] = emerald * (width - 95)

    border_row = bytearray(bg_row)
    border_row[48 * 3 : (width - 47) * 3] = border * (width - 95)

    chart_row = bytearray(card_row)
    chart_row[split_x * 3 : (chart_x1 + 1) * 3] = fc_bg * (chart_x1 + 1 - split_x)

    grid_row = bytearray(chart_row)
    grid_row[chart_x0 * 3 : (chart_x1 + 1) * 3] = grid * (chart_x1 + 1 - chart_x0)

    rows = []
    for y in range(height):
        if y < 48 or y > height - 48:
            row = bytearray(bg_row)
        elif y <= 54:
            row = bytearray(stripe_row)
        elif y in (height - 49, height - 48):
            row = bytearray(border_row)
        elif chart_y0 <= y <= chart_y1:
            row = bytearray(grid_row if y in (270, 340, 410, 480) else chart_row)
            if y % 10 < 6:
                row[split_x * 3 : (split_x + 2) * 3] = emerald * 2
        else:
            row = bytearray(card_row)

        # Header accent bars
        if 88 <= y <= 110:
            row[92 * 3 : 420 * 3] = text_light * (420 - 92)
        if 126 <= y <= 140:
            row[92 * 3 : 560 * 3] = text_muted * (560 - 92)
        if 88 <= y <= 140:
            if y <= 90 or y >= 138:
                row[860 * 3 : 1109 * 3] = emerald * (1109 - 860)
            else:
                row[860 * 3 : 1109 * 3] = panel_dark * (1109 - 860)
                row[860 * 3 : 862 * 3] = emerald * 2
                row[1107 * 3 : 1109 * 3] = emerald * 2
                if 102 <= y <= 126:
                    row[882 * 3 : 980 * 3] = emerald * (980 - 882)
                    row[980 * 3 : 1084 * 3] = text_light * (1084 - 980)

        # Bottom 4 KPI strips
        if 542 <= y <= 558:
            for kx in (92, 355, 618, 881):
                col = emerald if kx == 92 else border
                row[kx * 3 : (kx + 220) * 3] = col * 220

        rows.append(row)

    # Overlay trajectory curve, confidence band, and latest spot marker in O(W)
    for x in range(chart_x0, chart_x1 + 1):
        t = (x - chart_x0) / max(1, (chart_x1 - chart_x0))
        cy = int(round(chart_y0 + (0.72 - 0.52 * t + 0.08 * math.sin(t * math.pi * 6.0)) * (chart_y1 - chart_y0)))
        if x >= split_x:
            band = int(14 + (x - split_x) * 0.08)
            for yy in range(max(chart_y0, cy - band), min(chart_y1 + 1, cy + band + 1)):
                rows[yy][x * 3 : (x + 1) * 3] = emerald_dk
        stroke_col = emerald if x >= split_x else text_light
        for yy in range(max(chart_y0, cy - 2), min(chart_y1 + 1, cy + 3)):
            rows[yy][x * 3 : (x + 1) * 3] = stroke_col

    split_cy = int(round(chart_y0 + (0.72 - 0.52 * 0.72 + 0.08 * math.sin(0.72 * math.pi * 6.0)) * (chart_y1 - chart_y0)))
    for dy in range(-7, 8):
        for dx in range(-7, 8):
            if dx * dx + dy * dy <= 49:
                yy, xx = split_cy + dy, split_x + dx
                if chart_y0 <= yy <= chart_y1 and chart_x0 <= xx <= chart_x1:
                    rows[yy][xx * 3 : (xx + 1) * 3] = amber

    raw_rows = bytearray()
    for row in rows:
        filtered = bytearray(1 + len(row))
        filtered[0] = 1
        # Fast filter type 1 (Sub)
        filtered[1:4] = row[0:3]
        for i in range(3, len(row)):
            filtered[1 + i] = (row[i] - row[i - 3]) & 0xFF
        raw_rows.extend(filtered)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    compressed = zlib.compress(bytes(raw_rows), level=9)
    return (
        b"\x89PNG\r\n\x1a\n"
        + _png_chunk(b"IHDR", ihdr)
        + _png_chunk(b"IDAT", compressed)
        + _png_chunk(b"IEND", b"")
    )


def _dist_to_segment(px: float, py: float, x1: float, y1: float, x2: float, y2: float) -> float:
    dx, dy = x2 - x1, y2 - y1
    seg_len_sq = dx * dx + dy * dy
    if seg_len_sq == 0.0:
        return math.hypot(px - x1, py - y1)
    t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / seg_len_sq))
    proj_x = x1 + t * dx
    proj_y = y1 + t * dy
    return math.hypot(px - proj_x, py - proj_y)


def generate_app_icon_png(size: int = 192, maskable: bool = False) -> bytes:
    """
    Generate a crisp PNG PWA app icon (180x180, 192x192, or 512x512) in pure Python.
    Maskable icons use full-bleed emerald background and keep artwork inside the 64% safe zone.
    """
    emerald_bg = (4, 120, 87)      # #047857
    emerald_deep = (6, 95, 70)     # #065f46
    outer_bg = (15, 23, 42)        # #0f172a
    white = (255, 255, 255)
    mint = (167, 243, 208)         # #a7f3d0
    soft_mint = (236, 253, 245)    # #ecfdf5

    scale = 0.64 if maskable else 0.84
    offset = (1.0 - scale) * 0.5

    def map_pt(u: float, v: float) -> tuple[float, float]:
        return (offset + u * scale, offset + v * scale)

    p0 = map_pt(0.16, 0.72)
    p1 = map_pt(0.38, 0.50)
    p2 = map_pt(0.55, 0.62)
    p3 = map_pt(0.84, 0.28)
    arrow_a = map_pt(0.68, 0.28)
    arrow_b = map_pt(0.84, 0.44)
    base_l = map_pt(0.16, 0.82)
    base_r = map_pt(0.84, 0.82)

    stroke_r = 0.044 * scale
    dot_r = 0.062 * scale
    bar_r = 0.022 * scale
    corner_r = 0.22
    aa_px = 1.2 / max(1, size)

    raw_rows = bytearray()
    for y in range(size):
        ny = (y + 0.5) / size
        row = bytearray(size * 3)
        for x in range(size):
            nx = (x + 0.5) / size

            # Rounded square clip when not maskable
            in_card = True
            if not maskable:
                cx = max(corner_r - nx, 0.0, nx - (1.0 - corner_r))
                cy = max(corner_r - ny, 0.0, ny - (1.0 - corner_r))
                if cx > 0.0 and cy > 0.0 and math.hypot(cx, cy) > corner_r:
                    in_card = False

            if not in_card:
                r, g, b = outer_bg
            else:
                # Subtle vertical depth on emerald card
                r, g, b = emerald_deep if ny > 0.78 else emerald_bg

                # Subtle horizontal baseline bar
                d_base = _dist_to_segment(nx, ny, base_l[0], base_l[1], base_r[0], base_r[1])
                if d_base <= bar_r:
                    r, g, b = (16, 150, 108)

                # Arrow head segments
                d_arr1 = _dist_to_segment(nx, ny, arrow_a[0], arrow_a[1], p3[0], p3[1])
                d_arr2 = _dist_to_segment(nx, ny, p3[0], p3[1], arrow_b[0], arrow_b[1])
                if min(d_arr1, d_arr2) <= stroke_r * 0.92:
                    r, g, b = mint

                # Primary trend polyline
                d_line = min(
                    _dist_to_segment(nx, ny, p0[0], p0[1], p1[0], p1[1]),
                    _dist_to_segment(nx, ny, p1[0], p1[1], p2[0], p2[1]),
                    _dist_to_segment(nx, ny, p2[0], p2[1], p3[0], p3[1]),
                )
                if d_line <= stroke_r:
                    r, g, b = white
                elif d_line <= stroke_r + aa_px:
                    alpha = max(0.0, min(1.0, (stroke_r + aa_px - d_line) / aa_px))
                    r = int(r * (1.0 - alpha) + white[0] * alpha)
                    g = int(g * (1.0 - alpha) + white[1] * alpha)
                    b = int(b * (1.0 - alpha) + white[2] * alpha)

                # Inflection node dot
                if math.hypot(nx - p1[0], ny - p1[1]) <= dot_r:
                    r, g, b = soft_mint

            idx = x * 3
            row[idx] = r
            row[idx + 1] = g
            row[idx + 2] = b

        filtered = bytearray(1 + len(row))
        filtered[0] = 1
        filtered[1:4] = row[0:3]
        for i in range(3, len(row)):
            filtered[1 + i] = (row[i] - row[i - 3]) & 0xFF
        raw_rows.extend(filtered)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    compressed = zlib.compress(bytes(raw_rows), level=9)
    return (
        b"\x89PNG\r\n\x1a\n"
        + _png_chunk(b"IHDR", ihdr)
        + _png_chunk(b"IDAT", compressed)
        + _png_chunk(b"IEND", b"")
    )


def build_manifest_json() -> str:
    manifest = {
        "id": "/",
        "name": "NaijaPrice Tracker",
        "short_name": "NaijaPrice",
        "description": (
            "Interactive Nigerian agricultural commodity price analytics, "
            "seasonality detection, forecasting, and offline market briefings."
        ),
        "start_url": "/",
        "scope": "/",
        "display": "standalone",
        "orientation": "portrait-primary",
        "theme_color": "#047857",
        "background_color": "#0f172a",
        "categories": ["finance", "business", "education"],
        "icons": [
            {
                "src": "/pwa-192x192.png",
                "sizes": "192x192",
                "type": "image/png",
                "purpose": "any",
            },
            {
                "src": "/pwa-512x512.png",
                "sizes": "512x512",
                "type": "image/png",
                "purpose": "any",
            },
            {
                "src": "/pwa-maskable-512x512.png",
                "sizes": "512x512",
                "type": "image/png",
                "purpose": "maskable",
            },
        ],
    }
    return json.dumps(manifest, indent=2) + "\n"


def generate_brand_mark_svg() -> str:
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="36" height="36" fill="none">'
        '<rect width="36" height="36" rx="8" fill="#047857"/>'
        '<path d="M7 24L13.5 17.5L18.5 21L28.5 11" stroke="#FFFFFF" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"/>'
        '<path d="M23.5 11H28.5V16" stroke="#A7F3D0" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>'
        '<circle cx="13.5" cy="17.5" r="2" fill="#ECFDF5"/>'
        '</svg>'
    )


def write_static_seo_assets(public_dir: str, base_url: str = "https://naijaprice-tracker.app") -> dict:
    os.makedirs(public_dir, exist_ok=True)
    sitemap_path = os.path.join(public_dir, "sitemap.xml")
    robots_path = os.path.join(public_dir, "robots.txt")
    llms_path = os.path.join(public_dir, "llms.txt")
    og_path = os.path.join(public_dir, "og-image.png")
    brand_path = os.path.join(public_dir, "brand-mark.svg")
    favicon_path = os.path.join(public_dir, "favicon.svg")
    manifest_path = os.path.join(public_dir, "manifest.webmanifest")
    icon_192_path = os.path.join(public_dir, "pwa-192x192.png")
    icon_512_path = os.path.join(public_dir, "pwa-512x512.png")
    icon_maskable_path = os.path.join(public_dir, "pwa-maskable-512x512.png")
    apple_icon_path = os.path.join(public_dir, "apple-touch-icon.png")

    with open(sitemap_path, "w", encoding="utf-8") as f:
        f.write(build_sitemap_xml(base_url))
    with open(robots_path, "w", encoding="utf-8") as f:
        f.write(build_robots_txt(base_url))
    with open(llms_path, "w", encoding="utf-8") as f:
        f.write(build_llms_txt(base_url))
    with open(manifest_path, "w", encoding="utf-8") as f:
        f.write(build_manifest_json())

    og_bytes = generate_og_image_png()
    with open(og_path, "wb") as f:
        f.write(og_bytes)

    icon_192 = generate_app_icon_png(192, maskable=False)
    icon_512 = generate_app_icon_png(512, maskable=False)
    icon_maskable = generate_app_icon_png(512, maskable=True)
    apple_icon = generate_app_icon_png(180, maskable=False)

    with open(icon_192_path, "wb") as f:
        f.write(icon_192)
    with open(icon_512_path, "wb") as f:
        f.write(icon_512)
    with open(icon_maskable_path, "wb") as f:
        f.write(icon_maskable)
    with open(apple_icon_path, "wb") as f:
        f.write(apple_icon)

    svg = generate_brand_mark_svg()
    with open(brand_path, "w", encoding="utf-8") as f:
        f.write(svg)
    with open(favicon_path, "w", encoding="utf-8") as f:
        f.write(svg)

    return {
        "sitemapBytes": os.path.getsize(sitemap_path),
        "robotsBytes": os.path.getsize(robots_path),
        "llmsBytes": os.path.getsize(llms_path),
        "manifestBytes": os.path.getsize(manifest_path),
        "ogImageBytes": len(og_bytes),
        "pwa192Bytes": len(icon_192),
        "pwa512Bytes": len(icon_512),
        "pwaMaskable512Bytes": len(icon_maskable),
        "appleTouchIconBytes": len(apple_icon),
        "svgBytes": len(svg.encode("utf-8")),
    }


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "generate"
    arg_url = sys.argv[2] if len(sys.argv) > 2 else ""
    env_url = os.environ.get("APP_URL") or ""
    if env_url == "MY_APP_URL":
        env_url = ""
    base_url = arg_url or env_url or "https://naijaprice-tracker.app"

    if cmd == "sitemap":
        sys.stdout.write(build_sitemap_xml(base_url))
    elif cmd == "robots":
        sys.stdout.write(build_robots_txt(base_url))
    elif cmd == "llms":
        sys.stdout.write(build_llms_txt(base_url))
    elif cmd == "manifest":
        sys.stdout.write(build_manifest_json())
    elif cmd == "generate":
        root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        public_dir = os.path.join(root_dir, "public")
        result = write_static_seo_assets(public_dir, base_url)
        print(json.dumps(result))
    else:
        print(json.dumps({"error": f"Unknown seo_tools command: {cmd}"}))
        sys.exit(1)


if __name__ == "__main__":
    main()

