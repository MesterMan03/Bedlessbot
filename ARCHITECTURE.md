# Chatbot Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Discord User                             │
└────────────────────────┬────────────────────────────────────────┘
                         │ Mentions bot / Replies to bot
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    src/index.ts (Main Bot)                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  processSelfPing() → showChatBotWarning()                │   │
│  │                    → addChatBotMessage()                  │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              src/chatbot/index.ts (Public API)                   │
│  - isReplyingToUs()                                              │
│  - showChatBotWarning()                                          │
│  - addChatBotMessage()                                           │
│  - ClearConversation()                                           │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│               src/chatbot/queue.ts (Queue Manager)               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Message Queue: [msg1, msg2, msg3, ...]                  │   │
│  │  executeQueue() → processes one at a time                │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│          src/chatbot/main.ts (Core Logic)                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  replyToChatBotMessage()                                  │   │
│  │    1. Extract message content & images                    │   │
│  │    2. Check if search needed ──────┐                      │   │
│  │    3. Add to conversation          │                      │   │
│  │    4. Send to OpenAI ──────────────┼────┐                │   │
│  │    5. Handle tool calls            │    │                │   │
│  │    6. Format & send response       │    │                │   │
│  └────────────────────────────────────┼────┼────────────────┘   │
└─────────────────────────────────────┬─┼────┼──────────────┬─────┘
                                      │ │    │              │
                    ┌─────────────────┘ │    │              └──────────────┐
                    │                   │    │                             │
                    ▼                   ▼    ▼                             ▼
        ┌───────────────────┐  ┌───────────────┐            ┌──────────────────────┐
        │ search.ts         │  │ OpenAI API    │            │ tools.ts             │
        │ ┌───────────────┐ │  │ ┌───────────┐ │            │ ┌──────────────────┐ │
        │ │shouldSearch() │ │  │ │GPT-4o-mini│ │            │ │discordTools[]    │ │
        │ │   ↓           │ │  │ │           │ │            │ │                  │ │
        │ │performSearch()│ │  │ │Structured │ │            │ │get_member_info() │ │
        │ │   ↓           │ │  │ │Output     │ │            │ │                  │ │
        │ │Tavily API     │ │  │ │           │ │            │ │executeDiscordTool│ │
        │ │   ↓           │ │  │ │Tool Calls │ │            │ │      ↓           │ │
        │ │formatResults()│ │  │ └───────────┘ │            │ │Guild.members     │ │
        │ └───────────────┘ │  └───────────────┘            │ └──────────────────┘ │
        └───────────────────┘                               └──────────────────────┘
                    │                   │                             │
                    └───────────────────┼─────────────────────────────┘
                                        ▼
                        ┌───────────────────────────────┐
                        │ conversation.ts               │
                        │ ┌───────────────────────────┐ │
                        │ │ conversations[] (state)   │ │
                        │ │   - system messages       │ │
                        │ │   - user messages         │ │
                        │ │   - assistant messages    │ │
                        │ │ Max: 50 messages          │ │
                        │ └───────────────────────────┘ │
                        │ prepareConversation()         │
                        │ addSystemMessage()            │
                        │ addUserMessage()              │
                        │ addAssistantMessage()         │
                        └───────────────────────────────┘

                        ┌───────────────────────────────┐
                        │ summary.ts                    │
                        │ ┌───────────────────────────┐ │
                        │ │ generateSummary()         │ │
                        │ │   - Fetch 50 messages     │ │
                        │ │   - Format for GPT        │ │
                        │ │   - Generate casual       │ │
                        │ │     summary               │ │
                        │ │ 15 min cooldown/channel   │ │
                        │ └───────────────────────────┘ │
                        └───────────────────────────────┘

Flow Example: User asks "What's the weather in NYC?"
═══════════════════════════════════════════════════════

1. User: @Bedlessbot What's the weather in NYC?
2. index.ts: addChatBotMessage(message)
3. queue.ts: Add to queue → executeQueue()
4. main.ts: replyToChatBotMessage()
   - Bot replies: "Please wait..."
5. search.ts: shouldSearch("What's the weather in NYC?")
   - Decision model: "search" (needs real-time data)
   - Bot updates: "Searching the web..."
6. search.ts: performSearch() → Tavily API
   - Returns: [{title: "NYC Weather", content: "...", url: "..."}]
7. conversation.ts: Add system message with search context
8. main.ts: Send to OpenAI with search context
   - Bot updates: "Thinking..."
9. OpenAI: Returns response using search context
10. main.ts: Format response with source links
11. conversation.ts: Add assistant response to history
12. Bot sends final message to user with weather info + sources
```

## Key Design Decisions

### 1. **Separation of Concerns**
- Each file has a single responsibility
- Makes testing and debugging easier
- Allows independent updates

### 2. **Queue System**
- Prevents concurrent API calls
- Ensures messages are processed in order
- Avoids rate limiting issues

### 3. **Smart Search**
- Decision model prevents unnecessary searches
- Saves API costs (both Tavily & OpenAI)
- Better UX with clear status updates

### 4. **Tool Framework**
- Extensible: Easy to add new tools
- Type-safe: Full TypeScript support
- Integrated: AI decides when to use tools

### 5. **State Management**
- Centralized conversation history
- Automatic cleanup (50 message limit)
- Thread-safe (single queue executor)
