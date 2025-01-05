import { treaty } from "@elysiajs/eden";
import { type DashboardApp } from "..";

const app = treaty<DashboardApp>(location.origin);

const user = app.api.user.get().then((userRes) => userRes.data);

export { user };
