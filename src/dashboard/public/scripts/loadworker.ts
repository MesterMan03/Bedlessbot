import { treaty } from "@elysiajs/eden";
import { type DashboardApp } from "../..";
import type { PushSubscriptionData } from "../../api-types";
import { GetUser } from "./auth";

const app = treaty<DashboardApp>(location.origin);

if ("serviceWorker" in navigator) {
    navigator.serviceWorker
        .register("/service-worker.js", { scope: "/", type: "module" })
        .then(async (reg) => {
            // setup periodic sync for new pack comments
            if (reg.periodicSync) {
                reg.periodicSync
                    .register("pack-comments", {
                        minInterval: 5 * 60 * 1000 // 5 minutes
                    })
                    .catch(console.error);
            }

            // For developers: check if we have a push subscription
            // if yes, bind a function to window to unsubscribe and remove it from server
            const sub = await reg.pushManager.getSubscription();
            if (sub) {
                console.warn("Injected UnsubscribeFromPushNotifications() to remove subscription.");
                async function unsubscribe() {
                    if (sub == null) {
                        return "No subscription found";
                    }
                    await sub.unsubscribe().then(() => {
                        return app.api["unregister-push"].post({ endpoint: sub.toJSON().endpoint as string });
                    });
                }
                //@ts-ignore - we're adding this to the window object so we can call it from the console
                window.UnsubscribeFromPushNotifications = unsubscribe;
            }
        })
        .catch((error) => {
            console.log("Service Worker registration failed:", error);
        });
}

async function subscribeToPushNotifications() {
    const reg = await navigator.serviceWorker.ready;

    // check if we're logged in
    const user = await GetUser();
    if (!user) {
        console.error("We're not logged in, aborting subscription.");
        return;
    }

    // check if we have permissions for notifications
    const perm = await reg.pushManager.permissionState({ userVisibleOnly: true });
    if (perm !== "granted") {
        console.error("No permission for notifications, aborting subscription.");
        return;
    }

    // check if we have a subscription already, if yes, unsubscribe and remove it from server
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
        console.warn("We already have a subscription, aborting subscription.");
        return;
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
            app.api["register-push"].post(data).catch(console.error);
        })
        .catch(console.error);
}

export { subscribeToPushNotifications };
