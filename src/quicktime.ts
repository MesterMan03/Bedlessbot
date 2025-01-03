import twemoji from "@twemoji/api";
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonComponent,
    ButtonInteraction,
    ButtonStyle,
    ComponentType,
    GuildMember,
    inlineCode,
    type GuildTextBasedChannel,
    type Message,
    type MessageReaction
} from "discord.js";
import sharp from "sharp";
import svgCaptcha from "svg-captcha";
import wordList from "../res/wordlist.json" with { type: "json" };
import emojis from "../res/emojis.json" with { type: "json" };
import { AddXPToUser, GetLevelConfig } from "./levelmanager";

enum QuickTimeType {
    /**
     * A random text will be generated which users have to type.
     */
    RandomText = "text",
    /**
     * A random emoji will be picked which users have to react with.
     */
    ReactEmoji = "emoji",
    RandomButton = "button",
    WordScramble = "scramble"
}

const RandomButtonColors = <const>["red", "green", "blue", "gray"];
type RandomButtonColor = (typeof RandomButtonColors)[number];

const RandomButtonColorToStyle: Record<RandomButtonColor, ButtonStyle> = <const>{
    red: ButtonStyle.Danger,
    green: ButtonStyle.Success,
    blue: ButtonStyle.Primary,
    gray: ButtonStyle.Secondary
};

/**
 * Generate a 5x5 grid of ButtonBuilders with random emojis and colors. Randomly pick a unique cell that contains a unique color and label.
 * @returns A tuple containing the grid of buttons, the unique color and the unique label.
 */
function generateRandomButtons(): [ActionRowBuilder<ButtonBuilder>[], { color: RandomButtonColor; label: string }] {
    // generate the 5 random emojis
    const buttonEmojis = new Array<string>(10);
    for (let i = 0; i < buttonEmojis.length; i++) {
        buttonEmojis[i] = emojis[Math.floor(Math.random() * emojis.length)];
    }

    const sizeX = 5,
        sizeY = 5;

    const uniqueX = Math.floor(Math.random() * sizeX);
    const uniqueY = Math.floor(Math.random() * sizeY);

    const uniqueColor = RandomButtonColors[Math.floor(Math.random() * RandomButtonColors.length)];
    const uniqueLabel = buttonEmojis[Math.floor(Math.random() * buttonEmojis.length)];

    const grid = new Array<ActionRowBuilder<ButtonBuilder>>(5);

    for (let y = 0; y < sizeY; y++) {
        const row = new ActionRowBuilder<ButtonBuilder>();
        for (let x = 0; x < sizeX; x++) {
            if (x === uniqueX && y === uniqueY) {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`quicktime.rbutton.correct`)
                        .setEmoji(uniqueLabel)
                        .setStyle(RandomButtonColorToStyle[uniqueColor])
                );
            } else {
                while (true) {
                    const color = RandomButtonColors[Math.floor(Math.random() * RandomButtonColors.length)];
                    const label = buttonEmojis[Math.floor(Math.random() * buttonEmojis.length)];
                    if (!(color === uniqueColor && label === uniqueLabel)) {
                        row.addComponents(
                            new ButtonBuilder()
                                .setCustomId(`quicktime.rbutton.incorrect${x}${y}`)
                                .setEmoji(label)
                                .setStyle(RandomButtonColorToStyle[color])
                        );
                        break;
                    }
                }
            }
        }
        grid[y] = row;
    }
    return [grid, { color: uniqueColor, label: uniqueLabel }];
}

function shuffleWord(word: string) {
    const letters = word.split("");
    for (let i = letters.length - 1; i > 0; i--) {
        const j = Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / (0xffffffff + 1)) * (i + 1)); // Use crypto for better randomness
        [letters[i], letters[j]] = [letters[j], letters[i]]; // Swap elements
    }
    return letters.join("");
}

async function StartQuickTime(channel: GuildTextBasedChannel, inputType?: string) {
    // generate a random type from QuickTimeType
    const type = inputType ?? Object.values(QuickTimeType)[Math.floor((Math.random() * Object.keys(QuickTimeType).length) / 2)];

    if (type === QuickTimeType.RandomText) {
        const randomText = svgCaptcha.create({ ignoreChars: "01lioLIO", color: true, size: 7, background: "FE0000", noise: 4 });
        const message = await channel.send({
            content: `Quick time event, type the text shown on the image to win! You have 30 seconds.`,
            files: [
                {
                    attachment: await sharp(Buffer.from(randomText.data)).resize(300).png().toBuffer(),
                    name: "captcha.png",
                    contentType: "image/png"
                }
            ]
        });

        const filter = (message: Message) => message.content === randomText.text;
        const collector = channel.createMessageCollector({ filter, time: 30_000, max: 1 });

        collector.on("collect", async (m) => {
            const member = await message.guild.members.fetch(m.author.id);
            RewardUser(member, channel);
            collector.stop();
        });

        collector.on("end", (collected) => {
            // do something when the time runs out
            if (collected.size === 0) {
                message.reply(`No one typed the text in time! The text was ${randomText.text}`);
            }
        });
    } else if (type === QuickTimeType.ReactEmoji) {
        const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
        // use twemoji to convert the emoji into a svg
        const parsedEmoji = twemoji.parse(randomEmoji, { folder: "svg", ext: ".svg" });
        // use regex to get the text inside src="..."
        const emojiSource = RegExp(/src="([^"]*)"/).exec(parsedEmoji)?.[1];
        if (!emojiSource) {
            throw new Error("Couldn't find emoji source");
        }
        // fetch and render the emoji ans a png
        const emojiData = await fetch(emojiSource).then((res) => res.arrayBuffer());
        const renderedEmoji = await sharp(emojiData).resize(128).png().toBuffer();
        const message = await channel.send({
            content: `Quick time event, react with the emoji shown to win! You have 30 seconds.`,
            files: [
                {
                    attachment: renderedEmoji,
                    name: "emoji.png",
                    contentType: "image/png"
                }
            ]
        });

        const filter = (reaction: MessageReaction) => reaction.emoji.name === randomEmoji;
        const collector = message.createReactionCollector({ filter, time: 30_000, max: 1 });

        collector.once("collect", async (_, user) => {
            // do something when the user reacts with the correct emoji
            const member = await message.guild.members.fetch(user);
            RewardUser(member, channel, 1.5);
            collector.stop();
        });

        collector.on("end", (collected) => {
            // do something when the time runs out
            if (collected.size === 0) {
                message.reply(`No one reacted in time! The emoji was ${randomEmoji}`);
            }
        });
    } else if (type === QuickTimeType.RandomButton) {
        // generate the grid of buttons
        const [grid, unique] = generateRandomButtons();

        const message = await channel.send({
            content: `Quick time event, click the ${unique.color} ${unique.label} to win! You have 30 seconds.`,
            components: grid
        });

        const filter = (i: ButtonInteraction) => i.customId === "quicktime.rbutton.correct";
        const collector = message.createMessageComponentCollector<ComponentType.Button>({ filter, time: 30_000 });

        collector.once("collect", async (i) => {
            i.deferUpdate();
            RewardUser(i.member, channel, 0.75);
            collector.stop();
        });

        collector.on("end", (collected) => {
            if (collected.size === 0) {
                message.reply(`No one clicked the correct button!`);
            }
            // disable all buttons
            const components = message.components.map((row) =>
                new ActionRowBuilder<ButtonBuilder>().setComponents(
                    row.components.map((button) => ButtonBuilder.from((button as ButtonComponent).toJSON()).setDisabled(true))
                )
            );
            message.edit({ components });
        });
    } else if (type === QuickTimeType.WordScramble) {
        const randomWord = wordList[Math.floor(Math.random() * wordList.length)];
        const scrambledWord = shuffleWord(randomWord);

        // send the message
        const messageContent = `Quick time event, unscramble the word "${scrambledWord}" to win! You have a minute.`;
        const message = await channel.send(messageContent);

        // set up a timer that automatically reveals a letter and decreases the multiplier
        let multiplier = 2.0;
        const revealedLetters = new Set<number>();
        const wordLength = randomWord.length;

        const revealInterval = setInterval(() => {
            const unrevealedIndices = new Array<number>(wordLength);
            for (let i = 0; i < wordLength; i++) {
                if (!revealedLetters.has(i)) {
                    unrevealedIndices[i] = i;
                }
            }

            // reveal a letter if there are at least 2 unrevealed letters
            if (unrevealedIndices.length >= 2) {
                const randomIndex = unrevealedIndices[Math.floor(Math.random() * unrevealedIndices.length)];
                revealedLetters.add(randomIndex);

                const displayWord = inlineCode(
                    randomWord
                        .split("")
                        .map((letter, index) => (revealedLetters.has(index) ? letter : "_"))
                        .join("")
                );
                message.edit(`${messageContent}\nThe word is: ${displayWord}`);
                multiplier -= 0.1;
            }
        }, 5000);

        // set up the message collector
        const filter = (m: Message) => m.content === randomWord;
        const collector = message.channel.createMessageCollector({ filter, time: 60_000 });

        collector.once("collect", async (m) => {
            clearInterval(revealInterval);
            const member = await message.guild.members.fetch(m.author.id);
            RewardUser(member, channel, multiplier);
            collector.stop();
        });

        collector.on("end", (collected) => {
            if (collected.size === 0) {
                message.reply(`No one typed the word "${randomWord}"`);
            }
        });
    }
}

async function RewardUser(member: GuildMember, channel: GuildTextBasedChannel, mult = 1.0) {
    // generate a random xp amount between 400 and 800
    const xp = Math.floor((Math.random() * 400 + 400) * mult);

    const finalXP = await AddXPToUser(GetLevelConfig(member.id), xp, member);
    channel.send(`Congratulations <@${member.id}>! You won ${finalXP} Social Credit for winning the quick time event!`);
}

export { StartQuickTime };
