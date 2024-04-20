/// <reference lib="dom" />

import { FetchPageTest } from "./api-test";

async function loadUsers(pageCursor: number) {
  const page = await FetchPageTest(pageCursor);
  if (!page) return;

  for (const user of page) {
    const podiumHTML = `<span onclick="navigator.clipboard.writeText('${user.userid}')"><img src="${user.avatar}">${user.username}</span>`;
    const xpInfoHTML = `<span>${user.progress[0]}/${Math.floor((user.progress[0] * 100) / user.progress[1])}<br>Total xp: ${user.xp}</span>`;
    if (user.pos === 1) {
      const first = document.querySelector<HTMLDivElement>("#first")!;
      first.querySelector("h2")!.innerHTML = podiumHTML;
      first.querySelector("#xp")!.innerHTML = xpInfoHTML;
      continue;
    }

    if (user.pos === 2) {
      const second = document.querySelector<HTMLDivElement>("#second")!;
      second.querySelector("h2")!.innerHTML = podiumHTML;
      second.querySelector("#xp")!.innerHTML = xpInfoHTML;
      continue;
    }

    if (user.pos === 3) {
      const third = document.querySelector<HTMLDivElement>("#third")!;
      third.querySelector("h2")!.innerHTML = podiumHTML;
      third.querySelector("#xp")!.innerHTML = xpInfoHTML;
      continue;
    }

    const listings = document.querySelector("section")!;
    listings.insertAdjacentHTML(
      "beforeend",
      `<div class="user">
      <p class="pos">${user.pos}</p>
      <p class="name" onclick="navigator.clipboard.writeText('${user.userid}')"><img src="${user.avatar}">${user.username}</p>
      <label>
        <p>Level: ${user.level}</p>
        <progress value="${user.progress[0]}" max="${(user.progress[0] * 100) / user.progress[1]}">${Math.floor((user.progress[0] * 100) / user.progress[1])}</progress>
        ${xpInfoHTML}
      </label>
    </div>`,
    );
  }
}

let pageCursor = 0;
const maxPage = 10;

// Initial load
await loadUsers(pageCursor);
pageCursor++;

addEventListener("scroll", async () => {
  if (
    scrollY + innerHeight == document.body.clientHeight &&
    pageCursor < maxPage
  ) {
    await loadUsers(pageCursor);
    pageCursor++;
  }
});
