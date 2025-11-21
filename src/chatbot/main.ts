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
import { zodResponseFormat } from "openai/helpers/zod";
import type { ChatCompletionContentPart } from "openai/resources/index.mjs";
import { z } from "zod";
import client from "../index.js";
import { ChatBotModel, TEST_MODE, getChatBotSysMessage } from "./constants.js";
import { addAssistantMessage, addSystemMessage, addUserMessage, prepareConversation } from "./conversation.js";
import { formatSearchResults, performSearch, shouldSearch } from "./search.js";
import { generateSummary, shouldGenerateSummary } from "./summary.js";
import { discordTools, executeDiscordTool } from "./tools.js";

const openAIClient = new openai.OpenAI({
    apiKey: process.env.OPENAI_KEY,
    organization: process.env.OPENAI_ORG,
    project: process.env.OPENAI_PROJECT
});

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

    // Construct the input content
    let textContent = message.author.username;
    if (message.reference?.messageId) {
        textContent += ` [replying to ${message.reference.messageId}]`;
    }
    textContent += ` {${message.channelId}}`;
    textContent += ` (${message.id})`;
    textContent += ` <${DateTime.fromJSDate(message.createdAt).toFormat("yyyy-MM-dd HH:mm:ss")}>`;
    textContent += ": " + message.content;

    // Look for images in the message (accepts png, jpeg, webp and gif)
    const imageAttachments = message.attachments
        .filter((attachment) => ["png", "jpeg", "webp", "gif"].includes(attachment.contentType?.split("/")[1] ?? ""))
        .map((attachment) => attachment.url);

    if (TEST_MODE) {
        console.log("Message content:", textContent);
        console.log("Image attachments:", imageAttachments);
    }

    // Construct the content to be sent to OpenAI
    const content = [
        {
            type: "text",
            text: textContent
        }
    ] as ChatCompletionContentPart[];
    imageAttachments.forEach((imageAttachment) => {
        content.push({
            type: "image_url",
            image_url: {
                url: imageAttachment,
                detail: "low"
            }
        });
    });

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

    // Check if search is needed
    const needsSearch = await shouldSearch(message.content);

    let searchContext = "";
    if (needsSearch) {
        botMessage.edit({ content: italic("Searching the web...") });
        const searchResults = await performSearch(message.content);
        searchContext = formatSearchResults(searchResults);

        if (TEST_MODE) {
            console.log("Search context:", searchContext);
        }
    }

    // Store the conversation in memory
    addSystemMessage(message.id, getChatBotSysMessage());
    addUserMessage(message, content);

    // If we have search context, add it as a system message
    if (searchContext) {
        addAssistantMessage(message.id, searchContext);
    }

    if (TEST_MODE) {
        console.dir(
            prepareConversation().filter((msg) => msg.role !== "system"),
            { depth: null }
        );
    }

    botMessage.edit({ content: italic("Thinking...") });

    // Send the request to OpenAI
    const responseFormat = z.object({
        text: z.string({
            description:
                "The raw response without metadata. It only contains the text of the response, without any user id, channel id, timestamp etc."
        })
    });

    const response = await openAIClient.chat.completions
        .parse({
            model: ChatBotModel,
            messages: prepareConversation(),
            safety_identifier: SHA256.hash(message.author.id).toString(),
            tools: discordTools,
            response_format: zodResponseFormat(responseFormat, "metadata_free_response")
        })
        .then((response) => {
            if (TEST_MODE) {
                console.log("Prompt tokens:", response.usage?.prompt_tokens);
                console.log("Cached tokens:", response.usage?.prompt_tokens_details?.cached_tokens);
            }
            return response.choices[0].message;
        })
        .catch((error) => {
            botMessage.edit({ content: `__An unexpected error has happened__: ${error.message}` });
            return null;
        });

    if (!response) {
        return;
    }

    const toolCalls = response.tool_calls ?? [];

    // Handle Discord tools
    for (const toolCall of toolCalls) {
        if (toolCall.function.name !== "generate_summary") {
            const args = JSON.parse(toolCall.function.arguments);
            const result = await executeDiscordTool(toolCall.function.name, args);

            if (TEST_MODE) {
                console.log("Tool call:", toolCall.function.name, "Result:", result);
            }

            // Add the tool result to the conversation and get a new response
            if (result.success) {
                const toolResultMessage = `Tool result from ${toolCall.function.name}: ${JSON.stringify(result.data)}`;
                // We need to make another API call with the tool result
                const followUpResponse = await openAIClient.chat.completions.parse({
                    model: ChatBotModel,
                    messages: [
                        ...prepareConversation(),
                        {
                            role: "assistant",
                            content: null,
                            tool_calls: [toolCall]
                        },
                        {
                            role: "tool",
                            tool_call_id: toolCall.id,
                            content: toolResultMessage
                        }
                    ],
                    safety_identifier: SHA256.hash(message.author.id).toString(),
                    response_format: zodResponseFormat(responseFormat, "metadata_free_response")
                });

                const followUpParsed = followUpResponse.choices[0].message.parsed;
                if (followUpParsed) {
                    let chatBotReply = followUpParsed.text;

                    // Check if the AI hallucinated metadata
                    if (chatBotReply.startsWith("Bedlessbot")) {
                        chatBotReply = chatBotReply.split(":").splice(3).join(":").trim();
                    }

                    const clampedMessage = chatBotReply.length > 3500 ? chatBotReply.slice(0, 3500) + "..." : chatBotReply;
                    botMessage.edit({
                        content: "",
                        components: [new TextDisplayBuilder().setContent(clampedMessage)],
                        flags: "IsComponentsV2"
                    });

                    // Enrich the reply with metadata and store it
                    const storedReply = `Bedlessbot {${botMessage.channelId}} (${botMessage.id}) <${DateTime.fromJSDate(botMessage.createdAt).toFormat("yyyy-MM-dd HH:mm:ss")}>: ${chatBotReply}`;
                    addAssistantMessage(message.id, storedReply);
                }
                return;
            } else {
                botMessage.edit({ content: `Error executing tool: ${result.error}` });
                return;
            }
        }
    }

    // No tools were called, proceed with normal response
    const parsedReply = response.parsed;
    if (!parsedReply) {
        message.reply("__An unexpected error has happened__");
        return;
    }

    if (TEST_MODE) {
        console.log("Parsed reply:", parsedReply);
    }

    let chatBotReply = parsedReply.text;

    // First check if the AI is a dumbass and hallucinated metadata in the beginning
    if (chatBotReply.startsWith("Bedlessbot")) {
        chatBotReply = chatBotReply.split(":").splice(3).join(":").trim();
    }

    const clampedMessage = chatBotReply.length > 3500 ? chatBotReply.slice(0, 3500) + "..." : chatBotReply;
    botMessage.edit({ content: "", components: [new TextDisplayBuilder().setContent(clampedMessage)], flags: "IsComponentsV2" });

    // Enrich the reply with metadata
    const storedReply = `Bedlessbot {${botMessage.channelId}} (${botMessage.id}) <${DateTime.fromJSDate(botMessage.createdAt).toFormat("yyyy-MM-dd HH:mm:ss")}>: ${chatBotReply}`;

    // Add the response to the conversation
    addAssistantMessage(message.id, storedReply);
}
