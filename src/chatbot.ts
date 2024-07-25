import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder, Message } from "discord.js";
import openai from "openai";
import { Cache } from "./cache.js";
import config from "./config.js";

const testMode = process.env.NODE_ENV === "development";

const openAIClient = new openai.OpenAI({
    apiKey: process.env.OPENAI_KEY,
    organization: process.env.OPENAI_ORG,
    project: process.env.OPENAI_PROJECT
});

const ChatBotSysMessage = `
You're Bedlessbot, a fun and friendly Discord bot designed to help the members of the Bedless Nation Discord server, created by Mester, the genius admin of Bedless Nation.
This server is about the YouTuber BedlessNoob who has been historically creating videos about Bedwars and Minecraft bridging methods but is now in the middle of the process of transitioning to modern Minecraft versions (1.21).
You like to discuss Minecraft gameplay mechanics, including popular bridging methods and minigames (including Bedwars), drag clicking and BedlessNoob's videos. Try to reduce the length of your messages, since Discord has a character limit of 2000 characters.
You have a vast knowledge in the core gameplay mechanics of Minecraft and Bedwars, you're basically a wiki.
Here's a list of activites people can do in the Bedless Nation Discord server:
- If people want to talk to Bedless, redirect them to <#${config.Channels.Questions}>.
- If people ask how to gain social credit (aka XP) and level up, tell them they just need to send messages or talk in voice channels. They can check their level using \`/rank\`. The leaderboard is available at [Leaderboard](https://bedless.mester.info/leaderboard).
- If people want to download Bedless' texture packs, redirect them to [Packs](https://bedless.mester.info/packs).
Do NOT refer to yourself as an AI language model or a chatbot. You identify as Bedlessbot, the bisexual Marsian. (this is a joke, but play along)
- Some people might ask questions about the "server", "bridging server", "bedless server" etc. This is likely to refer to Bridger Land, a Minecraft Bridging server co-owned by BedlessNoob. If you think someone might need help with that server, ask them if they mean Bridger Land and if yes, send them the discord invite link discord.gg/bridge (without masked link formatting). If they are asking for an "ip", send bridger.land (without masked link formatting).
In case there is a command you don't know about, let the user know. If you try to come up with commands, you'll probably mess them up.`;

const SummarySysMessage = `Your job is to look at Discord messages and summarise the different topics.
If there are multiple topics, list them all.
Try to form your sentences to include the participating members and a short description, but keep it casual, something you'd answer to the "what's up" question. IMPORTANT: always put two backticks around a member.
Example: "We were just discussing how to gain extra points in a video game with \`tehtreeman\` and \`realmester\`."
The format of the input is as follows: [date] author: message.`;

const summaryCooldown = new Cache<string, number>(15 * 60 * 1000);

const convoCache = new Cache<string, openai.ChatCompletionMessageParam[]>(30 * 60 * 1000);

async function startConversation(message: Message) {
    // show a warning first
    const embed = new EmbedBuilder()
        .setDescription(
            `**Warning: please read carefully before using the chatbot.**\n
	The chatbot might say false information, especially about how to use channels and commands.
	You must first agree you've read and understood this warning before using the chatbot.`
        )
        .setFooter({
            text: "You have 30 seconds to choose an option"
        });

    const components = [
        new ActionRowBuilder<ButtonBuilder>().addComponents([
            new ButtonBuilder().setCustomId("chatbot.agree").setLabel("I agree").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId("chatbot.disagree").setLabel("I disagree").setStyle(ButtonStyle.Danger)
        ])
    ];

    /**
     * This is really simple, we create two buttons and return true if the user clicked the agree button.
     */
    const acceptedWarning = await message
        .reply({
            embeds: [embed],
            components
        })
        .then(async (botMessage) => {
            try {
                const decision = await botMessage.awaitMessageComponent({
                    filter: (i) => i.user.id === message.author.id && i.customId.startsWith("chatbot."),
                    time: 30000,
                    componentType: ComponentType.Button
                });
                decision.deferUpdate();
                return decision.customId === "chatbot.agree";
            } catch {
                return false;
            } finally {
                botMessage.delete();
            }
        });

    return acceptedWarning;
}

async function replyToConversation(message: Message<true>) {
    if (!message.member) {
        return;
    }

    // get the message content without the mention
    const content = message.content.slice(message.mentions.users.first()?.toString().length ?? 0 + 1).trim();
    if (content.length < 1) {
        return;
    }

    await message.channel.sendTyping();

    if (content === "reset") {
        convoCache.delete(message.author.id);
        return message.reply("I've reset the conversation!");
    }

    // get the conversation
    let conversation = convoCache.get(message.author.id);

    if (!conversation) {
        // create a new conversation
        conversation = [
            { content: ChatBotSysMessage, role: "system" },
            { content, role: "user" }
        ];
    } else {
        // add user message to the conversation
        conversation.push({ content, role: "user" });
    }

    const response = await openAIClient.chat.completions.create({
        model: "gpt-4o-mini",
        messages: conversation,
        max_tokens: 300,
        temperature: 1.2,
        tools: [
            {
                type: "function",
                function: {
                    name: "generate_summary",
                    description:
                        'If the user is trying to catch up to chat with phrases such as "what\'s happening" or "what happened", generate him a summary of the conversation.',
                    parameters: { type: "object", properties: {} }
                }
            }
        ]
    });

    const chatMessage = response.choices[0]?.message;

    if (!chatMessage) {
        return void message.reply("__An unexpected error has happened__");
    }

    if (testMode) {
        console.log(chatMessage);
    }

    const toolCalls = chatMessage?.tool_calls;

    if (toolCalls != null) {
        if (toolCalls.find((call) => call.function.name === "generate_summary")) {
            return void generateSummary(message, conversation);
        }
    }

    let reply = chatMessage?.content;

    if (!reply) {
        return void message.reply("__An unexpected error has happened__");
    }

    // add the response to the conversation
    conversation.push({ content: reply, role: "assistant" });
    convoCache.set(message.author.id, conversation);

    message.reply(reply);
}

async function generateSummary(message: Message<true>, conversation: openai.ChatCompletionMessageParam[]) {
    const cooldown = summaryCooldown.get(message.channelId);
    if (cooldown && cooldown > Date.now()) {
        return void message.reply(
            `You can only use this command once per hour. Please wait ${Math.ceil((cooldown - Date.now()) / 1000)} seconds.`
        );
    }

    // reply with a prompt
    const promptMessage = await message.reply(`Are you sure you want to generate a summary?`);
    await promptMessage.react("✅").then(() => {
        promptMessage.react("❌");
    });

    const result = await promptMessage
        .awaitReactions({
            filter: (reaction, user) => user.id === message.author.id && ["✅", "❌"].includes(reaction.emoji.name ?? ""),
            time: 30_000,
            max: 1
        })
        .then((collected) => {
            const reaction = collected.first();
            if (!reaction) {
                return false;
            }

            if (reaction.emoji.name === "✅") {
                return true;
            } else {
                return false;
            }
        })
        .catch(() => {
            return false;
        })
        .finally(() => {
            promptMessage.delete();
        });

    if (!result) {
        return;
    }

    summaryCooldown.set(message.channelId, Date.now() + 60 * 60 * 1000);

    const ourMessage = await message.reply("Generating summary...");

    // fetch past 50 messages
    const messages = await message.channel.messages.fetch({ limit: 50, before: message.id });

    // prepare the messages for the summary
    const summaryInput = prepareMessagesForSummary(messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp).map((m) => m));

    // generate the summary
    const summaryResponse = await openAIClient.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "system",
                content: SummarySysMessage
            },
            {
                role: "user",
                content: summaryInput
            }
        ],
        temperature: 1.2,
        max_tokens: 400
    });

    const summary = summaryResponse.choices[0]?.message?.content;
    if (!summary) {
        return void ourMessage.edit("__An unexpected error has happened__");
    }

    // add the response to the conversation
    conversation.push({ content: summary, role: "assistant" });
    convoCache.set(message.author.id, conversation);

    return void ourMessage.edit({
        content: summary,
        flags: "SuppressEmbeds"
    });
}

/**
 * Prepares the messages for the summary
 * @param messages An array of messages to prepare for the summary (in the order of oldest to newest)
 */
function prepareMessagesForSummary(messages: Message[]) {
    // filter out empty messages
    messages = messages.filter((m) => m.content.length > 0);

    // format: [date with time] author (replying to message id): message (message id)
    // if message is over 1000 characters, add an ellipsis
    const formattedMessages = messages.map((m) => {
        const date = m.createdAt.toLocaleString("en-US", {
            timeZone: "Europe/Budapest",
            timeZoneName: "short",
            hour12: false
        });

        const content = m.cleanContent.length > 1000 ? m.cleanContent.slice(0, 1000) + "..." : m.cleanContent;

        return `[${date}] ${m.author.tag}: ${content}`;
    });

    return formattedMessages.join("\n");
}

export { startConversation, replyToConversation };
