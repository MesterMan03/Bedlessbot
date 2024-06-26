import { subscribeToPushNotifications } from "./loadworker";

document.getElementById("enablenotifs")?.addEventListener("click", async () => {
    Notification.requestPermission().then(function (getperm) {
        alert(getperm);
        subscribeToPushNotifications();
    });
});
