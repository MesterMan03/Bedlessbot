import { ChatInputCommandInteraction, EmbedBuilder, PermissionsBitField, SlashCommandBuilder } from "discord.js";
import moment from "moment-timezone";
import { DateToNumber } from "../birthdaymanager";
import { db } from "..";

export default {
    data: new SlashCommandBuilder()
        .setName("set-user-birthday")
        .setDescription("Set a user's birthday")
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers)
        .addUserOption((option) => option.setName("member").setDescription("The member to set the birthday of.").setRequired(true))
        .addStringOption((option) =>
            option.setName("date").setDescription("The date of the birthday in the format DD/MM/YYYY or DD/MM.").setRequired(true)
        ),
    async execute(interaction: ChatInputCommandInteraction) {
        const user = interaction.options.getUser("member", true);
        const dateRaw = interaction.options.getString("date", true);

        // check if the date is in the correct format
        if (!/^\d{2}\/\d{2}(\/\d{4})?$/.test(dateRaw)) {
            const embed = new EmbedBuilder()
                .setColor("Grey")
                .setDescription("Please provide a valid date in the format DD/MM/YYYY or DD/MM.");
            return void interaction.reply({ embeds: [embed] });
        }

        const date = moment(dateRaw, dateRaw.length === 10 ? "DD/MM/YYYY" : "DD/MM");
        if (!date.isValid()) {
            return void interaction.reply("Please provide a valid date in the format DD/MM/YYYY or DD/MM.");
        }
        const thisYear = moment().year();

        // check if year is at least 1800
        if (date.year() < 1800 || date.year() > thisYear) {
            return void interaction.reply("Please provide a valid year.");
        }

        // if year is not provided, set it to 0
        if (date.year() === thisYear) date.set("year", 0);

        const dateStr = date.year() === 0 ? date.format("DD MMMM") : date.format("DD MMMM YYYY");
        const dateNum = DateToNumber(date.format("DD/MM"));

        // insert or update the birthday
        db.query("INSERT OR REPLACE INTO birthdays (userid, date, datenum) VALUES ($userid, $date, $datenum)").run({
            $userid: user.id,
            $date: date.format("DD/MM/YYYY"),
            $datenum: dateNum,
        });

        const embed = new EmbedBuilder().setColor("Grey").setDescription(`Set <@${user.id}>'s birthday to **${dateStr}**.`);
        return void interaction.reply({ embeds: [embed] });
    },
};
