import { treaty } from "@elysiajs/eden";
import type { DashboardApp } from "../..";
import "./loadworker";
import type { DashboardLbEntry } from "../../api-types";
import { XPToLevelUp } from "../../../levelfunctions";
import { GetUser } from "./auth";

const app = treaty<DashboardApp>(location.origin);

enum PageLoadCode {
    Success = 200,
    InvalidPage = 400,
    RateLimit = 429
}

let toastTimeout: globalThis.Timer | undefined = undefined;
function showToast() {
    const toast = document.getElementById("toast");
    if (!toast) {
        return;
    }

    toast.style.opacity = "1";
    toast.style.visibility = "visible";

    // we need to clear the timeout in case the toast is shown while it's already visible, which results in the toast hiding too early
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.visibility = "hidden";
    }, 2000);
}

async function loadUsers(page: number) {
    const loadingIndicator = document.querySelector<HTMLParagraphElement>("#loading-indicator");
    if (!loadingIndicator) {
        throw new Error("Loading indicator not found");
    }

    loadingIndicator.style.display = "initial";

    // jump to bottom of page
    scrollTo(0, document.body.scrollHeight);

    window._paq?.push(["trackEvent", "Leaderboard", "LoadPage", page]);
    const request = await app.api.lbpage.get({ query: { page } });
    if (request.error) {
        loadingIndicator.style.display = "none";
        return request.error.status as number;
    }

    const pageData = request.data;

    for (const user of pageData) {
        renderUser(user);
    }

    loadingIndicator.style.display = "none";
    return PageLoadCode.Success;
}

function renderUser(user: DashboardLbEntry) {
    const podiumHTML = `<img src="${user.avatar}" loading="lazy"><span onclick="navigator.clipboard.writeText('${user.userid}')">${user.username}</span>`;
    const xpInfoHTML = `<span class="xp-popup">${user.progress[0]}/${Math.floor((user.progress[0] * 100) / user.progress[1])}</span>`;

    let podiumElement: HTMLDivElement | null = null;

    if (1 <= user.pos && user.pos <= 3) {
        if (user.pos === 1) {
            podiumElement = document.querySelector<HTMLDivElement>("#first");
        }
        if (user.pos === 2) {
            podiumElement = document.querySelector<HTMLDivElement>("#second");
        }
        if (user.pos === 3) {
            podiumElement = document.querySelector<HTMLDivElement>("#third");
        }

        if (!podiumElement) {
            throw new Error("Podium element not found");
        }

        // biome-ignore lint/style/noNonNullAssertion: <explanation>
        podiumElement.querySelector("h2")!.innerHTML = podiumHTML;
        // biome-ignore lint/style/noNonNullAssertion: <explanation>
        podiumElement.querySelector("#total-xp-level")!.innerHTML = `Level: ${user.level}<br>Total XP: ${user.xp}`;
        // biome-ignore lint/style/noNonNullAssertion: <explanation>
        podiumElement.querySelector("#xp")!.innerHTML = xpInfoHTML;

        return;
    }

    const listings = document.querySelector("section");
    if (!listings) {
        throw new Error("Listings not found");
    }

    listings.insertAdjacentHTML(
        "beforeend",
        `<div class="user">
  <p class="pos">${user.pos}</p>
  <p class="name new"><img src="${user.avatar}" loading="lazy"><span>${user.username}</span></p>
  <label>
    <p><span>Level: ${user.level}</span><span>XP: ${user.xp}</span></p>
    <progress value="${user.progress[0]}" max="${(user.progress[0] * 100) / user.progress[1]}">${Math.floor(
        (user.progress[0] * 100) / user.progress[1]
    )}</progress>
    ${xpInfoHTML}
  </label>
</div>`
    );

    // setup click listener for name
    const nameElement = listings.querySelector<HTMLParagraphElement>(".name.new");
    if (nameElement) {
        nameElement.addEventListener("click", () => {
            navigator.clipboard.writeText(user.userid);
        });
        nameElement.classList.remove("new");
    }
}

// set up toast
document.addEventListener("click", function (event) {
    //@ts-ignore It does exist, idiot
    if (event.target?.closest(".name")) {
        showToast();
    }
});

function showRankCard(user: DashboardLbEntry) {
    const dialogElement = document.createElement("dialog");
    dialogElement.classList.add("rank-dialog");
    const iframe = document.createElement("iframe");
    iframe.width = "1200";
    iframe.height = "300";

    const rankInput = new URLSearchParams();
    rankInput.set("leaderboard", user.pos.toString());
    rankInput.set("username", user.username);
    rankInput.set("level", user.level.toString());
    rankInput.set("total", user.xp.toString());
    rankInput.set("current", user.progress.toString());
    rankInput.set("max", XPToLevelUp(user.level).toString());
    rankInput.set("avatar", user.avatar);
    iframe.src = "/rank.html?" + rankInput.toString();
    dialogElement.append(iframe);
    document.body.append(dialogElement);
    dialogElement.showModal();

    function close() {
        dialogElement.close();
        dialogElement.remove();
        document.removeEventListener("click", close);
        document.removeEventListener("touchstart", close);
    }

    document.addEventListener("click", close);
    document.addEventListener("touchstart", close);
}

function shakeElement(element: HTMLElement) {
    element.classList.add("shake");
    element.addEventListener("animationend", () => {
        element.classList.remove("shake");
    });
}

// set up nameorid input
const nameoridInput = document.getElementById("nameorid") as HTMLInputElement;
let loadingUserQuery = false;
nameoridInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") {
        return;
    }
    if (loadingUserQuery) {
        return;
    }

    // sanitise input
    const nameOrId = nameoridInput.value;
    if (nameOrId.length < 1 || nameOrId.length > 20) {
        shakeElement(nameoridInput);
        return;
    }

    // do a search
    nameoridInput.value = "Loading...";
    loadingUserQuery = true;
    const rank = await app.api.lbpage.get({ query: { page: `i${nameOrId}` } });
    loadingUserQuery = false;
    nameoridInput.value = nameOrId;
    if (rank.error) {
        shakeElement(nameoridInput);
        return;
    }
    if (rank.data.length === 0) {
        shakeElement(nameoridInput);
        return;
    }
    const user = rank.data[0];
    console.log(user);

    showRankCard(user);
});

// rewrite input if it contains illegal characters
nameoridInput.addEventListener("input", (event) => {
    if (loadingUserQuery) {
        event.preventDefault();
        return;
    }
    nameoridInput.value = nameoridInput.value.replace(/[^a-zA-Z0-9_.]/g, "");
});

// setup showme button
const showmeButton = document.getElementById("showme") as HTMLButtonElement;
GetUser().then((user) => {
    if (user) {
        showmeButton.addEventListener("click", () => {
            // fill nameorid input with the userid, then send Enter
            nameoridInput.value = user.userid;
            nameoridInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        });
    } else {
        showmeButton.addEventListener("click", () => {
            location.href = "/api/auth?redirect=/leaderboard";
        });
    }
});

let pageCursor = 0;

// Initial load
await loadUsers(pageCursor);
pageCursor++;

let doneLoading = true;
addEventListener("scroll", function listener() {
    (async () => {
        if (scrollY + innerHeight == document.body.clientHeight && doneLoading) {
            doneLoading = false;
            const successCode = await loadUsers(pageCursor).then((successCode) => {
                doneLoading = true;
                return successCode;
            });
            if (successCode === PageLoadCode.InvalidPage) {
                // we've reached the end, stop loading
                removeEventListener("scroll", listener);
            }
            if (successCode === PageLoadCode.Success) {
                pageCursor++;
            }
        }
    })();
});
