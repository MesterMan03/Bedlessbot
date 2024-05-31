import { treaty } from "@elysiajs/eden";
import { type DashboardApp } from "..";

// this trick lets us use autocomplete, but doesn't actually import anything
declare const moment: typeof import("moment");

const app = treaty<DashboardApp>(location.origin);

const tz = moment.tz.guess();
console.log(moment(new Date()).tz(tz).format("HH:mm DD/MM/YYYY"));
