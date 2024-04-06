import {
    Client,
    Collection,
    Events,
    REST,
    Routes,
    SlashCommandBuilder,
    type RESTPostAPIChatInputApplicationCommandsJSONBody,
    type GuildTextBasedChannel,
} from "discord.js";
import * as fs from "fs";
import * as path from "path";
import { processInteraction } from "./commands/apply";
import { Database } from "bun:sqlite";
import { join } from "path";
import puppeteer from "puppeteer";
import { GetXPFromMessage } from "./levelmanager";

const client = new Client({
    allowedMentions: {
        parse: ["users"],
    },
    intents: ["Guilds", "GuildMessages", "MessageContent", "GuildMessageReactions"],
});

const clientCommands = new Collection<string, { execute: Function }>();

const token = process.env.TOKEN!;
const clientID = process.env.CLIENT_ID!;
const guildID = process.env.GUILD_ID!;

const commands = new Array<RESTPostAPIChatInputApplicationCommandsJSONBody>();

// Grab all the command folders from the commands directory you created earlier
const __dirname = new URL(".", import.meta.url).pathname;
const foldersPath = path.join(__dirname, "commands");
const commandPaths = fs.readdirSync(foldersPath).filter((file) => file.endsWith(".ts"));

for (const commandPath of commandPaths) {
    const filePath = path.join(foldersPath, commandPath);
    const command = (await import(filePath)) as { default: { data: SlashCommandBuilder; execute: Function } };

    if ("data" in command.default && "execute" in command.default) {
        clientCommands.set(command.default.data.name, command.default);
        commands.push(command.default.data.toJSON());
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(token);

// and deploy your commands!
(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        // The put method is used to fully refresh all commands in the guild with the current set
        const data = await rest.put(Routes.applicationGuildCommands(clientID, guildID), { body: commands });

        //@ts-ignore
        console.log(`Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        // And of course, make sure you catch and log any errors!
        console.error(error);
    }
})();

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.inCachedGuild()) return;
    if (interaction.guildId !== guildID) return;

    if (interaction.isChatInputCommand()) {
        const command = clientCommands.get(interaction.commandName);

        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: "There was an error while executing this command!", ephemeral: true });
            } else {
                await interaction.reply({ content: "There was an error while executing this command!", ephemeral: true });
            }
        }
    }

    if (interaction.isButton() && ["accept", "deny", "hacker", "troll"].includes(interaction.customId)) {
        await processInteraction(interaction);
    }
});

client.on(Events.MessageCreate, (message) => {
    if (!message.inGuild() || message.guildId !== guildID) return;

    // this is sorta just a joke thing
    // if bedless sends a youtube notification, react with Hungarian flag
    if (message.channelId === "692075656921481310") {
        return void message.react("🇭🇺");
    }

    // give xp
    GetXPFromMessage(message);
});

client.on(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user?.tag}!`);
});

client.login(token);

process.on("uncaughtException", (err) => {
    console.error(err);
});
process.on("unhandledRejection", (err) => {
    console.error(err);
});

function shutdown(reason?: string) {
    if (reason) {
        console.error(`Shutting down client: ${reason}`);
    }
    browser?.close();
    client.destroy();
    db.close();
    process.exit(0);
}

// set up automatic shutdown when process is terminated
process.on("exit", () => {
    shutdown();
});
process.on("SIGINT", () => {
    shutdown("SIGINT");
});
process.on("SIGTERM", () => {
    shutdown("SIGTERM");
});

const browser = await puppeteer
    .launch({
        headless: true,
        args: [
            "--autoplay-policy=user-gesture-required",
            "--disable-background-networking",
            "--disable-background-timer-throttling",
            "--disable-backgrounding-occluded-windows",
            "--disable-breakpad",
            "--disable-client-side-phishing-detection",
            "--disable-component-update",
            "--disable-default-apps",
            "--disable-dev-shm-usage",
            "--disable-domain-reliability",
            "--disable-extensions",
            "--disable-features=AudioServiceOutOfProcess",
            "--disable-hang-monitor",
            "--disable-ipc-flooding-protection",
            "--disable-notifications",
            "--disable-offer-store-unmasked-wallet-cards",
            "--disable-popup-blocking",
            "--disable-print-preview",
            "--disable-prompt-on-repost",
            "--disable-renderer-backgrounding",
            "--disable-setuid-sandbox",
            "--disable-speech-api",
            "--disable-sync",
            "--hide-scrollbars",
            "--ignore-gpu-blacklist",
            "--metrics-recording-only",
            "--mute-audio",
            "--no-default-browser-check",
            "--no-first-run",
            "--no-pings",
            "--password-store=basic",
            "--use-gl=swiftshader",
            "--use-mock-keychain",
        ],
    })
    .catch((error) => {
        console.warn("Could not launch puppeteer, some functionalities might not work");
        console.warn(error);
        return null;
    });

function GetResFolder() {
    return join(__dirname, "res");
}

function GetGuild() {
    return client.guilds.cache.get(guildID)!;
}

const db = new Database("data.db");
db.exec("PRAGMA journal_mode = wal;");

export { GetResFolder, db, browser, GetGuild };

export default client;
