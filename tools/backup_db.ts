import { Database } from "bun:sqlite";

export async function createSanitizedDatabaseBackup(sourcePath: string, destinationPath: string) {
    const source = new Database(sourcePath, { readonly: true });
    const backup = Database.deserialize(source.serialize());
    source.close();

    try {
        const hasConversationTable = backup
            .query<{ count: number }, []>(
                "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'chatbot_conversations'"
            )
            .get()?.count;
        if (hasConversationTable) {
            backup.run("DELETE FROM chatbot_conversations");
        }
        backup.run("VACUUM");
        await Bun.write(destinationPath, backup.serialize());
    } finally {
        backup.close();
    }
}

if (import.meta.main) {
    const [sourcePath, destinationPath] = Bun.argv.slice(2);
    if (!sourcePath || !destinationPath) {
        throw new Error("Usage: bun run tools/backup_db.ts <source database> <destination database>");
    }
    await createSanitizedDatabaseBackup(sourcePath, destinationPath);
}
