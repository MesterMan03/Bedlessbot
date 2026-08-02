export type ConversationMessage = {
    messageId: string;
    userId: string;
    username: string;
    content: string;
    channelId: string;
    date: string;
};

export type DiscordToolResult = {
    success: boolean;
    data?: unknown;
    error?: string;
};
