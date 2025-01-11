import { treaty } from "@elysiajs/eden";
import { type DashboardApp } from "../..";

const app = treaty<DashboardApp>(location.origin);

const GetUser = () => app.api.user.get().then((userRes) => userRes.data);

export { GetUser };
