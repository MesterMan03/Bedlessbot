import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import {
    CONVERSATION_RETENTION_MS,
    type ConversationKey,
    clearConversation,
    commitConversationTurn,
    configureConversationPersistence,
    createConversationSnapshot,
    purgeExpiredConversationData,
    resetConversationStoreForTests,
    runInConversation
} from "../src/chatbot/conversation.js";

const channelA = "guild:channel-a" as ConversationKey;
const channelB = "guild:channel-b" as ConversationKey;

afterEach(() => {
    resetConversationStoreForTests();
});

describe("conversation store", () => {
    it("isolates channels and ignores duplicate Discord messages", () => {
        commitConversationTurn(channelA, "message-1", [{ type: "message", role: "user", content: "from A" }]);
        commitConversationTurn(channelA, "message-1", [{ type: "message", role: "user", content: "duplicate" }]);
        commitConversationTurn(channelB, "message-2", [{ type: "message", role: "user", content: "from B" }]);

        expect(JSON.stringify(createConversationSnapshot(channelA))).toContain("from A");
        expect(JSON.stringify(createConversationSnapshot(channelA))).not.toContain("duplicate");
        expect(JSON.stringify(createConversationSnapshot(channelA))).not.toContain("from B");
        expect(JSON.stringify(createConversationSnapshot(channelB))).toContain("from B");
    });

    it("persists and reloads conversation state", () => {
        const database = new Database(":memory:");
        configureConversationPersistence(database);
        commitConversationTurn(channelA, "turn-1", [
            { type: "message", role: "user", content: "persist me" },
            { type: "message", role: "assistant", content: "persisted reply" }
        ]);

        resetConversationStoreForTests();
        configureConversationPersistence(database);

        expect(JSON.stringify(createConversationSnapshot(channelA))).toContain("persist me");
        database.close();
    });

    it("discards legacy ambient messages when persisted state is loaded", () => {
        const database = new Database(":memory:");
        configureConversationPersistence(database);
        commitConversationTurn(channelA, "ambient-message", [{ type: "message", role: "user", content: "ambient content" }]);

        resetConversationStoreForTests();
        configureConversationPersistence(database);

        expect(JSON.stringify(createConversationSnapshot(channelA))).not.toContain("ambient content");
        database.close();
    });

    it("deletes chatbot message content after 30 days without touching other data", () => {
        const database = new Database(":memory:");
        database.run("CREATE TABLE levels (userid TEXT PRIMARY KEY, xp INTEGER)");
        database.run("INSERT INTO levels VALUES ('member-1', 123)");
        configureConversationPersistence(database);

        const now = Date.now();
        commitConversationTurn(
            channelA,
            "expired-turn",
            [
                { type: "message", role: "user", content: "delete me" },
                { type: "message", role: "assistant", content: "expired reply" }
            ],
            now - CONVERSATION_RETENTION_MS
        );
        commitConversationTurn(
            channelA,
            "recent-turn",
            [
                { type: "message", role: "user", content: "keep me" },
                { type: "message", role: "assistant", content: "recent reply" }
            ],
            now - CONVERSATION_RETENTION_MS + 60_000
        );

        purgeExpiredConversationData(now);

        const snapshot = JSON.stringify(createConversationSnapshot(channelA));
        expect(snapshot).not.toContain("delete me");
        expect(snapshot).toContain("keep me");
        expect(database.query<{ xp: number }, []>("SELECT xp FROM levels WHERE userid = 'member-1'").get()?.xp).toBe(123);
        database.close();
    });

    it("drops legacy summaries and migrates timestamped Discord turns", () => {
        const database = new Database(":memory:");
        configureConversationPersistence(database);
        const now = Date.now();
        const recentTimestamp = now - 1_000;
        const recentSnowflake = ((BigInt(recentTimestamp) - 1_420_070_400_000n) << 22n).toString();
        database
            .query("INSERT INTO chatbot_conversations (conversation_key, state, updated_at) VALUES (?, ?, ?)")
            .run(
                channelA,
                JSON.stringify({
                    summary: "legacy summary without safe retention metadata",
                    turns: [
                        {
                            id: recentSnowflake,
                            items: [
                                { type: "message", role: "user", content: "recent legacy turn" },
                                { type: "message", role: "assistant", content: "recent legacy reply" }
                            ]
                        },
                        {
                            id: "not-a-discord-snowflake",
                            items: [{ type: "message", role: "user", content: "undated legacy turn" }]
                        }
                    ]
                }),
                now
            );

        purgeExpiredConversationData(now);

        const snapshot = JSON.stringify(createConversationSnapshot(channelA));
        expect(snapshot).toContain("recent legacy turn");
        expect(snapshot).not.toContain("legacy summary");
        expect(snapshot).not.toContain("undated legacy turn");
        database.close();
    });

    it("clears one conversation without clearing another", () => {
        commitConversationTurn(channelA, "message-1", [{ type: "message", role: "user", content: "from A" }]);
        commitConversationTurn(channelB, "message-2", [{ type: "message", role: "user", content: "from B" }]);
        clearConversation(channelA);

        expect(createConversationSnapshot(channelA)).toEqual([]);
        expect(JSON.stringify(createConversationSnapshot(channelB))).toContain("from B");
    });

    it("compacts only complete old turns and retains recent context", () => {
        for (let index = 0; index < 25; index++) {
            commitConversationTurn(channelA, `turn-${index}`, [
                {
                    type: "message",
                    role: "user",
                    content: `turn ${index}: ${"x".repeat(5_000)}`
                }
            ]);
        }

        const snapshot = createConversationSnapshot(channelA);
        expect(snapshot[0]).toMatchObject({ type: "message", role: "developer" });
        expect(snapshot.length).toBeLessThan(26);
        expect(JSON.stringify(snapshot)).toContain("turn 24:");
    });

    it("serializes work within a channel", async () => {
        const events: string[] = [];
        const first = runInConversation(channelA, async () => {
            events.push("first:start");
            await Promise.resolve();
            events.push("first:end");
        });
        const second = runInConversation(channelA, async () => {
            events.push("second:start");
            events.push("second:end");
        });

        await Promise.all([first, second]);
        expect(events).toEqual(["first:start", "first:end", "second:start", "second:end"]);
    });
});
