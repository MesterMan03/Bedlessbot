import client, { db } from "..";
import { GetMaxPage } from "../commands/leaderboard";
import { XPToLevel, type LevelInfo, XPToLevelUp, LevelToXP } from "../levelmanager";

interface DashboardAPIInterface {
    FetchLbPage: (page: number) => Promise<DashboardLbEntry[] | null>;
}

interface DashboardLbEntry {
    pos: number;
    level: number;
    xp: number;
    userid: string;
    avatar: string;
    username: string;
    progress: [number, number];

}

const PageSize = 20;

async function FetchPage(page: number) {
    if (page >= GetMaxPage() || !Number.isInteger(page) || page < 0) {
        return null;
    }

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
                avatar: user ? user.displayAvatarURL({ forceStatic: false, size: 64 }) : "https://cdn.discordapp.com/embed/avatars/0.png",
                username: user ? user.username : "unknown",
                progress: [progress, progressPercent]
            } satisfies DashboardLbEntry;
        })
    );
}

export default class DashboardAPI implements DashboardAPIInterface {
    FetchLbPage = FetchPage;
}

export { type DashboardAPIInterface, type DashboardLbEntry };
