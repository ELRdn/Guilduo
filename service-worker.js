const APP_VERSION = "2026.08.14-public-beta";
const CACHE_PREFIX = "questforge-pwa-";
const CACHE_VERSION = `${CACHE_PREFIX}v21`;
const NAVIGATION_FALLBACK = "/index.html";
const BETA_NAVIGATION_PATH = "/next/index.html";

const APP_SHELL = [
  "/manifest.webmanifest",
  "/manifest.en.webmanifest",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/assets/icons/icon-maskable-512.png",
  "/assets/avatar-role-sentinel.webp",
  "/assets/avatar-role-femme-sentinel.webp",
  "/assets/boss-h3-transparent.webp",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await cache.addAll(APP_SHELL);
    const navigationResponse = await fetch(NAVIGATION_FALLBACK, { cache: "reload" });
    if (navigationResponse.ok) {
      await cache.put(NAVIGATION_FALLBACK, navigationResponse);
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const hadPriorQuestForgeCache = keys.some(
      (key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_VERSION,
    );

    await Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_VERSION)
      .map((key) => caches.delete(key)));
    await self.clients.claim();

    const windows = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });
    windows.forEach((client) => {
      client.postMessage({ type: "QUESTFORGE_UPDATE_READY", version: APP_VERSION });
    });

    if (hadPriorQuestForgeCache) {
      await Promise.all(windows.map((client) => {
        if (typeof client.navigate !== "function") return Promise.resolve();
        return client.navigate(client.url).catch(() => undefined);
      }));
    }
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    const isBetaNavigation = requestUrl.pathname === "/next" || requestUrl.pathname.startsWith("/next/");
    const navigationCacheKey = isBetaNavigation ? BETA_NAVIGATION_PATH : NAVIGATION_FALLBACK;
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then((response) => {
          if (response?.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(navigationCacheKey, copy));
          }
          return response;
        })
        .catch(() => caches.match(navigationCacheKey).then((cached) => cached || caches.match(NAVIGATION_FALLBACK))),
    );
    return;
  }

  if (["script", "style", "manifest"].includes(request.destination)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response?.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response || response.status !== 200) return response;
        const copy = response.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        return response;
      });
    }),
  );
});
