"use strict";

const CACHE_PREFIX = "fenix-smart-control:" + self.registration.scope + ":";
const CACHE_NAME = CACHE_PREFIX + "v1";
const SHELL_FILES = [
  "./index.html", "./styles.css", "./app.js", "./pwa.js", "./manifest.webmanifest",
  "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png",
  "./logos/logo-fenix.png", "./logos/logo-aguas-do-cerrado.png",
  "./logos/power-on.png", "./logos/power-off.png"
];
const SHELL_URLS = new Set(SHELL_FILES.map(file => new URL(file, self.registration.scope).href));
const INDEX_URL = new URL("./index.html", self.registration.scope).href;

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES)));
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // Não armazena MQTT, respostas da central ou comandos. Somente os arquivos da interface.
  if (request.mode === "navigate" && url.href.startsWith(self.registration.scope)) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok && (url.pathname === new URL(INDEX_URL).pathname || url.pathname === new URL(self.registration.scope).pathname)) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(INDEX_URL, response.clone());
        }
        return response;
      } catch {
        return (await caches.open(CACHE_NAME)).match(INDEX_URL);
      }
    })());
    return;
  }
  url.search = "";
  if (!SHELL_URLS.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(url.href, response.clone());
      return response;
    } catch {
      return cache.match(url.href);
    }
  })());
});
