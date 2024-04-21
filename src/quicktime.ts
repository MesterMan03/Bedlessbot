import { GuildMember, bold, type GuildTextBasedChannel, type Message, type MessageReaction, type User } from "discord.js";
import { AddXPToUser, GetLevelConfig } from "./levelmanager";

enum QuickTimeType {
    /**
     * A random text will be generated which users have to type.
     */
    RandomText,
    /**
     * A random emoji will be picked which users have to react with.
     */
    ReactEmoji,
}

// emojis that may be used in the quick time event
const emojis = [
    "😂",
    "😍",
    "😭",
    "😊",
    "😢",
    "😘",
    "😁",
    "😩",
    "😔",
    "😏",
    "😉",
    "😎",
    "😄",
    "😒",
    "😅",
    "😌",
    "😞",
    "😆",
    "😝",
    "😋",
    "😀",
    "😖",
    "😅",
    "😜",
    "😚",
    "😐",
    "😛",
    "😃",
    "😑",
    "😲",
    "😇",
    "😈",
    "👿",
    "👹",
    "👺",
    "💀",
    "👻",
    "👽",
    "🤖",
    "💩",
    "😺",
    "😸",
    "😹",
    "😻",
    "😼",
    "😽",
    "😾",
    "😿",
    "🙀",
    "🙁",
    "🙂",
    "🙃",
    "🙄",
    "🤐",
    "🤑",
    "🤒",
    "🤓",
    "🤔",
    "🤕",
    "🤖",
    "🤗",
    "🤘",
    "🤙",
    "🤚",
    "🤛",
    "🤜",
    "🤝",
    "🤞",
    "🤟",
    "🤠",
    "🤡",
    "🤢",
    "🤣",
    "🤤",
    "🤥",
    "🤦",
    "🤧",
    "🤨",
    "🤩",
    "🤪",
    "🚀",
    "🚁",
    "🚂",
    "🚃",
    "🚄",
    "🚅",
    "🚆",
    "🚇",
    "🚈",
    "🚉",
    "🚊",
    "🚋",
    "🚌",
    "🚍",
    "🚎",
    "🚏",
    "🚐",
    "🚑",
    "🚒",
    "🚓",
    "🚔",
    "🚕",
    "🚖",
    "🚗",
    "🚘",
    "🚙",
    "🚚",
    "🚛",
    "🚜",
    "🚝",
    "🚞",
    "🚟",
    "🚠",
    "🚡",
    "🚢",
    "🚣",
    "🚤",
    "🚥",
    "🚦",
    "🚧",
    "🚨",
    "🚩",
    "🚪",
    "🚫",
    "🚬",
    "🚭",
    "🚮",
    "🚯",
    "🚰",
    "🚱",
    "🚲",
    "🚳",
    "🚴",
    "🚵",
    "🚶",
    "🚷",
    "🚸",
    "🚹",
    "🚺",
    "🚻",
    "🚼",
    "🚽",
    "🚾",
    "🚿",
    "🛀",
    "🛁",
    "🛂",
    "🛃",
    "🛄",
    "🛅",
];

function getRandomEmoji() {
    return emojis[Math.floor(Math.random() * emojis.length)];
}

async function StartQuickTime(channel: GuildTextBasedChannel) {
    // generate a random type from QuickTimeType
    const type = Math.floor((Math.random() * Object.keys(QuickTimeType).length) / 2);

    const randomText = type === QuickTimeType.RandomText ? `${Math.random().toString(36).substring(2, 9)}` : getRandomEmoji();

    // send a message based on the type
    const message = await channel.send( 
        `Quick time event! ${
            type === QuickTimeType.RandomText ? "Type this text:" : "React with"
        } ${bold(randomText)} to win! You have 30 seconds.`
    );

    // set up a message collector or reaction collector based on the type
    if (type === QuickTimeType.RandomText) {
        const filter = (m: Message) => m.content === randomText;
        const collector = channel.createMessageCollector({ filter, time: 30_000, max: 1 });

        collector.on("collect", async (m) => {
            // do something when the user types the correct text
            if(!m.member) return;
            RewardUser(m.member, channel);
        });

        collector.on("end", (collected, reason) => {
            // do something when the time runs out
            if(collected.size === 0) {
                message.reply("No one typed the text in time!");
            }
        });
    } else {
        const filter = (reaction: MessageReaction, user: User) => reaction.emoji.name === randomText;
        const collector = message.createReactionCollector({ filter, time: 30_000, max: 1 });

        collector.on("collect", async (reaction, user) => {
            // do something when the user reacts with the correct emoji
            const member = await message.guild.members.fetch(user);
            RewardUser(member, channel);
        });

        collector.on("end", (collected, reason) => {
            // do something when the time runs out
            if(collected.size === 0) {
                message.reply("No one reacted in time!");
            }
        });
    }
}

function RewardUser(member: GuildMember, channel: GuildTextBasedChannel) {
    // generate a random xp amount between 250 and 750
    const xp = Math.floor(Math.random() * 500) + 250;

    AddXPToUser(GetLevelConfig(member.id), xp, member);
    channel.send(`Congratulations <@${member.id}>! You won ${xp} Social Credit for winning the quick time event!`);
}

export { StartQuickTime };