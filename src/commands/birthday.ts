import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { db } from "..";
import { DateToNumber, timezone, type Birthday } from "../birthdaymanager";
import moment from "moment-timezone";
import ordinal from "ordinal";

const cooldowns = new Map<string, number>();

export default {
    data: new SlashCommandBuilder()
        .setName("birthday")
        .setDescription("View your or someone else's birthday.")
        .addUserOption((option) => option.setName("member").setDescription("The member to show the birthday of.").setRequired(false)),
    async execute(interaction: ChatInputCommandInteraction) {
        const cooldown = cooldowns.get(interaction.user.id);
        if (cooldown && cooldown + 20_000 > Date.now() && !interaction.memberPermissions?.has("Administrator")) {
            return void interaction.reply("You can only use this command every 20 seconds.");
        }
        cooldowns.set(interaction.user.id, Date.now());

        const user = interaction.options.getUser("member") ?? interaction.user;
        const birthday = db.query<Birthday, []>(`SELECT date FROM birthdays WHERE userid = '${user.id}'`).get();

        if (!birthday) {
            const embed = new EmbedBuilder().setColor("Red").setDescription(`I don't know <@${user.id}>'s birthday **yet**.`);
            return void interaction.reply({ embeds: [embed] });
        }

        const date = moment(birthday.date, "DD/MM/YYYY");
        const dateNum = DateToNumber(date.format("DD/MM"));
        const thisYear = moment().year();
        const todayNum = DateToNumber(moment().format("DD/MM"));

        const nextBirthday = date.clone();
        if (dateNum >= todayNum) {
            nextBirthday.set("year", thisYear);
        } else {
            nextBirthday.set("year", thisYear + 1);
        }

        // calculate age the user will be (-1 if year is 0)
        const age = date.year() === 0 ? -1 : nextBirthday.year() - date.year();
        // ageString is either the age in ordinal format or next
        const ageString = age !== -1 ? `**${ordinal(age)}**` : "**next**";

        // calculate upcoming days
        const days = nextBirthday.diff(moment(), "days");
        const daysString = dateNum === todayNum ? "**today**" : days <= 1 ? "**tomorrow**" : `in **${days}** days`;

        const embed = new EmbedBuilder()
            .setColor("Grey")
            .setDescription(`<@${user.id}>'s ${ageString} birthday is ${daysString} on **${nextBirthday.format("DD MMMM YYYY")}** 🕯️`);

        return void interaction.reply({ embeds: [embed] });
    }
};
