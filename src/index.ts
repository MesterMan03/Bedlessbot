import { fileURLToPath } from "bun";
import { Database } from "bun:sqlite";
import {
    ActivityType,
    Client,
    Collection,
    Events,
    Message,
    REST,
    Routes,
    type RESTPostAPIChatInputApplicationCommandsJSONBody
} from "discord.js";
import * as fs from "fs";
import * as path from "path";
import { join } from "path";
import puppeteer from "puppeteer";
import { WishBirthdays, cronjob } from "./birthdaymanager";
import config from "./config";
import {
    EndVoiceChat,
    GetLevelConfig,
    GetXPFromMessage,
    ManageLevelRole,
    SetXPMultiplier,
    StartVoiceChat,
    XPToLevel
} from "./levelmanager";
import { StartQuickTime } from "./quicktime";
import "./dashboard/index"; // load the dashboard
import { SendRequest } from "./apimanager";

console.log(`Starting... ${process.env.NODE_ENV} bot`);

const token = process.env.TOKEN!;
const clientID = process.env.CLIENT_ID!;
const guildID = process.env.GUILD_ID!;

type ClientCommand = {
    execute: Function;
    data: RESTPostAPIChatInputApplicationCommandsJSONBody;
    interactions?: string[];
    processInteraction?: Function;
};
const clientCommands = new Collection<string, ClientCommand>();

// Grab all the command folders from the commands directory you created earlier
const __dirname = fileURLToPath(new URL(".", import.meta.url).toString());
const foldersPath = path.join(__dirname, "commands");
const commandPaths = fs.readdirSync(foldersPath).filter((file) => file.endsWith(".ts"));

const db = new Database(join(__dirname, "..", "data.db"));
db.run("PRAGMA journal_mode = wal;");

const client = new Client({
    allowedMentions: {
        parse: ["users"]
    },
    intents: ["Guilds", "GuildMessages", "MessageContent", "GuildMessageReactions", "GuildVoiceStates", "GuildMembers"]
});

const browser = await puppeteer
    .launch({
        headless: true,
        userDataDir: join(__dirname, "..", "chrome-data"),
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
    })
    .then((browser) => {
        console.log("Puppeteer launched successfully");
        return browser;
    })
    .catch((error) => {
        console.warn("Could not launch puppeteer, some functionalities might not work");
        console.warn(error);
    });

for (const commandPath of commandPaths) {
    const filePath = path.join(foldersPath, commandPath);
    const command = (await import(filePath)) as { default: ClientCommand };

    if ("data" in command.default && "execute" in command.default) {
        clientCommands.set(command.default.data.name, command.default);
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(token);

// reload slash commands
try {
    const commands = clientCommands.map((command) => command.data);
    console.log(`Started refreshing ${commands.length} application (/) commands.`);

    // The put method is used to fully refresh all commands in the guild with the current set
    await rest.put(Routes.applicationGuildCommands(clientID, guildID), { body: commands });

    console.log(`Successfully reloaded ${commands.length} application (/) commands.`);
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

            return await command.execute(interaction);
        }

        if (interaction.isMessageComponent()) {
            const command = clientCommands.find((cmd) => cmd.interactions?.includes(interaction.customId));

            if (!command?.processInteraction) {
                await interaction.reply({ content: `No command matching ${interaction.customId} was found.`, ephemeral: true });
                return;
            }

            return await command.processInteraction(interaction);
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

    if (message.channelId === process.env.APPLICATIONS_CHANNEL!) {
        return void message.delete();
    }

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

    // 0.5% chance to start a quick time event (in development mode 100%)
    // make sure the channel is allowed to have quick time events
    if (
        (config.QuickTimeChannels.includes(message.channelId) &&
            Math.random() < 0.005) ||
        process.env.NODE_ENV === "development"
    ) {
        StartQuickTime(message.channel);
    }

    // use transformation model to find potential answers to a question
    SendRequest({ text: message.content }).then((response) => {
        if (response.status !== 200) return;

        const answer = response.data.answer as string;

        message.reply(answer).catch(() => {
            // the message was probably deleted
            return;
        });
    });

    // check for blocked channels and no-xp role
    if (config.NoXPChannels.includes(message.channelId) || message.member?.roles.cache.has(config.NoXPRole)) return;

    GetXPFromMessage(message);
});

client.on(Events.GuildMemberAdd, (member) => {
    if (member.guild.id !== guildID) return;

    // check for level roles
    const level = XPToLevel(GetLevelConfig(member.id).xp);
    ManageLevelRole(member, level);

    // give back roles if they had them
    const rolesToGive = db.query<{ userid: string; roleid: string }, []>(`SELECT * FROM roles_given WHERE userid = ${member.id}`).all();
    if (rolesToGive.length !== 0) {
        for (const roleToGive of rolesToGive) {
            member.roles.add(roleToGive.roleid, "joined back");
        }
    }
});

client.on(Events.ClientReady, async () => {
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

function ExecuteAdminCommand(message: Message) {
    const command = message.content.split(" ")[1];
    const args = message.content.split(" ").slice(2);

    if (command === "set-xpmul") {
        SetXPMultiplier(parseInt(args[0], 10));
        message.reply(`Set XP multiplier to ${args[0]}`);

        return true;
    }

    if (command === "wish-birthdays") {
        WishBirthdays();
        message.reply("Wished birthdays");

        return true;
    }

    return false;
}

function GetResFolder() {
    return join(__dirname, "..", "res");
}

function GetGuild() {
    return client.guilds.cache.get(guildID)!;
}

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

// start the bot
client.login(token);

export { GetGuild, GetResFolder, browser, db };

export default client;
