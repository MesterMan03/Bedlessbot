import config from "../src/config";
import { dashboardApi } from "../src/dashboard";
import { describe, it, expect } from "bun:test";
import DashboardAPITest from "../src/dashboard/api-test";

const api = dashboardApi;

if (api instanceof DashboardAPITest) {
    describe("random name generation", () => {
        const name = api.GenerateRandomName();

        it(
            "generates a string between 3 and 32 characters",
            () => {
                expect(name).toBeString();
                expect(name.length).toBeGreaterThanOrEqual(3);
                expect(name.length).toBeLessThanOrEqual(32);
            },
            { repeats: 100 }
        );

        it(
            "generates a string with only lowercase letters, numbers, underscore, and period",
            () => {
                expect(name).toMatch(/^[a-z0-9_.]+$/);
            },
            { repeats: 100 }
        );
    });
}

describe("OAuth url", () => {
    const state = "test";

    const url = api.CreateOAuth2Url(state, config.DashOrigin);

    const urlObject = new URL(url);

    it("sets correct state", () => {
        expect(urlObject.searchParams.get("state")).toBe(state);
    });

    if (process.env.DEV_DASH === "yes") {
        it("sets a code", () => {
            expect(urlObject.searchParams.get("code")).toBeString();
        });
    }

    it("sets correct origin and pathname", () => {
        if (process.env.DEV_DASH === "yes") {
            expect(urlObject.origin).toBe(config.DashOrigin);
            expect(urlObject.pathname).toBe(config.OAuthRedirect);
        } else {
            expect(urlObject.origin).toBe("https://discord.com");
            expect(urlObject.pathname).toBe("/oauth2/authorize");
        }
    });

    if (process.env.DEV_DASH !== "yes") {
        it("sets correct client id", () => {
            expect(urlObject.searchParams.get("client_id")).toBe(process.env["CLIENT_ID"] as string);
        });

        it("sets correct redirect uri", () => {
            expect(urlObject.searchParams.get("redirect_uri")).toBe(config.DashOrigin + config.OAuthRedirect);
        });

        it("sets correct scopes", () => {
            const scopes = urlObject.searchParams.get("scope")?.split(" ") ?? [];
            // scopes should include identify, role_connections.write
            expect(scopes).toContain("identify");
            expect(scopes).toContain("role_connections.write");
        });
    }
});