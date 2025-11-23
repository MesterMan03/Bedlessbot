import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    ComponentType,
    type Message,
    TextDisplayBuilder
} from "discord.js";
import openai from "openai";
import { Cache } from "../cache.js";
import {
    ChatBotModel,
    SUMMARY_COOLDOWN_MS,
    SummaryDecisionModel,
    SummaryDecisionPrompt,
    SummarySysMessage,
    TEST_MODE
} from "./constants.js";
import { addAssistantMessage, getConversation } from "./conversation.js";
import { createConversationMessage } from "./main.js";

const openAIClient = new openai.OpenAI({
    apiKey: process.env.OPENAI_KEY,
    organization: process.env.OPENAI_ORG,
    project: process.env.OPENAI_PROJECT
});

const summaryCooldown = new Cache<string, number>(SUMMARY_COOLDOWN_MS);

/**
 * Determines if the user is asking for a conversation summary
 */
export async function shouldGenerateSummary(query: string): Promise<boolean> {
    const response = await openAIClient.responses.create({
        model: SummaryDecisionModel,
        instructions: SummaryDecisionPrompt,
        input: query,
        text: {
            format: {
                type: "json_schema",
                name: "SummaryDecision",
                schema: {
                    type: "object",
                    properties: {
                        summary: {
                            type: "boolean",
                            description: "True if a conversation summary is requested, otherwise false."
                        }
                    },
                    required: ["summary"],
                    additionalProperties: false
                },
                strict: true
            }
        }
    });

    const content = response.output_text;
    if (!content) {
        if (TEST_MODE) {
            console.log("No content in summary decision response for query:", query);
        }
        return false;
    }

    const parsed = JSON.parse(content);
    const decision = parsed.summary === true;

    if (TEST_MODE) {
        console.log("Summary decision:", decision, "for query:", query);
    }

    return decision;
}

/**
 * Generates a summary of the conversation. Returns true if summary was generated, false if user declined.
 */
export async function generateSummary(userMessage: Message<true>, botMessage: Message<true>): Promise<boolean> {
    // Reply with a prompt
    const components = [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId("chatbot.summary.accept").setLabel("Yes").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId("chatbot.summary.deny").setLabel("No").setStyle(ButtonStyle.Danger)
        )
    ];
    botMessage.edit({ content: `Are you sure you want to generate a summary?`, components });

    const filter = (i: ButtonInteraction) => i.customId.startsWith("chatbot.summary.") && i.user.id === userMessage.author.id;
    const result = await botMessage
        .awaitMessageComponent({
            filter,
            componentType: ComponentType.Button,
            time: 30_000
        })
        .then((i) => {
            i.deferUpdate();
            return i.customId === "chatbot.summary.accept";
        })
        .catch(() => {
            return false;
        });

    if (!result) {
        // User declined summary, return false to continue with normal response
        return false;
    }

    const cooldown = summaryCooldown.get(userMessage.channelId);
    if (cooldown && cooldown > Date.now()) {
        botMessage.edit(
            `You can only use this command once per 15 minutes per channel. Please wait ${Math.ceil((cooldown - Date.now()) / 1000)} seconds.`
        );
        return true;
    }
    summaryCooldown.set(userMessage.channelId, Date.now() + SUMMARY_COOLDOWN_MS);

    botMessage.edit({ content: "Generating summary...", components: [] });

    // Fetch past 50 messages
    const messages = await userMessage.channel.messages.fetch({ limit: 50, before: userMessage.id });

    // Prepare the messages for the summary
    const summaryInput = prepareMessagesForSummary(messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp).map((m) => m));

    // Generate the summary
    const summaryResponse = await openAIClient.responses.create({
        model: ChatBotModel,
        instructions: SummarySysMessage,
        input: [
            ...getConversation(),
            {
                type: "message",
                role: "user",
                content: `Please provide a concise summary of the following conversation messages:\n\n${summaryInput}`
            }
        ]
    });

    const summary = summaryResponse.output_text;
    if (!summary) {
        if (TEST_MODE) {
            console.log("No summary content generated for messages:", summaryResponse);
        }
        botMessage.edit("__An unexpected error has happened:__ no summary could be generated.");
        return true;
    }

    // Add the response to the conversation
    addAssistantMessage(createConversationMessage(botMessage, summary));

    botMessage.edit({
        content: "",
        allowedMentions: { parse: [] },
        components: [new TextDisplayBuilder().setContent(summary)],
        flags: "IsComponentsV2"
    });

    return true;
}

/**
 * Prepares the messages for the summary
 * @param messages An array of messages to prepare for the summary (in the order of oldest to newest)
 */
function prepareMessagesForSummary(messages: Message[]) {
    // Filter out empty messages
    const filteredMessages = messages.filter((m) => m.content.length > 0);

    // Format: [date with time] author (replying to message id): message (message id)
    // If message is over 1000 characters, add an ellipsis
    const formattedMessages = filteredMessages.map((message) => {
        const date = message.createdAt.toLocaleString("en-US", {
            timeZone: "Europe/Budapest",
            timeZoneName: "short",
            hour12: false
        });

        const content = message.cleanContent.length > 1000 ? message.cleanContent.slice(0, 1000) + "..." : message.cleanContent;
        const attachmentCount = message.attachments.size;

        return `[${date}] ${message.author.tag}: ${content} <${attachmentCount} attachments>`;
    });

    return formattedMessages.join("\n");
}
