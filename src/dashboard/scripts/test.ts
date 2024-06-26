import "./loadworker";

document.getElementById("enablenotifs")?.addEventListener("click", async () => {
    await Notification.requestPermission();
});
