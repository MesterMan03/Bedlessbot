import { treaty } from "@elysiajs/eden";
import { type DashboardApp } from "..";

// this trick lets us use autocomplete, but doesn't actually import anything
// note that because we don't import anything, this script can only be run in browsers, where the moment library is already loaded
declare const moment: typeof import("moment");

const app = treaty<DashboardApp>(location.origin);

const tz = moment.tz.guess();
console.log(moment(new Date()).tz(tz).format("HH:mm DD/MM/YYYY"));
console.log((await app.api.comments.get({ query: { page: 0, packid: "15k" } })).data);
