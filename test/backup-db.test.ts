import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSanitizedDatabaseBackup } from "../tools/backup_db.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
        rmSync(directory, { recursive: true, force: true });
    }
});

describe("database backup", () => {
    it("keeps application data but excludes chatbot conversations", async () => {
        const directory = mkdtempSync(join(tmpdir(), "bedlessbot-backup-test-"));
        temporaryDirectories.push(directory);
        const sourcePath = join(directory, "source.db");
        const backupPath = join(directory, "backup.db");
        const source = new Database(sourcePath);
        source.run("CREATE TABLE levels (userid TEXT PRIMARY KEY, xp INTEGER)");
        source.run("INSERT INTO levels VALUES ('member-1', 123)");
        source.run(
            "CREATE TABLE chatbot_conversations (conversation_key TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at INTEGER NOT NULL)"
        );
        source.run("INSERT INTO chatbot_conversations VALUES ('guild:channel', 'message content', 1)");
        source.close();

        await createSanitizedDatabaseBackup(sourcePath, backupPath);

        const backup = new Database(backupPath, { readonly: true });
        expect(backup.query<{ xp: number }, []>("SELECT xp FROM levels WHERE userid = 'member-1'").get()?.xp).toBe(123);
        expect(backup.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM chatbot_conversations").get()?.count).toBe(0);
        backup.close();
    });
});
