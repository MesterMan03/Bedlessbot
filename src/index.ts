import { Database } from "bun:sqlite";
import {
    ActivityType,
    Client,
    Collection,
    Events,
    Message,
    REST,
    Routes,
    SlashCommandBuilder,
    type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";
import * as fs from "fs";
import * as path from "path";
import { join } from "path";
import puppeteer from "puppeteer";
import { WishBirthdays, cronjob } from "./birthdaymanager";
import { processInteraction } from "./commands/apply";
import config from "./config";
import { EndVoiceChat, GetXPFromMessage, SetXPMultiplier, StartVoiceChat } from "./levelmanager";
import { fileURLToPath } from "bun";

const clientCommands = new Collection<string, { execute: Function }>();

const token = process.env.TOKEN!;
const clientID = process.env.CLIENT_ID!;
const guildID = process.env.GUILD_ID!;

const commands = new Array<RESTPostAPIChatInputApplicationCommandsJSONBody>();

// Grab all the command folders from the commands directory you created earlier
const __dirname = fileURLToPath(new URL(".", import.meta.url).toString());
const foldersPath = path.join(__dirname, "commands");
const commandPaths = fs.readdirSync(foldersPath).filter((file) => file.endsWith(".ts"));

const db = new Database(join(__dirname, "..", "data.db"));
db.run("PRAGMA journal_mode = wal;");

const browser = await puppeteer
    .launch({
        headless: true,
        userDataDir: join(__dirname, "..", "chrome-data"),
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
    })
    .then((browser) => {
        console.log("Puppeteer launched successfully");
        return browser;
    })
    .catch((error) => {
        console.warn("Could not launch puppeteer, some functionalities might not work");
        console.warn(error);
    });

const client = new Client({
    allowedMentions: {
        parse: ["users"],
    },
    intents: ["Guilds", "GuildMessages", "MessageContent", "GuildMessageReactions", "GuildVoiceStates", "GuildMembers"],
});

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

// reload slash commands
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

// set up client events and log in
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.inCachedGuild()) return;
    if (interaction.guildId !== guildID) return;

    try {
        if (interaction.isChatInputCommand()) {
            const command = clientCommands.get(interaction.commandName);

            if (!command) {
                await interaction.reply({ content: `No command matching ${interaction.commandName} was found.`, ephemeral: true });
                return;
            }

            await command.execute(interaction);
        }

        if (interaction.isButton() && ["accept", "deny", "infraction"].includes(interaction.customId)) {
            await processInteraction(interaction);
        }

        if (interaction.isAutocomplete() && interaction.commandName === "apply") {
            interaction.respond([{ name: "File proof (select this if you're uploading a file from your device)", value: "fileproof" }]);
        }
    } catch (error) {
        console.error(error);
        if (!interaction.isRepliable()) return;

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: "There was an error while executing this command!", ephemeral: true });
        } else {
            await interaction.reply({ content: "There was an error while executing this command!", ephemeral: true });
        }
    }
});

client.on(Events.MessageCreate, async (message) => {
    if (!message.inGuild() || message.guildId !== guildID) return;

    // this is sorta just a joke thing
    // if bedless sends a youtube notification, react with Hungarian flag
    if (message.channelId === "692075656921481310") {
        message.react("🇭🇺");
        return;
    }

    if (message.author.bot) return;

    // check if message starts with the bots mention and member has admin
    if (message.content.startsWith(`<@${clientID}>`)) {
        if (message.member?.permissions.has("Administrator")) {
            // only stop if the command ran successfully
            if (ExecuteAdminCommand(message)) return;
        }

        return;
    }

    if (message.content.toLowerCase().includes("oh my god")) {
        // 50% chance
        if (Math.random() < 0.5) await message.reply("oh my god");
    }

    // check for blocked channels and no-xp role
    if (config.NoXPChannels.includes(message.channelId) || message.member?.roles.cache.has(config.NoXPRole)) return;

    GetXPFromMessage(message);
});

function ExecuteAdminCommand(message: Message) {
    const command = message.content.split(" ")[1];
    const args = message.content.split(" ").slice(2);

    if (command === "set-xpmul") {
        SetXPMultiplier(parseInt(args[0], 10));
        message.reply(`Set XP multiplier to ${args[0]}`);

        return true;
    }

    if(command === "wish-birthdays") {
        WishBirthdays();
        message.reply("Wished birthdays");

        return true;
    }

    return false;
}

client.on(Events.ClientReady, async () => {
    // join general vc (uncomment when bun implements node:dgram)
    // const generalVC = await client.channels.fetch(process.env.GENERALVC_CHANNEL!);
    // if (generalVC?.isVoiceBased()) {
    //     const connection = joinVoiceChannel({
    //         channelId: generalVC.id,
    //         guildId: generalVC.guildId,
    //         adapterCreator: generalVC.guild.voiceAdapterCreator,
    //         selfMute: true,
    //     });

    //     connection.receiver.speaking.on("start", (userId) => {
    //         console.log(`User ${userId} started speaking`);
    //         const start = performance.now();

    //         function endCallback(userId: string) {
    //             const end = performance.now();
    //             const time = end - start;

    //             console.log(`User ${userId} stopped speaking after ${time}ms`);
    //             connection.receiver.speaking.removeListener("end", endCallback);
    //         }

    //         connection.receiver.speaking.addListener("end", endCallback);
    //     });
    // }

    await GetGuild()
        .members.fetch()
        .then(() => {
            console.log("Finished fetching members");
        });

    client.user?.setActivity({ name: "Mester", type: ActivityType.Listening });

    console.log(`Logged in as ${client.user?.tag}!`);
});

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    if (oldState.guild.id !== guildID) return;

    // if previously there was no channel, but now there is, we joined
    // it also counts as joining if we go from muted or deafened to not muted or deafened or if we moved from afk channel
    if (
        ((!oldState.channel || oldState.channelId === GetGuild().afkChannelId) &&
            newState.channel &&
            newState.channelId !== GetGuild().afkChannelId) ||
        (!(newState.mute || newState.deaf) && (oldState.mute || oldState.deaf))
    ) {
        StartVoiceChat(newState);
    }

    // if previously there was a channel, but now there isn't, we left
    // we also leave when we go muted or deafened or we moved to afk channel
    if ((oldState.channel && (!newState.channel || newState.channelId === GetGuild().afkChannelId)) || newState.mute || newState.deaf) {
        if (newState.member?.roles.cache.has(config.NoXPRole)) return;
        EndVoiceChat(newState);
    }
});

client.login(token);

function shutdown(reason?: string) {
    if (reason) {
        console.error(`Shutting down client: ${reason}`);
    }
    browser?.close();
    client.destroy();
    db.close();
    cronjob.stop();
    process.exit(0);
}

process.on("uncaughtException", (err) => {
    console.error(err);
});
process.on("unhandledRejection", (err) => {
    console.error(err);
});

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

function GetResFolder() {
    return join(__dirname, "..", "res");
}

function GetGuild() {
    return client.guilds.cache.get(guildID)!;
}

export { GetGuild, GetResFolder, browser, db };

export default client;
