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

if (!packData) {
    openModal(`<p class="error">Error: Pack data not found.</p>`);
    throw new Error("Pack data not found");
}

/**
 * A function to download a pack.
 * @param packid The packid to download.
 * @param version The version of the pack to download.
 */
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

/**
 * A function to get the URL of the pack icon without the extension.
 * @param packid The packid of the pack.
 * @returns The URL of the pack icon (missing extension).
 */
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
function openModal(inputText: string, onClose?: () => void) {
    if (!dialogElement) {
        throw new Error("Dialog element not found");
    }
    dialogElement.innerHTML = `${inputText}<form method="dialog"><button>Close</button></form>`;
    dialogElement.showModal();

    if (onClose) {
        dialogElement.querySelector("form")?.addEventListener("submit", function close() {
            dialogElement.querySelector("form")?.removeEventListener("submit", close);
            onClose();
        });
    }
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
const commentForm = document.getElementById("commentForm") as HTMLFormElement;
const commentElement = commentForm.querySelector<HTMLTextAreaElement>("textarea[name=comment]") as HTMLTextAreaElement;

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
            if (version === "bedrock") {
                openModal(
                    "<div>DISCLAIMER: The Bedrock pack does NOT support OptiFine features, which means you lose custom skies and connected textures.</div>",
                    () => {
                        downloadPack(pack.id, version);
                    }
                );
            } else {
                downloadPack(pack.id, version);
            }
        });
        packDownloadsElement.appendChild(downloadButton);
    }
    packsSectionElement.appendChild(packElement);
}

// add login warning or submit button, based on whether the user is logged in or not
app.api.user.get().then((response) => {
    if (response.status !== 200) {
        const warning = document.createElement("a");
        warning.innerText = "You must be logged in to comment!";
        warning.href = "/api/auth?redirect=/packs.html";

        commentForm.append(warning);
    } else {
        const button = document.createElement("button");
        button.innerText = "Submit";
        button.type = "submit";

        commentForm.append(button);
    }
});

const variants = packData.packs.map((pack) => pack.variant ?? pack.id).filter((variant, idx, arr) => arr.indexOf(variant) === idx);

// set up select menu with select options based on variants
const select = document.createElement("select");
select.name = "packid";
commentForm.prepend(select);

for (const variant of variants) {
    const optgroup = document.createElement("optgroup");
    optgroup.label = variant;
    optgroup.id = `variant-${variant}`;
    select.appendChild(optgroup);
}
for (const pack of packData.packs) {
    const option = document.createElement("option");
    option.value = pack.id;
    option.innerText = pack.friendly_name;
    select.appendChild(option);
    (document.getElementById(`variant-${pack.variant ?? pack.id}`) as HTMLOptGroupElement).appendChild(option);
}

// add event listener to the comment form
commentForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    // create a form data object
    const formData = new FormData(commentForm);

    // validate comment (must be trimmed, at least 32 characters, max 1024 characters)
    const comment = (formData.get("comment") as string).trim();
    if (comment.length < 32 || comment.length > 1024) {
        commentElement.setCustomValidity("Comment must be at least 32 characters and no more than 1024 characters.");
        commentElement.reportValidity();
        return;
    }

    const submitButton = commentForm.querySelector<HTMLButtonElement>("button[type=submit]");
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.innerText = "Loading captcha...";
    }

    // spawn hCaptcha
    const hCaptchaElement = document.getElementById("hcaptcha") as VanillaHCaptchaWebComponent;
    // check if the hCaptcha element has no children -> render it
    if (hCaptchaElement.children.length === 0) {
        hCaptchaElement.render({ sitekey: "7c279daa-4c7e-4c0a-8814-fca3646e78cc", theme: "dark", size: "invisible", tabindex: 0 });
    }

    hCaptchaElement
        .executeAsync()
        .then(({ response }) => {
            // send the comment to the server
            app.api.comments
                .post({
                    packid: formData.get("packid") as string,
                    comment,
                    "h-captcha-response": response
                })
                .then((res) => {
                    processCommentResponse(res.status);
                });
        })
        .catch((err) => {
            if (err === "challenge-closed") {
                return;
            }
            console.error(err);
            openModal(`<p class="error">Error: CAPTCHA failed due to an unexpected error.</p>`);
        })
        .finally(() => {
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.innerText = "Submit";
            }
        });
});

/**
 * A function to process the response from the server after submitting a comment.
 * @param code The status code of the response from the server.
 */
async function processCommentResponse(code: number) {
    switch (code) {
        case 200: {
            // show a confirmation modal and a button to enable notifications
            const disabledNotifications = Notification.permission === "denied";
            if (disabledNotifications) {
                openModal(`<p>Your comment has been sent for review.</p>`);
                return;
            }

            const hasPushSubscription = (await (await navigator.serviceWorker.ready).pushManager.getSubscription()) != null;
            const notificationsButtonCode = !hasPushSubscription
                ? `<p>You can enable notifications for this pack by clicking the button below.</p><button id="enablenotifs">Enable notifications</button>`
                : "";

            openModal(`<p>Your comment has been sent for review.</p>` + notificationsButtonCode);

            if (!hasPushSubscription) {
                document.getElementById("enablenotifs")?.addEventListener("click", async () => {
                    if ((await Notification.requestPermission()) === "granted") {
                        subscribeToPushNotifications();
                    }
                });
            }
            break;
        }
        case 422: {
            openModal(`<p class="error">Error: Badly formatted comment.</p>`);
            break;
        }
        case 401: {
            openModal(`<p class="error">Error: CAPTCHA failed. Are you a robot?</p>`);
            break;
        }
        default: {
            openModal(`<p class="error">Error: Unknown response from server.</p>`);
            break;
        }
    }
}

// remove custom validity from comment element when user types
commentElement.addEventListener("input", () => {
    commentElement.setCustomValidity("");
});
// pagination for comments
let page = 0;
let maxPage = 0;
const prevPageButtons = document.getElementsByClassName("prevCommentPage") as HTMLCollectionOf<HTMLButtonElement>;
const nextPageButtons = document.getElementsByClassName("nextCommentPage") as HTMLCollectionOf<HTMLButtonElement>;
const pageLabels = document.getElementsByClassName("pageLabel") as HTMLCollectionOf<HTMLSpanElement>;

app.api.comments.maxpage.get({ query: { packid: select.value } }).then((response) => {
    maxPage = response.data ?? 1;
    for (const nextPageButton of nextPageButtons) {
        nextPageButton.disabled = maxPage === 1;
    }
    for (const pageLabel of pageLabels) {
        pageLabel.innerHTML = `${page + 1}/${maxPage}`;
    }
});

for (const prevPageButton of prevPageButtons) {
    prevPageButton.addEventListener("click", previousCommentPage);
}
for (const nextPageButton of nextPageButtons) {
    nextPageButton.addEventListener("click", nextCommentPage);
}

function previousCommentPage() {
    if (page === 0) {
        for (const prevPageButton of prevPageButtons) {
            prevPageButton.disabled = true;
        }
        return;
    }
    // disable button if at second page
    for (const prevPageButton of prevPageButtons) {
        prevPageButton.disabled = page === 1;
    }
    --page;
    for (const nextPageButton of nextPageButtons) {
        nextPageButton.disabled = false;
    }
    for (const pageLabel of pageLabels) {
        pageLabel.innerHTML = `${page + 1}/${maxPage}`;
    }
    updateComments();
}

function nextCommentPage() {
    if (page === maxPage - 1) {
        for (const nextPageButton of nextPageButtons) {
            nextPageButton.disabled = true;
        }
        return;
    }
    // disable button if at second to last page
    for (const nextPageButton of nextPageButtons) {
        nextPageButton.disabled = page === maxPage - 2;
    }
    ++page;
    for (const prevPageButton of prevPageButtons) {
        prevPageButton.disabled = false;
    }
    for (const pageLabel of pageLabels) {
        pageLabel.innerHTML = `${page + 1}/${maxPage}`;
    }
    updateComments();
}

const commentsDiv = document.getElementById("comments") as HTMLDivElement;
select.addEventListener("change", async () => {
    page = 0;
    updateComments();
    maxPage = (await app.api.comments.maxpage.get({ query: { packid: select.value } })).data ?? 1;
    for (const prevPageButton of prevPageButtons) {
        prevPageButton.disabled = true;
    }
    for (const nextPageButton of nextPageButtons) {
        nextPageButton.disabled = maxPage === 1;
    }
    for (const pageLabel of pageLabels) {
        pageLabel.innerHTML = `${page + 1}/${maxPage}`;
    }
});

/**
 * A function to update the comments section with the comments for the currently selected pack.
 */
async function updateComments() {
    console.log(`Fetching comments for ${select.value}`);

    commentsDiv.innerHTML = "Loading...";
    const comments = (await app.api.comments.get({ query: { packid: select.value, page } })).data;
    commentsDiv.innerHTML = "";

    if (comments && comments?.length !== 0) {
        for (const comment of comments) {
            const commentElement = document.createElement("div");
            commentElement.innerHTML = `
<div class="commentInfo">
    <img loading="lazy" src="${comment.avatar}" alt="${comment.username}">
    <div>
        <h3>${comment.username}</h3>
        <span>${luxon.DateTime.fromMillis(comment.date).toLocaleString(luxon.DateTime.DATETIME_SHORT)}</span>
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

document.getElementById("togglecomments")?.addEventListener("click", () => {
    console.log("sup");
    document.querySelector<HTMLDivElement>("section.comments")?.classList.toggle("hidden");
});

navigator.serviceWorker.addEventListener("message", (event) => {
    // check if the message is "sync-comments"
    if (event.data === "sync-comments") {
        updateComments();
    }
});
