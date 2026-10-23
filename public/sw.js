// Cache only public application assets. Financial data and authentication never enter this cache.
const CACHE = "dong-shell-v8";
const ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/themes.css",
  "/v3.css",
  "/jalali.js",
  "/calendar.js",
  "/statements.js",
  "/theme.js",
  "/people.js",
  "/personal-ledger.js",
  "/app.js",
  "/overview.js",
  "/items.js",
  "/security.js",
  "/settle-all.js",
  "/ledger.js",
  "/helpers.js",
  "/import.js",
  "/icon.svg",
  "/fonts/Vazirmatn.woff2",
  "/fonts/Vazirmatn-Latin.woff2",
];
self.addEventListener("install", (e) =>
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS))),
);
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      ),
  ),
);
self.addEventListener("fetch", (e) => {
  if (
    e.request.method !== "GET" ||
    new URL(e.request.url).origin !== self.location.origin ||
    new URL(e.request.url).pathname.startsWith("/api/")
  )
    return;
  // Only the versioned, explicitly public shell is served from cache.
  // API requests and navigation still reach the network.
  const path = new URL(e.request.url).pathname;
  if (
    e.request.mode !== "navigate" &&
    ASSETS.includes(path) &&
    path !== "/" &&
    path !== "/index.html"
  ) {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(e.request);
        if (hit) return hit;
        const response = await fetch(e.request);
        if (response.ok) await cache.put(e.request, response.clone());
        return response;
      }),
    );
    return;
  }
  e.respondWith(
    fetch(e.request).catch(() =>
      caches
        .match(e.request)
        .then(
          (r) =>
            r ||
            (e.request.mode === "navigate"
              ? caches.match("/")
              : Response.error()),
        ),
    ),
  );
});
