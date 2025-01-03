import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
    type Interaction,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} from "discord.js";
import client, { db } from "..";
import { LevelToXP, XPToLevel, XPToLevelUp } from "../levelmanager";

const pageSize = 10;

export default {
    data: new SlashCommandBuilder()
        .setName("leaderboard")
        .setDescription("Shows the leaderboard of the server.")
        .addIntegerOption((option) => option.setName("page").setRequired(false).setDescription("The page number.").setMinValue(1)),

    async execute(interaction: ChatInputCommandInteraction) {
        // defer the interaction, since caching might take some time
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // validate page
        const page = (interaction.options.getInteger("page") ?? 1) - 1;
        const maxPage = GetMaxPage();

        // check if page is valid
        if (page != 1 && page >= maxPage) {
            return void interaction.editReply("Invalid page.");
        }

        // get the levels
        const levels = db
            .query<{ userid: string; xp: number }, []>(`SELECT * FROM levels ORDER BY xp DESC LIMIT ${pageSize} OFFSET ${pageSize * page}`)
            .all();

        if (levels.length === 0) {
            return void interaction.editReply("No levels found.");
        }

        const embed = await ReadLevels(levels, page, maxPage);

        // create components
        const components = [
            new ActionRowBuilder<ButtonBuilder>().setComponents(
                new ButtonBuilder().setCustomId("lb-first").setLabel("First page").setEmoji("⏮").setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId("lb-back").setEmoji("◀").setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId("lb-for").setEmoji("▶").setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId("lb-last").setLabel("Last page").setEmoji("⏭").setStyle(ButtonStyle.Secondary)
            ),
            new ActionRowBuilder<ButtonBuilder>().setComponents(
                new ButtonBuilder().setCustomId("lb-back50").setLabel("50").setEmoji("⏪").setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId("lb-back15").setLabel("15").setEmoji("◀").setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId("lb-for15").setLabel("15").setEmoji("▶").setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId("lb-for50").setLabel("50").setEmoji("⏩").setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setURL("https://bedless.mester.info/leaderboard").setLabel("View in browser").setStyle(ButtonStyle.Link)
            )
        ];

        // show embed
        interaction.editReply({
            embeds: [embed],
            components
        });
    },

    interactions: ["lb-for", "lb-back", "lb-first", "lb-last", "lb-for15", "lb-back15", "lb-for50", "lb-back50"],

    processInteraction
};

async function processInteraction(interaction: Interaction) {
    if (!interaction.isMessageComponent()) {
        return;
    }

    const embed = interaction.message.embeds[0];
    if (!embed) {
        throw new Error("No embed found in the message.");
    }

    // check if the leaderboard isn't loading already
    if (embed.footer) {
        return await interaction.reply({ content: "The leaderboard is already loading.", flags: MessageFlags.Ephemeral });
    }

    await interaction.deferUpdate();

    // get current page from the embed title
    let page = parseInt((embed.title ?? "a b c 1").split(" ")[3]);
    const maxPage = GetMaxPage();

    // add loading page text
    const embedBuilder = EmbedBuilder.from(embed);
    embedBuilder.setFooter({ text: "Loading page..." });

    interaction.editReply({ embeds: [embedBuilder] });

    // change page
    if (interaction.customId === "lb-for") {
        page = Math.min(page + 1, maxPage);
    }
    if (interaction.customId === "lb-back") {
        page = Math.max(page - 1, 1);
    }
    if (interaction.customId === "lb-first") {
        page = 1;
    }
    if (interaction.customId === "lb-last") {
        page = maxPage;
    }
    if (interaction.customId === "lb-for15") {
        page = Math.min(page + 15, maxPage);
    }
    if (interaction.customId === "lb-back15") {
        page = Math.max(page - 15, 1);
    }
    if (interaction.customId === "lb-for50") {
        page = Math.min(page + 50, maxPage);
    }
    if (interaction.customId === "lb-back50") {
        page = Math.max(page - 50, 1);
    }

    // page must start from 0 indexing
    page -= 1;

    // redraw the embed
    const levels = db
        .query<{ userid: string; xp: number }, []>(`SELECT * FROM levels ORDER BY xp DESC LIMIT ${pageSize} OFFSET ${pageSize * page}`)
        .all();

    if (levels.length === 0) {
        return void interaction.followUp({ content: "No levels found.", flags: MessageFlags.Ephemeral });
    }

    const newEmbed = await ReadLevels(levels, page, maxPage);

    interaction.editReply({ embeds: [newEmbed] });
}

/**
 * A function for reading an array of levels and turning it into a nice embed.
 * @param page The page to read from.
 * @param maxPage The max page available.
 */
async function ReadLevels(levels: { userid: string; xp: number }[], page: number, maxPage: number) {
    const embed = new EmbedBuilder()
        .setDescription("**Level leaderboard of Bedless Nation**")
        .setTitle(`Level leaderboard (page ${(page + 1).toString()} / ${maxPage.toString()})`)
        .setColor([182, 38, 164]);

    // read from the page
    for (const levelInfo of levels) {
        const i = levels.indexOf(levelInfo);
        const level = XPToLevel(levelInfo.xp);
        const username = (await client.users.fetch(levelInfo.userid)).username;

        // get the relative xp from the level config
        const relativexp = levelInfo.xp - LevelToXP(level);

        // using some math to figure out the percentage of the relative xp
        let levelPercentage = Number.parseInt(((relativexp * 100) / XPToLevelUp(level)).toFixed(0));

        // now we do some serious shit to turn it into a nice string
        levelPercentage -= levelPercentage % 10;
        levelPercentage /= 10;
        levelPercentage = isNaN(levelPercentage) ? 0 : Math.min(levelPercentage, 9);

        // preview: [####x.....]
        const levelPercentageString = `[${"#".repeat(levelPercentage)}x${".".repeat(9 - levelPercentage)}]`;

        embed.addFields([
            {
                // this part figures out the position of the rank in the leaderboard
                name: `${(page * pageSize + i + 1).toString()}. ${username}`,
                value: `Level: ${level.toString()} | Total XP: ${levelInfo.xp}\nNext level: ${levelPercentageString}`,
                inline: false
            }
        ]);
    }

    // return the embed
    return embed;
}

/**
 * A function to get the max level page.
 * @returns The highest page number.
 */
function GetMaxPage() {
    const levelCount = db.query<{ row_count: number }, []>("SELECT COUNT(*) AS row_count FROM levels").get()?.row_count ?? 0;

    return Math.ceil(Math.max(levelCount, 1) / pageSize);
}

export { GetMaxPage };
