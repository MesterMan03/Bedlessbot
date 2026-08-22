import { describe, expect, it } from "bun:test";
import { isSummaryRequest } from "../src/chatbot/intents.js";
import { prepareConversationForSummary } from "../src/chatbot/summary-format.js";

describe("summary intent", () => {
    it("recognizes channel recap requests without a model call", () => {
        expect(isSummaryRequest("what did I miss?")).toBeTrue();
        expect(isSummaryRequest("catch me up please")).toBeTrue();
        expect(isSummaryRequest("summarize the recent conversation")).toBeTrue();
    });

    it("does not intercept unrelated uses of similar language", () => {
        expect(isSummaryRequest("tell me about bridging")).toBeFalse();
        expect(isSummaryRequest("what is going on with this Minecraft mechanic?")).toBeFalse();
    });
});

describe("chatbot-only summaries", () => {
    it("formats explicit user and assistant turns and skips tool data", () => {
        const summary = prepareConversationForSummary([
            {
                type: "message",
                role: "user",
                content: JSON.stringify({ username: "tester", content: "hello", date: "2026-08-22 12:00:00" })
            },
            {
                type: "message",
                role: "assistant",
                content: JSON.stringify({ username: "Bedlessbot", content: "unfortunate.", date: "2026-08-22 12:00:01" })
            },
            { type: "function_call_output", call_id: "call-1", output: "ignore me" }
        ]);

        expect(summary).toContain("tester: hello");
        expect(summary).toContain("Bedlessbot: unfortunate.");
        expect(summary).not.toContain("ignore me");
    });
});
