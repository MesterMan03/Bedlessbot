import { Database } from "bun:sqlite";

export default function SetupDB(db: Database) {
    // journal mode
    db.run("PRAGMA journal_mode = wal;");

    // Role applications
    db.run("CREATE TABLE IF NOT EXISTS cheatpoints (userid TEXT PRIMARY KEY, cheatpoint INTEGER);");
    db.run("CREATE TABLE IF NOT EXISTS proofs (proof TEXT PRIMARY KEY, userid TEXT);");
    db.run("CREATE TABLE IF NOT EXISTS roles_given (userid TEXT PRIMARY KEY, roleid TEXT);");

    // Leveling
    db.run("CREATE TABLE IF NOT EXISTS levels (userid TEXT PRIMARY KEY, xp INTEGER);");
    db.run("CREATE INDEX IF NOT EXISTS idx_xp_desc ON levels (xp DESC);");

    // Birthdays
    db.run("CREATE TABLE IF NOT EXISTS birthdays (userid TEXT PRIMARY KEY, date TEXT, datenum INTEGER);");
    db.run("CREATE INDEX IF NOT EXISTS idx_datenum_desc ON birthdays (datenum ASC);");

    // Pack comments
    db.run("CREATE TABLE IF NOT EXISTS pack_comments (id TEXT PRIMARY KEY, packid TEXT, userid TEXT, comment TEXT, date INTEGER);");
    db.run("CREATE INDEX IF NOT EXISTS idx_comment_date_desc ON pack_comments (date DESC);");
    db.run("CREATE TABLE IF NOT EXISTS pending_pack_comments (id TEXT PRIMARY KEY, packid TEXT, userid TEXT, comment TEXT, date INTEGER);");

    // Dashboard users
    db.run("CREATE TABLE IF NOT EXISTS dash_users (userid TEXT PRIMARY KEY, username TEXT, avatar TEXT, access_token TEXT, refresh_token TEXT);");
    db.run("CREATE TABLE IF NOT EXISTS push_subscriptions (userid TEXT, endpoint TEXT PRIMARY KEY, expiration INTEGER, auth TEXT, p256dh TEXT);");
}
