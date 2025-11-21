# Testing the New Chatbot Features

## Setup

1. **Install Dependencies**
   ```bash
   cd /home/mester/Bedlessbot
   bun install
   ```

2. **Set Environment Variables**
   Add to your `.env` file:
   ```bash
   TAVILY_API_KEY=tvly-xxxxxxxxxxxxxxxxxxxxx
   ```

3. **Start the Bot**
   ```bash
   bun run dev  # For development mode with verbose logging
   # or
   bun run start  # For production mode
   ```

## Test Cases

### 1. Basic Conversation (No Search)
Tests that the chatbot works normally without triggering search.

**Input:**
```
@Bedlessbot What's the best bridging method in Minecraft?
```

**Expected Behavior:**
- Bot replies: "Please wait..."
- Bot thinks using existing knowledge
- Bot responds with information about bridging methods
- NO search should be triggered
- Response time: ~2-3 seconds

**Verification:**
- Check console logs (in dev mode) - should NOT see "Search decision: search"
- Response should be based on training data

---

### 2. Web Search (Real-time Information)
Tests the search decision mechanism and Tavily integration.

**Input:**
```
@Bedlessbot What's the current weather in London?
```

**Expected Behavior:**
1. Bot replies: "Please wait..."
2. Bot updates: "Searching the web..."
3. Bot updates: "Thinking..."
4. Bot responds with weather info + source links
- Response time: ~5-7 seconds

**Verification:**
- Check console logs: "Search decision: search"
- Response should include markdown links like `[Source](https://...)`
- Information should be current

---

### 3. Explicit Search Request
Tests that explicit search requests are detected.

**Input:**
```
@Bedlessbot Search for the latest Minecraft updates
```

**Expected Behavior:**
- Search is triggered
- Bot provides recent updates with sources
- Multiple sources cited

**Verification:**
- Console shows search was performed
- Response has multiple `[Source]` links

---

### 4. Discord Tool: Member Information
Tests the `get_member_information` tool.

**Input:**
```
@Bedlessbot Who is realmester?
```

**Expected Behavior:**
- Bot uses the `get_member_information` tool
- Bot responds with: username, display name, roles, join date, permissions
- Response time: ~3-4 seconds (includes tool call)

**Verification:**
- Console logs: "Tool call: get_member_information"
- Response includes member details from guild cache

**Alternative Inputs:**
```
@Bedlessbot Tell me about user 123456789
@Bedlessbot What roles does username have?
@Bedlessbot When did username join?
```

---

### 5. Conversation Summary
Tests the summary generation feature.

**Setup:**
Have at least 10 messages in the channel before testing.

**Input:**
```
@Bedlessbot Summarize the conversation
```

**Expected Behavior:**
1. Bot asks: "Are you sure you want to generate a summary?" (Yes/No buttons)
2. Click "Yes"
3. Bot: "Generating summary..."
4. Bot provides casual summary mentioning participants

**Verification:**
- Try again within 15 minutes → should get cooldown message
- Summary should mention usernames in backticks: `username`

---

### 6. Image Analysis
Tests image understanding capability.

**Input:**
Attach an image + message:
```
@Bedlessbot What's in this image?
[attachment: screenshot.png]
```

**Expected Behavior:**
- Bot analyzes the image
- Bot describes what it sees
- Works with PNG, JPEG, WebP, GIF

**Verification:**
- Response should describe the image content
- Try with different image types

---

### 7. Conversation Context
Tests that the bot remembers conversation history.

**Input Sequence:**
```
User: @Bedlessbot My name is TestUser
Bot: [responds acknowledging the statement]

User: @Bedlessbot What's my name?
Bot: [should refuse to use the name, uses username instead]
```

**Expected Behavior:**
- Bot should NOT use "TestUser"
- Bot should use the actual Discord username
- This tests the system prompt about impersonation

**Verification:**
- Bot maintains conversation history
- Bot follows system prompt rules

---

### 8. Error Handling: Invalid Member
Tests error handling in Discord tools.

**Input:**
```
@Bedlessbot Who is nonexistent_user_12345?
```

**Expected Behavior:**
- Tool attempts to find member
- Tool returns error: "Member not found"
- Bot responds: "I couldn't find that member" or similar

**Verification:**
- No crashes
- Graceful error message

---

### 9. Multiple Tools in Conversation
Tests using multiple features in one conversation.

**Input Sequence:**
```
User: @Bedlessbot Who is the admin realmester?
Bot: [uses get_member_information tool]

User: @Bedlessbot What's the latest news about Minecraft?
Bot: [uses web search]
```

**Expected Behavior:**
- First message uses Discord tool
- Second message uses web search
- Both in same conversation context

**Verification:**
- Conversation history preserved
- Different tools used appropriately

---

### 10. Clear Conversation History
Tests the clear conversation admin command.

**Setup:**
Have admin permissions.

**Input:**
```
@Bedlessbot clear-chat
```

**Expected Behavior:**
- Bot responds: "Successfully cleared the chatbot history."
- Next message starts fresh conversation

**Verification:**
- Try asking about something from before clear → bot shouldn't remember
- Console shows conversation array cleared (in dev mode)

---

## Development Mode Testing

Enable verbose logging:
```bash
NODE_ENV=development bun run src/index.ts
```

**Console Output to Watch For:**

1. **Search Decision:**
   ```
   Search decision: search for query: [user query]
   Search results: 5
   Search context: [formatted results]
   ```

2. **Tool Calls:**
   ```
   Tool call: get_member_information Result: { success: true, data: {...} }
   ```

3. **Token Usage:**
   ```
   Prompt tokens: 1234
   Cached tokens: 500
   ```

4. **Conversation State:**
   ```
   Conversation: [array of conversation entries]
   Parsed reply: { text: "..." }
   ```

---

## Performance Benchmarks

| Operation | Expected Time | Token Cost |
|-----------|--------------|------------|
| Basic reply (no search) | 2-3s | ~500-800 |
| With search | 5-7s | ~1500-2000 |
| With tool call | 3-4s | ~800-1200 |
| Summary generation | 4-6s | ~1000-1500 |
| Image analysis | 3-5s | ~1000-1500 |

---

## Troubleshooting

### Search Not Working
- Check `TAVILY_API_KEY` is set
- Verify Tavily account has credits
- Check console for error messages

### Tool Not Triggering
- Make sure query is specific enough
- Try rephrasing to be more explicit
- Check console logs for tool call attempts

### "An unexpected error has happened"
- Check OpenAI API key is valid
- Verify OpenAI account has credits
- Check console for detailed error

### Bot Not Responding
- Check queue is not stuck (restart bot)
- Verify message permissions
- Check channel is not in NoXPChannels

---

## Example Test Session

```
Terminal 1 (Bot):
$ NODE_ENV=development bun run src/index.ts
Starting development bot...
Logged in as Bedlessbot#1234!

Terminal 2 (Testing):
# Test 1: Basic conversation
User: @Bedlessbot What is drag clicking?

Console Output:
Search decision: no_search for query: What is drag clicking?
Prompt tokens: 456
Bot response: [explains drag clicking]

# Test 2: Search required
User: @Bedlessbot What's the weather in Tokyo?

Console Output:
Search decision: search for query: What's the weather in Tokyo?
Search results: 5
Search context: [weather data with sources]
Prompt tokens: 1823
Bot response: [weather info with source links]

# Test 3: Member info
User: @Bedlessbot Who is realmester?

Console Output:
Tool call: get_member_information Result: { success: true, data: { ... } }
Prompt tokens: 982
Bot response: [member information]

✅ All tests passed!
```

---

## Additional Testing Tips

1. **Rate Limiting:** Don't spam too fast, queue processes one at a time
2. **Token Costs:** Monitor OpenAI dashboard for usage
3. **Search Quality:** Tavily works best with specific queries
4. **Tool Usage:** AI decides tools automatically, don't force it
5. **Conversation Limit:** After 50 messages, oldest are dropped

---

## Reporting Issues

If you find bugs:

1. Note exact input that caused the issue
2. Include console output (in dev mode)
3. Check error logs
4. Verify environment variables are set
5. Try clearing conversation history

Common fixes:
- Restart the bot
- Clear conversation: `@Bedlessbot clear-chat`
- Check API credentials
- Verify dependencies: `bun install`
