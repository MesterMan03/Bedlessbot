/* eslint-disable */

/**
 * @typedef {Object} UserValues
 * @prop {string} userImage
 * @prop {string} leaderboard
 * @prop {string} username
 * @prop {number} level
 * @prop {number} totalXP
 * @prop {number} currentXP
 * @prop {number} maxXP
 */

/**
 * @param {UserValues}
 */
function setUserValues({ userImage, leaderboard, username, level, totalXP, currentXP, maxXP }) {
    const userImageElem = document.querySelector("img");
    const leaderboardElem = document.querySelector("#leaderboard");
    const usernameElem = document.querySelector("#username");
    const levelElem = document.querySelector("#level");
    const totalXPElem = document.querySelector("#total-xp");
    const currentXPElem = document.querySelector("#current-xp");
    const maxXPElem = document.querySelector("#max-xp");
    const percentageElem = document.querySelector("#percentage");
    const XPProgressElem = document.querySelector("#progress");

    userImageElem.src = userImage;
    userImageElem.alt = username;

    // add ellipsis for username
    username = username.length > 13 ? username.slice(0, 13) + "..." : username;

    leaderboardElem.innerText = leaderboard;
    usernameElem.innerText = username;
    levelElem.innerText = level;
    totalXPElem.innerText = totalXP;
    currentXPElem.innerText = `${currentXP}&nbsp`;
    maxXPElem.innerText = `	&nbsp;${maxXP}`;

    percentageElem.innerText = ((currentXP / maxXP) * 100).toFixed(2);

    XPProgressElem.max = maxXP;
    XPProgressElem.value = currentXP;
}

const search = new URLSearchParams(window.location.search);
setUserValues({
    userImage: search.get("avatar"),
    leaderboard: parseInt(search.get("leaderboard")),
    username: search.get("username"),
    level: parseInt(search.get("level")),
    totalXP: parseInt(search.get("total")),
    currentXP: parseInt(search.get("current")),
    maxXP: parseInt(search.get("max"))
});
