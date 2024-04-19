/// <reference lib="dom" />

import { FetchPageTest } from "./api-test";

type User = {
  pos: number;
  level: number;
  xp: number;
  userid: string;
  avatar: string;
  username: string;
  progress: number[];
};

let users: User[] = [];

for (let i = 0; i < 10; i++) {
  const page = await FetchPageTest(i);

  if (page) {
    users.push(...page);
  }
}

// Sorts the users in case they aren't already sorted
users.sort((a, b) => a.pos - b.pos);

for (const user of users) {
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
        <progress value="${user.progress[0]}" max="${(user.progress[0] * 100) / user.progress[1]}">${Math.floor((user.progress[0] * 100) / user.progress[1])}</progress>
        ${xpInfoHTML}
      </label>
    </div>`,
  );
}
