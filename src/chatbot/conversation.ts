import type openai from "openai";
import { MAX_CONVERSATION_LENGTH } from "./constants.js";
import type { ConversationEntry } from "./types.js";
import type { Message } from "discord.js";

// The global conversation
const conversations: ConversationEntry[] = [];

/**
 * Prepares the conversation for sending to OpenAI.
 * @returns The current conversation as an array of ChatCompletionMessageParam
 */
export function prepareConversation() {
    return conversations
        .map((conversation) => [conversation.system, conversation.user, conversation.assistant].filter((m) => m != null))
        .reduce((acc, curr) => acc.concat(curr), []);
}

function limitConversationLength() {
    while (conversations.length > MAX_CONVERSATION_LENGTH) {
        // Remove the second message (keep the first one which has the system message)
        conversations.splice(1, 1);
    }
}

/**
 * Adds a user message to the conversation
 */
export function addUserMessage(message: Message, content: string | openai.ChatCompletionContentPart[]) {
    conversations.push({ messageid: message.id, user: { role: "user", content, name: message.author.username } });
    limitConversationLength();
}

/**
 * Adds a system message to the conversation (only for the first message)
 */
export function addSystemMessage(messageId: string, content: string) {
    conversations.push({ messageid: messageId, system: { role: "system", content } });
    limitConversationLength();
}

/**
 * Adds an assistant message to the conversation
 */
export function addAssistantMessage(messageId: string, content: string) {
    conversations.push({ messageid: messageId, assistant: { content, role: "assistant" } });
    limitConversationLength();
}

/**
 * Clears the conversation, useful when the session gets "polluted"
 */
export function clearConversation() {
    conversations.splice(0, conversations.length);
}

/**
 * Gets the current conversation
 */
export function getConversations() {
    return conversations;
}
