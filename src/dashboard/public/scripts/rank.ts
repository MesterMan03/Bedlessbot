import { treaty } from "@elysiajs/eden";
import type { DashboardApp } from "../..";
import { XPToLevel, XPToLevelUp } from "../../../levelfunctions";

const app = treaty<DashboardApp>(location.origin);

const allowedDomains = ["cdn.discordapp.com"];

function isValidURL(url: string): boolean {
    try {
        const parsedURL = new URL(url);
        return allowedDomains.includes(parsedURL.hostname);
    } catch {
        return false;
    }
}

interface UserValues {
    userImage: string;
    leaderboard: number;
    username: string;
    level: number;
    totalXP: number;
    currentXP: number;
    maxXP: number;
}

const userImageElem = document.querySelector("img") as HTMLImageElement;

function setUserValues(values: UserValues) {
    const leaderboardElem = document.querySelector("#leaderboard") as HTMLParagraphElement;
    const usernameElem = document.querySelector("#username") as HTMLParagraphElement;
    const levelElem = document.querySelector("#level") as HTMLParagraphElement;
    const totalXPElem = document.querySelector("#total-xp") as HTMLParagraphElement;
    const currentXPElem = document.querySelector("#current-xp") as HTMLParagraphElement;
    const maxXPElem = document.querySelector("#max-xp") as HTMLParagraphElement;
    const percentageElem = document.querySelector("#percentage") as HTMLParagraphElement;
    const XPProgressElem = document.querySelector("#progress") as HTMLProgressElement;

    const { userImage, leaderboard, username, level, totalXP, currentXP, maxXP } = values;

    if (isValidURL(userImage)) {
        userImageElem.src = userImage;
        userImageElem.alt = username;
    } else {
        console.error("Invalid user image URL");
        userImageElem.alt = "Invalid user image URL";
    }

    // add ellipsis for username
    const finalUsername = username.length > 13 ? username.slice(0, 13) + "..." : username;

    leaderboardElem.innerText = leaderboard.toString();
    usernameElem.innerText = finalUsername;
    levelElem.innerText = level.toString();
    totalXPElem.innerText = totalXP.toString();
    currentXPElem.innerText = `${currentXP}`;
    maxXPElem.innerText = `${maxXP}`;

    percentageElem.innerText = ((currentXP / maxXP) * 100).toFixed(2);

    XPProgressElem.max = maxXP;
    XPProgressElem.value = currentXP;
}

const search = new URLSearchParams(window.location.search);
// check if we have a userid field
(async () => {
    if (search.has("userid")) {
        const userid = search.get("userid") as string;
        const res = await app.api.lbpage.get({ query: { page: `i${userid}` } });
        if (res.error) {
            console.error(res.error.value);
            userImageElem.alt = res.error.value;
            return;
        }
        if (res.data.length === 0) {
            console.error("User not found");
            userImageElem.alt = "User not found";
            return;
        }
        const user = res.data[0];
        setUserValues({
            userImage: user.avatar,
            leaderboard: user.pos,
            username: user.username,
            level: user.level,
            totalXP: user.xp,
            currentXP: user.progress[0],
            maxXP: XPToLevelUp(user.level)
        });
    } else {
        // we have a static page
        setUserValues({
            userImage: search.get("avatar") as string,
            leaderboard: parseInt(search.get("leaderboard") as string),
            username: search.get("username") as string,
            level: parseInt(search.get("level") as string),
            totalXP: parseInt(search.get("total") as string),
            currentXP: parseInt(search.get("current") as string),
            maxXP: parseInt(search.get("max") as string)
        });
    }
})();
