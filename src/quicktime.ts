import twemoji from "@twemoji/api";
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonComponent,
    ButtonInteraction,
    ButtonStyle,
    ComponentType,
    GuildMember,
    type GuildTextBasedChannel,
    type Message,
    type MessageReaction
} from "discord.js";
import sharp from "sharp";
import svgCaptcha from "svg-captcha";
import emojis from "../res/emojis.json" with { type: "json" };
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
    RandomButton
}

const RandomButtonColors = <const>["red", "green", "blue", "gray"];
type RandomButtonColor = (typeof RandomButtonColors)[number];

const RandomButtonColorToStyle: Record<RandomButtonColor, ButtonStyle> = <const>{
    red: ButtonStyle.Danger,
    green: ButtonStyle.Success,
    blue: ButtonStyle.Primary,
    gray: ButtonStyle.Secondary
};
const RANDOM_BUTTONS_PREGENERATED = new Array<ActionRowBuilder<ButtonBuilder>>(5).fill(new ActionRowBuilder<ButtonBuilder>(), 0, 4);
RANDOM_BUTTONS_PREGENERATED.forEach((row) => {
    for (let i = 0; i < 5; i++) {
        row.addComponents(new ButtonBuilder().setCustomId(`quicktime.button.${i}`).setLabel(`Button ${i}`).setStyle(ButtonStyle.Primary));
    }
});

/**
 * Generate a 5x5 grid of ButtonBuilders with random emojis and colors. Randomly pick a unique cell that contains a unique color and label.
 * @returns A tuple containing the grid of buttons, the unique color and the unique label.
 */
function generateRandomButtons(): [ActionRowBuilder<ButtonBuilder>[], [RandomButtonColor, string]] {
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
    return [grid, [uniqueColor, uniqueLabel]];
}

async function StartQuickTime(channel: GuildTextBasedChannel) {
    // generate a random type from QuickTimeType
    const type = Math.floor((Math.random() * Object.keys(QuickTimeType).length) / 2);

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

        collector.once("collect", async (m) => {
            // do something when the user types the correct text
            if (!m.member) {
                return;
            }
            RewardUser(m.member, channel);
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
            content: `Quick time event, click the ${unique[0]} ${unique[1]} to win! You have 30 seconds.`,
            components: grid
        });

        const filter = (i: ButtonInteraction) => i.customId === "quicktime.rbutton.correct";
        const collector = message.createMessageComponentCollector<ComponentType.Button>({ filter, time: 30_000 });

        collector.once("collect", async (i) => {
            i.deferUpdate();
            RewardUser(i.member, channel, 0.8);
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
    }
}

function RewardUser(member: GuildMember, channel: GuildTextBasedChannel, mult = 1.0) {
    // generate a random xp amount between 400 and 800
    const xp = Math.floor((Math.random() * 400 + 400) * mult);

    AddXPToUser(GetLevelConfig(member.id), xp, member);
    channel.send(`Congratulations <@${member.id}>! You won ${xp} Social Credit for winning the quick time event!`);
}

export { StartQuickTime };
