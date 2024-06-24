import { treaty } from "@elysiajs/eden";
import { type DashboardApp } from "..";
import { marked } from "marked";
import DOMPurify from "dompurify";
import type { PackData } from "../api-types";
import "./loadworker";

// this trick lets us use autocomplete, but doesn't actually import anything
// note that because we don't import anything, this script can only be run in browsers, where the luxon library is already loaded
declare const luxon: typeof import("luxon");

const cdn = "https://bedless-cdn.mester.info";

// init the app and pack data
const app = treaty<DashboardApp>(location.origin);
const packData = (await app.api.packdata.get()).data as PackData;

// Code snippet for using the luxon library
// Since the date object of pack comments are a UNIX millisecond timestamp, you have to convert it
// somehow to a human-readable format. I guess you could use the built-in Date object, but that's
// a bit of a hassle. Meanwhile, luxon can handle timezones and custom formats with almost no downside
// compared to moment (luxon uses the built-in Intl API, which greatly reduces the bundle size)

console.log(luxon.DateTime.now().setZone("system").toFormat("HH:mm dd/LL/yyyy"));

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

    const downloadLink = new URL(`/api/downloadpack`, location.origin);
    downloadLink.searchParams.append("packid", packid);
    downloadLink.searchParams.append("version", version);

    location.replace(downloadLink.toString());
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

const commentForm = document.getElementById("commentForm") as HTMLFormElement;
// add "log in to comment" warning
app.api.user.get().then((response) => {
    if (response.status !== 200) {
        // remove the submit button
        commentForm.querySelector("button")?.remove();

        const warning = document.createElement("a");
        warning.innerText = "You must be logged in to comment!";
        warning.href = "/api/auth?redirect=/packs.html";
        commentForm.append(warning);
    }
});

// add select menu for all packs
const select = document.createElement("select");
select.name = "packid";
for (const pack of packData.packs) {
    const option = document.createElement("option");
    option.value = pack.id;
    option.innerText = pack.friendly_name;
    select.appendChild(option);
}
commentForm.prepend(select);

const commentsDiv = document.getElementById("comments") as HTMLDivElement;
select.addEventListener("change", () => {
    updateComments();
});

// function to update comments with packid from the select menu
async function updateComments() {
    commentsDiv.innerHTML = "";
    const comments = (await app.api.comments.get({ query: { packid: select.value, page: 0 } })).data;
    if (comments && comments?.length !== 0) {
        for (const comment of comments) {
            const commentElement = document.createElement("div");
            commentElement.innerHTML = `
                <img src="${comment.avatar}" alt="${comment.username}">
                <h3>${comment.username}</h3>
                <p>${comment.comment}</p>
            `;
            commentsDiv.appendChild(commentElement);
        }
    } else {
        const noComments = document.createElement("p");
        noComments.innerText = "No comments yet!";
        commentsDiv.appendChild(noComments);
    }
}
updateComments();
