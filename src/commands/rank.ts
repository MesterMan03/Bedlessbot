import { ActionRowBuilder, ButtonBuilder, EmbedBuilder } from "@discordjs/builders";
import { ButtonStyle, ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from "discord.js";
import { browser, db } from "..";
import { LevelToXP, XPToLevel, XPToLevelUp } from "../levelfunctions";
import { GetLeaderboardPos, type LevelInfo } from "../levelmanager";

const rankPath = `${process.env.NODE_ENV === "production" ? "https://bedless.mester.info" : "http://localhost:8146"}/rank.html`;

export default {
    data: new SlashCommandBuilder()
        .setName("rank")
        .setDescription("Shows the rank of a user.")
        .addUserOption((option) => option.setName("member").setDescription("The member to show the rank of.").setRequired(false))
        .addBooleanOption((option) =>
            option.setName("textmode").setDescription("Whether to show the rank in text mode.").setRequired(false)
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        if (!browser) {
            return "Puppeteer is not available, cannot render rank card.";
        }

        const user = interaction.options.getUser("member") ?? interaction.user;

        // get level info
        const levelInfo = db.query<LevelInfo, []>(`SELECT * FROM levels WHERE userid = '${user.id}'`).get();
        if (!levelInfo) {
            return void interaction.reply("User has no level data. Send a message first.");
        }

        if (interaction.options.getBoolean("textmode")) {
            // create the embed
            const embed = new EmbedBuilder()
                .setDescription(`Level rank of <@${levelInfo.userid}>`)
                .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
                .setColor([182, 38, 164]);

            // add the fields
            AddRankFieldEmbeds(embed, levelInfo);

            return void interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply();

        const userLevel = XPToLevel(levelInfo.xp);
        const relativexp = levelInfo.xp - LevelToXP(userLevel);
        const avatar = user.displayAvatarURL({ size: 256, extension: "png", forceStatic: true });
        const lbPos = GetLeaderboardPos(levelInfo.userid);

        const page = await browser.newPage();
        await page.setViewport({ width: 1200, height: 300 });
        await page.setUserAgent("internal");

        const destination = new URL(rankPath);
        destination.searchParams.append("avatar", avatar);
        destination.searchParams.append("leaderboard", lbPos.toString());
        destination.searchParams.append("username", user.username);
        destination.searchParams.append("level", userLevel.toString());
        destination.searchParams.append("total", levelInfo.xp.toString());
        destination.searchParams.append("current", relativexp.toString());
        destination.searchParams.append("max", XPToLevelUp(userLevel).toString());

        // create the screenshot
        await page.goto(destination.toString(), { waitUntil: "networkidle0" });
        const buffer = await page.screenshot({ type: "png" });
        
        // Create the "View in Browser" button
        const browserURL = new URL(rankPath);
        browserURL.searchParams.append("userid", user.id);
        const components = [
            new ActionRowBuilder<ButtonBuilder>().setComponents(
                new ButtonBuilder().setURL(browserURL.toString()).setLabel("View in Browser").setStyle(ButtonStyle.Link)
            )
        ];

        interaction
            .editReply({
                files: [
                    {
                        attachment: buffer,
                        name: "rank.png"
                    }
                ],
                components
            })
            .then(() => {
                page.close();
            });
    }
};

/**
 * A function used to add fields to an embed containing a member's level information.
 * @param embed The embed to add the fields to.
 * @param levelInfo The level data to get the information from.
 */
function AddRankFieldEmbeds(embed: EmbedBuilder, levelInfo: LevelInfo) {
    const userLevel = XPToLevel(levelInfo.xp);

    /**
     * The xp relative to the user's level.
     */
    const relativexp = levelInfo.xp - LevelToXP(userLevel);

    embed.addFields([
        {
            name: `Level (XP)`,
            value: `${userLevel} (${relativexp})`,
            inline: true
        },
        {
            name: `Total XP`,
            value: `${levelInfo.xp}`,
            inline: true
        },
        {
            name: `XP until next level (%)`,

            // this weird part calculates the percentage of the xp until the next level
            value: `${XPToLevelUp(userLevel) - relativexp} (${((100 * relativexp) / XPToLevelUp(userLevel)).toFixed(2)}%)`,

            inline: true
        }
    ]);
}

export { AddRankFieldEmbeds };
