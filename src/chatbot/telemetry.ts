import type OpenAI from "openai";

type ChatbotMetric = {
    requestId: string;
    operation: "chat" | "summary";
    model: string;
    durationMs: number;
    iterations?: number;
    toolCalls?: string[];
    error?: string;
    usage?: OpenAI.Responses.ResponseUsage | null;
    inputTokens?: number;
    cachedInputTokens?: number;
    cacheWriteTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
};

export function recordChatbotMetric(metric: ChatbotMetric) {
    const usage = metric.usage;
    console.info(
        JSON.stringify({
            event: "chatbot.request",
            ...metric,
            inputTokens: metric.inputTokens ?? usage?.input_tokens,
            cachedInputTokens: metric.cachedInputTokens ?? usage?.input_tokens_details?.cached_tokens,
            cacheWriteTokens: metric.cacheWriteTokens ?? usage?.input_tokens_details?.cache_write_tokens,
            outputTokens: metric.outputTokens ?? usage?.output_tokens,
            reasoningTokens: metric.reasoningTokens ?? usage?.output_tokens_details?.reasoning_tokens
        })
    );
}
