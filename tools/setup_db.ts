import { Database } from "bun:sqlite";

const db = new Database("data.db");
db.run("PRAGMA journal_mode = delete;");
db.run("CREATE TABLE cheatpoints (userid TEXT PRIMARY KEY, cheatpoint INTEGER);");
db.run("CREATE TABLE proofs (proof TEXT PRIMARY KEY, userid TEXT);");
db.run("CREATE TABLE levels (userid TEXT PRIMARY KEY, xp INTEGER);");
db.run("CREATE TABLE birthdays (userid TEXT PRIMARY KEY, date TEXT, datenum INTEGER);");
db.run("CREATE INDEX idx_xp_desc ON levels (xp DESC);");
db.run("CREATE INDEX idx_datenum_desc ON birthdays (datenum ASC);");
db.close();
