import { treaty } from "@elysiajs/eden";
import { type DashboardApp } from "..";
import { marked } from "marked";
import DOMPurify from "dompurify";
import type { PackData } from "../api-types";

// this trick lets us use autocomplete, but doesn't actually import anything
// note that because we don't import anything, this script can only be run in browsers, where the moment library is already loaded
declare const moment: typeof import("moment-timezone");

const cdn = "https://bedless-cdn.mester.info";

// This is basically how we're gonna grab pack comments

const app = treaty<DashboardApp>(location.origin);
console.log((await app.api.comments.get({ query: { page: 0, packid: "15k" } })).data);

const packData = (await app.api.packdata.get()).data as PackData;

// Code snippet for using the moment library
// Since the date object of pack comments are a UNIX millisecond timestamp, you have to convert it
// somehow to a human-readable format. I guess you could use the built-in Date object, but that's
// a bit of a hassle. Meanwhile, moment can handle timezones and custom formats with the downside of
// bloat - it is slightly mitigated by the script file being cached -, and we're also using like a single
// feature of it, so decide if writing your own function is worth it (personally I'd say it's not) - Mester

const tz = moment.tz.guess();
console.log(moment(new Date()).tz(tz).format("HH:mm DD/MM/YYYY"));

// I'm not sure if using Markdown will be a good idea in the long rung
// It'd be nice if comments could be formatted, but adding an entire Markdown parser to the script
// makes it a tiny bit bloated + there are features that we'd like to disable (masked links, for example)
// For now, here's a snippet that shows how to use the marked library to parse Markdown, but it might get removed
// in the future - Mester
// P.S. even if we drop Markdown for comments, we might want to use them for pack descriptions

const markdownInput = `
# Hello, world!

This is a test of the markdown parser. Here's a list:
- Item 1
- Item 2
- Item 3

Now a codeblock:
\`\`\`js
console.log("Hello, world!");
\`\`\`

Masked link: [click me](https://google.com)
`;

const markdownOutput = DOMPurify.sanitize(marked.parse(markdownInput, { async: false }) as string);
document.body.appendChild(document.createElement("div")).innerHTML = markdownOutput;

// The following functions are meant as a very basic, stripped-down code snippets
// You can leave them as-is or rework them if the code structure requires it

function downloadPack(packid: string, version: "1.8.9" | "1.20.5" | "bedrock") {
    const pack = packData.packs.find((pack) => pack.id === packid);
    if (!pack) {
        throw new Error("Pack not found");
    }

    const fileName = pack.downloads[version];
    if (!fileName) {
        throw new Error("Version not found");
    }

    const downloadLink = `${cdn}/${fileName}`;

    // download the file without the use of redirecting
    const a = document.createElement("a");
    a.href = downloadLink;
    a.download = pack.friendly_name;
    a.click();
}

function getPackIcon(packid: string) {
    const pack = packData.packs.find((pack) => pack.id === packid);
    if (!pack) {
        throw new Error("Pack not found");
    }

    return `${cdn}/icons/${pack.icon}`;
}

// render all packs
for (const pack of packData.packs) {
    const icon = getPackIcon(pack.id);
    const packElement = document.createElement("div");
    const description = marked.parse(pack.description, { async: false }) as string;
    packElement.innerHTML = `
        <img src="${icon}" alt="${pack.friendly_name}">
        <h2>${pack.friendly_name}</h2>
        <div>${description}</div>
    `;
    // dinamically load the download buttons
    for (const version of <const>["1.8.9", "1.20.5", "bedrock"]) {
        if (!pack.downloads[version]) {
            continue;
        }

        const downloadButton = document.createElement("button");
        downloadButton.textContent = `Download for ${version === "bedrock" ? "Bedrock" : version}`;
        downloadButton.addEventListener("click", () => downloadPack(pack.id, version));
        packElement.appendChild(downloadButton);
    }
    document.body.appendChild(packElement);
}

if ("serviceWorker" in navigator) {
    navigator.serviceWorker
        .register("/scripts/service-worker.js", { scope: "/", type: "module" })
        .then((registration) => {
            console.log("Service Worker registered with scope:", registration.scope);
        })
        .catch((error) => {
            console.log("Service Worker registration failed:", error);
        });
}
