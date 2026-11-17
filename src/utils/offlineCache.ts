export const CACHEABLE_GET_ENDPOINTS = new Set(["/api/meta", "/api/health", "/api/live-feed"]);
export const CACHEABLE_POST_ENDPOINTS = new Set([
  "/api/analyze",
  "/api/watchlists/list",
  "/api/alerts/evaluate",
  "/api/ledger",
]);

export function hashCachePayload(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch ^ (i & 0xff);
    h2 = Math.imul(h2, 0x01000193);
  }
  return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}

export function isCacheableApiRequest(method: string, pathname: string): boolean {
  const upper = method.toUpperCase();
  if (upper === "GET") return CACHEABLE_GET_ENDPOINTS.has(pathname);
  if (upper === "POST") return CACHEABLE_POST_ENDPOINTS.has(pathname);
  return false;
}

export function buildSwCacheKeyUrl(
  pathname: string,
  bodyText: string = "",
  origin: string = "https://naijaprice-tracker.app"
): string {
  const cleanOrigin = origin.replace(/\/+$/, "");
  if (!bodyText) {
    return `${cleanOrigin}/__sw_cache${pathname}`;
  }
  return `${cleanOrigin}/__sw_cache${pathname}?h=${hashCachePayload(bodyText)}`;
}

export function saveOfflineSnapshot(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), value }));
  } catch {
    // Ignore storage quota issues
  }
}

export function loadOfflineSnapshot<T>(key: string): { savedAt: number; value: T } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: number; value?: T };
    if (!parsed || typeof parsed.savedAt !== "number" || parsed.value === undefined) {
      return null;
    }
    return { savedAt: parsed.savedAt, value: parsed.value };
  } catch {
    return null;
  }
}

export async function mirrorJsonToSwCache(
  pathname: string,
  bodyText: string,
  payload: unknown
): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) return;
  try {
    const cache = await caches.open("naijaprice-analysis-v1");
    const keyUrl = buildSwCacheKeyUrl(pathname, bodyText, window.location.origin);
    const json = JSON.stringify(payload);
    const makeResp = () =>
      new Response(json, {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    await cache.put(keyUrl, makeResp());
    if (pathname === "/api/analyze") {
      await cache.put(`${window.location.origin}/__sw_cache/api/analyze/latest`, makeResp());
    } else if (pathname === "/api/watchlists/list") {
      await cache.put(`${window.location.origin}/__sw_cache/api/watchlists/list/latest`, makeResp());
    }
  } catch {
    // Ignore Cache Storage access errors
  }
}

export async function warmLoadedStaticAssetsToCache(): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) return;
  try {
    const cache = await caches.open("naijaprice-static-v1");
    const origin = window.location.origin;
    const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const staticUrls = new Set<string>([window.location.href]);
    for (const entry of entries) {
      if (!entry.name.startsWith(origin)) continue;
      const u = new URL(entry.name);
      if (u.pathname.startsWith("/api/") || u.pathname.startsWith("/__sw_cache")) continue;
      staticUrls.add(entry.name);
    }
    await Promise.allSettled(
      Array.from(staticUrls).map(async (url) => {
        const existing = await cache.match(url, { ignoreVary: true });
        if (!existing) {
          const res = await fetch(url);
          if (res.ok) {
            await cache.put(url, res);
          }
        }
      })
    );
  } catch {
    // Ignore warm-up errors
  }
}

export async function registerNaijaPriceServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });
    navigator.serviceWorker.ready.then(() => {
      void warmLoadedStaticAssetsToCache();
    });
    return registration;
  } catch {
    return null;
  }
}
