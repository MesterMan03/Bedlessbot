import { OAuth2Scopes } from "discord.js";
import client, { db } from "..";
import { GetMaxPage } from "../commands/leaderboard";
import config from "../config";
import { XPToLevel, type LevelInfo, XPToLevelUp, LevelToXP } from "../levelmanager";
import DiscordOauth2, { type User } from "discord-oauth2";

interface DashboardAPIInterface {
    FetchLbPage: (page: number) => Promise<DashboardLbEntry[] | null>;
    CreateOAuth2Url: (state: string) => string;
    ProcessOAuth2Callback: (code: string) => Promise<User | null>;
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

const oauth2Client = new DiscordOauth2({
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    redirectUri: config.OAuthRedirect
});

const scopes = [OAuth2Scopes.Identify, OAuth2Scopes.RoleConnectionsWrite];

export default class DashboardAPI implements DashboardAPIInterface {
    async FetchLbPage(page: number) {
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

    CreateOAuth2Url(state: string) {
        return oauth2Client.generateAuthUrl({ scope: scopes, state, prompt: "none" });
    }

    async ProcessOAuth2Callback(code: string) {
        const token = await oauth2Client.tokenRequest({
            code,
            scope: scopes,
            grantType: "authorization_code"
        });

        return oauth2Client.getUser(token.access_token);
    }
}

export { type DashboardAPIInterface, type DashboardLbEntry };
