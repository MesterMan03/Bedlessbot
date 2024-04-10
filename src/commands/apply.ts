import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    ChatInputCommandInteraction,
    EmbedBuilder,
    SlashCommandBuilder,
    type TextBasedChannel,
} from "discord.js";
import { google } from "googleapis";
import client, { GetGuild, db } from "..";

/**
 * A map storing the last time a user used a command.
 * We use this to insert a 5 minute cooldown between commands.
 */
const cooldowns = new Map<string, number>();

const youtubeAPI = google.youtube({
    version: "v3",
    auth: process.env.YOUTUBE_API_KEY,
});

enum VideoPrivacyResult {
    Private,
    NotExist,
    Failed,
}

async function checkVideoPrivacy(videoId: string): Promise<VideoPrivacyResult> {
    try {
        const response = await youtubeAPI.videos.list({
            part: ["status"],
            id: [videoId],
        });

        if (!response?.data?.items) {
            return VideoPrivacyResult.Failed;
        }

        if (response.data.items.length > 0) {
            const privacyStatus = response.data.items[0].status?.privacyStatus;
            return privacyStatus === "private" ? VideoPrivacyResult.Private : VideoPrivacyResult.Failed;
        } else {
            return VideoPrivacyResult.NotExist;
        }
    } catch (error) {
        console.error("Error checking video privacy:", error);
        return VideoPrivacyResult.Failed;
    }
}

function increaseCheaterPoint(userID: string) {
    // update the cheatpoints
    if (db.query(`SELECT * FROM cheatpoints WHERE userid = '${userID}'`).get() == null) {
        db.run(`INSERT INTO cheatpoints (userid, cheatpoint) VALUES ('${userID}', 1)`);
    } else {
        db.run(`UPDATE cheatpoints SET cheatpoint = cheatpoint + 1 WHERE userid = '${userID}'`);
    }
}

function shortRoleToName(role: string) {
    return (
        {
            dragclick: "Drag clicker",
            "16cps": "16+ CPS",
            eagle: "Eagle Bridger",
            witchly: "Witchly Bridger",
            breezily: "Breezily Bridger",
            goodpvp: "Good PvPer",
            moonwalk: "Moonwalker",
            god: "Godbridger",
            diagod: "Diagonal Godbridger",
            telly: "Telly Bridger",
        }[role] ?? "unknown role"
    );
}

function roleNameToShort(name: string) {
    return {
        "Drag clicker": "dragclick",
        "16+ CPS": "16cps",
        "Eagle Bridger": "eagle",
        "Witchly Bridger": "witchly",
        "Breezily Bridger": "breezily",
        "Good PvPer": "goodpvp",
        Moonwalker: "moonwalk",
        Godbridger: "god",
        "Diagonal Godbridger": "diagod",
        "Telly Bridger": "telly",
    }[name];
}

function shortRoleToRoleID(role: string) {
    return {
        dragclick: "1223797522523230290",
        "16cps": "1223797518626984088",
        eagle: "1223797538185019424",
        witchly: "1223797534200434759",
        breezily: "1223797530127499294",
        goodpvp: "1223797526336110714",
        moonwalk: "1223797542148640889",
        god: "1223797549933133866",
        diagod: "1223797545952874590",
        telly: "1223797553703944282",
    }[role];
}

export async function processInteraction(interaction: ButtonInteraction) {
    const outcomeChannel = (await client.channels.fetch(process.env.OUTCOME_CHANNEL!)) as TextBasedChannel;
    if (!outcomeChannel) throw new Error("what the fuck");

    const embed = EmbedBuilder.from(interaction.message.embeds[0]);
    const userid = embed.data.footer!.text;
    const role = roleNameToShort(embed.data.fields![1].value);
    if (!role) {
        interaction.reply("Unknown role. This is an error, contact Mester.");
        return;
    }

    const member = await GetGuild().members.fetch(userid);
    if (!member) {
        embed.setDescription(`The member has left the server`).setColor("Red");
        interaction.update({ embeds: [embed], components: [] });
        return;
    }

    if (interaction.customId === "accept") {
        embed.setDescription(`Application accepted by <@${interaction.user.id}>`).setColor("Green");
        interaction.update({ embeds: [embed], components: [] });

        outcomeChannel.send(`Congratulations <@${member.user.id}>! Your role application for ${shortRoleToName(role)} has been accepted!`);

        const roleToAdd = shortRoleToRoleID(role);
        if (!roleToAdd || !GetGuild().roles.cache.has(roleToAdd)) return;

        member.roles.add(roleToAdd);
    }

    if (interaction.customId === "deny") {
        await interaction.deferUpdate();

        // ask for reason
        const reasonMessage = await interaction.followUp(
            "Please provide a reason for denying this application in the next 60 seconds (max 500 words). Alternatively, send `cancel` to cancel."
        );

        const reasonCollector = reasonMessage.channel.createMessageCollector({
            filter: (m) => m.author.id === interaction.user.id && m.content.length <= 500,
            time: 60000,
            max: 1,
        });

        reasonCollector.on("collect", async (reasonMessage) => {
            reasonCollector.stop();

            if (reasonMessage.content.toLowerCase() === "cancel") {
                return;
            }

            embed.setDescription(`Application denied by <@${interaction.user.id}>`).setColor("Red");
            embed.addFields({ name: "Reason for denial", value: reasonMessage.content });
            interaction.message.edit({ embeds: [embed], components: [] });
            reasonMessage.delete();

            outcomeChannel.send(
                `<@${member.id}>, your role application for ${shortRoleToName(role)} has unfortunately been denied for: ${
                    reasonMessage.content
                }!`
            );
        });

        reasonCollector.on("end", () => {
            reasonMessage.delete();
        });
    }

    if (interaction.customId === "troll") {
        embed.setDescription(`Application marked as troll by <@${interaction.user.id}>`).setColor("Red");
        interaction.update({ embeds: [embed], components: [] });

        outcomeChannel.send(`<@${member.id}>, your role application for ${shortRoleToName(role)} has been marked as a troll application.`);
    }

    if (interaction.customId === "hacker") {
        embed.setDescription(`Application flagged for hacking by <@${interaction.user.id}>`).setColor("Red");
        interaction.update({ embeds: [embed], components: [] });

        increaseCheaterPoint(member.id);

        const cheatpoint = (
            db.query(`SELECT cheatpoint FROM cheatpoints WHERE userid = '${member.id}'`).get() as {
                cheatpoint: number;
            }
        ).cheatpoint;

        outcomeChannel.send(
            `<@${member.id}>, your role application for ${shortRoleToName(
                role
            )} has been flagged for hacking. You now have ${cheatpoint}/3 cheater points.`
        );
    }
}

export default {
    data: new SlashCommandBuilder()
        .setName("apply")
        .setDescription("Apply for a role")
        .addStringOption((option) =>
            option.setName("role").setDescription("The role you want to apply for.").setRequired(true).setChoices(
                {
                    name: "Drag clicker",
                    value: "dragclick",
                },
                {
                    name: "16+ CPS",
                    value: "16cps",
                },
                {
                    name: "Eagle Bridger",
                    value: "eagle",
                },
                {
                    name: "Witchly Bridger",
                    value: "witchly",
                },
                {
                    name: "Breezily Bridger",
                    value: "breezily",
                },
                {
                    name: "Good PvPer",
                    value: "goodpvp",
                },
                {
                    name: "Moonwalker",
                    value: "moonwalk",
                },
                {
                    name: "Godbridger",
                    value: "god",
                },
                {
                    name: "Diagonal Godbridger",
                    value: "diagod",
                },
                {
                    name: "Telly Bridger",
                    value: "telly",
                }
            )
        )
        .addStringOption((option) =>
            option
                .setName("proof")
                .setDescription("The YouTube or Imgur link that serves as your proof (don't forget to include the https:// part).")
                .setRequired(true)
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        try {
            if (!interaction.inCachedGuild()) {
                return await interaction.reply("This command can only be used in the server.");
            }

            await interaction.deferReply({ ephemeral: false });

            // check if user has reacted to the guide message with a thumbsup
            const guideMessage = await GetGuild()
                .channels.fetch(process.env.GUIDE_CHANNEL!)
                .then((channel) => {
                    if (!channel?.isTextBased()) return;

                    return channel.messages.fetch(process.env.GUIDE_MESSAGE!);
                });

            if (!guideMessage) {
                return await interaction.editReply("Role guide message couldn't be found. This is not an epic moment, contact Mester.");
            }

            const guideReaction = guideMessage.reactions.cache.get("👍");
            if (
                !guideReaction ||
                (await guideReaction.users.fetch({ after: String(BigInt(interaction.user.id) - 1n), limit: 1 })).first()?.id !==
                    interaction.user.id
            ) {
                await interaction.editReply(
                    `Please react to the [guide message](${guideMessage.url}) with a thumbs up before applying for a role.`
                );
                return;
            }

            const cheatpoint = (
                db.query(`SELECT cheatpoint FROM cheatpoints WHERE userid = '${interaction.user.id}'`).get() as {
                    cheatpoint: number;
                } | null
            )?.cheatpoint;

            if (cheatpoint && cheatpoint >= 3) {
                await interaction.editReply("You have been banned from applying for roles due to having at least 3 cheater points.");
                return;
            }

            const role = interaction.options.getString("role", true);
            let proof = interaction.options.getString("proof", true); // is this allowed?
            let canParseProof = URL.canParse(proof);

            // check if proof is valid but is missing https
            if (!canParseProof && URL.canParse("https://" + proof)) {
                proof = "https://" + proof; // make sure user cannot avoid duplicate system by removing/adding https
                canParseProof = true;
            }

            // check if the proof has been submitted before and not by the same user
            if (db.query(`SELECT * FROM proofs WHERE proof = $proof AND userid != '${interaction.user.id}'`).get({ $proof: proof })) {
                await interaction.editReply("This proof has already been used before by someone else.");
                return;
            }

            // verify the proof is a valid url
            if (!canParseProof) {
                await interaction.editReply("Invalid proof URL.");
                return;
            }
            const proofURL = new URL(proof);

            // check if user already has this role
            const roleToCheck = shortRoleToRoleID(role);
            if (roleToCheck && interaction.member.roles.cache.has(roleToCheck)) {
                await interaction.editReply("You already have this role.");
                return;
            }

            // check if proof is a youtube link, except when role is good pvper, then check for imgur
            if (
                ["www.youtube.com", "m.youtube.com", "youtu.be", "youtube.com"].includes(proofURL.hostname) === false &&
                role !== "goodpvp"
            ) {
                await interaction.editReply("Please use a YouTube video link for proof.");
                return;
            }
            if (["imgur.com"].includes(proofURL.hostname) === false && role === "goodpvp") {
                await interaction.editReply("Please use an Imgur link for proof.");
                return;
            }

            // check if video is private
            let isPrivate: VideoPrivacyResult;
            if (role !== "goodpvp") {
                // extract video id using search params
                const pathname = proofURL.pathname.split("/");
                pathname.shift();

                let videoId: string | null;
                if (proofURL.hostname === "youtu.be") {
                    videoId = pathname[0];
                } else if (pathname[0] === "shorts") {
                    // shorts link
                    videoId = pathname[1];
                } else {
                    videoId = proofURL.searchParams.get("v");
                }

                if (!videoId) {
                    await interaction.editReply("Invalid YouTube link.");
                    return;
                }

                isPrivate = await checkVideoPrivacy(videoId);
                if (isPrivate !== VideoPrivacyResult.Failed) {
                    await interaction.editReply("That video is private or doesn't exist.");
                    return;
                }
            }

            // check if user is on cooldown
            if (cooldowns.has(interaction.user.id) && !interaction.memberPermissions.has("Administrator")) {
                const time = cooldowns.get(interaction.user.id)!;
                if (Date.now() / 1000 < time + 60) {
                    await interaction.editReply(
                        `You're on cooldown. Please wait ${Math.ceil(
                            time + 60 - Date.now() / 1000
                        )} seconds before running this command again.`
                    );
                    return;
                }
            }
            cooldowns.set(interaction.user.id, Date.now() / 1000);

            // insert proof into database
            if (
                db.query(`SELECT * FROM proofs WHERE proof = $proof AND userid = '${interaction.user.id}'`).get({ $proof: proof }) == null
            ) {
                db.query(`INSERT INTO proofs (proof, userid) VALUES ($proof, '${interaction.user.id}')`).run({ $proof: proof });
            }

            interaction.editReply("Your application has been submitted for review.");

            const reviewChannel = (await client.channels.fetch(process.env.TO_REVIEW_CHANNEL!)) as TextBasedChannel;
            if (!reviewChannel) throw new Error("what the fuck");

            const embed = new EmbedBuilder()
                .setTitle("Role Application")
                .setFields(
                    { name: "Username", value: interaction.user.username, inline: true },
                    { name: "Role applied for:", value: shortRoleToName(role), inline: true },
                    { name: "Proof", value: proof, inline: false }
                )
                .setColor("DarkPurple")
                .setFooter({ text: interaction.user.id });

            const components = [
                new ActionRowBuilder<ButtonBuilder>().setComponents(
                    new ButtonBuilder().setCustomId("accept").setLabel("Accept").setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId("deny").setLabel("Deny").setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId("troll")
                        .setEmoji("907471808033349695")
                        .setLabel("Troll")
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId("hacker")
                        .setEmoji("820606205953179649")
                        .setLabel("Hacker")
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setURL(proof).setLabel("View Proof").setStyle(ButtonStyle.Link)
                ),
            ];

            reviewChannel.send({ embeds: [embed], components });
        } catch (error) {
            console.log(error);
        }
    },
};
