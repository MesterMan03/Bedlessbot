export function isSummaryRequest(query: string) {
    const normalized = query.trim().toLowerCase();
    return (
        /\b(catch\s+(?:me|us)\s+up|fill\s+(?:me|us)\s+in|what\s+did\s+i\s+miss)\b/.test(normalized) ||
        (/\b(summary|summarize|recap)\b/.test(normalized) &&
            /\b(chat|conversation|messages?|channel|discussion|recent|today)\b/.test(normalized)) ||
        /^(?:so,?\s*)?what(?:'s| is)\s+going\s+on[?!.]*$/.test(normalized) ||
        /^what\s+happened(?:\s+(?:here|in\s+(?:chat|the\s+channel)|while\s+i\s+was\s+away))?[?!.]*$/.test(normalized)
    );
}
