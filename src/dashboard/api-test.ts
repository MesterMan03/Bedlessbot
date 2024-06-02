import type { User } from "discord-oauth2";
import type { DashboardAPIInterface, DashboardFinalPackComment, DashboardLbEntry, DashboardPackComment, DashboardUser } from "./api-types";
import { Database } from "bun:sqlite";
import config from "../config";

// set up test database
const db = new Database(":memory:");
db.run("PRAGMA journal_mode = wal;");
db.run("CREATE TABLE pack_comments (id TEXT PRIMARY KEY, packid TEXT, userid TEXT, comment TEXT, date INTEGER);");
db.run("CREATE INDEX idx_comment_date_desc ON pack_comments (date DESC);");
db.run("CREATE TABLE pending_pack_comments (id TEXT PRIMARY KEY, packid TEXT, userid TEXT, comment TEXT, date INTEGER);");
db.run("CREATE TABLE dash_users (userid TEXT PRIMARY KEY, username TEXT, avatar TEXT, access_token TEXT, refresh_token TEXT);");

const LbPageSize = 20;
const CommentsPageSize = 10;

function GenerateRandomName(): string {
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

export default class DashboardAPITest implements DashboardAPIInterface {
    async FetchLbPage(page: number) {
        if (page >= 10) {
            return null;
        }

        const levels = Array.from(
            { length: LbPageSize },
            (_, i) =>
                ({
                    pos: i + page * LbPageSize + 1,
                    level: Math.floor(Math.random() * 100),
                    xp: Math.floor(Math.random() * 1000),
                    userid: Math.random().toString(10).substring(2),
                    avatar: "https://cdn.discordapp.com/embed/avatars/0.png",
                    // username is a random string between 3 and 32 characters
                    username: GenerateRandomName(),
                    progress: [Math.floor(Math.random() * 1000), Math.floor(Math.random() * 100)]
                }) satisfies DashboardLbEntry
        );

        return new Promise<typeof levels>((res) => {
            setTimeout(() => {
                res(levels);
            }, 1000); // add an artifical delay
        });
    }

    CreateOAuth2Url(state: string) {
        // return the callback url
        const url = new URL(config.OAuthRedirect);
        url.searchParams.set("code", "MadeByMester");
        url.searchParams.set("state", state);
        return url.toString();
    }

    async ProcessOAuth2Callback(_: string) {
        // return dummy user
        const user = {
            id: Math.random().toString(10).substring(2),
            username: GenerateRandomName(),
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
        if (page >= 10) {
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
                const user = await this.GetUser(comment.userid).catch(
                    () =>
                        ({
                            username: GenerateRandomName(),
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
}
