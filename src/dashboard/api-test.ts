import type { User } from "discord-oauth2";
import type {
    DashboardAPIInterface,
    DashboardFinalPackComment,
    DashboardLbEntry,
    DashboardPackComment,
    DashboardUser,
    NotificationData,
    PushSubscriptionData
} from "./api-types";
import { Database } from "bun:sqlite";
import config from "../config";
import webpush from "web-push";
import packData from "./data.json";
import { CONSTANTS, GetLeaderboardPos, IGetMaxCommentsPage } from "./api-common";
import SetupDB from "../../tools/setup_db";
import { LevelToXP, XPToLevel, XPToLevelUp, type LevelInfo } from "../levelfunctions";

// set up test database
const db = new Database(":memory:");
SetupDB(db);

// fill pack comments with test data
for (const pack of packData.packs) {
    for (let i = 0; i < 50; i++) {
        db.run("INSERT INTO pack_comments (id, packid, userid, comment, date) VALUES (?, ?, ?, ?, ?)", [
            `${pack.id}-${i}`,
            pack.id,
            "testuser",
            "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Pellentesque adipiscing commodo elit at imperdiet.\n\nSit amet consectetur adipiscing elit duis tristique sollicitudin. Euismod nisi porta lorem mollis aliquam ut porttitor leo a. Ultricies mi quis hendrerit dolor.",
            Date.now()
        ]);
    }
}

// fill level data with test data
for (let i = 0; i < CONSTANTS.LbPageSize * 10; i++) {
    db.run("INSERT INTO levels (userid, xp) VALUES (?, ?)", [`testuser${i}`, Math.floor(Math.random() * i * 100) + 1]);
}

webpush.setVapidDetails(
    process.env["VAPID_SUBJECT"] as string,
    process.env["VAPID_PUBLIC_KEY"] as string,
    process.env["VAPID_PRIVATE_KEY"] as string
);

export default class DashboardAPITest implements DashboardAPIInterface {
    GenerateRandomName(): string {
        const minLength = 3;
        const maxLength = 32;
        const characters = "abcdefghijklmnopqrstuvwxyz0123456789_."; // Only lowercase letters, numbers, underscore, and period
        const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
        let result = "";

        for (let i = 0; i < length; i++) {
            const randomIndex = Math.floor(Math.random() * characters.length);
            result += characters.charAt(randomIndex);
        }

        return result;
    }

    async FetchLbPage(pageOrId: number | string) {
        if (typeof pageOrId === "number" && pageOrId >= 10) {
            return null;
        }

        let query: string | undefined;
        if (typeof pageOrId === "number") {
            query = `SELECT * FROM levels ORDER BY xp DESC LIMIT ${CONSTANTS.LbPageSize} OFFSET ${pageOrId * CONSTANTS.LbPageSize}`;
        } else {
            const userid = pageOrId;
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

        const data = await Promise.all(
            levels.map(async (levelInfo) => {
                const level = XPToLevel(levelInfo.xp);
                const progress = levelInfo.xp - LevelToXP(level);

                // rounded to 2 decimal places
                const progressPercent = Math.round((progress / XPToLevelUp(level)) * 10000) / 100;

                return {
                    pos: pos(levelInfo),
                    level,
                    xp: levelInfo.xp,
                    userid: levelInfo.userid,
                    avatar: "https://cdn.discordapp.com/embed/avatars/0.png",
                    username: levelInfo.userid,
                    progress: [progress, progressPercent]
                } satisfies DashboardLbEntry;
            })
        );

        // artifical delay
        return new Promise<typeof data>((res) => {
            setTimeout(() => res(data), 500);
        });
    }

    CreateOAuth2Url(state: string, origin: string) {
        // return the callback url
        const url = new URL(config.OAuthRedirect, origin);
        url.searchParams.set("code", "MadeByMester");
        url.searchParams.set("state", state);
        return url.toString();
    }

    async ProcessOAuth2Callback(_: string) {
        // return dummy user
        const user = {
            id: Math.random().toString(10).substring(2),
            username: this.GenerateRandomName(),
            global_name: "Dummy Person",
            avatar: "https://cdn.discordapp.com/embed/avatars/0.png",
            discriminator: "0"
        } satisfies User;

        db.run("INSERT INTO dash_users (userid, username, avatar, access_token, refresh_token) VALUES (?, ?, ?, ?, ?);", [
            user.id,
            user.username,
            user.avatar,
            "dummy_access_token",
            "dummy_refresh_token"
        ]);

        return user;
    }

    async SubmitPackComment(userid: string, packid: string, comment: string) {
        // create the comment with dummy data
        const commentObj = {
            id: Math.random().toString(10).substring(2),
            packid,
            userid,
            comment,
            date: Date.now()
        } satisfies DashboardPackComment;

        // write to the database
        db.run("INSERT INTO pending_pack_comments (id, packid, userid, comment, date) VALUES (?, ?, ?, ?, ?);", [
            commentObj.id,
            commentObj.packid,
            commentObj.userid,
            commentObj.comment,
            commentObj.date
        ]);

        this.ManagePackComment(commentObj.id, "approve");

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
                const user = await this.GetUser(comment.userid).catch(
                    () =>
                        ({
                            username: this.GenerateRandomName(),
                            avatar: "https://cdn.discordapp.com/embed/avatars/0.png"
                        }) satisfies DashboardUser
                );

                return {
                    ...comment,
                    username: user.username,
                    avatar: user.avatar
                } satisfies DashboardFinalPackComment;
            })
        );
    }

    async GetUser(userid: string) {
        const user = db.query<DashboardUser, [string]>("SELECT * FROM dash_users WHERE userid = ?").get(userid);

        if (!user) {
            throw new Error("User not found");
        }

        return {
            username: user.username,
            avatar: user.avatar
        } satisfies DashboardUser;
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

        setInterval(() => {
            this.SendPushNotification(userid, { title: "Test notification", body: "This is a test notification", tag: "test" });
        }, 5_000);
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

    UnregisterPushSubscription(userid: string, endpoint: string) {
        db.run("DELETE FROM push_subscriptions WHERE userid = ? AND endpoint = ?", [userid, endpoint]);
    }

    GetMaxCommentsPage(packid: string) {
        return IGetMaxCommentsPage(packid, db, CONSTANTS.CommentsPageSize);
    }
}
