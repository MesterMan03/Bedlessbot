import {
    Client,
    Collection,
    Events,
    REST,
    Routes,
    SlashCommandBuilder,
    type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";
import * as fs from "fs";
import * as path from "path";
import { processInteraction } from "./commands/apply";

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

client.on(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user?.tag}!`);
});

client.login(token);

process.on("uncaughtException", (err) => {
    console.error(err);
});

export default client;
