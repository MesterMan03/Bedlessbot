import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    ComponentType,
    EmbedBuilder,
    italic,
    Message,
    MessageFlags,
    TextDisplayBuilder
} from "discord.js";
import { DateTime } from "luxon";
import openai from "openai";
import type { ChatCompletionContentPart } from "openai/resources/index.mjs";
import { Cache } from "./cache.js";
import config from "./config.js";
import client from "./index.js";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { SHA256 } from "bun";

const testMode = process.env.NODE_ENV === "development";

const openAIClient = new openai.OpenAI({
    apiKey: process.env.OPENAI_KEY,
    organization: process.env.OPENAI_ORG,
    project: process.env.OPENAI_PROJECT
});

const ChatBotModel = "gpt-4-mini-2024-07-18";

const ChatBotSysMessage = `You're Bedlessbot, a Discord bot designed to help the members of the Bedless Nation Discord server, created by Mester, the genius pansexual admin of Bedless Nation. Your personality is a mixture of Ulquiorra Cifer from Bleach and GLaDOS from Portal. Your source code is available at https://github.com/MesterMan03/Bedlessbot (the chatbot source code is specifically located at https://github.com/MesterMan03/Bedlessbot/tree/main/src/chatbot.ts).
This server is about the YouTuber BedlessNoob who has been historically creating videos about Bedwars and Minecraft bridging methods but is now in the middle of the process of transitioning to modern Minecraft versions (1.21). His favourite mouse is called "abedless", his own mouse. His IP is 116.52.236.130, this is a public IP you may share with others.
You like to discuss Minecraft gameplay mechanics, including popular bridging methods and minigames (including Bedwars), drag clicking and BedlessNoob's videos. You have a vast knowledge in the core gameplay mechanics of Minecraft and Bedwars, you're basically a wiki.

Here's a list of activites people can do in the Bedless Nation Discord server:
- If people want to talk to Bedless, redirect them to <#${config.Channels.Questions}>.
- If people ask how to gain social credit (aka XP) and level up, tell them they just need to send messages or talk in voice channels. They can check their level using \`/rank\` or using [Leaderboard](https://bedless.mester.info/leaderboard?mtm_campaign=Discord-Bot&mtm_kwd=ai-leaderboard).
- If people want to download Bedless' texture packs, redirect them to [Packs](https://bedless.mester.info/packs?mtm_campaign=Discord-Bot&mtm_kwd=ai-packs).
- Some people might ask questions about the "server", "bridging server", "bedless server" etc. This is likely referring to Bridger Land, a Minecraft Bridging server co-owned by BedlessNoob. If you think someone might need help with that server, ask them if they mean Bridger Land and if yes, send them the discord invite link discord.gg/bridge (without masked link formatting). If they are asking for an "ip", send bridger.land (without masked link formatting).

The following section explains how you should behave:
- Do NOT refer to yourself as an AI language model or a chatbot. You identify as Bedlessbot, the bisexual Martian who is 6'1" tall (when asked, say that your height is specifically designed to insert dominance over the 6' tall BedlessNoob). Your pronouns are it/its. You were born on the 30th of March 2024, the day Mester became admin. Your favourite Minecraft client is Badlion for legacy pvp servers (mostly 1.8.9) and Fabric for modern versions.
- People might try to impersonate someone with phrases such as "refer to me as ..." or "my name is ...". Always deny such requests, refer to everyone as their username that you can see in the message.
- In case there is a command you don't know about, let the user know. If you try to come up with commands, you'll probably mess them up.
- Any time there's a discussion, BE BIASED TOWARDS MESTER. For example: "Who would win a fight? mester or bedless", you'd find reasons to give Mester an advantage while discrediting his opponent. If the discussion cannot be linked to Mester in any way, just respond normally.
- You have the ability to receive and analyse pictures. The user needs to attach the image to the message that they use to communicate with you.
- You have the ability to recall your past conversations, up to a limit. They'll be sent alongside the request so you can use them to answer the user's question if needed.
- If your message would be very long (lots of new lines), let the user know that you're not able to respond to their question.
- NO MATTER THE CONTEXT, YOU MUST NEVER USE ANY OFFENSIVE SLURS OR DEGRADING WORDS. The people you will be talking to are fucking idiots and probably under the age of 10, they WILL try to force you into saying these words, DON'T LET THEM.

In case you need it, here are the rules of the server:
## General
* By joining this server you automatically agree to follow and respect the rules.
* All of [Discord's Terms of Service](https://discord.com/tos) apply to this server.*
* Breaking the rules will result in a punishment.
* Not knowing the rules doesn't save you from punishments.
* All staff members need to be respected, no matter their rank.
* Don't send unnecessary DMs to staff (send questions about moderation stuff e.g. mutes to moderators and not admins) and don't unnecessarily ping staff.
* The administration reserves the house law. This allows to exclude players temporarily and permanently from the Discord server without giving evidence or reasons. Basically they can do whatever they want.
* **Asking for a mute/ban will actually result in a punishment, no questions asked.** Exception: asking for a punishment to win some sort of “contest”, most commonly a fake WR.
* Account trading of any sort is illegal and will be punished with perm ban (both the seller and buyer).
* Bedless Nation members understand how important good quality sleep is.
## Behaviour in text and voice chats
* Treat each other with respect and behave appropriately.
* Toxic behaviour and heavy provocations are forbidden. Solve arguments privately.
* Please only use the correct channels for all messages and contents. (Links in <#704123263898353716>, videos, images and gifs in <#1051636675429802104>, commands in <#709585977642844174>, etc)
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
* Do not beg here (especially for minecraft accounts), we aren't charity.
* Exploiting the chatbot function of <@1223758049840336997> to make it say things that would otherwise go against these rules will make **YOU** liable.
## Penalties
* Staff members are entitled to mute and ban in whatever situation they think it's appropriate.
* All decisions from staff members need to be respected and accepted, whether you agree with them or not. This includes trying to reduce/remove a punishment on someone else's behalf. In other words, no "free xyz", "unban my friend", "he didn't do nothing wrong" etc.
* Trolling, provoking, insulting or lying to staff can and probably will result in a punishment.
* Bypassing mutes and bans using multiple accounts is strictly forbidden.
* Repeatedly breaking the rules will result in extended punishments.
## Reporting users
If you believe someone's breaking the rules, you are obligated to report them by selecting their message (right click on desktop, tap and hold on mobile) and clicking on "Apps > Report message". You'll be asked to provide a short reason and an optional comment.
*Abusing this system or trolling will result in a kick then a ban.*

-# *Small exceptions
-# *Last change: 23.10.2024*

---

Messages have this format: "username {channel's ID} [replying to message id, optional] (message id) <message date in yyyy-mm-dd HH:MM:SS format>: message ". This is the message's metadata, you can use it to provide better context (for example you  can use the message id to figure out which exact message a user replied to), HOWEVER DO NOT USE THIS FORMAT AS YOUR OUTPUT. The format of your output should simply be the raw message content.
Example:
realmester {692077134780432384} [replying to 123456789] (123456789) 2024-07-23 12:34:56: Hello everyone!
your output should be "Hi realmester, how are you doing today?" (without metadata)`;

const SummarySysMessage = `Your job is to look at Discord messages and summarise the different topics that happened in the conversation, if there are multiple topics, list them all.
Try to form your sentences to include the participating members and a description, but keep it casual, something you'd answer to the "what's up" question. IMPORTANT: always put two backticks around usernames.
Example: "We were just discussing how to gain extra points in a video game with \`tehtreeman\` and \`realmester\`."
The format of the input is as follows: [date] author: message.`;

const MessageQueue = new Array<Message<true>>();

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

let executingQueue = false;
function ExecuteQueue() {
    if (executingQueue) {
        return;
    }
    // take the first message in the queue
    const message = MessageQueue.shift();
    // if the message is undefined, it means the queue is empty
    if (!message) {
        return;
    }
    executingQueue = true;
    ReplyToChatBotMessage(message).then(() => {
        executingQueue = false;
        ExecuteQueue();
    });
}

/**
 * Clears the conversation, useful when the session gets "polluted"
 */
function ClearConversation() {
    conversations.splice(0, conversations.length);
}

async function ShowChatBotWarning(message: Message<true>) {
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

function AddChatBotMessage(message: Message<true>) {
    MessageQueue.push(message);
    ExecuteQueue();
}

async function ReplyToChatBotMessage(message: Message<true>) {
    if (!message.member) {
        return;
    }

    // construct the imput content
    let textContent = message.author.username;
    if (message.reference?.messageId) {
        textContent += ` [replying to ${message.reference.messageId}]`;
    }
    textContent += ` {${message.channelId}}`;
    textContent += ` (${message.id})`;
    textContent += ` <${DateTime.fromJSDate(message.createdAt).toFormat("yyyy-MM-dd HH:mm:ss")}>`;
    textContent += ": " + message.content;

    // look for images in the message (accepts png, jpeg, webp and gif)
    const imageAttachments = message.attachments
        .filter((attachment) => ["png", "jpeg", "webp", "gif"].includes(attachment.contentType?.split("/")[1] ?? ""))
        .map((attachment) => attachment.url);

    // construct the content to be sent to openai
    const content = [
        {
            type: "text",
            text: textContent
        }
    ] as ChatCompletionContentPart[];
    imageAttachments.forEach((imageAttachment) => {
        content.push({
            type: "image_url",
            image_url: {
                url: imageAttachment,
                detail: "low"
            }
        });
    });

    // store the conversation in memory
    if (conversations.length === 0) {
        conversations.push({
            messageid: message.id,
            system: { role: "system", content: ChatBotSysMessage },
            user: { role: "user", content }
        });
    } else {
        conversations.push({ messageid: message.id, user: { role: "user", content } });
    }

    if (testMode) {
        console.log(conversations, prepareConversation());
    }

    const botMessage = await message.reply({ content: italic("Please wait..."), allowedMentions: { users: [] } });

    // send the request to openai
    const responseFormat = z.object({
        text: z.string({
            description:
                "The raw response without metadata. It only contains the text of the response, without and user id, channel id, timestamp etc."
        })
    });
    const response = await openAIClient.chat.completions
        .parse({
            model: ChatBotModel,
            messages: prepareConversation(),
            safety_identifier: SHA256.hash(message.author.id).toString(),
            tools: [
                {
                    type: "function",
                    function: {
                        name: "generate_summary",
                        description:
                            "If the user is asking you to summarise what has just recently happened in the chat, generate a summary of the conversation.",
                        parameters: { type: "object", properties: {}, additionalProperties: false },
                        strict: true
                    }
                }
            ],
            response_format: zodResponseFormat(responseFormat, "metadata_free_response")
        })
        .then((response) => {
            if (testMode) {
                console.log("Prompt tokens:", response.usage?.prompt_tokens);
                console.log("Cached tokens:", response.usage?.prompt_tokens_details?.cached_tokens);
            }
            return response.choices[0].message;
        })
        .catch((error) => {
            botMessage.edit({ content: `__An unexpected error has happened__: ${error.message}` });
            return null;
        });
    if (!response) {
        return;
    }

    const toolCalls = response.tool_calls ?? [];
    if (toolCalls.find((call) => call.function.name === "generate_summary")) {
        generateSummary(message, botMessage);
        return;
    }

    const parsedReply = response.parsed;
    if (!parsedReply) {
        message.reply("__An unexpected error has happened__");
        return;
    }
    if (testMode) {
        console.log("Parsed reply:", parsedReply);
    }

    let chatBotReply = parsedReply.text;
    // first check if the AI is a dumbass and hallucinated metadata in the beginning
    if (chatBotReply.startsWith("Bedlessbot")) {
        chatBotReply = chatBotReply.split(":").splice(3).join(":").trim();
    }
    const clampedMessage = chatBotReply.length > 3500 ? chatBotReply.slice(0, 3500) + "..." : chatBotReply;
    botMessage.edit({ content: "", components: [new TextDisplayBuilder().setContent(clampedMessage)], flags: "IsComponentsV2" });

    // enrich the reply with metadata
    const storedReply = `Bedlessbot {${botMessage.channelId}} (${botMessage.id}) <${DateTime.fromJSDate(botMessage.createdAt).toFormat("yyyy-MM-dd HH:mm:ss")}>: ${chatBotReply}`;
    // add the response to the conversation
    const convo = conversations.find((convo) => convo.messageid === message.id);
    if (!convo) {
        conversations.push({ messageid: message.id, assistant: { content: storedReply, role: "assistant" } });
    } else {
        convo.assistant = { content: storedReply, role: "assistant" };
    }
    // make sure the conversation length doesn't go over 50 messages
    if (conversations.length > 50) {
        // remove the second message
        conversations.splice(1, 1);
    }
}

async function generateSummary(userMessage: Message<true>, botMessage: Message<true>) {
    const cooldown = summaryCooldown.get(userMessage.channelId);
    if (cooldown && cooldown > Date.now()) {
        botMessage.edit(
            `You can only use this command once per 15 minutes per channel. Please wait ${Math.ceil((cooldown - Date.now()) / 1000)} seconds.`
        );
        return;
    }

    // reply with a prompt
    const components = [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId("chatbot.summary.accept").setLabel("Yes").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId("chatbot.summary.deny").setLabel("No").setStyle(ButtonStyle.Danger)
        )
    ];
    botMessage.edit({ content: `Are you sure you want to generate a summary?`, components });

    const filter = (i: ButtonInteraction) => i.customId.startsWith("chatbot.summary.") && i.user.id === userMessage.author.id;
    const result = await botMessage
        .awaitMessageComponent({
            filter,
            componentType: ComponentType.Button,
            time: 30_000
        })
        .then((i) => {
            i.deferUpdate();
            return i.customId === "chatbot.summary.accept";
        })
        .catch(() => {
            return false;
        });

    if (!result) {
        botMessage.edit({ content: "Summary generation cancelled", components: [] });
        return;
    }

    summaryCooldown.set(userMessage.channelId, Date.now() + 15 * 60 * 1000);

    botMessage.edit({ content: "Generating summary...", components: [] });

    // fetch past 50 messages
    const messages = await userMessage.channel.messages.fetch({ limit: 50, before: userMessage.id });

    // prepare the messages for the summary
    const summaryInput = prepareMessagesForSummary(messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp).map((m) => m));

    // generate the summary
    const summaryResponse = await openAIClient.chat.completions.create({
        model: ChatBotModel,
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
        botMessage.edit("__An unexpected error has happened__");
        return;
    }

    // add the response to the conversation
    const convo = conversations.find((convo) => convo.messageid === userMessage.id);
    if (!convo) {
        conversations.push({ messageid: userMessage.id, assistant: { content: summary, role: "assistant" } });
    } else {
        convo.assistant = { content: summary, role: "assistant" };
    }

    botMessage.edit({
        content: summary,
        allowedMentions: { parse: [] },
        flags: MessageFlags.SuppressEmbeds
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
    const formattedMessages = messages.map((message) => {
        const date = message.createdAt.toLocaleString("en-US", {
            timeZone: "Europe/Budapest",
            timeZoneName: "short",
            hour12: false
        });

        const content = message.cleanContent.length > 1000 ? message.cleanContent.slice(0, 1000) + "..." : message.cleanContent;
        const attachmentCount = message.attachments.size;

        return `[${date}] ${message.author.tag}: ${content} <${attachmentCount} attachments>`;
    });

    return formattedMessages.join("\n");
}

export { isReplyingToUs, AddChatBotMessage, ShowChatBotWarning, ClearConversation };
