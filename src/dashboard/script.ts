/// <reference lib="dom" />

import { type FetchPage as IFetchPage } from "./api";

async function FetchPage(page: number): ReturnType<typeof IFetchPage> {
    const res = await fetch(`/page?page=${page}`);
    if (!res.ok) return null;

    return res.json();
}

const toast = document.getElementById("toast")!;

function showToast() {
    toast.style.opacity = "1";
    toast.style.visibility = "visible";

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.visibility = "hidden";
    }, 2000);
}

async function loadUsers(pageCursor: number) {
    const loadingIndicator = document.querySelector<HTMLParagraphElement>("#loading-indicator")!;

    loadingIndicator.style.display = "initial";
    const page = await FetchPage(pageCursor);
    if (!page) {
        loadingIndicator.style.display = "none";
        return false;
    }

    for (const user of page) {
        const podiumHTML = `<img src="${user.avatar}" loading="lazy"><span onclick="navigator.clipboard.writeText('${user.userid}')">${user.username}</span>`;
        const xpInfoHTML = `<span class="xp-popup">${user.progress[0]}/${Math.floor((user.progress[0] * 100) / user.progress[1])}</span>`;

        if (user.pos === 1) {
            const first = document.querySelector<HTMLDivElement>("#first")!;
            first.querySelector("h2")!.innerHTML = podiumHTML;
            first.querySelector("#total-xp-level")!.innerHTML = `Level: ${user.level}<br>Total XP: ${user.xp}`;
            first.querySelector("#xp")!.innerHTML = xpInfoHTML;
            continue;
        }

        if (user.pos === 2) {
            const second = document.querySelector<HTMLDivElement>("#second")!;
            second.querySelector("h2")!.innerHTML = podiumHTML;
            second.querySelector("#total-xp-level")!.innerHTML = `Level: ${user.level}<br>Total XP: ${user.xp}`;
            second.querySelector("#xp")!.innerHTML = xpInfoHTML;
            continue;
        }

        if (user.pos === 3) {
            const third = document.querySelector<HTMLDivElement>("#third")!;
            third.querySelector("h2")!.innerHTML = podiumHTML;
            third.querySelector("#total-xp-level")!.innerHTML = `Level: ${user.level}<br>Total XP: ${user.xp}`;
            third.querySelector("#xp")!.innerHTML = xpInfoHTML;
            continue;
        }

        const listings = document.querySelector("section")!;
        listings.insertAdjacentHTML(
            "beforeend",
            `<div class="user">
      <p class="pos">${user.pos}</p>
      <p class="name" onclick="navigator.clipboard.writeText('${user.userid}')"><img src="${user.avatar}" loading="lazy"><span>${user.username}</span></p>
      <label>
        <p><span>Level: ${user.level}</span><span>XP: ${user.xp}</span></p>
        <progress value="${user.progress[0]}" max="${(user.progress[0] * 100) / user.progress[1]}">${Math.floor(
            (user.progress[0] * 100) / user.progress[1]
        )}</progress>
        ${xpInfoHTML}
      </label>
    </div>`
        );
    }

    loadingIndicator.style.display = "none";
    return true;
}

// set up toast
document.addEventListener("click", function (event) {
    //@ts-ignore It does exist, idiot
    if (event.target?.closest(".name")) {
        showToast();
    }
});

let pageCursor = 0;

// Initial load
await loadUsers(pageCursor);
pageCursor++;

let done = true;
addEventListener("scroll", async () => {
    if (scrollY + innerHeight == document.body.clientHeight && done) {
        done = false;
        const success = await loadUsers(pageCursor).then((success) => {
            done = true;
            return success;
        });
        if (success) pageCursor++;
    }
});
