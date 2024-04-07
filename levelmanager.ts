import type { GuildMember, Message } from "discord.js";
import client, { GetGuild, db } from ".";
import config from "./config";

interface LevelInfo {
    userid: string;
    xp: number;
}

const a = 5 / 6;
const c = 91;
const b = 27;
const LevelToXP = (level: number) => Math.round(a * level * (2 * Math.pow(level, 2) + b * level + c));

function XPToLevel(fx: number) {
    // Define a tolerance level for comparing f(x) and fx
    const tolerance = 0.0001;

    // Perform a binary search to find the approximate value of x
    let lowerBound = 0;
    let upperBound = fx / a; // Rough estimation of upper bound
    let mid = (lowerBound + upperBound) / 2;
    while (upperBound - lowerBound > tolerance) {
        if (LevelToXP(mid) > fx) {
            upperBound = mid;
        } else if (LevelToXP(mid) < fx) {
            lowerBound = mid;
        } else {
            return Math.floor(mid);
        }
        mid = (lowerBound + upperBound) / 2;
    }

    // Return the approximate value of x
    return Math.floor(mid);
}

/**
 * A function for calculating the required XP to level up.
 * @param {number} level The current level
 * @returns The total xp required to get the next level
 */
function XPToLevelUp(level: number) {
    return LevelToXP(level + 1) - LevelToXP(level);
}

function GetLeaderboardPos(userid: string) {
    const pos = db
        .query<{ pos: number }, []>(`SELECT COUNT(*) as pos FROM levels WHERE xp > (SELECT xp FROM levels WHERE userid = '${userid}')`)
        .get()?.pos;
    return pos ? pos + 1 : 1;
}

const xpMultiplier = 2000;

/**
 * A function for getting the xp from a message.
 * @param message The message to extract the xp from.
 * @returns The amount of xp gained from the message.
 */
async function GetXPFromMessage(message: Message<true>) {
    if (!message.member) {
        return;
    }

    const levelInfo = GetLevelConfig(message.author.id);

    // xp is random number between 5 and 10
    const xp = Math.floor(Math.random() * (10 - 5 + 1) + 5) * xpMultiplier;
    AddXPToUser(levelInfo, xp, message.member);

    return xp;
}

/**
 * A function for adding xp to the user (and automatically leveling them up if they've reached the new level).
 * @param levelInfo The level config of the user.
 * @param xp The xp to add - not sanitised, so make sure it's a whole number.
 */
function AddXPToUser(levelInfo: LevelInfo, xp: number, member: GuildMember) {
    // update the user's xp
    db.exec(`UPDATE levels SET xp = xp + ${Math.floor(xp)} WHERE userid = '${levelInfo.userid}'`);

    const newLevel = XPToLevel(levelInfo.xp + xp);
    if (newLevel > XPToLevel(levelInfo.xp) && newLevel !== 0) {
        // We leveled up!
        const newRole = ManageLevelRole(member, newLevel);
        AlertMember(member, newLevel, newRole);
    }
}

/**
 * Update a user's level role.
 * @param member The member to update.
 * @param memberLevel The level of the user.
 * @return The role id that was added, undefined if no role was added.
 */
function ManageLevelRole(member: GuildMember, memberLevel: number) {
    // get the role that the user should have
    const levelRole = config.LevelRoles.find((role) => role.level === memberLevel);
    if (!levelRole) {
        return null;
    }

    try {
        // get the current level role id that the user has
        const currRoles = config.LevelRoles.filter((role) => member.roles.cache.has(role.id));

        if (currRoles.length !== 0) {
            member.roles.remove(
                currRoles.map((role) => role.id),
                "level up - old role"
            );
        }
        member.roles.add(levelRole.id, "level up");
    } catch (err) {
        console.error(err);
    }

    return levelRole.id;
}

/**
 * Get the level info of a user.
 * @param userId The user id.
 * @returns The level info object of the user.
 */
function GetLevelConfig(userId: string) {
    db.exec(`INSERT OR IGNORE INTO levels (userid, xp) VALUES ('${userId}', 0)`);
    return db.query<LevelInfo, []>(`SELECT * FROM levels WHERE userid = '${userId}'`).get()!;
}

/**
 * A function for alerting a member that they've leveled up.
 * @param member The member to alert.
 * @param newlevel The member's new level.
 * @param messageUrl The message that made the member level up.
 * @param newRole The role id that was added to the user.
 */
async function AlertMember(member: GuildMember, newlevel: number, newRole: string | null = null) {
    let content = `Congratulations ${member}, you've successfully achieved level ${newlevel}!`;

    //if newRole is not null, get the role name
    if (newRole) {
        const roleName = await GetGuild()
            .roles.fetch(newRole)
            .then((role) => role?.name ?? "Unknown role");

        content += `\nAs a reward of your hard work, you've been given the **${roleName}** role!`;
    }

    const levelupChannel = await client.channels.fetch(process.env.LEVELUP_CHANNEL!);
    if (!levelupChannel?.isTextBased()) return;

    levelupChannel.send(content);
}

export { GetLeaderboardPos, GetXPFromMessage, LevelToXP, XPToLevel, XPToLevelUp, type LevelInfo };
