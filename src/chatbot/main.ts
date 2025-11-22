import { SHA256 } from "bun";
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    EmbedBuilder,
    type Message,
    TextDisplayBuilder,
    italic
} from "discord.js";
import { DateTime } from "luxon";
import openai from "openai";
import type { ResponseInputMessageContentList } from "openai/resources/responses/responses.mjs";
import client from "../index.js";
import { ChatBotModel, TEST_MODE, getChatBotSysMessage } from "./constants.js";
import { addAssistantMessage, addFunctionCallOutput, addResponseOutput, addUserMessage, getConversation } from "./conversation.js";
import { generateSummary, shouldGenerateSummary } from "./summary.js";
import { discordTools, executeDiscordTool } from "./tools.js";
import type { ConversationMessage } from "./types.js";

const openAIClient = new openai.OpenAI({
    apiKey: process.env.OPENAI_KEY,
    organization: process.env.OPENAI_ORG,
    project: process.env.OPENAI_PROJECT
});

const tavilyMCPUrl = new URL("https://mcp.tavily.com/mcp/");
tavilyMCPUrl.searchParams.append("tavilyApiKey", process.env.TAVILY_API_KEY ?? "");

export function createConversationMessage(message: Message<true>, content?: string): ConversationMessage {
    let textContent = content ?? message.content;
    if (message.reference?.messageId) {
        textContent += ` [replying to ${message.reference.messageId}]`;
    }
    return {
        channelId: message.channelId,
        messageId: message.id,
        content: textContent,
        userId: message.author.id,
        username: message.author.username,
        date: DateTime.fromJSDate(message.createdAt).toFormat("yyyy-MM-dd HH:mm:ss")
    };
}

export async function isReplyingToUs(message: Message<true>) {
    return message.mentions.repliedUser != null && message.mentions.repliedUser?.id === client.user?.id;
}

export async function showChatBotWarning(message: Message<true>) {
    // Show a warning first
    const embed = new EmbedBuilder()
        .setDescription(
            `**Warning: please read carefully before using the chatbot.**\n
	The chatbot might say false information, especially about how to use channels and commands.
	You must first agree you've read and understood this warning before using the chatbot.`
        )
        .setFooter({
            text: "You have 30 seconds to choose an option"
        });

    const components = [
        new ActionRowBuilder<ButtonBuilder>().addComponents([
            new ButtonBuilder().setCustomId("chatbot.agree").setLabel("I agree").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId("chatbot.disagree").setLabel("I disagree").setStyle(ButtonStyle.Danger)
        ])
    ];

    /**
     * This is really simple, we create two buttons and return true if the user clicked the agree button.
     */
    const acceptedWarning = await message
        .reply({
            embeds: [embed],
            components
        })
        .then(async (botMessage) => {
            try {
                const decision = await botMessage.awaitMessageComponent({
                    filter: (i) => i.user.id === message.author.id && i.customId.startsWith("chatbot."),
                    time: 30000,
                    componentType: ComponentType.Button
                });
                decision.deferUpdate();
                return decision.customId === "chatbot.agree";
            } catch {
                return false;
            } finally {
                botMessage.delete();
            }
        });

    return acceptedWarning;
}

export async function replyToChatBotMessage(message: Message<true>) {
    if (!message.member) {
        return;
    }

    const userMessage = createConversationMessage(message);
    const imageAttachments = message.attachments
        .filter((attachment) => ["png", "jpeg", "webp", "gif"].includes(attachment.contentType?.split("/")[1] ?? ""))
        .map((attachment) => attachment.url);

    if (TEST_MODE) {
        console.log("Message content:", userMessage.content);
        console.log("Image attachments:", imageAttachments);
    }

    // Construct the content to be sent to OpenAI
    const responseInput: ResponseInputMessageContentList = [
        {
            type: "input_text",
            text: JSON.stringify(userMessage)
        }
    ];
    imageAttachments.forEach((imageAttachment) => {
        responseInput.push({
            type: "input_image",
            image_url: imageAttachment,
            detail: "auto"
        });
    });
    addUserMessage(responseInput);

    const botMessage = await message.reply({ content: italic("Please wait..."), allowedMentions: { users: [] } });

    // Check if user is asking for a summary
    const needsSummary = await shouldGenerateSummary(message.content);

    // If user wants a summary, handle it separately
    if (needsSummary) {
        const summaryGenerated = await generateSummary(message, botMessage);
        if (summaryGenerated) {
            // Summary was generated and sent, we're done
            return;
        }
        // User declined summary, continue with normal response
        botMessage.edit({ content: italic("Please wait...") });
    }

    botMessage.edit({ content: italic("Thinking...") });
    let response = await executeModelCall(message, botMessage);
    if (!response) {
        return;
    }
    addResponseOutput(response.output);

    const toolCalls = response.output.filter((x) => x.type === "function_call");

    // Handle Discord tools
    for (const toolCall of toolCalls) {
        const args = JSON.parse(toolCall.arguments);
        const result = await executeDiscordTool(toolCall.name, args);

        if (TEST_MODE) {
            console.log("Tool call:", toolCall.name, "Arguments:", args, "Result:", result);
        }

        if (result.success) {
            addFunctionCallOutput(toolCall.call_id, JSON.stringify(result.data));
        }
    }

    const calledTools = toolCalls.length > 0;
    if (calledTools) {
        // remake the response with the function call outputs included
        response = await executeModelCall(message, botMessage, false);
        if (!response) {
            return;
        }
        addResponseOutput(response.output);
    }

    if (TEST_MODE) {
        console.dir(getConversation(), { depth: null });
    }

    const parsedReply = response.output_text ? (JSON.parse(response.output_text).text as string) : null;
    if (!parsedReply) {
        message.reply("__An unexpected error has happened:__ no output text was found in the response");
        return;
    }

    if (TEST_MODE) {
        console.log("Parsed reply:", parsedReply);
    }

    // First check if the AI is a dumbass and hallucinated metadata in the beginning
    let chatBotReply = parsedReply;
    if (chatBotReply.startsWith("Bedlessbot")) {
        chatBotReply = chatBotReply.split(":").splice(3).join(":").trim();
    }

    const clampedMessage = chatBotReply.length > 3500 ? chatBotReply.slice(0, 3500) + "..." : chatBotReply;

    const reasoningText = response.output.filter((x) => x.type === "reasoning")[0];
    const components = [new TextDisplayBuilder().setContent(clampedMessage)];
    if (reasoningText != null) {
        for (const summary of reasoningText.summary) {
            const summaryContent = summary.text
                .split("\n")
                .map((x) => (x.length > 0 ? `-# ${x}` : ""))
                .join("\n");
            components.unshift(new TextDisplayBuilder().setContent(summaryContent));
        }
    }

    botMessage.edit({ content: "", components, flags: "IsComponentsV2" });

    addAssistantMessage(createConversationMessage(botMessage, chatBotReply));
}

async function executeModelCall(message: Message<true>, botMessage: Message<true>, allowDiscordTools = true) {
    try {
        const response = await openAIClient.responses.create({
            model: ChatBotModel,
            instructions: getChatBotSysMessage(),
            safety_identifier: SHA256.hash(message.author.id).toString().substring(0, 64),
            input: getConversation(),
            tools: [
                {
                    type: "mcp",
                    require_approval: "never",
                    server_url: tavilyMCPUrl.toString(),
                    server_label: "tavily-web-search"
                },
                ...(allowDiscordTools ? discordTools : [])
            ],
            metadata: {
                messageId: message.id,
                channelId: message.channelId,
                userId: message.author.id
            },
            text: {
                verbosity: "medium",
                format: {
                    name: "ChatBotResponse",
                    type: "json_schema",
                    schema: {
                        type: "object",
                        properties: {
                            text: {
                                type: "string",
                                description:
                                    "The raw response from the chatbot without any metadata. It only contains the text of the response, without any user id, channel id, timestamp etc."
                            }
                        },
                        required: ["text"],
                        additionalProperties: false
                    },
                    strict: true
                }
            },
            parallel_tool_calls: true,
            reasoning: {
                summary: "auto",
                effort: allowDiscordTools ? "medium" : "minimal"
            }
        });
        if (TEST_MODE) {
            console.log("Response output:", response.output);
            console.log("Input tokens:", response.usage?.input_tokens);
            console.log("Cached input tokens:", response.usage?.input_tokens_details?.cached_tokens);
            console.log("Output tokens:", response.usage?.output_tokens);
        }
        return response;
    } catch (error) {
        if (error instanceof Error) {
            botMessage.edit({ content: `__An unexpected error has happened__: ${error.message}` });
        }
        return null;
    }
}
