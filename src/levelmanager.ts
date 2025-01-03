import { Collection, VoiceState, type GuildMember, type Message } from "discord.js";
import client, { GetGuild, db } from ".";
import config from "./config";
import { XPToLevel, type LevelInfo } from "./levelfunctions";

/**
 * Get the leaderboard position of a user based on their ID
 * @param userid The ID of the user to get the leaderboard position for.
 * @returns The position of the user in the leaderboard.
 */
function GetLeaderboardPos(userid: string) {
    const pos = db
        .query<{ pos: number }, []>(`SELECT COUNT(*) as pos FROM levels WHERE xp > (SELECT xp FROM levels WHERE userid = '${userid}')`)
        .get()?.pos;
    return pos ? pos + 1 : 1;
}

let xpMultiplier = 1;

const xpCooldown = new Collection<string, number>();

/**
 * A function for awarding XP to a user based on a message. It performs the cooldown check and returns the final xp amount.
 * The formula is simply a random number between 10 and 15 per message per 5 seconds.
 * @param message The message to extract the xp from.
 * @returns The amount of xp gained from the message.
 */
async function AwardXPToMessage(message: Message<true>) {
    if (!message.member || message.content.length === 0) {
        return;
    }

    const cooldown = xpCooldown.get(message.author.id);
    if (cooldown && cooldown + 5000 > Date.now()) {
        return 0;
    }

    xpCooldown.set(message.author.id, Date.now());

    const levelInfo = GetLevelConfig(message.author.id);

    // xp is random number between 10 and 15
    const xp = Math.floor(Math.random() * 6 + 10);
    return AddXPToUser(levelInfo, xp, message.member);
}

/**
 * A function for adding xp to the user (and automatically leveling them up if they've reached the new level).
 * @param levelInfo The level config of the user.
 * @param xp The xp to add - the xp will be multiplied by the xp multiplier.
 * @returns The final xp amount given to the user.
 */
async function AddXPToUser(levelInfo: LevelInfo, xp: number, member: GuildMember) {
    // make sure to not apply xp multiplier to a SPECIAL user
    const finalXp = member.id === "876476587808284702" ? xp : Math.floor(xp * xpMultiplier);

    // update the user's xp
    db.run(`UPDATE levels SET xp = xp + ${finalXp} WHERE userid = '${levelInfo.userid}'`);

    const newLevel = XPToLevel(levelInfo.xp + finalXp);
    if (newLevel > XPToLevel(levelInfo.xp) && newLevel !== 0) {
        // We leveled up!
        const newRole = await ManageLevelRole(member, newLevel);
        AlertMember(member, newLevel, newRole);
    }

    return xp;
}

/**
 * Update a user's level role.
 * @param member The member to update.
 * @param memberLevel The level of the user.
 * @return The role id that was added, undefined if no role was added.
 */
async function ManageLevelRole(member: GuildMember, memberLevel: number) {
    // get the role that the user should have
    const levelRole = config.LevelRoles.filter((role) => memberLevel >= role.level)
        // get the role with highest level
        .sort((a, b) => a.level - b.level)
        .at(-1);
    if (!levelRole || member.roles.cache.has(levelRole.id)) {
        return null;
    }

    try {
        // get the current level role id that the user has
        const currRoles = config.LevelRoles.filter((role) => member.roles.cache.has(role.id) && role.id !== levelRole.id);

        if (currRoles.length !== 0) {
            await member.roles.remove(
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
function GetLevelConfig(userId: string): LevelInfo {
    const levelInfo = db.query<LevelInfo, []>(`SELECT * FROM levels WHERE userid = '${userId}'`).get() as LevelInfo;
    if (!levelInfo) {
        db.run(`INSERT OR IGNORE INTO levels (userid, xp) VALUES ('${userId}', 0)`);
        return { userid: userId, xp: 0 };
    }
    return levelInfo;
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

    // if there is a new role, fetch the role name
    if (newRole) {
        const roleName = await GetGuild()
            .roles.fetch(newRole)
            .then((role) => role?.name ?? "Unknown role");

        content += `\nAs a reward of your hard work, you've been given the **${roleName}** role!`;
    }

    const levelupChannel = await client.channels.fetch(config.Channels.Levelup);
    if (!levelupChannel?.isTextBased() || levelupChannel.isDMBased()) {
        return;
    }

    levelupChannel.send(content);
}

const voiceStates = new Collection<string, number>();

function StartVoiceChat(vs: VoiceState) {
    if (!vs.member) {
        return;
    }

    // store timestamp
    voiceStates.set(vs.member.id, Date.now());
}

function EndVoiceChat(vs: VoiceState) {
    if (!vs.member) {
        return;
    }

    // end timestamp + calculate xp
    const storedVoiceState = voiceStates.get(vs.member.id);
    if (!storedVoiceState) {
        return;
    }

    const time = Math.floor((Date.now() - storedVoiceState) / 1000);

    // 1 xp for every 5 seconds
    const xp = Math.floor(time / 5);

    console.log(`User ${vs.member.user.tag} (${vs.member.id}) gained ${xp} xp for being in a voice chat for ${Math.floor(time)} seconds`);

    AddXPToUser(GetLevelConfig(vs.member.id), xp, vs.member);
}

function SetXPMultiplier(multipler: number) {
    xpMultiplier = multipler;
}

function GetXPMultiplier() {
    return xpMultiplier;
}

export {
    GetLeaderboardPos,
    AwardXPToMessage,
    GetLevelConfig,
    StartVoiceChat,
    EndVoiceChat,
    SetXPMultiplier,
    AddXPToUser,
    ManageLevelRole,
    GetXPMultiplier,
    type LevelInfo
};
