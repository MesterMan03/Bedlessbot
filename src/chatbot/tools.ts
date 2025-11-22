import type { GuildMember } from "discord.js";
import type { FunctionTool } from "openai/resources/responses/responses.mjs";
import client, { GetGuild, db } from "../index.js";
import { XPToLevel, XPToLevelUp } from "../levelfunctions.js";
import type { DiscordToolResult } from "./types.js";

/**
 * Registry of Discord tools that can be invoked by the AI
 */
export const discordTools: FunctionTool[] = [
    {
        type: "function",
        name: "get_member_information",
        description:
            "Fetches information about a Discord server member based on their user ID or username. Returns their roles, join date, permissions, and account creation date.",
        parameters: {
            type: "object",
            properties: {
                identifier: {
                    type: "string",
                    description: "The user ID (snowflake) or username of the member to look up"
                }
            },
            required: ["identifier"],
            additionalProperties: false
        },
        strict: true
    },
    {
        type: "function",
        name: "get_level_information",
        description:
            "Fetches level and XP information for a Discord server member. Use this when users ask about someone's level, rank, XP, or progress. Returns their current level, total XP, XP needed for next level, and leaderboard position.",
        parameters: {
            type: "object",
            properties: {
                identifier: {
                    type: "string",
                    description: "The user ID (snowflake) or username of the member to look up"
                }
            },
            required: ["identifier"],
            additionalProperties: false
        },
        strict: true
    },
    {
        type: "function",
        name: "get_leaderboard_information",
        description:
            "Fetches members on the XP leaderboard. Use this when users ask about the leaderboard, top members, or who has the most XP. Can fetch top 10 by default, a specific position (e.g., rank 5), or a position range (e.g., ranks 10-20). Returns username, level, and total XP for each member.",
        parameters: {
            type: "object",
            properties: {
                startPosition: {
                    type: "number",
                    description: "The starting position on the leaderboard (1-indexed). Defaults to 1 if not provided."
                },
                endPosition: {
                    type: "number",
                    description:
                        "The ending position on the leaderboard (1-indexed). Defaults to 10 if not provided. Maximum range is 50 positions."
                }
            },
            additionalProperties: false
        },
        strict: false
    }
];

/**
 * Executes a Discord tool by name
 */
export async function executeDiscordTool(toolName: string, args: Record<string, unknown>): Promise<DiscordToolResult> {
    switch (toolName) {
        case "get_member_information":
            return await getMemberInformation(args.identifier as string);
        case "get_level_information":
            return await getLevelInformation(args.identifier as string);
        case "get_leaderboard_information":
            return await getLeaderboardInformation(args.startPosition as number | undefined, args.endPosition as number | undefined);
        default:
            return {
                success: false,
                error: `Unknown tool: ${toolName}`
            };
    }
}

/**
 * Gets member information from the guild cache
 */
async function getMemberInformation(identifier: string): Promise<DiscordToolResult> {
    try {
        const guild = GetGuild();
        let member: GuildMember | undefined;

        // Try to find by ID first
        if (/^\d+$/.test(identifier)) {
            member = guild.members.cache.get(identifier);
        }

        // If not found, try to find by username
        if (!member) {
            member = guild.members.cache.find(
                (m) => m.user.username.toLowerCase() === identifier.toLowerCase() || m.user.tag.toLowerCase() === identifier.toLowerCase()
            );
        }

        if (!member) {
            return {
                success: false,
                error: `Member not found: ${identifier}`
            };
        }

        // Compile member information
        const memberInfo = {
            id: member.id,
            username: member.user.username,
            displayName: member.displayName,
            tag: member.user.tag,
            isBot: member.user.bot,
            joinedAt: member.joinedAt?.toISOString(),
            createdAt: member.user.createdAt.toISOString(),
            roles: member.roles.cache
                .filter((role) => role.name !== "@everyone")
                .sort((a, b) => b.position - a.position)
                .map((role) => role.name)
                .slice(0, 20), // Limit to 20 roles to avoid token explosion
            roleCount: member.roles.cache.size - 1, // -1 for @everyone
            isAdmin: member.permissions.has("Administrator"),
            isModerator: member.permissions.has("ModerateMembers"),
            nickname: member.nickname
        };

        return {
            success: true,
            data: memberInfo
        };
    } catch (error) {
        return {
            success: false,
            error: `Error fetching member information: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}

async function getLevelInformation(identifier: string): Promise<DiscordToolResult> {
    try {
        const guild = GetGuild();
        let member: GuildMember | undefined;

        // Try to find by ID first
        if (/^\d+$/.test(identifier)) {
            member = guild.members.cache.get(identifier);
        }

        // If not found, try to find by username
        if (!member) {
            member = guild.members.cache.find(
                (m) => m.user.username.toLowerCase() === identifier.toLowerCase() || m.user.tag.toLowerCase() === identifier.toLowerCase()
            );
        }

        if (!member) {
            return {
                success: false,
                error: `Member not found: ${identifier}`
            };
        }

        // Get level info from database
        const levelInfo = db.query<{ userid: string; xp: number }, []>(`SELECT * FROM levels WHERE userid = '${member.id}'`).get();

        if (!levelInfo) {
            return {
                success: true,
                data: {
                    username: member.user.username,
                    userId: member.id,
                    level: 0,
                    currentXP: 0,
                    xpForNextLevel: XPToLevelUp(0),
                    leaderboardPosition: null,
                    message: "This user hasn't gained any XP yet."
                }
            };
        }

        const level = XPToLevel(levelInfo.xp);
        const xpForNextLevel = XPToLevelUp(level);

        // Get leaderboard position
        const pos = db
            .query<{ pos: number }, []>(
                `SELECT COUNT(*) as pos FROM levels WHERE xp > (SELECT xp FROM levels WHERE userid = '${member.id}')`
            )
            .get()?.pos;
        const leaderboardPosition = pos ? pos + 1 : 1;

        return {
            success: true,
            data: {
                username: member.user.username,
                userId: member.id,
                level: level,
                currentXP: levelInfo.xp,
                xpForNextLevel: xpForNextLevel,
                leaderboardPosition: leaderboardPosition
            }
        };
    } catch (error) {
        return {
            success: false,
            error: `Error fetching level information: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}

async function getLeaderboardInformation(startPosition?: number, endPosition?: number): Promise<DiscordToolResult> {
    try {
        // Default to top 10 if no positions specified
        const start = startPosition ?? 1;
        const end = endPosition ?? 10;

        // Validate positions
        if (start < 1) {
            return {
                success: false,
                error: "Start position must be at least 1"
            };
        }

        if (end < start) {
            return {
                success: false,
                error: "End position must be greater than or equal to start position"
            };
        }

        if (end - start + 1 > 50) {
            return {
                success: false,
                error: "Maximum range is 50 positions. Please reduce the range."
            };
        }

        // Calculate LIMIT and OFFSET for SQL query
        const limit = end - start + 1;
        const offset = start - 1;

        // Get members from database with offset and limit
        const topMembers = db
            .query<{ userid: string; xp: number }, []>(`SELECT * FROM levels ORDER BY xp DESC LIMIT ${limit} OFFSET ${offset}`)
            .all();

        if (topMembers.length === 0) {
            return {
                success: true,
                data: {
                    leaderboard: [],
                    message: start === 1 ? "No members have earned XP yet." : `No members found in positions ${start}-${end}.`,
                    requestedRange: { start, end }
                }
            };
        }

        // Map to include usernames and levels
        const leaderboard = await Promise.all(
            topMembers.map(async (entry, index) => {
                const user = await client.users.fetch(entry.userid).catch(() => null);
                const level = XPToLevel(entry.xp);

                return {
                    position: start + index,
                    username: user?.username ?? `Unknown User (${entry.userid})`,
                    userId: entry.userid,
                    level: level,
                    totalXP: entry.xp
                };
            })
        );

        return {
            success: true,
            data: {
                leaderboard: leaderboard,
                totalEntries: topMembers.length,
                requestedRange: { start, end }
            }
        };
    } catch (error) {
        return {
            success: false,
            error: `Error fetching leaderboard: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}
