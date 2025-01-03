import DiscordOauth2 from "discord-oauth2";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, OAuth2Scopes } from "discord.js";
import { verify } from "hcaptcha";
import webpush from "web-push";
import client, { GenerateSnowflake, db } from "..";
import config from "../config";
import { LevelToXP, XPToLevel, XPToLevelUp, type LevelInfo } from "../levelfunctions";
import { CONSTANTS, GetLeaderboardPos, IGetMaxCommentsPage } from "./api-common";
import type {
    DashboardAPIInterface,
    DashboardFinalPackComment,
    DashboardLbEntry,
    DashboardPackComment,
    DashboardUser,
    NotificationData,
    PushSubscriptionData
} from "./api-types";
import data from "./data.json";

webpush.setVapidDetails(
    process.env["VAPID_SUBJECT"] as string,
    process.env["VAPID_PUBLIC_KEY"] as string,
    process.env["VAPID_PRIVATE_KEY"] as string
);

const allPackIDs = data.packs.map((pack) => pack.id);

const oauth2Client = new DiscordOauth2({
    clientId: process.env["CLIENT_ID"],
    clientSecret: process.env["CLIENT_SECRET"],
    redirectUri: new URL(config.OAuthRedirect, config.DashOrigin).toString()
});

const scopes = [OAuth2Scopes.Identify, OAuth2Scopes.RoleConnectionsWrite];

function GetMaxLbPage() {
    const levelCount = db.query<{ row_count: number }, []>("SELECT COUNT(*) AS row_count FROM levels").get()?.row_count ?? 0;

    return Math.ceil(Math.max(levelCount, 1) / CONSTANTS.LbPageSize);
}

async function findIdFromNameOrId(nameOrId: string) {
    // step 1 - check if it's a user id (17-20 numbers)
    const isUserId = /^\d{17,20}$/.test(nameOrId);
    if (isUserId) {
        // check if the user id is found in the leaderboard
        const levelInfo = db.query<LevelInfo, [string]>("SELECT * FROM levels WHERE userid = ?").get(nameOrId);
        if (!levelInfo) {
            return nameOrId;
        }
    } else {
        // step 2 - attempt to find the user id from the user cache
        const user1 = client.users.cache.find((user) => user.username === nameOrId);
        if (user1) {
            return user1.id;
        }
    }
    return null;
}

export default class DashboardAPI implements DashboardAPIInterface {
    async FetchLbPage(pageOrId: number | string) {
        if (typeof pageOrId === "number" && pageOrId >= GetMaxLbPage()) {
            return null;
        }

        let query: string | undefined;
        if (typeof pageOrId === "number") {
            query = `SELECT * FROM levels ORDER BY xp DESC LIMIT ${CONSTANTS.LbPageSize} OFFSET ${pageOrId * CONSTANTS.LbPageSize}`;
        } else {
            const userid = await findIdFromNameOrId(pageOrId);
            if (!userid) {
                return null;
            }
            query = `SELECT * FROM levels WHERE userid = '${userid}'`;
        }

        const levels = db.query<LevelInfo, []>(query).all();
        const pos = (levelInfo: LevelInfo) => {
            if (typeof pageOrId === "number") {
                return levels.indexOf(levelInfo) + pageOrId * CONSTANTS.LbPageSize + 1;
            } else {
                return GetLeaderboardPos(levelInfo.userid, db);
            }
        };

        return Promise.all(
            levels.map(async (levelInfo) => {
                const user = await client.users.fetch(levelInfo.userid);

                const level = XPToLevel(levelInfo.xp);
                const progress = levelInfo.xp - LevelToXP(level);

                // rounded to 2 decimal places
                const progressPercent = Math.round((progress / XPToLevelUp(level)) * 10000) / 100;

                return {
                    pos: pos(levelInfo),
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

    CreateOAuth2Url(state: string, _: string) {
        const redirectUri = new URL(config.OAuthRedirect, config.DashOrigin);
        redirectUri.protocol = config.DashOrigin.startsWith("https") ? "https" : "http";

        return oauth2Client.generateAuthUrl({
            scope: scopes,
            state,
            prompt: "none",
            redirectUri: redirectUri.toString()
        });
    }

    async ProcessOAuth2Callback(code: string) {
        const token = await oauth2Client.tokenRequest({
            code,
            scope: scopes,
            grantType: "authorization_code"
        });

        // write user to database
        const user = await oauth2Client.getUser(token.access_token);
        const discordUser = await client.users.fetch(user.id);
        db.run("INSERT OR REPLACE INTO dash_users (userid, username, avatar, access_token, refresh_token) VALUES (?, ?, ?, ?, ?)", [
            user.id,
            user.username,
            discordUser.displayAvatarURL({ forceStatic: false, size: 64 }),
            token.access_token,
            token.refresh_token
        ]);

        return user;
    }

    async SubmitPackComment(userid: string, packid: string, comment: string, captcha: string) {
        if (!allPackIDs.includes(packid)) {
            throw new Error("Invalid pack ID");
        }

        // validate captcha response
        await verify(process.env["HCAPTCHA_SECRET"] as string, captcha)
            .then((data) => {
                if (!data.success) {
                    throw new Error("Invalid captcha");
                }
            })
            .catch((err) => {
                throw err;
            });

        const commentObj = {
            id: GenerateSnowflake(),
            packid,
            userid,
            comment,
            date: Date.now()
        } satisfies DashboardPackComment;

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
        if (!reviewChannel?.isTextBased() || reviewChannel.isDMBased()) {
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
        if (page >= this.GetMaxCommentsPage(packid)) {
            return null;
        }

        const comments = db
            .query<DashboardPackComment, [string]>(
                `SELECT * FROM pack_comments WHERE packid = ? ORDER BY date DESC LIMIT ${CONSTANTS.CommentsPageSize} OFFSET ${
                    page * CONSTANTS.CommentsPageSize
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

    async GetUser(userid: string) {
        // grab from database
        const user = db.query<DashboardUser, [string]>("SELECT * FROM dash_users WHERE userid = ?").get(userid);

        if (!user) {
            throw new Error("User not found");
        }

        return { username: user.username, avatar: user.avatar } satisfies DashboardUser;
    }

    SendPushNotification(userid: string, notification: NotificationData) {
        // get all subscriptions for the user
        const subscription = db
            .query<{ endpoint: string; auth: string; p256dh: string }, [string]>(
                "SELECT endpoint, auth, p256dh FROM push_subscriptions WHERE userid = ?"
            )
            .all(userid);

        // send the notification to all subscriptions
        subscription.forEach((sub) => {
            const pushConfig = {
                endpoint: sub.endpoint,
                keys: {
                    auth: sub.auth,
                    p256dh: sub.p256dh
                }
            };

            webpush.sendNotification(pushConfig, JSON.stringify(notification)).catch(() => {
                // unregister the subscription if it fails
                this.UnregisterPushSubscription(userid, sub.endpoint);
            });
        });
    }

    RegisterPushSubscription(userid: string, subscription: PushSubscriptionData) {
        // update the subscription (or insert if it doesn't exist)
        db.run("INSERT OR REPLACE INTO push_subscriptions (userid, endpoint, expiration, auth, p256dh) VALUES (?, ?, ?, ?, ?);", [
            userid,
            subscription.endpoint,
            subscription.expirationTime ?? null,
            subscription.keys.auth,
            subscription.keys.p256dh
        ]);
    }

    UnregisterPushSubscription(userid: string, endpoint: string) {
        db.run("DELETE FROM push_subscriptions WHERE userid = ? AND endpoint = ?", [userid, endpoint]);
    }

    GetMaxCommentsPage(packid: string) {
        return IGetMaxCommentsPage(packid, db, CONSTANTS.CommentsPageSize);
    }
}
