import { describe, expect, it } from "bun:test";
import { isSummaryRequest } from "../src/chatbot/intents.js";

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
