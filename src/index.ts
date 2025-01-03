import { fileURLToPath } from "bun";
import { Database } from "bun:sqlite";
import {
    ActivityType,
    ChatInputCommandInteraction,
    Client,
    Collection,
    Events,
    Guild,
    Message,
    MessageComponentInteraction,
    MessageFlags,
    REST,
    Routes,
    ThreadAutoArchiveDuration,
    type Interaction,
    type RESTPostAPIChatInputApplicationCommandsJSONBody
} from "discord.js";
import * as fs from "fs";
import { Snowflake } from "nodejs-snowflake";
import * as path from "path";
import { join } from "path";
import puppeteer from "puppeteer";
import { SendRequest } from "./apimanager";
import { WishBirthdays, cronjob } from "./birthdaymanager";
import { AddChatBotMessage, ClearConversation, ShowChatBotWarning, isReplyingToUs } from "./chatbot";
import config from "./config";
import {
    AwardXPToMessage,
    EndVoiceChat,
    GetLevelConfig,
    GetXPMultiplier,
    ManageLevelRole,
    SetXPMultiplier,
    StartVoiceChat,
    XPToLevel
} from "./levelmanager";
import { StartQuickTime } from "./quicktime";

console.log(`Starting ${process.env.NODE_ENV} bot...`);

const snowflake = new Snowflake({ custom_epoch: 1704063600, instance_id: 69 });

const token = process.env["TOKEN"] as string;
const clientID = process.env["CLIENT_ID"] as string;
const guildID = process.env["GUILD_ID"] as string;

type ClientCommand = {
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
    name?: string;
    data: RESTPostAPIChatInputApplicationCommandsJSONBody | null;
    interactions?: string[];
    processInteraction?: (interaction: MessageComponentInteraction) => Promise<void>;
};
const clientCommands = new Collection<string, ClientCommand>();

// Grab all the command folders from the commands directory you created earlier
const dirname = fileURLToPath(new URL(".", import.meta.url).toString());
const foldersPath = path.join(dirname, "commands");
const commandPaths = fs.readdirSync(foldersPath).filter((file) => file.endsWith(".ts"));

const db = new Database(join(dirname, "..", "data.db"));
db.run("PRAGMA journal_mode = wal;");

const client = new Client({
    allowedMentions: {
        parse: ["users"]
    },
    intents: ["Guilds", "GuildMessages", "MessageContent", "GuildMessageReactions", "GuildVoiceStates", "GuildMembers"]
});

const executablePath = process.env["PUPPETEER_EXEC"] ?? undefined;
console.log(`Launching puppeteer with executable path: ${executablePath}`);
const browser = await puppeteer
    .launch({
        headless: true,
        userDataDir: join(dirname, "..", "chrome-data"),
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
        executablePath
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

    if (command.default.data && !command.default.name) {
        clientCommands.set(command.default.data.name, command.default);
    } else if (command.default.name) {
        clientCommands.set(command.default.name, command.default);
    } else {
        console.log(`[WARNING] Ignored command at ${filePath} for missing a "data" field and not having a name.`);
    }
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(token);

// reload slash commands
try {
    const commands = clientCommands.filter((command) => command.data).map((command) => command.data);
    console.log(`Started refreshing ${commands.length} application (/) commands.`);

    // The put method is used to fully refresh all commands in the guild with the current set
    await rest.put(Routes.applicationGuildCommands(clientID, guildID), { body: commands });

    console.log(`Successfully reloaded ${commands.length} application (/) commands.`);
} catch (error) {
    // And of course, make sure you catch and log any errors!
    console.error(error);
}

async function processInteraction(interaction: Interaction) {
    if (interaction.isChatInputCommand()) {
        const command = clientCommands.get(interaction.commandName);

        if (!command) {
            await interaction.reply({
                content: `No command matching ${interaction.commandName} was found.`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        return await command.execute(interaction);
    }

    if (interaction.isMessageComponent()) {
        if (interaction.customId.startsWith("chatbot.")) {
            return;
        }
        if (interaction.customId.startsWith("quicktime.")) {
            if (interaction.customId.startsWith("quicktime.rbutton.incorrect")) {
                interaction.reply({ content: "Incorrect button!", flags: MessageFlags.Ephemeral });
            }
            return;
        }
        const command = clientCommands.find((cmd) => cmd.interactions?.includes(interaction.customId));

        if (!command?.processInteraction) {
            await interaction.reply({
                content: `No command matching ${interaction.customId} was found.`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        return await command.processInteraction(interaction);
    }
}

function processSelfPing(message: Message<true>) {
    if (message.member?.permissions.has("Administrator")) {
        // only stop if the command ran successfully
        if (ExecuteAdminCommand(message)) {
            return;
        }
    }

    // start the chatbot
    const usedChatbot = message.member?.roles.cache.has(config.Roles.Chatbot);
    if (!usedChatbot) {
        ShowChatBotWarning(message).then((accepted) => {
            if (!accepted) {
                return;
            }

            message.member?.roles.add(config.Roles.Chatbot);
            AddChatBotMessage(message);
        });
    } else {
        AddChatBotMessage(message);
    }
}

function processAIRequest(message: Message<true>) {
    SendRequest({ text: message.content }).then((response) => {
        if (response.status !== 200) {
            return;
        }

        //@ts-ignore shut up
        const answer = response.data.answer as string;

        message.reply(answer).catch(() => {
            // the message was probably deleted
            return;
        });
    });
}

// set up client events
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.inCachedGuild()) {
        return;
    }
    if (interaction.guildId !== guildID) {
        return;
    }

    try {
        await processInteraction(interaction);
    } catch (error) {
        console.error(error);
        if (!interaction.isRepliable()) {
            return;
        }

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: "There was an error while executing this command!", flags: MessageFlags.Ephemeral });
        } else {
            await interaction.reply({ content: "There was an error while executing this command!", flags: MessageFlags.Ephemeral });
        }
    }
});

client.on(Events.MessageCreate, async (message) => {
    if (!message.inGuild() || message.guildId !== guildID) {
        return;
    }

    // this is sorta just a joke thing
    // if bedless sends a youtube notification, react with Hungarian flag
    if (message.channelId === "692075656921481310") {
        message.react("🇭🇺");
        return;
    }

    if (message.author.bot) {
        return;
    }

    // remove all non-interaction messages in the applications channel
    if (message.channelId === config.Channels.Applications) {
        message.delete();
        return;
    }

    // if message is in the clutches channel, automatically start a thread
    if (message.channelId === config.Channels.Clutches) {
        message
            .startThread({
                name: `Clutch suggestion by ${message.author.username}`,
                autoArchiveDuration: ThreadAutoArchiveDuration.ThreeDays,
                rateLimitPerUser: 5,
                reason: "Clutch suggestion"
            })
            .then((thread) => {
                thread.send(
                    `You can use this thread to discuss the clutch submission of **${message.author.username}**. Remember to keep it civil and respectful.`
                );
            });
        await message.react("<:BigBrain:884161577681580082>").catch(() => {});
        await message.react("<:Yikes:884161548287877230>").catch(() => {});
        return;
    }

    // check if message starts with the bots mention and member has admin
    if (message.content.startsWith(`<@${clientID}>`) || (await isReplyingToUs(message))) {
        processSelfPing(message);
        return;
    }

    if (message.content.toLowerCase().includes("oh my god")) {
        // 50% chance
        if (Math.random() < 0.5) {
            await message.reply("oh my god");
        }
    }

    // 0.5% chance to start a quick time event (in development mode 100%)
    // make sure the channel is allowed to have quick time events
    if (config.QuickTimeChannels.includes(message.channelId) && Math.random() < 0.005 /*|| process.env.NODE_ENV === "development"*/) {
        StartQuickTime(message.channel);
    }

    // use transformation model to find potential answers to a question
    processAIRequest(message);

    // check for blocked channels and no-xp role
    if (config.NoXPChannels.includes(message.channelId) || message.member?.roles.cache.has(config.NoXPRole)) {
        return;
    }

    AwardXPToMessage(message);
});

client.on(Events.GuildMemberAdd, (member) => {
    if (member.guild.id !== guildID) {
        return;
    }

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

    // start dashboard
    await import("./dashboard/index");

    console.log(`Logged in as ${client.user?.tag}!`);
});

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    if (oldState.guild.id !== guildID) {
        return;
    }

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
        if (newState.member?.roles.cache.has(config.NoXPRole)) {
            return;
        }
        EndVoiceChat(newState);
    }
});

client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
    // check if the new member has the BridgerLand role and the old member doesn't
    if (newMember.roles.cache.has(config.Roles.BridgerLand) && !oldMember.roles.cache.has(config.Roles.BridgerLand)) {
        // alert the member that they should join BridgerLand instead
        newMember
            .send(
                `If you're here for anything related to BridgerLand, please join the [BridgerLand Discord server](https://discord.gg/bridge) instead.`
            )
            .catch(() => {
                // if we cannot send a DM, use a public channel
                const channel = client.channels.cache.get(config.Channels.Birthday);
                if (!channel?.isTextBased() || channel.isDMBased()) {
                    return;
                }
                channel.send(
                    `<@${newMember.id}> If you're here for anything related to BridgerLand, please join the [BridgerLand Discord server](https://discord.gg/bridge) instead.`
                );
            })
            .finally(() => {
                // after 5 minutes, check if the user still has the role and remove it
                setTimeout(
                    () => {
                        if (newMember.roles.cache.has(config.Roles.BridgerLand)) {
                            newMember.roles.remove(config.Roles.BridgerLand);
                        }
                    },
                    5 * 60 * 1000
                );
            });
    }
});

function ExecuteAdminCommand(message: Message<true>) {
    const command = message.content.split(" ")[1];
    const args = message.content.split(" ").slice(2);

    if (command === "set-xpmul") {
        if (args.length === 0) {
            // return the current xp multiplier
            message.reply(`Current XP multiplier: ${GetXPMultiplier()}`);
            return true;
        }

        const mult = parseInt(args[0], 10);
        if (Number.isNaN(mult)) {
            message.reply("Invalid XP multiplier");
            return true;
        }
        SetXPMultiplier(mult);
        message.reply(`Set XP multiplier to ${mult}`);

        return true;
    }

    if (command === "wish-birthdays") {
        WishBirthdays();
        message.reply("Wished birthdays");

        return true;
    }

    if (command === "hi") {
        message.reply({
            content: `Hi! Latency: ${Math.abs(Date.now() - message.createdTimestamp)}ms. API Latency: ${Math.round(client.ws.ping)}ms`,
            allowedMentions: { users: [] }
        });
        return true;
    }

    if (command === "quick-time") {
        StartQuickTime(message.channel, args[0]);
        return true;
    }

    if (command === "clear-chat") {
        message.reply("Successfully cleared the chatbot history.");
        ClearConversation();
        return true;
    }

    return false;
}

function GetResFolder() {
    return join(dirname, "..", "res");
}

function GetGuild() {
    return client.guilds.cache.get(guildID) as Guild;
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

function GenerateSnowflake() {
    // use 2024-01-01 as the epoch
    return snowflake.getUniqueID().toString();
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

export { GenerateSnowflake, GetGuild, GetResFolder, browser, db, type ClientCommand };

export default client;
