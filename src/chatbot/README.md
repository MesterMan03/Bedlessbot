# Chatbot Module

This directory contains the modular chatbot implementation for Bedlessbot.

## Structure

- **`index.ts`** - Public API exports
- **`main.ts`** - Main chatbot logic and message handling
- **`conversation.ts`** - Per-channel, persistent conversation state and request serialization
- **`summary.ts`** - Conversation summary generation
- **`client.ts`** - Shared OpenAI client configuration
- **`telemetry.ts`** - Structured request and token metrics
- **`tools.ts`** - Discord-specific tools the AI can invoke
- **`constants.ts`** - System prompts and configuration
- **`types.ts`** - TypeScript type definitions

## Features

### 1. Web Search
The chatbot can search the web using Tavily when it needs real-time information:
- The main model decides whether live web data is needed
- Tavily performs the search through MCP
- Results are formatted with proper source citations
- The AI uses this context to provide accurate, up-to-date information

**Environment variable required:** `TAVILY_API_KEY`

### 2. Discord Tools
The chatbot has access to Discord-specific tools:
- **`get_member_information`** - Fetches member details from the guild cache
  - Can search by user ID or username
  - Returns roles, join date, permissions, etc.

### 3. Conversation Management
- Isolates history by guild and channel/thread
- Persists history in SQLite and serializes concurrent requests per conversation
- Deletes persisted turns and compacted summaries 30 days after their original Discord message timestamp
- Excludes chatbot conversation content from database backups
- Compacts complete older turns when the estimated context exceeds 24,000 tokens
- Supports image analysis
- Handles metadata for proper context

### 4. Summary Generation
- Users can ask for conversation summaries
- Has a 15-minute cooldown per channel
- Generates casual summaries with participating members

## Usage

```typescript
import { addChatBotMessage, showChatBotWarning, ClearConversation, isReplyingToUs } from "./chatbot/index.js";

// Add a message to the chatbot queue
addChatBotMessage(message);

// Show warning to new users
const accepted = await showChatBotWarning(message);

// Clear conversation history
ClearConversation();

// Check if replying to the bot
const replying = await isReplyingToUs(message);
```

## Environment Variables

- `OPENAI_KEY` - OpenAI API key
- `OPENAI_ORG` - OpenAI organization ID
- `OPENAI_PROJECT` - OpenAI project ID
- `TAVILY_API_KEY` - Tavily API key for web search
- `NODE_ENV` - Set to "development" for verbose logging

## Adding New Tools

To add a new Discord tool:

1. Add the tool definition to `discordTools` array in `tools.ts`
2. Create the implementation function
3. Add a case in `executeDiscordTool()` switch statement

Example:
```typescript
{
    type: "function" as const,
    function: {
        name: "my_new_tool",
        description: "What this tool does",
        parameters: {
            type: "object",
            properties: {
                param1: {
                    type: "string",
                    description: "Parameter description"
                }
            },
            required: ["param1"],
            additionalProperties: false
        },
        strict: true
    }
}
```

## Models Used

- **Main chatbot:** `gpt-5.6-luna`
- **Summary generation:** `gpt-5.6-luna`
