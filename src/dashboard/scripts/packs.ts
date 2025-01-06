import { treaty } from "@elysiajs/eden";
import { type DashboardApp } from "..";
import type { PackData } from "../api-types";
import "@hcaptcha/vanilla-hcaptcha";
import type { VanillaHCaptchaWebComponent } from "@hcaptcha/vanilla-hcaptcha";
import { subscribeToPushNotifications } from "./loadworker";
import * as luxon from "luxon";
import * as marked from "marked";
import { user } from "./auth";

const cdn = "https://bedless-cdn.mester.info";

// init the app and pack data
const app = treaty<DashboardApp>(location.origin);
const packData = (await app.api.packdata.get()).data as PackData;

if (!packData) {
    openModal(`<p class="error">Error: Pack data not found.</p>`);
    throw new Error("Pack data not found");
}

const PackVersions = <const>["1.8.9", "1.20.5", "bedrock"];
type PackVersion = typeof PackVersions[number];

/**
 * A function to download a pack.
 * @param packid The packid to download.
 * @param version The version of the pack to download.
 */
function downloadPack(packid: string, version: PackVersion) {
    window._paq?.push(["trackEvent", "Packs", "DownloadPack", `${packid}-${version}`]);
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

const dialogElement = document.querySelector<HTMLDialogElement>("#notifications");
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
const packPopout = document.getElementById("packpopout") as HTMLDialogElement;

for (const pack of packData.packs) {
    const icon = getPackIcon(pack.id);
    const packElement = document.createElement("div");
    packElement.className = "pack";
    const description = marked.parse(pack.description, {
        async: false
    });
    packElement.innerHTML = `<section class="top">
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
<button class="commentsbutton">Open comments</button>
`;
    const packDownloadsElement = packElement.querySelector(".downloads") as HTMLDivElement;

    // dinamically load the download buttons
    for (const version of PackVersions) {
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

    // setup comments button
    const commentsButton = packElement.querySelector(".commentsbutton") as HTMLButtonElement;
    commentsButton.addEventListener("click", () => {
        window._paq?.push(["trackEvent", "Packs", "OpenComments", pack.id]);
        function transition() {
            packPopout.querySelector(".pack")?.remove();
            packPopout.prepend(packElement.cloneNode(true));

            select.value = pack.id;
            resetSelectedPack();

            packPopout.showModal();
        }

        if (!document.startViewTransition) {
            transition();
        } else {
            document.startViewTransition(transition);
        }
    });

    packsSectionElement.appendChild(packElement);
}

// add login warning or submit button, based on whether the user is logged in or not
const loginButton = document.getElementById("loginbutton") as HTMLButtonElement;
loginButton.addEventListener("click", () => {
    window.location.href = "/api/auth?redirect=/packs";
});

user.then((user) => {
    if (user) {
        loginButton.style.display = "none";
    } else {
        commentForm.style.display = "none";
    }
});

const variants = packData.packs.map((pack) => pack.variant ?? pack.id).filter((variant, idx, arr) => arr.indexOf(variant) === idx);

// set up select menu with select options based on variants
const select = document.createElement("select");
select.name = "packid";
select.hidden = true;
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

// Add event listener to the comment form
commentForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    // Create a form data object
    const formData = new FormData(commentForm);

    // Validate comment (must be trimmed, at least 1 character, max 1024 characters)
    const comment = (formData.get("comment") as string).trim();
    if (comment.length < 1 || comment.length > 1024) {
        commentElement.setCustomValidity("Comment must be at least 1 character and no more than 1024 characters.");
        commentElement.reportValidity();
        return;
    }

    const submitButton = commentForm.querySelector<HTMLButtonElement>("button[type=submit]");
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.innerText = "Loading captcha...";
    }

    // Spawn hCaptcha
    const hCaptchaElement = document.getElementById("hcaptcha") as VanillaHCaptchaWebComponent;
    // Check if the hCaptcha element has no children -> render it
    if (hCaptchaElement.children.length === 0) {
        hCaptchaElement.render({ sitekey: "7c279daa-4c7e-4c0a-8814-fca3646e78cc", theme: "dark", size: "invisible", tabindex: 0 });
    }

    const packPopoutOpen = packPopout.open;
    if (packPopoutOpen) {
        setTimeout(() => {
            packPopout.close();
        }, 1000);
    }

    hCaptchaElement
        .executeAsync()
        .then(({ response }) => {
            // Send the comment to the server
            app.api.comments
                .post({
                    packid: formData.get("packid") as string,
                    comment,
                    "h-captcha-response": response
                })
                .then((res) => {
                    processCommentResponse(res.status);
                    // Clear the comment field on successful submission
                    if (res.status === 200) {
                        commentElement.value = "";
                    }
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
            if (packPopoutOpen) {
                packPopout.showModal();
            }
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
    page -= 1;

    // disable button if at first page
    for (const prevPageButton of prevPageButtons) {
        prevPageButton.disabled = page === 0;
    }
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
    page += 1;

    // disable button if at last page
    for (const nextPageButton of nextPageButtons) {
        nextPageButton.disabled = page === maxPage - 1;
    }
    for (const prevPageButton of prevPageButtons) {
        prevPageButton.disabled = false;
    }
    for (const pageLabel of pageLabels) {
        pageLabel.innerHTML = `${page + 1}/${maxPage}`;
    }
    updateComments();
}

const commentsDiv = document.getElementById("comments") as HTMLDivElement;
select.addEventListener("change", () => {
    resetSelectedPack();
});
async function resetSelectedPack() {
    maxPage = (await app.api.comments.maxpage.get({ query: { packid: select.value } })).data ?? 1;
    page = 0;
    updateComments();
    for (const pageLabel of pageLabels) {
        pageLabel.innerHTML = `${page + 1}/${maxPage}`;
    }
}

/**
 * A function to update the comments section with the comments for the currently selected pack.
 */
async function updateComments() {
    console.debug(`Fetching comments for ${select.value}, page: ${page}`);

    for (const pageButton of [...prevPageButtons, ...nextPageButtons]) {
        pageButton.disabled = true;
    }

    // render new comments
    let loading = true;
    app.api.comments.get({ query: { packid: select.value, page } }).then((res) => {
        const comments = res.data;
        loading = false;

        if (comments && comments?.length !== 0) {
            commentsDiv.innerHTML = "";
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

                // add onclickevent to h3
                const usernameElement = commentElement.querySelector("h3") as HTMLHeadingElement;
                usernameElement.addEventListener("click", () => {
                    navigator.clipboard.writeText(comment.userid);
                });
            }
        } else if (comments != null) {
            // we have no comments
            commentsDiv.innerHTML = `<p>No comments yet!</p>`;
        } else {
            // something went wrong
            commentsDiv.innerHTML = `<p>An error occurred while fetching comments.</p>`;
        }

        if (page > 0) {
            for (const pageButton of prevPageButtons) {
                pageButton.disabled = false;
            }
        }
        if (page < maxPage - 1) {
            for (const pageButton of nextPageButtons) {
                pageButton.disabled = false;
            }
        }
    });

    // after 200 ms, check if we're still loading and add a "Loading..." text
    setTimeout(() => {
        if (loading) {
            loading = false;
            commentsDiv.innerHTML = "Loading..." + commentsDiv.innerHTML;
        }
    }, 200);
}

document.getElementById("togglecomments")?.addEventListener("click", () => {
    document.querySelector<HTMLDivElement>("section.comments")?.classList.toggle("hidden");
});

navigator.serviceWorker.addEventListener("message", (event) => {
    // check if the message is "sync-comments"
    if (event.data === "sync-comments") {
        updateComments();
    }
});
