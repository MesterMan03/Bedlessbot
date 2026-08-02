import OpenAI from "openai";

export const openAIClient = new OpenAI({
    apiKey: process.env.OPENAI_KEY,
    organization: process.env.OPENAI_ORG,
    project: process.env.OPENAI_PROJECT,
    maxRetries: 2,
    timeout: 85_000
});
