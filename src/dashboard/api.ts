import DiscordOauth2, { type User } from "discord-oauth2";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, OAuth2Scopes } from "discord.js";
import client, { db } from "..";
import config from "../config";
import { LevelToXP, XPToLevel, XPToLevelUp, type LevelInfo } from "../levelmanager";
import data from "./data.json";

interface DashboardAPIInterface {
    FetchLbPage: (page: number) => Promise<DashboardLbEntry[] | null>;
    CreateOAuth2Url: (state: string) => string;
    ProcessOAuth2Callback: (code: string) => Promise<User | null>;
    SubmitPackComment: (userid: string, packid: string, comment: string) => Promise<DashboardPackComment | null>;
    ManagePackComment: (commentid: string, action: "approve" | "deny" | "spam") => Promise<boolean>;
    FetchPackComments: (packid: string, page: number) => Promise<DashboardFinalPackComment[] | null>;
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

interface DashboardPackComment {
    id: string;
    packid: string;
    userid: string;
    comment: string;
    date: number;
}

interface DashboardFinalPackComment extends DashboardPackComment {
    username: string;
    avatar: string;
}

const LbPageSize = 20;
const CommentsPageSize = 10;

const allPackIDs = data.packs.map((pack) => pack.id);

const oauth2Client = new DiscordOauth2({
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    redirectUri: config.OAuthRedirect
});

const scopes = [OAuth2Scopes.Identify, OAuth2Scopes.RoleConnectionsWrite];

function GetMaxLbPage() {
    const levelCount = db.query<{ row_count: number }, []>("SELECT COUNT(*) AS row_count FROM levels").get()?.row_count ?? 0;

    return Math.ceil(Math.max(levelCount, 1) / LbPageSize);
}

function GetMaxCommentsPage(packid: string) {
    const commentCount =
        db.query<{ row_count: number }, [string]>("SELECT COUNT(*) AS row_count FROM pack_comments WHERE packid = ?").get(packid)
            ?.row_count ?? 0;

    return Math.ceil(Math.max(commentCount, 1) / CommentsPageSize);
}

export default class DashboardAPI implements DashboardAPIInterface {
    async FetchLbPage(page: number) {
        if (page >= GetMaxLbPage()) {
            return null;
        }

        const levels = db
            .query<LevelInfo, []>(`SELECT * FROM levels ORDER BY xp DESC LIMIT ${LbPageSize} OFFSET ${page * LbPageSize}`)
            .all();
        return Promise.all(
            levels.map(async (levelInfo) => {
                const user = await client.users.fetch(levelInfo.userid);

                const level = XPToLevel(levelInfo.xp);
                const progress = levelInfo.xp - LevelToXP(level);

                // rounded to 2 decimal places
                const progressPercent = Math.round((progress / XPToLevelUp(level)) * 10000) / 100;

                return {
                    pos: levels.indexOf(levelInfo) + page * LbPageSize + 1,
                    level,
                    xp: levelInfo.xp,
                    userid: levelInfo.userid,
                    avatar: user
                        ? user.displayAvatarURL({ forceStatic: false, size: 64 })
                        : "https://cdn.discordapp.com/embed/avatars/0.png",
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

    async SubmitPackComment(userid: string, packid: string, comment: string) {
        if (!allPackIDs.includes(packid)) {
            throw new Error("Invalid pack ID");
        }

        const commentObj: DashboardPackComment = {
            id: Math.random().toString(10).substring(2),
            packid,
            userid,
            comment,
            date: Date.now()
        };

        // insert the comment into the database
        db.run("INSERT INTO pending_pack_comments (id, packid, userid, comment, date) VALUES (?, ?, ?, ?, ?)", [
            commentObj.id,
            commentObj.packid,
            commentObj.userid,
            commentObj.comment,
            commentObj.date
        ]);

        // send a review modal to mods
        const reviewChannel = await client.channels.fetch(config.Channels.PackComments);
        if (!reviewChannel?.isTextBased()) {
            throw new Error("Review channel is not a text channel or does not exist.");
        }

        const reviewEmbed = new EmbedBuilder()
            .setColor("DarkPurple")
            .setTitle("New Pack Comment")
            .setDescription("Read and review this comment, then decide if it should be approved.")
            .addFields(
                { name: "Author", value: `<@${commentObj.userid}>`, inline: true },
                { name: "Pack name", value: data.packs.find((pack) => pack.id === packid)?.friendly_name ?? "unknown", inline: true },
                { name: "Comment", value: commentObj.comment }
            )
            .setTimestamp(commentObj.date)
            .setFooter({ text: commentObj.id });

        const components = [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId("dash-comment-approve").setLabel("Approve").setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId("dash-comment-deny").setLabel("Deny").setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId("dash-comment-spam").setLabel("Spam").setStyle(ButtonStyle.Secondary)
            )
        ];

        reviewChannel.send({ embeds: [reviewEmbed], components });

        return commentObj;
    }

    async ManagePackComment(commentid: string, action: "approve" | "deny" | "spam") {
        const comment = db.query<DashboardPackComment, [string]>("SELECT * FROM pending_pack_comments WHERE id = ?").get(commentid);

        if (!comment) {
            throw new Error("Comment not found");
        }

        if (action === "approve") {
            db.run("INSERT INTO pack_comments (id, packid, userid, comment, date) VALUES (?, ?, ?, ?, ?)", [
                comment.id,
                comment.packid,
                comment.userid,
                comment.comment,
                comment.date
            ]);
        }

        // TODO: create some sanction for excessive spam reports

        db.run("DELETE FROM pending_pack_comments WHERE id = ?", [commentid]);

        return true;
    }

    async FetchPackComments(packid: string, page: number) {
        if (!allPackIDs.includes(packid)) {
            throw new Error("Invalid pack ID");
        }

        if (page >= GetMaxCommentsPage(packid)) {
            return null;
        }

        const comments = db
            .query<DashboardPackComment, [string]>(
                `SELECT * FROM pack_comments WHERE packid = ? ORDER BY date DESC LIMIT ${CommentsPageSize} OFFSET ${
                    page * CommentsPageSize
                }`
            )
            .all(packid);

        return Promise.all(
            comments.map(async (comment) => {
                const user = await client.users.fetch(comment.userid);

                return {
                    ...comment,
                    username: user ? user.username : "unknown",
                    avatar: user
                        ? user.displayAvatarURL({ forceStatic: false, size: 64 })
                        : "https://cdn.discordapp.com/embed/avatars/0.png"
                } satisfies DashboardFinalPackComment;
            })
        );
    }
}

export { type DashboardAPIInterface, type DashboardLbEntry, type DashboardPackComment, type DashboardFinalPackComment };
