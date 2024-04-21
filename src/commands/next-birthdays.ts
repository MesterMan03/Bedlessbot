import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { db } from "..";
import { DateToNumber, timezone, type Birthday } from "../birthdaymanager";
import moment from "moment-timezone";

const cooldowns = new Map<string, number>();

export default {
    data: new SlashCommandBuilder().setName("next-birthdays").setDescription("Shows the next 10 birthdays."),
    async execute(interaction: ChatInputCommandInteraction) {
        const cooldown = cooldowns.get(interaction.user.id);
        if (cooldown && cooldown + 5000 > Date.now() && !interaction.memberPermissions?.has("Administrator")) {
            return void interaction.reply("You can only use this command every 5 seconds.");
        }
        cooldowns.set(interaction.user.id, Date.now());

        // calculate today's date in orderable format
        const today = moment().tz(timezone).format("DD/MM");
        const thisYear = moment().tz(timezone).year();
        const todayNum = DateToNumber(today);

        // now we just need to find the offset, so find every birthday that is today or later
        const birthdays = db
            .query<
                Omit<Birthday, "datenum">,
                []
            >(`SELECT userid, date FROM birthdays WHERE datenum >= ${todayNum} ORDER BY datenum ASC LIMIT 10`)
            .all();

        // problem: if we're at the end of the year, we need to wrap around to the start
        if (birthdays.length < 10) {
            const wraparound = db
                .query<Omit<Birthday, "datenum">, []>(
                    `SELECT userid, date FROM birthdays ORDER BY datenum ASC LIMIT ${10 - birthdays.length}`
                )
                .all()
                // deduplicate
                .filter((birthday) => !birthdays.some((b) => b.userid === birthday.userid));
            birthdays.push(...wraparound);
        }

        const embedFields = new Array<{ date: string; text: string }>();

        // turn the dates into (day, month name, year) format
        birthdays.map((birthday) => {
            const date = moment(birthday.date, "DD/MM/YYYY");
            const year = date.year();
            const dateNum = DateToNumber(date.format("DD/MM"));

            // if date is today or later, it's this year, otherwise it's next year
            if (dateNum >= todayNum) {
                date.set("year", thisYear);
            } else {
                date.set("year", thisYear + 1);
            }

            // format the month as English short name
            const dateString = date.format("DD MMMM YYYY");

            // calculate age the user will be (-1 if year is 0)
            const originalDate = moment(birthday.date, "DD/MM/YYYY");
            const age = year === 0 ? -1 : thisYear - year;
            const ageString = age === -1 ? "" : ` (${age})`;

            const embedText = `<@${birthday.userid}>${ageString}`;

            // check if embedFields already has a field for this date
            const field = embedFields.find((field) => field.date === dateString);
            if (field) {
                field.text += `\n${embedText}`;
            } else {
                embedFields.push({ date: dateString, text: `${embedText}` });
            }
        });

        // create the response
        const embed = new EmbedBuilder()
            .setColor("DarkPurple")
            .setTitle("Upcoming birthdays")
            .setFields(
                embedFields.map((field) => {
                    return { name: field.date, value: field.text };
                })
            );

        await interaction.reply({ embeds: [embed] });
    }
};
