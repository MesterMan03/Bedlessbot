import moment from "moment-timezone";
import cron from "node-cron";
import client, { GetGuild, db } from ".";
import config from "./config";

/**
 * Converts a date into an orderable number
 * @param date The date to process in DD/MM format
 * @returns Its order in the year
 */
function DateToNumber(date: string) {
    const dateObj = moment(date, "DD/MM");
    return dateObj.month() * 31 + dateObj.date();
}

interface Birthday {
    userid: string;
    date: string;
    datenum: number;
}

const timezone = "Europe/London";

async function WishBirthdays() {
    try {
        console.log("Started wishing birthdays...");

        // remove the birthday role from everyone
        const guild = GetGuild();
        const birthdayRole = await guild.roles.fetch(config.Roles.Birthday);
        if (!birthdayRole) {
            throw new Error("Couldn't find birthday role");
        }

        for (const member of guild.members.cache.filter((m) => m.roles.cache.has(birthdayRole.id)).values()) {
            await member.roles.remove(birthdayRole);
        }

        // get today's date in DD/MM format
        const today = moment().tz(timezone).format("DD/MM");

        // find everyone with a birthday today
        const query = db.query<Omit<Birthday, "datenum">, []>(`SELECT userid, date FROM birthdays WHERE date LIKE '${today}%'`).all();
        for (const birthday of query) {
            // get the year component of date
            const year = moment(birthday.date, "DD/MM/YYYY").year();

            // calculate age (if year is below 1800, set to -1)
            const age = year < 1800 ? -1 : moment().tz(timezone).year() - year;
            const ageString = age !== -1 ? ` (${age})` : "";

            const generalChannel = await client.channels.fetch(config.Channels.Birthday);
            if (!generalChannel?.isTextBased()) {
                return;
            }

            generalChannel.send(`It's the birthday of <@${birthday.userid}>${ageString}! 🎂`);

            // give them the birthday role
            const member = await guild.members.fetch(birthday.userid).catch(() => {
                return null;
            });
            if (!member) {
                continue;
            }

            await member.roles.add(birthdayRole);
        }
    } catch (e) {
        console.error("Error in birthday cronjob");
        console.error(e);
    }
}

// set up cronjob that runs every day at 8:00 in the Europe/London timezone
const cronjob = cron.schedule("0 8 * * *", WishBirthdays, { timezone });

export { DateToNumber, cronjob, type Birthday, timezone, WishBirthdays };
