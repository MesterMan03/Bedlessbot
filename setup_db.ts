import { Database } from "bun:sqlite";

const db = new Database("data.db");
db.exec("CREATE TABLE cheatpoints (userid TEXT PRIMARY KEY, cheatpoint INTEGER)");
db.exec("CREATE TABLE proofs (proof TEXT PRIMARY KEY, userid TEXT)");