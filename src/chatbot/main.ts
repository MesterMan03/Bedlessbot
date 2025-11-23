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
import openai from "openai";
import type { ResponseInputMessageContentList } from "openai/resources/responses/responses.mjs";
import client from "../index.js";
import { ChatBotModel, SearchDecisionModel, TEST_MODE, getChatBotSysMessage, getSearchDecisionPrompt } from "./constants.js";
import {
    addAssistantMessageToSnapshot,
    addFunctionCallOutputToSnapshot,
    addResponseOutputToSnapshot,
    addUserMessageToSnapshot,
    commitConversationSnapshot,
    createConversationSnapshot
} from "./conversation.js";
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

    // Create a snapshot of the current conversation for this message
    const conversationSnapshot = createConversationSnapshot();

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
    addUserMessageToSnapshot(conversationSnapshot, responseInput);

    const botMessage = await message.reply({ content: italic("Preparing..."), allowedMentions: { users: [] } });

    // Check if user is asking for a summary
    const needsSummary = await shouldGenerateSummary(message.content);

    // If user wants a summary, handle it separately
    if (needsSummary) {
        const summaryGenerated = await generateSummary(message, botMessage);
        if (summaryGenerated) {
            // Summary was generated and sent, we're done
            return;
        }
    }

    // Decide if we need to search first
    const searchDecision = await decideIfSearchNeeded(message.content);

    if (TEST_MODE) {
        console.log("Search decision:", searchDecision);
    }

    // If search is needed, perform it and add to snapshot before main loop
    if (searchDecision.needs_search) {
        botMessage.edit({ content: italic("Searching the web...") });
        // The MCP server will handle search in the loop, but we signal it's a search-first query
    }

    // Set up 90 second global timeout
    const startTime = Date.now();
    const globalTimeout = 90000; // 90 seconds

    const finalResponse = await executeChatBotLoop(
        message,
        botMessage,
        conversationSnapshot,
        startTime,
        globalTimeout,
        searchDecision.needs_search
    );

    if (!finalResponse) {
        // Error message already shown by executeChatBotLoop
        return;
    }

    if (TEST_MODE) {
        console.dir(conversationSnapshot, { depth: null });
    }

    const outputText = finalResponse.response.output_text;
    const parsedReply = outputText ? (JSON.parse(outputText).text as string) : null;
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

    const reasoningText = finalResponse.reasoningOutput
        .map((x) => x.summary)
        .flat()
        .map((x) => x.text)
        .join("\n\n");

    // beautiful typescript <3
    const components: NonNullable<BaseMessageOptions["components"]>[number][] = [new TextDisplayBuilder().setContent(clampedMessage)];

    if (reasoningText.length > 0) {
        // create a button that will show the reasoning text for 30 minutes
        const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`chatbot.showreasoning.${botMessage.id}`)
                .setLabel("Show reasoning")
                .setStyle(ButtonStyle.Secondary)
        );
        components.push(buttonRow);
    }

    botMessage.edit({ content: "", components, flags: "IsComponentsV2" });
    botMessage
        .createMessageComponentCollector({
            filter: (i) => i.user.id === message.author.id && i.customId === `chatbot.showreasoning.${botMessage.id}`,
            componentType: ComponentType.Button,
            time: 30 * 60 * 1000 // 30 minutes
        })
        .on("collect", async (interaction) => {
            await interaction.deferUpdate();
            interaction.followUp({
                //components: [new FileBuilder().setURL("attachment://reasoning.txt")],
                files: [
                    new AttachmentBuilder(Buffer.from(reasoningText, "utf-8"))
                        .setName("reasoning.txt")
                        .setDescription("Reasoning steps taken by the AI to arrive at its final answer.")
                ],
                ephemeral: true
            });
        })
        .on("end", () => {
            // remove the button after timeout
            const updatedComponents = botMessage.components.filter((row) => row.type !== ComponentType.ActionRow);
            botMessage.edit({ components: updatedComponents });
        });

    // Add the assistant's final message to the snapshot
    addAssistantMessageToSnapshot(conversationSnapshot, createConversationMessage(botMessage, chatBotReply));

    // Commit the entire conversation snapshot back to the global conversation
    commitConversationSnapshot(conversationSnapshot);
}

/**
 * Decides if a query needs web search based on content analysis
 */
async function decideIfSearchNeeded(query: string): Promise<{ needs_search: boolean; query?: string }> {
    try {
        const response = await openAIClient.chat.completions.create({
            model: SearchDecisionModel,
            messages: [
                { role: "system", content: getSearchDecisionPrompt() },
                { role: "user", content: query }
            ],
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "SearchDecision",
                    strict: true,
                    schema: {
                        type: "object",
                        properties: {
                            needs_search: {
                                type: "boolean",
                                description: "Whether the query requires web search for current/real-world information"
                            },
                            query: {
                                type: "string",
                                description: "Optimized search query if needs_search is true, empty string otherwise"
                            }
                        },
                        required: ["needs_search", "query"],
                        additionalProperties: false
                    }
                }
            }
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
            return { needs_search: false };
        }

        return JSON.parse(content);
    } catch (error) {
        if (TEST_MODE) {
            console.error("Search decision error:", error);
        }
        return { needs_search: false };
    }
}

/**
 * Continuously executes the model in a loop, handling tool calls until we get a final text response
 * or hit the global timeout (90 seconds)
 */
async function executeChatBotLoop(
    message: Message<true>,
    botMessage: Message<true>,
    conversationSnapshot: openai.Responses.ResponseInput,
    startTime: number,
    globalTimeout: number,
    isSearchQuery: boolean
) {
    let iteration = 0;
    const maxIterations = 5; // Safety limit to prevent infinite loops
    const reasoningOutput: openai.Responses.ResponseReasoningItem[] = [];
    const usedTools = new Set<string>(); // Track which tools have been called
    let consecutiveToolOnlyIterations = 0; // Track iterations with only tool calls, no text

    while (iteration < maxIterations) {
        iteration++;

        await botMessage.edit({ content: italic(`Thinking... #${iteration}`) });

        // Check if we've exceeded the global timeout
        const elapsed = Date.now() - startTime;
        if (elapsed >= globalTimeout) {
            botMessage.edit({
                content: "__Response timeout:__ The AI took too long to respond (>90 seconds). Please try again."
            });
            return null;
        }

        // Calculate remaining time for this iteration
        const remainingTime = globalTimeout - elapsed;
        const timeoutPromise = new Promise<"timeout">((resolve) => {
            setTimeout(() => resolve("timeout"), remainingTime);
        });

        if (TEST_MODE) {
            console.log(`Iteration ${iteration}, elapsed: ${elapsed}ms, remaining: ${remainingTime}ms`);
        }

        // Build dynamic tool list based on context
        const availableTools = buildToolsForIteration(iteration, isSearchQuery, usedTools);

        // Execute model call with timeout
        const response = await Promise.race([executeModelCall(message, botMessage, conversationSnapshot, availableTools), timeoutPromise]);

        if (response === "timeout") {
            botMessage.edit({
                content: "__Response timeout:__ The AI took too long to respond (>90 seconds). Please try again."
            });
            return null;
        }

        if (!response) {
            // Error already handled in executeModelCall
            return null;
        }

        addResponseOutputToSnapshot(conversationSnapshot, response.output);
        reasoningOutput.push(...response.output.filter((x) => x.type === "reasoning"));

        // Check if we have a final text response
        if (response.output_text) {
            return { response, reasoningOutput };
        }

        // Handle tool calls
        const toolCalls = response.output.filter((x) => x.type === "function_call");

        if (toolCalls.length === 0) {
            // No text output and no tool calls - something is wrong
            consecutiveToolOnlyIterations++;

            if (consecutiveToolOnlyIterations >= 2) {
                // Force a synthesis-only call
                if (TEST_MODE) {
                    console.log("Forcing synthesis-only iteration after consecutive tool calls");
                }
                const synthesisResponse = await executeModelCall(message, botMessage, conversationSnapshot, []);
                if (synthesisResponse?.output_text) {
                    addResponseOutputToSnapshot(conversationSnapshot, synthesisResponse.output);
                    return { response: synthesisResponse, reasoningOutput };
                }
            }

            botMessage.edit({
                content: "__An unexpected error has happened:__ The AI didn't provide a response or tool calls."
            });
            return null;
        }

        consecutiveToolOnlyIterations++;

        // Check for duplicate tool calls
        const duplicateCalls = toolCalls.filter((tc) => usedTools.has(tc.name));
        if (duplicateCalls.length > 0) {
            if (TEST_MODE) {
                console.log(
                    "Detected duplicate tool calls:",
                    duplicateCalls.map((tc) => tc.name)
                );
            }
            // Force synthesis on next iteration by clearing tools
            const synthesisResponse = await executeModelCall(message, botMessage, conversationSnapshot, []);
            if (synthesisResponse?.output_text) {
                addResponseOutputToSnapshot(conversationSnapshot, synthesisResponse.output);
                return { response: synthesisResponse, reasoningOutput };
            }
            botMessage.edit({
                content: "__An unexpected error has happened:__ Detected tool call loop. Please try rephrasing your question."
            });
            return null;
        }

        // Execute Discord tools
        for (const toolCall of toolCalls) {
            const args = JSON.parse(toolCall.arguments);
            const result = await executeDiscordTool(toolCall.name, args);

            if (TEST_MODE) {
                console.log("Tool call:", toolCall.name, "Arguments:", args, "Result:", result);
            }

            const data = result.success ? result.data : result;
            addFunctionCallOutputToSnapshot(conversationSnapshot, toolCall.call_id, JSON.stringify(data));

            // Track this tool as used
            usedTools.add(toolCall.name);
        }

        // Reset consecutive counter since we're continuing
        consecutiveToolOnlyIterations = 0;
    }

    // Hit max iterations
    botMessage.edit({
        content: `__An unexpected error has happened:__ The AI exceeded the maximum number of iterations (${maxIterations}).`
    });
    return null;
}

/**
 * Builds the appropriate tool list for each iteration based on context
 */
function buildToolsForIteration(iteration: number, isSearchQuery: boolean, usedTools: Set<string>) {
    const tools: openai.Responses.Tool[] = [];

    // Always include MCP search
    tools.push({
        type: "mcp",
        require_approval: "never",
        server_url: tavilyMCPUrl.toString(),
        server_label: "tavily-web-search"
    });

    // Include Discord tools only if:
    // 1. It's the first iteration AND
    // 2. It's NOT a search query (real-world/current events)
    if (iteration === 1 && !isSearchQuery) {
        // Filter out already-used tools
        const availableDiscordTools = discordTools.filter((tool) => !usedTools.has(tool.name));
        tools.push(...availableDiscordTools);
    }

    return tools;
}

async function executeModelCall(
    message: Message<true>,
    botMessage: Message<true>,
    conversationSnapshot: openai.Responses.ResponseInput,
    tools: openai.Responses.Tool[]
) {
    try {
        const response = await openAIClient.responses.create({
            model: ChatBotModel,
            instructions: getChatBotSysMessage(),
            safety_identifier: SHA256.hash(message.author.id).toString().substring(0, 64),
            input: conversationSnapshot,
            tools,
            metadata: {
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
            parallel_tool_calls: false,
            reasoning: {
                summary: "detailed",
                effort: "medium"
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
