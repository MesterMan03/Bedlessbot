import { treaty } from "@elysiajs/eden";
import { type DashboardApp } from "..";
import type { PushSubscriptionData } from "../api-types";

const app = treaty<DashboardApp>(location.origin);

if ("serviceWorker" in navigator) {
    navigator.serviceWorker
        .register("/scripts/service-worker.js", { scope: "/", type: "module" })
        .then(async (reg) => {
            console.log("Service Worker registered with scope:", reg.scope);

            // TODO: replace this to run on a button click (for example when a comment is submitted) which will let Notification.requestPermission() to be called
            subscribeToPushNotifications();
        })
        .catch((error) => {
            console.log("Service Worker registration failed:", error);
        });
}

export async function subscribeToPushNotifications() {
    const reg = await navigator.serviceWorker.ready;

    // check if we're logged in
    const { error } = await app.api.user.get();
    if (error) {
        console.error("We're not logged in, aborting push notifications.");
        return;
    }

    // check if we have a subscription already, if yes, unsubscribe and remove it from server
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
        console.log("Unsubscribing from push notifications...");
        await sub.unsubscribe();
        await app.api["unregister-push"].post({ endpoint: sub.endpoint });
    }

    console.log("Subscribing to push notifications...");

    const { data: pubKey } = await app.api["vapid-public-key"].get();
    if (!pubKey) {
        console.error("Failed to get VAPID public key, push notifications will not work.");
        return;
    }

    // convert base64 to Uint8Array
    const key = pubKey.replace(/-/g, "+").replace(/_/g, "/");
    const rawKey = window.atob(key);
    const pubKeyArray = new Uint8Array(new ArrayBuffer(rawKey.length));
    for (let i = 0; i < rawKey.length; i++) {
        pubKeyArray[i] = rawKey.charCodeAt(i);
    }

    reg.pushManager
        .subscribe({ userVisibleOnly: true, applicationServerKey: pubKeyArray })
        .then((sub) => {
            const data = sub.toJSON() as PushSubscriptionData;
            if (!data.keys || !data.endpoint) {
                console.error("Failed to subscribe to push notifications, missing keys or endpoint.");
                return;
            }
            app.api["register-push"].post(data);
        })
        .catch(console.error);
}
