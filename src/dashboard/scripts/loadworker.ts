import { treaty } from "@elysiajs/eden";
import { type DashboardApp } from "..";

const app = treaty<DashboardApp>(location.origin);

if ("serviceWorker" in navigator) {
    navigator.serviceWorker
        .register("/scripts/service-worker.js", { scope: "/", type: "module" })
        .then(async (reg) => {
            console.log("Service Worker registered with scope:", reg.scope);

            console.log("Subscribing to push notifications...")

            const { data: pubKey } = await app.api["vapid-public-key"].get();
            if (!pubKey) {
                console.error("Failed to get VAPID public key");
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
                    console.log(sub.toJSON());
                })
                .catch(console.error);
        })
        .catch((error) => {
            console.log("Service Worker registration failed:", error);
        });
}
