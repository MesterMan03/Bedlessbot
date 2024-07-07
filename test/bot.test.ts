import { describe, it, expect } from "bun:test";
import client from "../src";

if (process.env.DEV_DASH !== "yes") {
    describe("general", () => {
        it("boots", () => {
            expect(client).toBeDefined();
            expect(true).toBe(true);
        });
    });
}
