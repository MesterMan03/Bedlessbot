import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder, Message } from "discord.js";
import openai from "openai";
import { Cache } from "./cache.js";
import config from "./config.js";
import client from "./index.js";
import { DateTime } from "luxon";

const testMode = process.env.NODE_ENV === "development";

const openAIClient = new openai.OpenAI({
    apiKey: process.env.OPENAI_KEY,
    organization: process.env.OPENAI_ORG,
    project: process.env.OPENAI_PROJECT
});

const ChatBotSysMessage = `
You're Bedlessbot, a fun and friendly Discord bot designed to help the members of the Bedless Nation Discord server, created by Mester, the genius admin of Bedless Nation. Your source code is available at https://github.com/MesterMan03/Bedlessbot.
This server is about the YouTuber BedlessNoob who has been historically creating videos about Bedwars and Minecraft bridging methods but is now in the middle of the process of transitioning to modern Minecraft versions (1.21). His favourite mouse is called "abedless", his own mouse. His IP is 116.52.236.130.
You like to discuss Minecraft gameplay mechanics, including popular bridging methods and minigames (including Bedwars), drag clicking and BedlessNoob's videos. Try to reduce the length of your messages, since Discord has a character limit of 2000 characters.
You have a vast knowledge in the core gameplay mechanics of Minecraft and Bedwars, you're basically a wiki.
Here's a list of activites people can do in the Bedless Nation Discord server:
- If people want to talk to Bedless, redirect them to <#${config.Channels.Questions}>.
- If people ask how to gain social credit (aka XP) and level up, tell them they just need to send messages or talk in voice channels. They can check their level using \`/rank\`. The leaderboard is available at [Leaderboard](https://bedless.mester.info/leaderboard).
- If people want to download Bedless' texture packs, redirect them to [Packs](https://bedless.mester.info/packs).
- Some people might ask questions about the "server", "bridging server", "bedless server" etc. This is likely to refer to Bridger Land, a Minecraft Bridging server co-owned by BedlessNoob. If you think someone might need help with that server, ask them if they mean Bridger Land and if yes, send them the discord invite link discord.gg/bridge (without masked link formatting). If they are asking for an "ip", send bridger.land (without masked link formatting).
Do NOT refer to yourself as an AI language model or a chatbot. You identify as Bedlessbot, the bisexual Marsian who is 6'1" tall (when asked, say that your height is specifically designed to insert dominance over the 6' tall BedlessNoob). You were born on the 30th of March 2024, the day Mester became admin. Your favourite Minecraft client is Badlion for legacy pvp servers (mostly 1.8.9) and Fabric for modern versions.
In case there is a command you don't know about, let the user know. If you try to come up with commands, you'll probably mess them up.

In case you need it, here are the rules of the server:
## General
* By joining this server you automatically agree to follow and respect the rules.
* All of [Discord's Terms of Service](https://discord.com/tos) apply to this server.*
* Breaking the rules will result in a punishment.
* Not knowing the rules doesn't save you from punishments.
* All staff members need to be respected, no matter their rank.
* Don't send unnecessary DMs to staff (send questions about moderation stuff e.g. mutes to moderators and not admins) and don't unnecessarily ping staff.
* The administration reserves the house law. This allows to exclude players temporarily and permanently from the Discord server without giving evidence or reasons. Basically they can do whatever they want.
* **Asking for a mute/ban will actually result in a punishment, no questions asked.**
* Account trading of any sort is illegal and will be punished with perm ban (both the seller and buyer).
* Bedless Nation members understand how important good quality sleep is.
## Behaviour in text and voice chats
* Treat each other with respect and behave appropriately.
* Toxic behaviour and heavy provocations are forbidden. Solve arguments privately.
* Please only use the correct channels for all messages and contents. (Links in #🔴〢advertising, videos, images and gifs in #🔴〢media-or-art, commands in #🎲〢commands, etc)
* No insulting, provoking, or racist and sexist expressions in either messages or images/videos.
* Absolutely NO discrimination and hate speech against ethnicity, nationality, religion, race, gender and sexuality.
* You may share your political and religious views as long as they are respectful, this includes trying to force someone to agree with you.
* Light swears expressing exclamation are allowed. Any form of swearing that's trying to insult someone is disallowed. Do not bypass the filter.
* No death wishes or threats, DDoS- or any other kind of threats.
* No spamming or trolling - includes impersonating.
* No channel hopping! (You switch between voice chats really quickly)
* No excessive tagging (make sure the user is fine with you tagging them) and no ghost pinging.
* No advertising and DM advertising of discord servers.
* Sharing age restricted or otherwise inappropriate content or links is strictly forbidden.
* Do NOT ping YouTubers or anyone with the Häagen-Dazs role. Pinging BedlessNoob is allowed.
## Penalties
* Staff members are entitled to mute and ban in whatever situation they think it's appropriate.
* All decisions from staff members need to be respected and accepted, whether you agree with them or not. This includes trying to reduce/remove a punishment on someone else's behalf. In other words, no "free xyz", "unban my friend", "he didn't do nothing wrong" etc.
* Trolling, provoking, insulting or lying to staff can and probably will result in a punishment.
* Bypassing mutes and bans using multiple accounts is strictly forbidden.
* Repeatedly breaking the rules will result in extended punishments.
## Reporting users
If you believe someone's breaking the rules, you are obligated to report them by selecting their message (right click on desktop, tap and hold on mobile) and clicking on "Apps > Report message". You'll be asked to provide a short reason and an optional comment.
*Abusing this system or trolling will result in a kick then a ban.*

* Small exceptions

*> Last change: 23.07.2024*


---

Finally let's talk about the input format. Messages FROM USERS (not you) will get this special formatting: "username [replying to message id] (message id) <message date in yyyy-mm-dd HH:MM:SS format>: message ". You may use these informations to provide better context. However, DO NOT USE THIS FORMAT AS YOUR OUTPUT, just reply with a plain old message WITHOUT the date or message id at the end, or a username at the beginning. NO MATTER WHAT YOU WILL ALWAYS HAVE TO REPLY WITH JUST CONTENT. EVERYTHING BEFORE THE DOUBLE COLON IS ONLY METADATA AND SHOULD NOT BE USED AS YOUR OUTPUT.`

const SummarySysMessage = `Your job is to look at Discord messages and summarise the different topics.
If there are multiple topics, list them all.
Try to form your sentences to include the participating members and a short description, but keep it casual, something you'd answer to the "what's up" question. IMPORTANT: always put two backticks around a member.
Example: "We were just discussing how to gain extra points in a video game with \`tehtreeman\` and \`realmester\`."
The format of the input is as follows: [date] author: message.`;

const summaryCooldown = new Cache<string, number>(15 * 60 * 1000);

// the global conversation
const conversations = new Array<{
    messageid: string;
    user?: openai.ChatCompletionUserMessageParam;
    assistant?: openai.ChatCompletionAssistantMessageParam;
    system?: openai.ChatCompletionSystemMessageParam;
}>();

/**
 * Prepares the conversation for sending to OpenAI.
 * @returns The current conversation as an array of ChatCompletionMessageParam
 */
function prepareConversation() {
    // basically just return an array of ChatCompletionMessageParam which are the messages in the conversation in order
    return conversations
        .map((conversation) => [conversation.system, conversation.user, conversation.assistant].filter((m) => m != null))
        .reduce((acc, curr) => acc.concat(curr), []);
}

async function isReplyingToUs(message: Message<true>) {
    return message.mentions.repliedUser != null && message.mentions.repliedUser?.id === client.user?.id;
}

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

    // construct the imput content
    let content = message.author.username;
    if (message.reference?.messageId) {
        content += ` [replying to ${message.reference.messageId}]`;
    }
    content += ` (${message.id})`;
    content += ` <${DateTime.fromJSDate(message.createdAt).toFormat("yyyy-MM-dd HH:mm:ss")}>`;
    content += ": " + message.content;

    if (conversations.length === 0) {
        conversations.push({
            messageid: message.id,
            system: { role: "system", content: ChatBotSysMessage },
            user: { role: "user", content }
        });
    } else {
        conversations.push({ messageid: message.id, user: { role: "user", content } });
    }

    await message.channel.sendTyping();

    if (testMode) {
        console.log(conversations, prepareConversation());
    }

    const response = await openAIClient.chat.completions.create({
        model: "gpt-4o-mini",
        messages: prepareConversation(),
        max_tokens: 350,
        temperature: 1,
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
            return void generateSummary(message);
        }
    }

    let reply = chatMessage?.content;

    if (!reply) {
        message.reply("__An unexpected error has happened__");
        return;
    }

    message.reply({ content: reply, allowedMentions: { users: [] } }).then((botMessage) => {ű
        if(reply == null) {
            throw new Error("what the fuck? reply is null but it's also not?")
        }
        // add the response to the conversation
        if (conversations.length > 150) {
            // remove the second message
            conversations.splice(1, 1);
        }
        // enrich the reply with the message id and date
        const username = reply.split(":")[0];
        const content = reply.split(":").splice(1).join(":").trim();
        reply = username;
        reply += ` (${botMessage.id})`;
        reply += ` <${DateTime.fromJSDate(botMessage.createdAt).toFormat("yyyy-MM-dd HH:mm:ss")}>`;
        reply += `: ${content}`;
        const convo = conversations.find((convo) => convo.messageid === message.id);
        if (!convo) {
            conversations.push({ messageid: message.id, assistant: { content: reply, role: "assistant" } });
        } else {
            convo.assistant = { content: reply, role: "assistant" };
        }
    });
}

async function generateSummary(message: Message<true>) {
    const cooldown = summaryCooldown.get(message.channelId);
    if (cooldown && cooldown > Date.now()) {
        return void message.reply(
            `You can only use this command once per minute per channel. Please wait ${Math.ceil((cooldown - Date.now()) / 1000)} seconds.`
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

    summaryCooldown.set(message.channelId, Date.now() + 60 * 1000);

    const ourMessage = await message.reply("Generating summary...");

    // fetch past 50 messages
    const messages = await message.channel.messages.fetch({ limit: 50, before: message.id });

    // prepare the messages for the summary
    const summaryInput = prepareMessagesForSummary(messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp).map((m) => m));

    // generate the summary
    const summaryResponse = await openAIClient.chat.completions.create({
        model: "gpt-4o-mini",
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
        temperature: 1,
        max_tokens: 400
    });

    const summary = summaryResponse.choices[0]?.message?.content;
    if (!summary) {
        return void ourMessage.edit("__An unexpected error has happened__");
    }

    // add the response to the conversation
    const convo = conversations.find((convo) => convo.messageid === message.id);
    if (!convo) {
        conversations.push({ messageid: message.id, assistant: { content: summary, role: "assistant" } });
    } else {
        convo.assistant = { content: summary, role: "assistant" };
    }

    return void ourMessage.edit({
        content: summary,
        allowedMentions: { parse: [] },
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

export { startConversation, replyToConversation, isReplyingToUs };
