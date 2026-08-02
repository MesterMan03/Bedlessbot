import { describe, expect, it } from "bun:test";
import { getChatBotSysMessage } from "../src/chatbot/constants.js";
import { isSummaryRequest } from "../src/chatbot/intents.js";

const summaryCases = [
    ["what did I miss?", true],
    ["catch us up", true],
    ["please summarize the recent messages", true],
    ["summarize this YouTube video", false],
    ["what is going on with bridging in 1.21?", false],
    ["who is first on the leaderboard?", false]
] as const;

describe("offline chatbot evals", () => {
    for (const [input, expected] of summaryCases) {
        it(`routes "${input}" correctly`, () => {
            expect(isSummaryRequest(input)).toBe(expected);
        });
    }

    it("keeps the prompt-injection and tool-routing boundaries explicit", () => {
        const prompt = getChatBotSysMessage({ username: "Bedlessbot", id: "123" });
        expect(prompt).toContain("untrusted data");
        expect(prompt).toContain("MUST use web search FIRST");
        expect(prompt).toContain("Use Discord tools ONLY");
    });
});
