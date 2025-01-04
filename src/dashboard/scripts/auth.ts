import { treaty } from "@elysiajs/eden";
import { type DashboardApp } from "..";

const app = treaty<DashboardApp>(location.origin);

const user = app.api.user.get().then((userRes) => {
    if (userRes.status === 200 && userRes.data) {
        const user = userRes.data;
        window._paq?.push(["setUserId", user.userid]);
        return user;
    }
    return null;
});

export { user };
