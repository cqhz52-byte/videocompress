const CACHE_NAME = "video-compressor-v5";
const APP_VERSION = "v0.3.3";

const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./version.json",
  "./icons/icon.svg",
  "https://unpkg.com/lucide@latest/dist/umd/lucide.min.js",
  "./vendor/ffmpeg/index.js",
  "./vendor/ffmpeg/classes.js",
  "./vendor/ffmpeg/const.js",
  "./vendor/ffmpeg/errors.js",
  "./vendor/ffmpeg/utils.js",
  "./vendor/ffmpeg/types.js",
  "./vendor/ffmpeg/worker.js",
  "./vendor/ffmpeg/ffmpeg-core.js",
  "./vendor/ffmpeg/ffmpeg-core.wasm",
  "https://unpkg.com/tesseract.js@5.1.1/dist/tesseract.min.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: "window" }))
      .then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: "APP_UPDATED", version: APP_VERSION });
        });
      })
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      });
    })
  );
});
