import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
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
        await interaction.deferReply({ ephemeral: true });

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

        // show embed
        interaction.editReply({
            embeds: [embed],
        });
    },
};

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
                inline: false,
            },
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
