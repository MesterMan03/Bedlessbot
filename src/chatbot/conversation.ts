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
 * Creates a snapshot of the current conversation for isolated message handling
 */
export function createConversationSnapshot(): openai.Responses.ResponseInput {
    return [...conversation];
}

/**
 * Commits a conversation snapshot back to the global conversation
 * This should only be called after successfully processing a message
 */
export function commitConversationSnapshot(snapshot: openai.Responses.ResponseInput) {
    // Replace the entire conversation with the snapshot
    conversation.splice(0, conversation.length, ...snapshot);
    limitConversationLength();
}

/**
 * Adds a user message to a conversation snapshot
 */
export function addUserMessageToSnapshot(
    snapshot: openai.Responses.ResponseInput,
    content: string | openai.Responses.ResponseInputMessageContentList
) {
    snapshot.push({ type: "message", role: "user", content });
}

/**
 * Adds model responses to a conversation snapshot
 * @param snapshot The conversation snapshot to modify
 * @param responses The `output` field from the model call.
 */
export function addResponseOutputToSnapshot(snapshot: openai.Responses.ResponseInput, responses: openai.Responses.ResponseOutputItem[]) {
    snapshot.push(...responses);
}

/**
 * Adds an assistant message to a conversation snapshot
 * @param snapshot The conversation snapshot to modify
 * @param message The message returned by the assistant
 */
export function addAssistantMessageToSnapshot(snapshot: openai.Responses.ResponseInput, message: ConversationMessage) {
    snapshot.push({
        type: "message",
        role: "assistant",
        status: "completed",
        content: JSON.stringify(message)
    });
}

/**
 * Adds a function call output to a conversation snapshot
 * @param snapshot The conversation snapshot to modify
 * @param callId The call ID from the function call
 * @param output The output from the function call
 */
export function addFunctionCallOutputToSnapshot(snapshot: openai.Responses.ResponseInput, callId: string, output: string) {
    snapshot.push({ type: "function_call_output", call_id: callId, output });
}

/**
 * Legacy function - adds a user message to the global conversation
 * @deprecated Use createConversationSnapshot and addUserMessageToSnapshot instead
 */
export function addUserMessage(content: string | openai.Responses.ResponseInputMessageContentList) {
    conversation.push({ type: "message", role: "user", content });
    limitConversationLength();
}

/**
 * Legacy function - adds model responses to the global conversation
 * @deprecated Use addResponseOutputToSnapshot instead
 */
export function addResponseOutput(responses: openai.Responses.ResponseOutputItem[]) {
    conversation.push(...responses);
}

/**
 * Legacy function - adds an assistant message to the global conversation
 * @deprecated Use addAssistantMessageToSnapshot instead
 */
export function addAssistantMessage(message: ConversationMessage) {
    conversation.push({
        type: "message",
        role: "assistant",
        status: "completed",
        content: JSON.stringify(message)
    });
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
