/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

const CacheName = "image-cache-v1";
const OfflineUrl = "/offline.html";

// Install event - cache offline.html
self.addEventListener("install", (event: ExtendableEvent) => {
    event.waitUntil(
        caches.open(CacheName).then((cache) => {
            return cache.add(OfflineUrl);
        })
    );
    self.skipWaiting();
});

// Fetch event - cache and serve images from https://bedless-cdn.mester.info/icons/*
// Provide offline fallback
self.addEventListener("fetch", (event: FetchEvent) => {
    const url = new URL(event.request.url);
    if (url.origin === "https://bedless-cdn.mester.info" && url.pathname.startsWith("/icons/")) {
        event.respondWith(
            caches.open(CacheName).then(async (cache) => {
                const response = await cache.match(event.request);
                if (response) {
                    return response; // Return cached image
                }
                const networkResponse = await fetch(event.request);
                cache.put(event.request, networkResponse.clone()); // Cache the new image
                return networkResponse;
            })
        );
        // else check for .html files
    } else if (url.pathname.endsWith(".html")) {
        event.respondWith(
            fetch(event.request).catch(() => {
                return caches.match(OfflineUrl) as Promise<Response>;
            })
        );
    }
});
