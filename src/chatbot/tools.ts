import type { GuildMember } from "discord.js";
import { GetGuild } from "../index.js";
import type { DiscordToolResult } from "./types.js";
import type { ChatCompletionTool } from "openai/resources/index.mjs";

/**
 * Registry of Discord tools that can be invoked by the AI
 */
export const discordTools: ChatCompletionTool[] = [
    {
        type: "function",
        function: {
            name: "get_member_information",
            description:
                "Fetches information about a Discord server member. Use this when users ask about specific members, their roles, join dates, or other member-specific information.",
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
        }
    }
];

/**
 * Executes a Discord tool by name
 */
export async function executeDiscordTool(toolName: string, args: Record<string, unknown>): Promise<DiscordToolResult> {
    switch (toolName) {
        case "get_member_information":
            return await getMemberInformation(args.identifier as string);
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
