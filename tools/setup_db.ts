import { Database } from "bun:sqlite";

const db = new Database("data.db");
db.exec("PRAGMA journal_mode = delete;");
db.exec("CREATE TABLE cheatpoints (userid TEXT PRIMARY KEY, cheatpoint INTEGER)");
db.exec("CREATE TABLE proofs (proof TEXT PRIMARY KEY, userid TEXT)");
db.exec("CREATE TABLE levels (userid TEXT PRIMARY KEY, xp INTEGER)");
db.exec("CREATE INDEX idx_xp_desc ON levels (xp DESC);")
db.close();