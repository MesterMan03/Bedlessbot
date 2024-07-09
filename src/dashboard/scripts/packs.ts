/// <reference lib="dom" />

import { treaty } from "@elysiajs/eden";
import { type DashboardApp } from "..";
import type { PackData } from "../api-types";
import "@hcaptcha/vanilla-hcaptcha";
import type { VanillaHCaptchaWebComponent } from "@hcaptcha/vanilla-hcaptcha";
import { subscribeToPushNotifications } from "./loadworker";

// this trick lets us use autocomplete, but doesn't actually import anything
// note that because we don't import anything, this script can only be run in browsers, where the luxon library is already loaded
declare const luxon: typeof import("luxon");
declare const marked: typeof import("../../../types/marked-13.0.2.d.ts");

const cdn = "https://bedless-cdn.mester.info";

// init the app and pack data
const app = treaty<DashboardApp>(location.origin);
const packData = (await app.api.packdata.get()).data as PackData;

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

const dialogElement = document.querySelector("dialog");
if (!dialogElement) {
    throw new Error("Dialog element not found");
}
/**
 * @description A function used to open the modal to display a status.
 * @param inputText This should be an HTML string. Presumably this is safe HTML as it is hardcoded into the script and not input by the user.
 */
function openModal(inputText: string) {
    if (!dialogElement) {
        throw new Error("Dialog element not found");
    }
    dialogElement.innerHTML = `${inputText}<form method="dialog"><button>Close</button></form>`;
    dialogElement.showModal();
}

const mainElement = document.querySelector("main");
if (!mainElement) {
    throw new Error("Main element not found");
}

const packsSectionElement = document.querySelector<HTMLElement>(".packs");
if (!packsSectionElement) {
    throw new Error("Packs section element not found");
}

// render all packs
for (const pack of packData.packs) {
    const icon = getPackIcon(pack.id);
    const packElement = document.createElement("div");
    packElement.className = "pack";
    const description = marked.parse(pack.description, {
        async: false
    }) as string;
    packElement.innerHTML = `
    <section class="top">
      <picture>
        <source srcset="${icon}.webp" type="image/webp">
        <img loading="lazy" src="${icon}.png" alt="${pack.friendly_name}">
      </picture>
      <div class="details">
        <h2>${pack.friendly_name}</h2>
        <div> ${description}</div>
      </div>
    </section>
    <div class="downloads"></div>
`;
    const packDownloadsElement = packElement.querySelector(".downloads");
    if (!packDownloadsElement) {
        throw new Error("Pack downloads element not found");
    }

    // dinamically load the download buttons
    for (const version of <const>["1.8.9", "1.20.5", "bedrock"]) {
        if (!pack.downloads[version]) {
            continue;
        }

        const downloadButton = document.createElement("button");
        downloadButton.textContent = `Download for ${version === "bedrock" ? "Bedrock" : version}`;
        downloadButton.addEventListener("click", () => {
            downloadPack(pack.id, version);
            if (version === "bedrock") {
                // TODO: Write a message to display to the user when the Bedrock pack is downloaded.
                openModal("<div>Place your input HTML here</div>");
            }
        });
        packDownloadsElement.appendChild(downloadButton);
    }
    packsSectionElement.appendChild(packElement);
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

commentForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    // spawn hCaptcha
    const hCaptchaElement = document.getElementById("hcaptcha") as VanillaHCaptchaWebComponent;
    hCaptchaElement.render({ sitekey: "7c279daa-4c7e-4c0a-8814-fca3646e78cc", theme: "dark" });

    hCaptchaElement.executeAsync().then(() => {
        // create a form data object
        const formData = new FormData(commentForm);

        // send the comment to the server
        app.api.comments
            .post({
                packid: formData.get("packid") as string,
                comment: formData.get("comment") as string,
                "h-captcha-response": formData.get("h-captcha-response") as string
            })
            .then((res) => {
                if (res.status === 200) {
                    // show a confirmation modal and a button to enable notifications
                    openModal(
                        `<p>Your comment has been sent to be reviewed.</p><p>You can enable notifications for this pack by clicking the button below.</p><button id="enablenotifs">Enable notifications</button>`
                    );
                    document.getElementById("enablenotifs")?.addEventListener("click", async () => {
                        Notification.requestPermission().then(function (granted) {
                            if (granted !== "granted") {
                                return;
                            }
                            subscribeToPushNotifications();
                        });
                    });
                    return;
                }
                if (res.status === 422) {
                    openModal(`<p class="error">Error: Badly formatted comment.</p>`);
                    return;
                }
                if (res.status === 401) {
                    openModal(`<p class="error">Error: CAPTCHA failed. Are you a robot?</p>`);
                    return;
                }
            });
    });
});

const commentsDiv = document.getElementById("comments") as HTMLDivElement;
select.addEventListener("change", () => {
    updateComments();
});

// function to update comments with packid from the select menu
async function updateComments() {
    console.log(`Fetching comments for ${select.value}`);

    commentsDiv.innerHTML = "Loading...";
    const comments = (await app.api.comments.get({ query: { packid: select.value, page: 0 } })).data;
    commentsDiv.innerHTML = "";

    if (comments && comments?.length !== 0) {
        for (const comment of comments) {
            const commentElement = document.createElement("div");
            commentElement.innerHTML = `
<div class="commentInfo">
    <img src="${comment.avatar}" alt="${comment.username}">
    <div>
        <h3>${comment.username}</h3>
        <span>&EmptySmallSquare; ${luxon.DateTime.fromMillis(Date.now()).toFormat("yyyy/MM/dd hh:mm") /* MM is short month, mm is 2-digit minutes */}</span>
    </div>
</div>
<p>${comment.comment}</p>`;
            commentsDiv.appendChild(commentElement);
        }
    } else if (comments != null) {
        // we have no comments
        const noComments = document.createElement("p");
        noComments.innerText = "No comments yet!";
        commentsDiv.appendChild(noComments);
    } else {
        // something went wrong
        const error = document.createElement("p");
        error.innerText = "An error occurred while fetching comments.";
        commentsDiv.appendChild(error);
    }
}
updateComments();

navigator.serviceWorker.addEventListener("message", (event) => {
    // check if the message is "sync-comments"
    if (event.data === "sync-comments") {
        updateComments();
    }
});
