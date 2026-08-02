import { Database, SQLiteError } from "bun:sqlite";
import { join } from "path";
import { fileURLToPath } from "bun";
import { Client, type Guild } from "discord.js";
import { Snowflake } from "nodejs-snowflake";
import type { Browser } from "puppeteer";
import SetupDB from "../tools/setup_db";
import { configureConversationPersistence } from "./chatbot/conversation.js";

const dirname = fileURLToPath(new URL(".", import.meta.url).toString());
const guildID = process.env["GUILD_ID"] as string;
const snowflake = new Snowflake({ custom_epoch: 1704063600, instance_id: 69 });

export const db = new Database(join(dirname, "..", "data.db"));
try {
    SetupDB(db);
} catch (error) {
    if (!(error instanceof SQLiteError)) {
        throw error;
    }
}
configureConversationPersistence(db);

const client = new Client({
    allowedMentions: {
        parse: ["users"]
    },
    intents: ["Guilds", "GuildMessages", "MessageContent", "GuildMessageReactions", "GuildVoiceStates", "GuildMembers"]
});

export let browser: Browser | undefined;

export function setBrowser(value: Browser | undefined) {
    browser = value;
}

export function GetResFolder() {
    return join(dirname, "..", "res");
}

export function GetGuild() {
    return client.guilds.cache.get(guildID) as Guild;
}

export function GenerateSnowflake() {
    return snowflake.getUniqueID().toString();
}

export default client;
