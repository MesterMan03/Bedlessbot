import client, { db } from "..";
import { GetMaxPage } from "../commands/leaderboard";
import { XPToLevel, type LevelInfo, XPToLevelUp, LevelToXP } from "../levelmanager";

const PageSize = 25;

async function FetchPage(page: number) {
    if (page >= GetMaxPage() || !Number.isInteger(page) || page < 0) return null;

    const levels = db.query<LevelInfo, []>(`SELECT * FROM levels ORDER BY xp DESC LIMIT ${PageSize} OFFSET ${page * PageSize}`).all();
    return Promise.all(
        levels.map(async (levelInfo) => {
            const user = await client.users.fetch(levelInfo.userid);

            const level = XPToLevel(levelInfo.xp);
            const progress = levelInfo.xp - LevelToXP(level);

            // rounded to 2 decimal places
            const progressPercent = Math.round((progress / XPToLevelUp(level)) * 10000) / 100;

            return {
                pos: levels.indexOf(levelInfo) + page * PageSize + 1,
                level,
                xp: levelInfo.xp,
                userid: levelInfo.userid,
                avatar: user ? user.displayAvatarURL({ forceStatic: true, size: 256, extension: "png" }) : "https://cdn.discordapp.com/embed/avatars/0.png",
                username: user ? user.username : "unknown",
                progress: [progress, progressPercent],
            };
        })
    );
}

export { FetchPage };
