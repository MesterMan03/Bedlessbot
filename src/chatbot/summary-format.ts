import type OpenAI from "openai";

export function prepareConversationForSummary(conversation: OpenAI.Responses.ResponseInput) {
    return conversation
        .flatMap((item) => {
            if (item.type !== "message") {
                return [];
            }
            const role = item.role;
            if (role !== "user" && role !== "assistant") {
                return [];
            }
            const values = typeof item.content === "string" ? [item.content] : item.content.map(messageContentText).filter(Boolean);
            return values.map((value) => formatConversationMessage(value, role));
        })
        .filter(Boolean)
        .join("\n");
}

function messageContentText(content: { type: string; text?: string }) {
    return content.type === "input_text" || content.type === "output_text" ? (content.text ?? "") : "";
}

function formatConversationMessage(value: string, role: "user" | "assistant") {
    try {
        const message = JSON.parse(value) as { content?: unknown; username?: unknown; date?: unknown };
        if (typeof message.content !== "string" || message.content.length === 0) {
            return "";
        }
        const content = message.content.length > 1_000 ? `${message.content.slice(0, 1_000)}...` : message.content;
        const username = typeof message.username === "string" ? message.username : role === "assistant" ? "Bedlessbot" : "unknown";
        const date = typeof message.date === "string" ? `[${message.date}] ` : "";
        return `${date}${username}: ${content}`;
    } catch {
        const content = value.length > 1_000 ? `${value.slice(0, 1_000)}...` : value;
        return `${role === "assistant" ? "Bedlessbot" : "unknown"}: ${content}`;
    }
}
