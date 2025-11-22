import type openai from "openai";
import { MAX_CONVERSATION_LENGTH } from "./constants.js";
import type { ConversationMessage } from "./types.js";

// The global conversation
const conversation: openai.Responses.ResponseInput = [];

function limitConversationLength() {
    const toRemove = conversation.length - MAX_CONVERSATION_LENGTH;
    if (toRemove > 0) {
        conversation.splice(0, toRemove);
    }
}

/**
 * Adds a user message to the conversation
 */
export function addUserMessage(content: string | openai.Responses.ResponseInputMessageContentList) {
    conversation.push({ type: "message", role: "user", content });
    limitConversationLength();
}

/**
 * Adds model responses to the conversation
 * @param responses The `output` field from the model call.
 */
export function addResponseOutput(responses: openai.Responses.ResponseOutputItem[]) {
    conversation.push(...responses);
}

/**
 * Adds an assistant message to the conversation
 * @param message The message returned by the assistant
 */
export function addAssistantMessage(message: ConversationMessage) {
    conversation.push({
        type: "message",
        role: "assistant",
        status: "completed",
        content: JSON.stringify(message)
    });
}

export function addFunctionCallOutput(callId: string, output: string) {
    conversation.push({ type: "function_call_output", call_id: callId, output });
}

/**
 * Clears the conversation, useful when the session gets "polluted"
 */
export function clearConversation() {
    conversation.splice(0, conversation.length);
}

/**
 * Gets the current conversation
 */
export function getConversation() {
    return conversation;
}
