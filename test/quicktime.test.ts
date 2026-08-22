import { describe, expect, it } from "bun:test";
import type { Message } from "discord.js";
import { isCorrectDirectReply } from "../src/quicktime.js";

function reply(content: string, messageId?: string) {
    return { content, reference: messageId ? { messageId } : null } as Pick<Message, "content" | "reference">;
}

describe("quick-time text answers", () => {
    it("accepts the correct answer only when it directly replies to the game message", () => {
        expect(isCorrectDirectReply(reply("answer", "game"), "game", "answer")).toBeTrue();
        expect(isCorrectDirectReply(reply("answer", "different"), "game", "answer")).toBeFalse();
        expect(isCorrectDirectReply(reply("answer"), "game", "answer")).toBeFalse();
        expect(isCorrectDirectReply(reply("wrong", "game"), "game", "answer")).toBeFalse();
    });
});
