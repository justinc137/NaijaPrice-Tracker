import type { WorkspaceTab } from "../types/market";

export interface RouteSeoMeta {
  tab: WorkspaceTab;
  slug: string;
  navLabel: string;
  title: string;
  description: string;
  h1: string;
}

export const ROUTE_SEO_LIST: RouteSeoMeta[] = [
  {
    tab: "overview",
    slug: "/price-forecast",
    navLabel: "Price & Forecast",
    title: "NaijaPrice Tracker – Nigerian Commodity Price Forecasts",
    description:
      "Track Nigerian wholesale agricultural commodity prices, 12-month seasonality decomposition, and 3-to-12 month Ridge & Holt-Winters forecasts.",
    h1: "Nigerian Commodity Price Trajectory & Forecast",
  },
  {
    tab: "live",
    slug: "/live-feeds",
    navLabel: "Live Feeds",
    title: "Live Nigerian Market Feeds & FX Parity – NaijaPrice Tracker",
    description:
      "Fetch real-time WFP Nigeria food price surveys, USD/NGN spot FX parity, and World Bank CPI inflation data directly into your forecast models.",
    h1: "Real-Time External Nigerian Market & Macro Feeds",
  },
  {
    tab: "watchlists",
    slug: "/watchlists",
    navLabel: "Watchlists",
    title: "Watchlists & Price Alerts – NaijaPrice Tracker",
    description:
      "Create personalized Nigerian market watchlists and threshold-based price deviation alerts backed by persistent SQLite monitoring.",
    h1: "Personalized Market Watchlists & Threshold Alerts",
  },
  {
    tab: "seasonality",
    slug: "/seasonality-matrix",
    navLabel: "Seasonality Matrix",
    title: "Commodity Seasonality Matrix – NaijaPrice Tracker",
    description:
      "Compare 12-month harvest glut and lean-season price indices across Nigerian staples including rice, beans, maize, tomatoes, yam, and onions.",
    h1: "Nigerian Commodity 12-Month Seasonality Matrix",
  },
  {
    tab: "arbitrage",
    slug: "/market-arbitrage",
    navLabel: "Market Arbitrage",
    title: "Cross-Market Arbitrage Calculator – NaijaPrice Tracker",
    description:
      "Compare live price spreads across 18 Nigerian markets spanning all 6 geopolitical zones and estimate net inter-state transport margins.",
    h1: "Cross-Market Price Ranking & Arbitrage Margins",
  },
  {
    tab: "ledger",
    slug: "/data-ledger",
    navLabel: "Data Ledger",
    title: "Market Price Data Ledger & CSV – NaijaPrice Tracker",
    description:
      "Explore 8,352 monthly Nigerian agricultural commodity price observations or upload local field survey CSV datasets for analysis.",
    h1: "Nigerian Market Price Data Ledger & Survey Import",
  },
  {
    tab: "reports",
    slug: "/reports-python",
    navLabel: "Reports & Python",
    title: "Intelligence Briefs & Python Export – NaijaPrice Tracker",
    description:
      "Generate formal PDF commodity intelligence briefs, export forecast CSVs, and download the standalone Streamlit, Pandas, and Scikit-learn script.",
    h1: "Commodity Intelligence Briefs & Python Source",
  },
];

export function getSlugForTab(tab: WorkspaceTab): string {
  return ROUTE_SEO_LIST.find((r) => r.tab === tab)?.slug ?? "/price-forecast";
}

export function tabFromPathname(pathname: string): WorkspaceTab {
  const clean = pathname
    .trim()
    .toLowerCase()
    .replace(/\/+$/, "")
    .replace(/\.html$/, "");

  if (!clean || clean === "/" || clean === "/index" || clean === "/price-forecast") {
    return "overview";
  }
  const match = ROUTE_SEO_LIST.find((r) => r.slug === clean);
  return match ? match.tab : "overview";
}

export function normalizeCanonicalOrigin(origin: string): string {
  if (!origin) return "https://naijaprice-tracker.app";
  const clean = origin.replace(/\/+$/, "");
  if (
    clean.startsWith("http://") &&
    !clean.includes("localhost") &&
    !clean.includes("127.0.0.1")
  ) {
    return "https://" + clean.slice("http://".length);
  }
  return clean;
}

export function getRouteMeta(
  tab: WorkspaceTab,
  commodityName?: string,
  marketName?: string
): RouteSeoMeta {
  const base = ROUTE_SEO_LIST.find((r) => r.tab === tab) ?? ROUTE_SEO_LIST[0];
  if (tab === "overview" && commodityName && marketName) {
    return {
      ...base,
      title: `${commodityName} Price Forecast – ${marketName} | NaijaPrice`,
      h1: `${commodityName} Price Forecast — ${marketName}`,
    };
  }
  return base;
}

function setMetaContent(selector: string, content: string) {
  const el = document.querySelector(selector);
  if (el) {
    el.setAttribute("content", content);
  }
}

export function applyDocumentSeo(
  tab: WorkspaceTab,
  commodityName?: string,
  marketName?: string
) {
  if (typeof document === "undefined" || typeof window === "undefined") return;

  const meta = getRouteMeta(tab, commodityName, marketName);
  const origin = normalizeCanonicalOrigin(window.location.origin);
  const canonicalUrl = `${origin}${meta.slug}`;
  const ogImageUrl = `${origin}/og-image.png`;

  document.title = meta.title;
  setMetaContent('meta[name="description"]', meta.description);
  setMetaContent('meta[property="og:title"]', meta.title);
  setMetaContent('meta[property="og:description"]', meta.description);
  setMetaContent('meta[property="og:url"]', canonicalUrl);
  setMetaContent('meta[property="og:image"]', ogImageUrl);
  setMetaContent('meta[name="twitter:title"]', meta.title);
  setMetaContent('meta[name="twitter:description"]', meta.description);
  setMetaContent('meta[name="twitter:image"]', ogImageUrl);

  let canonicalLink = document.querySelector('link[rel="canonical"]');
  if (!canonicalLink) {
    canonicalLink = document.createElement("link");
    canonicalLink.setAttribute("rel", "canonical");
    document.head.appendChild(canonicalLink);
  }
  canonicalLink.setAttribute("href", canonicalUrl);

  const jsonLdScript = document.getElementById("naijaprice-jsonld");
  if (jsonLdScript) {
    const schema = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebApplication",
          "@id": `${origin}/#app`,
          name: "NaijaPrice Tracker",
          url: canonicalUrl,
          applicationCategory: "FinanceApplication",
          operatingSystem: "All",
          description: meta.description,
          image: ogImageUrl,
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "NGN",
          },
        },
        {
          "@type": "WebPage",
          "@id": `${canonicalUrl}#webpage`,
          url: canonicalUrl,
          name: meta.title,
          description: meta.description,
          isPartOf: { "@id": `${origin}/#app` },
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: "Nigerian Markets",
              item: `${origin}/price-forecast`,
            },
            {
              "@type": "ListItem",
              position: 2,
              name: meta.navLabel,
              item: canonicalUrl,
            },
          ],
        },
      ],
    };
    jsonLdScript.textContent = JSON.stringify(schema);
  }
}
