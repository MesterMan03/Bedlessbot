import type { User } from "discord-oauth2";
import type { DashboardAPIInterface, DashboardLbEntry, DashboardPackComment } from "./api";
import { Database } from "bun:sqlite";
import config from "../config";

// set up test database
const db = new Database(":memory:");
db.run("PRAGMA journal_mode = wal;");
db.run("CREATE TABLE pack_comments (id TEXT PRIMARY KEY, packid TEXT, userid TEXT, comment TEXT, date INTEGER);");
db.run("CREATE INDEX idx_comment_date_desc ON pack_comments (date DESC);");
db.run("CREATE TABLE pending_pack_comments (id TEXT PRIMARY KEY, packid TEXT, userid TEXT, comment TEXT, date INTEGER);");

const PageSize = 20;

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
        // this is a test api, generate random data
        if (page >= 10 || !Number.isInteger(page) || page < 0) {
            return null;
        }

        const levels = Array.from(
            { length: PageSize },
            (_, i) =>
                ({
                    pos: i + page * PageSize + 1,
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
        return {
            id: Math.random().toString(10).substring(2),
            username: GenerateRandomName(),
            global_name: "Dummy Person",
            avatar: null,
            discriminator: "0"
        } as User;
    }

    async SubmitPackComment(userid: string, packid: string, comment: string) {
        // create the comment with dummy data
        const commentObj = {
            id: Math.random().toString(10).substring(2),
            packid: packid,
            userid: userid,
            comment,
            date: Date.now(),
            pending: true
        } as DashboardPackComment<true>;

        // write to the database
        db.run("INSERT INTO pending_pack_comments (id, packid, userid, comment, date) VALUES (?, ?, ?, ?, ?);", [
            commentObj.id,
            commentObj.packid,
            commentObj.userid,
            commentObj.comment,
            commentObj.date
        ]);

        return commentObj;
    }
}
