import { db } from "../index.js";
import { GetLevelConfig, LevelToXP, XPToLevel } from "../levelmanager.js";
import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionsBitField } from "discord.js";
import { AddRankFieldEmbeds } from "./rank.js";

export default {
    data: new SlashCommandBuilder()
        .setName("xp")
        .setDescription("[Admin] Manage the xp of a user.")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("set")
                .setDescription("Set the xp of a user.")
                .addUserOption((option) => option.setName("member").setDescription("The member to set the xp of.").setRequired(true))
                .addStringOption((option) => option.setName("value").setDescription("The value to set the xp to.").setRequired(true))
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("add")
                .setDescription("Add xp to a user.")
                .addUserOption((option) => option.setName("member").setDescription("The member to add the xp to.").setRequired(true))
                .addStringOption((option) => option.setName("value").setDescription("The value to add to the xp.").setRequired(true))
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("remove")
                .setDescription("Remove xp from a user.")
                .addUserOption((option) => option.setName("member").setDescription("The member to remove the xp from.").setRequired(true))
                .addStringOption((option) => option.setName("value").setDescription("The value to remove from the xp.").setRequired(true))
        )
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ ephemeral: true });

        const target = interaction.options.getUser("member", true);
        const value = interaction.options.getString("value", true);

        // if value ends with L, set levelmode to true, otherwise set it to false
        const levelMode = value.endsWith("L");

        // if the subcommand is set, set setmode to true
        const setmode = interaction.options.getSubcommand() === "set";

        // this is some very crazy shit, so let me explain it:
        // numbervalue is made up with this "formula": (base) * (exponent)
        // base is basically what the user puts into "value" (without the L ending)
        // exponent is based on if we're adding or removing XP (except if we're in setmode, then it's always 1)
        const numberValue = Number.parseInt(value.substring(0, value.length - (levelMode ? 1 : 0)), 10) * (setmode || interaction.options.getSubcommand() === "add" ? 1 : -1);

        // check if value is correct
        if (
            // check if we're in level mode and the value is either one single letter (just the L at the end)
            (levelMode && value.length == 1) ||
            isNaN(numberValue)
        ) {
            return void interaction.editReply("Incorrect value");
        }

        // get the level config of the member
        let levelInfo = GetLevelConfig(target.id);

        // calculate the xp we're going to get and see if it's valid
        // I really hope this is fairly clear, but basically if we're in set mode, we're taking the value as a constant
        // otherwise we add it to the current level/xp
        let newxp = 0;
        if (levelMode) {
            newxp = setmode ? LevelToXP(numberValue) + 1 : LevelToXP(XPToLevel(levelInfo.xp) + numberValue) + 1;
        } else {
            newxp = setmode ? numberValue + 1 : levelInfo.xp + numberValue;
        }

        // check if the new xp is valid
        if (newxp < 0) {
            return void interaction.editReply("Invalid xp");
        }

        db.exec(`UPDATE levels SET xp = '${newxp}' WHERE userid = '${target.id}'`);
        levelInfo = GetLevelConfig(target.id);

        // log
        console.log(
            `${interaction.user.tag} (${interaction.user.id}) has changed the level information of ${target.tag} (${target.id}). New level: ${XPToLevel(levelInfo.xp)}, xp: ${
                levelInfo.xp
            }`
        );

        // create the embed
        const embed = new EmbedBuilder()
            .setDescription(`New level information of ${target}`)
            .setColor("DarkPurple")
            .setTitle(`Successfully changed level information of ${target.tag}`);

        // add the fields about the rank
        AddRankFieldEmbeds(embed, levelInfo);

        // send the embed
        interaction.editReply({ embeds: [embed] });
    }
};
