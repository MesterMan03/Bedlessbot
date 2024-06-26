/// <reference lib="webworker" />

import type { NotificationData } from "../api-types";

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

self.addEventListener("push", (event) => {
    const data = event.data?.json();
    if (!data) {
        return;
    }

    if (isNotificationData(data)) {
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: "/icon.gif",
            tag: data.tag
        });
    }

    console.log("Push event received:", data);
});

function isNotificationData(data: unknown): data is NotificationData {
    return typeof data === "object" && data !== null && "title" in data && "body" in data && "tag" in data;
}

self.addEventListener("notificationclick", (event) => {
    event.notification.close();

    // read the tag from the notification

    // comment-* -> open /packs
    if (event.notification.tag.startsWith("comment-")) {
        // open the packs page
        self.clients.openWindow("/packs");
    }
});
