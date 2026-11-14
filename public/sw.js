/* NaijaPrice Tracker Service Worker — Static Shell + Latest Market Analysis Offline Cache */

const STATIC_CACHE = "naijaprice-static-v1";
const ANALYSIS_CACHE = "naijaprice-analysis-v1";
const FONTS_CACHE = "naijaprice-fonts-v1";
const ACTIVE_CACHES = new Set([STATIC_CACHE, ANALYSIS_CACHE, FONTS_CACHE]);

const PRECACHE_URLS = [
  "/",
  "/price-forecast",
  "/manifest.webmanifest",
  "/brand-mark.svg",
  "/favicon.svg",
  "/pwa-192x192.png",
  "/pwa-512x512.png",
  "/apple-touch-icon.png",
];

const CACHEABLE_GET_API = new Set(["/api/meta", "/api/health"]);
const CACHEABLE_POST_API = new Set([
  "/api/analyze",
  "/api/watchlists/list",
  "/api/alerts/evaluate",
  "/api/ledger",
]);

function hashPayload(input) {
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

function withCacheHeader(response, headerValue) {
  const headers = new Headers(response.headers);
  headers.set("X-NaijaPrice-Cache", headerValue);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        Promise.allSettled(
          PRECACHE_URLS.map((url) =>
            fetch(url, { cache: "no-cache" }).then((res) => {
              if (res && res.ok) {
                return cache.put(url, res);
              }
              return undefined;
            })
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (!ACTIVE_CACHES.has(key)) {
              return caches.delete(key);
            }
            return Promise.resolve(true);
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

async function handleCacheableApi(request, pathname) {
  const cache = await caches.open(ANALYSIS_CACHE);
  let cacheKeyUrl = new URL("/__sw_cache" + pathname, self.location.origin).toString();
  let networkRequest = request;

  if (request.method === "POST") {
    const cloned = request.clone();
    const bodyText = await cloned.text();
    const digest = hashPayload(bodyText || "{}");
    cacheKeyUrl = new URL(
      "/__sw_cache" + pathname + "?h=" + digest,
      self.location.origin
    ).toString();
  }

  const latestFallbackKey =
    pathname === "/api/analyze"
      ? new URL("/__sw_cache/api/analyze/latest", self.location.origin).toString()
      : pathname === "/api/watchlists/list"
      ? new URL("/__sw_cache/api/watchlists/list/latest", self.location.origin).toString()
      : null;

  const cachedExact = await cache.match(cacheKeyUrl, { ignoreVary: true });
  const cachedLatest = latestFallbackKey
    ? await cache.match(latestFallbackKey, { ignoreVary: true })
    : undefined;
  const fallbackMatch = cachedExact || cachedLatest;

  // In low-connectivity environments, if a cached payload exists, race network with a 4.5s timeout
  const networkPromise = fetch(networkRequest).then(async (res) => {
    if (res && res.ok) {
      await cache.put(cacheKeyUrl, res.clone());
      if (latestFallbackKey) {
        await cache.put(latestFallbackKey, res.clone());
      }
    }
    return res;
  });

  if (fallbackMatch) {
    try {
      const raced = await Promise.race([
        networkPromise,
        new Promise((resolve) => setTimeout(() => resolve(null), 4500)),
      ]);
      if (raced && raced.ok) {
        return raced;
      }
      if (raced && raced.status >= 400 && raced.status < 500) {
        return raced;
      }
      return withCacheHeader(
        fallbackMatch,
        cachedExact ? "offline" : "offline-latest"
      );
    } catch {
      return withCacheHeader(
        fallbackMatch,
        cachedExact ? "offline" : "offline-latest"
      );
    }
  }

  try {
    return await networkPromise;
  } catch {
    return new Response(
      JSON.stringify({
        error: "Offline mode: no cached market analysis is available for this query yet.",
      }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "X-NaijaPrice-Cache": "miss",
        },
      }
    );
  }
}

async function handleNavigation(request) {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok) {
      cache.put(request, res.clone());
      cache.put("/", res.clone());
      cache.put("/price-forecast", res.clone());
    }
    return res;
  } catch {
    return (
      (await cache.match(request, { ignoreVary: true })) ||
      (await cache.match("/price-forecast", { ignoreVary: true })) ||
      (await cache.match("/", { ignoreVary: true })) ||
      new Response("Offline — NaijaPrice Tracker cache unavailable.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    );
  }
}

async function handleFontAsset(request) {
  const cache = await caches.open(FONTS_CACHE);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) {
    return cached;
  }
  try {
    const res = await fetch(request);
    if (res && res.ok) {
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    const isCss = request.url.includes("fonts.googleapis.com");
    return new Response("", {
      status: isCss ? 200 : 504,
      headers: isCss ? { "Content-Type": "text/css; charset=utf-8" } : {},
    });
  }
}

async function handleStaleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request, { ignoreVary: true });
  const updatePromise = fetch(request)
    .then((res) => {
      if (res && res.ok) {
        cache.put(request, res.clone());
      }
      return res;
    })
    .catch(() => null);

  if (cached) {
    return cached;
  }
  const net = await updatePromise;
  if (net) return net;
  return new Response("", { status: 504 });
}

async function handleNetworkFirstStatic(request) {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok) {
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    const cached = await cache.match(request, { ignoreVary: true });
    if (cached) {
      return cached;
    }
    return new Response("", { status: 504 });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method === "POST") {
    if (url.origin === self.location.origin && CACHEABLE_POST_API.has(url.pathname)) {
      event.respondWith(handleCacheableApi(request, url.pathname));
    }
    return;
  }

  if (request.method !== "GET") {
    return;
  }

  if (
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com"
  ) {
    event.respondWith(handleFontAsset(request));
    return;
  }

  if (url.origin !== self.location.origin) {
    return;
  }

  if (CACHEABLE_GET_API.has(url.pathname)) {
    event.respondWith(handleCacheableApi(request, url.pathname));
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  const isImmutableAsset =
    url.pathname.startsWith("/assets/") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".webmanifest");

  if (isImmutableAsset) {
    event.respondWith(handleStaleWhileRevalidate(request));
    return;
  }

  event.respondWith(handleNetworkFirstStatic(request));
});
