import type { Message } from "discord.js";
import type openai from "openai";

export type ConversationEntry = {
    messageid: string;
    user?: openai.ChatCompletionUserMessageParam;
    assistant?: openai.ChatCompletionAssistantMessageParam;
    system?: openai.ChatCompletionSystemMessageParam;
};

export type ConversationMessage = {
    messageId: string;
    userId: string;
    username: string;
    content: string;
    channelId: string;
    date: string;
}

export type SearchResult = {
    title: string;
    url: string;
    content: string;
    score: number;
};

export type DiscordToolResult = {
    success: boolean;
    data?: unknown;
    error?: string;
};

export type MessageQueueItem = Message<true>;
