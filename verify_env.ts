import { z } from "zod";

// create the .env schema for production without dev dash
const envSchema = z.object({
    TOKEN: z.string(),
    CLIENT_ID: z.string(),
    GUILD_ID: z.string(),
    YOUTUBE_API_KEY: z.string(),
    API_ENDPOINT: z.optional(z.string()),
    CLIENT_SECRET: z.string(),
    JWT_SECRET: z.string(),
    HCAPTCHA_SECRET: z.string(),
    VAPID_PRIVATE_KEY: z.string(),
    VAPID_PUBLIC_KEY: z.string(),
    VAPID_SUBJECT: z.string(),
    PORT: z.optional(z.string().regex(/^\d+$/)),
});

// create the .env schema for development with dev dash
// JWT_SECRET and VAPID needed
const devEnvSchema = z.object({
    JWT_SECRET: z.string(),
    VAPID_PRIVATE_KEY: z.string(),
    VAPID_PUBLIC_KEY: z.string(),
    VAPID_SUBJECT: z.string(),
    PORT: z.optional(z.string().regex(/^\d+$/)),
});

// verify the environment
if (process.env.DEV_DASH === "yes") {
    devEnvSchema.parse(process.env);
} else {
    envSchema.parse(process.env);
}
