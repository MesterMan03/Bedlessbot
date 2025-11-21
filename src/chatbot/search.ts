import { tavily } from "@tavily/core";
import openai from "openai";
import { SearchDecisionModel, SearchDecisionPrompt, TEST_MODE } from "./constants.js";
import type { SearchResult } from "./types.js";

const tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY });

const openAIClient = new openai.OpenAI({
    apiKey: process.env.OPENAI_KEY,
    organization: process.env.OPENAI_ORG,
    project: process.env.OPENAI_PROJECT
});

/**
 * Determines if a search is needed for the given query
 */
export async function shouldSearch(query: string): Promise<boolean> {
    const response = await openAIClient.chat.completions.create({
        model: SearchDecisionModel,
        messages: [
            { role: "system", content: SearchDecisionPrompt },
            { role: "user", content: query }
        ],
        response_format: {
            type: "json_schema",
            json_schema: {
                name: "SearchDecision",
                schema: {
                    type: "object",
                    properties: {
                        search: {
                            type: "boolean",
                            description: "True if a web search is needed to answer the query, otherwise false."
                        }
                    },
                    required: ["search"],
                    additionalProperties: false
                },
                strict: true
            }
        },
        temperature: 0
    });

    const output = response.choices[0]?.message?.content;

    const parsed = (output ? JSON.parse(output) : {}) as { search?: boolean };
    const decision = parsed.search === true;

    if (TEST_MODE) {
        console.log("Search decision:", decision, "for query:", query);
    }

    return decision;
}

/**
 * Performs a web search using Tavily
 */
export async function performSearch(query: string): Promise<SearchResult[]> {
    try {
        const response = await tavilyClient.search(query, {
            maxResults: 5,
            searchDepth: "basic",
            includeAnswer: false
        });

        if (TEST_MODE) {
            console.log("Search results:", response.results.length);
        }

        return response.results.map((result) => ({
            title: result.title,
            url: result.url,
            content: result.content,
            score: result.score
        }));
    } catch (error) {
        console.error("Search error:", error);
        return [];
    }
}

/**
 * Formats search results into a context string for the AI
 */
export function formatSearchResults(results: SearchResult[]): string {
    if (results.length === 0) {
        return "No search results found.";
    }

    let formatted = "Here are the search results:\n\n";

    for (const result of results) {
        formatted += `**${result.title}**\n`;
        formatted += `Source: ${result.url}\n`;
        formatted += `${result.content}\n\n`;
    }

    formatted +=
        "\nPlease use this information to answer the user's question. Make sure to cite sources using markdown links when referencing specific information.";

    return formatted;
}
