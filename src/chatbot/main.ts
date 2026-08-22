import { SHA256 } from "bun";
import {
    ActionRowBuilder,
    AttachmentBuilder,
    type BaseMessageOptions,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    EmbedBuilder,
    type Message,
    TextDisplayBuilder,
    italic
} from "discord.js";
import { DateTime } from "luxon";
import type OpenAI from "openai";
import type { ResponseInputMessageContentList } from "openai/resources/responses/responses.mjs";
import client from "../runtime.js";
import { openAIClient } from "./client.js";
import { ChatBotModel, TEST_MODE, getChatBotSysMessage } from "./constants.js";
import { commitConversationTurn, createConversationSnapshot, getConversationKey, runInConversation } from "./conversation.js";
import { isSummaryRequest } from "./intents.js";
import { generateSummary } from "./summary.js";
import { recordChatbotMetric } from "./telemetry.js";
import { discordTools, executeDiscordTool } from "./tools.js";
import type { ConversationMessage } from "./types.js";

const tavilyMCPUrl = new URL("https://mcp.tavily.com/mcp/");
if (process.env.TAVILY_API_KEY) {
    tavilyMCPUrl.searchParams.append("tavilyApiKey", process.env.TAVILY_API_KEY);
}

const GLOBAL_TIMEOUT_MS = 90_000;
const MAX_ITERATIONS = 5;

export function createConversationMessage(message: Message<true>, content?: string): ConversationMessage {
    return {
        channelId: message.channelId,
        messageId: message.id,
        content: content ?? message.content,
        userId: message.author.id,
        username: message.author.username,
        date: DateTime.fromJSDate(message.createdAt).toFormat("yyyy-MM-dd HH:mm:ss")
    };
}

export async function isReplyingToUs(message: Message<true>) {
    return message.mentions.repliedUser != null && message.mentions.repliedUser.id === client.user?.id;
}

export async function showChatBotWarning(message: Message<true>) {
    const embed = new EmbedBuilder()
        .setDescription(
            `**Warning: please read carefully before using the chatbot.**\n
	The chatbot might say false information, especially about how to use channels and commands.
	You must first agree you've read and understood this warning before using the chatbot.`
        )
        .setFooter({ text: "You have 30 seconds to choose an option" });
    const components = [
        new ActionRowBuilder<ButtonBuilder>().addComponents([
            new ButtonBuilder().setCustomId("chatbot.agree").setLabel("I agree").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId("chatbot.disagree").setLabel("I disagree").setStyle(ButtonStyle.Danger)
        ])
    ];

    return await message.reply({ embeds: [embed], components }).then(async (botMessage) => {
        try {
            const decision = await botMessage.awaitMessageComponent({
                filter: (interaction) => interaction.user.id === message.author.id && interaction.customId.startsWith("chatbot."),
                time: 30_000,
                componentType: ComponentType.Button
            });
            await decision.deferUpdate();
            return decision.customId === "chatbot.agree";
        } catch {
            return false;
        } finally {
            await botMessage.delete().catch(() => undefined);
        }
    });
}

export async function replyToChatBotMessage(message: Message<true>) {
    if (!message.member) {
        return;
    }
    const key = getConversationKey(message);
    try {
        return await runInConversation(key, () => processChatBotMessage(message, key));
    } catch (error) {
        console.error("Unhandled chatbot request failure", { messageId: message.id, channelId: message.channelId, error });
        await message
            .reply({ content: "__I couldn't process that request right now.__ Please try again later.", allowedMentions: { users: [] } })
            .catch(() => undefined);
    }
}

async function processChatBotMessage(message: Message<true>, key: ReturnType<typeof getConversationKey>) {
    const userMessage = createConversationMessage(message);
    const responseInput: ResponseInputMessageContentList = [{ type: "input_text", text: JSON.stringify(userMessage) }];
    for (const attachment of message.attachments.values()) {
        if (["png", "jpeg", "webp", "gif"].includes(attachment.contentType?.split("/")[1] ?? "")) {
            responseInput.push({
                type: "input_image",
                image_url: attachment.url,
                detail: "low"
            });
        }
    }

    const botMessage = await message.reply({ content: italic("Preparing..."), allowedMentions: { users: [] } });
    const userInput: OpenAI.Responses.ResponseInput = [{ type: "message", role: "user", content: responseInput }];

    if (isSummaryRequest(message.content)) {
        const summaryResult = await generateSummary(message, botMessage, createConversationSnapshot(key));
        if (summaryResult.handled) {
            if (summaryResult.summary) {
                commitConversationTurn(key, message.id, [
                    ...userInput,
                    {
                        type: "message",
                        role: "assistant",
                        content: JSON.stringify(createConversationMessage(botMessage, summaryResult.summary))
                    }
                ]);
            }
            return;
        }
    }

    const conversation = createConversationSnapshot(key);
    const existingItemCount = conversation.length;
    conversation.push(...userInput);
    const startedAt = Date.now();
    const result = await executeChatBotLoop(message, botMessage, conversation, startedAt);
    if (!result) {
        return;
    }

    let chatBotReply: string;
    try {
        const parsed = JSON.parse(result.response.output_text) as { text?: unknown };
        if (typeof parsed.text !== "string" || parsed.text.trim().length === 0) {
            throw new Error("Missing response text");
        }
        chatBotReply = parsed.text.trim();
    } catch (error) {
        if (TEST_MODE) {
            console.error("Could not parse chatbot structured output", error, result.response.output_text);
        }
        await botMessage.edit({ content: "__I couldn't format that response correctly.__ Please try again.", components: [] });
        return;
    }

    const clampedMessage = chatBotReply.length > 3_500 ? `${chatBotReply.slice(0, 3_500)}...` : chatBotReply;
    const reasoningText = result.reasoningOutput
        .flatMap((item) => item.summary)
        .map((summary) => summary.text)
        .join("\n\n");
    const components: NonNullable<BaseMessageOptions["components"]>[number][] = [new TextDisplayBuilder().setContent(clampedMessage)];
    if (reasoningText) {
        components.push(
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`chatbot.showreasoning.${botMessage.id}`)
                    .setLabel("Show reasoning summary")
                    .setStyle(ButtonStyle.Secondary)
            )
        );
    }
    await botMessage.edit({ content: "", components, flags: "IsComponentsV2" });
    attachReasoningCollector(message, botMessage, reasoningText);

    conversation.push({
        type: "message",
        role: "assistant",
        content: JSON.stringify(createConversationMessage(botMessage, chatBotReply))
    });
    commitConversationTurn(key, message.id, conversation.slice(existingItemCount));
    recordChatbotMetric({
        requestId: message.id,
        operation: "chat",
        model: result.response.model,
        durationMs: Date.now() - startedAt,
        iterations: result.iterations,
        toolCalls: result.toolCalls,
        ...result.usage
    });
}

function attachReasoningCollector(message: Message<true>, botMessage: Message<true>, reasoningText: string) {
    if (!reasoningText) {
        return;
    }
    botMessage
        .createMessageComponentCollector({
            filter: (interaction) =>
                interaction.user.id === message.author.id && interaction.customId === `chatbot.showreasoning.${botMessage.id}`,
            componentType: ComponentType.Button,
            time: 30 * 60 * 1_000
        })
        .on("collect", async (interaction) => {
            await interaction.deferUpdate();
            await interaction.followUp({
                files: [
                    new AttachmentBuilder(Buffer.from(reasoningText, "utf-8"))
                        .setName("reasoning-summary.txt")
                        .setDescription("A model-generated summary of its reasoning.")
                ],
                ephemeral: true
            });
        })
        .on("end", async () => {
            const updatedComponents = botMessage.components.filter((row) => row.type !== ComponentType.ActionRow);
            await botMessage.edit({ components: updatedComponents }).catch(() => undefined);
        });
}

type LoopResult = {
    response: OpenAI.Responses.Response;
    reasoningOutput: OpenAI.Responses.ResponseReasoningItem[];
    iterations: number;
    toolCalls: string[];
    usage: {
        inputTokens: number;
        cachedInputTokens: number;
        cacheWriteTokens: number;
        outputTokens: number;
        reasoningTokens: number;
    };
};

async function executeChatBotLoop(
    message: Message<true>,
    botMessage: Message<true>,
    conversation: OpenAI.Responses.ResponseInput,
    startedAt: number
): Promise<LoopResult | null> {
    const reasoningOutput: OpenAI.Responses.ResponseReasoningItem[] = [];
    const usedCalls = new Set<string>();
    const calledTools: string[] = [];
    const usage = {
        inputTokens: 0,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0
    };

    for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
        if (Date.now() - startedAt >= GLOBAL_TIMEOUT_MS) {
            await botMessage.edit({ content: "__Response timeout.__ Please try again.", components: [] });
            return null;
        }
        await botMessage.edit({ content: italic(`Thinking... #${iteration}`) });
        const response = await executeModelCall(message, conversation, GLOBAL_TIMEOUT_MS - (Date.now() - startedAt));
        if (!response) {
            await botMessage.edit({
                content: "__I couldn't reach the language model right now.__ Please try again later.",
                components: []
            });
            return null;
        }
        usage.inputTokens += response.usage?.input_tokens ?? 0;
        usage.cachedInputTokens += response.usage?.input_tokens_details?.cached_tokens ?? 0;
        usage.cacheWriteTokens += response.usage?.input_tokens_details?.cache_write_tokens ?? 0;
        usage.outputTokens += response.usage?.output_tokens ?? 0;
        usage.reasoningTokens += response.usage?.output_tokens_details?.reasoning_tokens ?? 0;
        reasoningOutput.push(...response.output.filter((item) => item.type === "reasoning"));

        if (response.output_text) {
            return { response, reasoningOutput, iterations: iteration, toolCalls: calledTools, usage };
        }

        // Tool-call output items from the tools enabled above are replayable input items.
        // SDK 7's broad output union also includes unrelated tool outputs with a wider
        // status type, so narrow it at this boundary.
        conversation.push(...(response.output as unknown as OpenAI.Responses.ResponseInput));
        const toolCalls = response.output.filter((item) => item.type === "function_call");
        if (toolCalls.length === 0) {
            continue;
        }
        for (const toolCall of toolCalls) {
            const signature = `${toolCall.name}:${toolCall.arguments}`;
            if (usedCalls.has(signature)) {
                conversation.push({
                    type: "function_call_output",
                    call_id: toolCall.call_id,
                    output: JSON.stringify({ success: false, error: "Duplicate tool call suppressed." })
                });
                continue;
            }
            usedCalls.add(signature);
            calledTools.push(toolCall.name);
            let result;
            try {
                const args = JSON.parse(toolCall.arguments) as Record<string, unknown>;
                result = await executeDiscordTool(toolCall.name, args);
            } catch (error) {
                result = { success: false, error: error instanceof Error ? error.message : String(error) };
            }
            conversation.push({
                type: "function_call_output",
                call_id: toolCall.call_id,
                output: JSON.stringify(result)
            });
        }
    }

    await botMessage.edit({
        content: "__I couldn't finish that request within the tool-call limit.__ Please rephrase it.",
        components: []
    });
    return null;
}

function buildTools(): OpenAI.Responses.Tool[] {
    const tools: OpenAI.Responses.Tool[] = [...discordTools];
    if (process.env.TAVILY_API_KEY) {
        tools.push({
            type: "mcp",
            require_approval: "never",
            server_url: tavilyMCPUrl.toString(),
            server_label: "tavily-web-search",
            server_description: "Search the public web for current, changing, real-world, or explicitly requested information."
        });
    }
    return tools;
}

async function executeModelCall(
    message: Message<true>,
    conversation: OpenAI.Responses.ResponseInput,
    timeout: number
): Promise<OpenAI.Responses.Response | null> {
    try {
        const response = await openAIClient.responses.create(
            {
                model: ChatBotModel,
                instructions: getChatBotSysMessage({ username: client.user?.username, id: client.user?.id }),
                safety_identifier: SHA256.hash(message.author.id).toString().substring(0, 64),
                input: conversation,
                tools: buildTools(),
                metadata: {
                    operation: "chat",
                    messageId: message.id,
                    channelId: message.channelId,
                    userId: message.author.id
                },
                text: {
                    verbosity: "low",
                    format: {
                        name: "ChatBotResponse",
                        type: "json_schema",
                        schema: {
                            type: "object",
                            properties: {
                                text: {
                                    type: "string",
                                    description: "The raw Discord response without metadata or a wrapper."
                                }
                            },
                            required: ["text"],
                            additionalProperties: false
                        },
                        strict: true
                    }
                },
                parallel_tool_calls: false,
                reasoning: {
                    context: "current_turn",
                    summary: "detailed",
                    effort: "medium"
                }
            },
            { timeout: Math.max(1_000, timeout) }
        );
        if (TEST_MODE) {
            console.log("Chatbot response usage", response.usage);
        }
        return response;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        recordChatbotMetric({
            requestId: message.id,
            operation: "chat",
            model: ChatBotModel,
            durationMs: GLOBAL_TIMEOUT_MS - timeout,
            error: errorMessage
        });
        if (TEST_MODE) {
            console.error("Chatbot model call failed", error);
        }
        return null;
    }
}
