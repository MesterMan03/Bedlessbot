import { SHA256 } from "bun";
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    ChatInputCommandInteraction,
    EmbedBuilder,
    SlashCommandBuilder,
    SlashCommandStringOption,
    type TextBasedChannel
} from "discord.js";
import { google } from "googleapis";
import client, { GetGuild, db } from "..";
import config, { isApplyRole, type ApplyRole } from "../config";

/**
 * A map storing the last time a user used a command.
 * We use this to insert a 5 minute cooldown between commands.
 */
const cooldowns = new Map<string, number>();

const youtubeAPI = google.youtube({
    version: "v3",
    auth: process.env.YOUTUBE_API_KEY
});

enum VideoPrivacyResult {
    Private,
    NotExist,
    Failed
}

async function checkVideoPrivacy(videoId: string): Promise<VideoPrivacyResult> {
    try {
        const response = await youtubeAPI.videos.list({
            part: ["status"],
            id: [videoId]
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

function shortRoleToName(role: ApplyRole) {
    return config.RoleToName[role] ?? "unknown role";
}

function roleNameToShort(name?: string): ApplyRole | null {
    if (!name) {
        return null;
    }

    // reverse config.RoleToName by finding the value first and returning its key
    return (Object.entries(config.RoleToName).find(([, value]) => value === name)?.[0] as ApplyRole) ?? null;
}

function shortRoleToRoleID(role: ApplyRole) {
    return config.RoleToID[role];
}

async function processInteraction(interaction: ButtonInteraction) {
    const outcomeChannel = (await client.channels.fetch(config.Channels.Outcome)) as TextBasedChannel;
    if (!outcomeChannel) {
        throw new Error("what the fuck");
    }

    const embed = EmbedBuilder.from(interaction.message.embeds[0]);
    const userid = embed.data.footer?.text;
    const role = roleNameToShort(embed.data.fields?.[1]?.value);

    if (!role) {
        interaction.reply(`Unknown role for ${embed.data.fields?.[1]?.value}. This is an error, contact Mester.`);
        return;
    }

    if (!userid) {
        interaction.reply("No user ID found. This is an error, contact Mester.");
        return;
    }

    const member = await GetGuild()
        .members.fetch(userid)
        .catch(() => {
            // user was likely banned or left
            return null;
        });
    if (!member) {
        embed.setDescription(`The member has left the server`).setColor("Red");
        interaction.update({ embeds: [embed], components: [] });
        return;
    }

    if (interaction.customId === "ap-accept") {
        embed.setDescription(`Application accepted by <@${interaction.user.id}>`).setColor("Green");
        interaction.update({ embeds: [embed], components: [] });

        outcomeChannel.send(`Congratulations <@${member.user.id}>! Your role application for ${shortRoleToName(role)} has been accepted!`);

        const roleToAdd = shortRoleToRoleID(role);
        if (!roleToAdd || !GetGuild().roles.cache.has(roleToAdd)) {
            return;
        }

        // save role in db
        db.run(`INSERT OR IGNORE INTO roles_given (userid, roleid) VALUES ('${member.id}', '${roleToAdd}')`);

        member.roles.add(roleToAdd);
    }

    if (interaction.customId === "ap-deny") {
        await interaction.deferUpdate();

        // ask for reason
        const reasonMessage = await interaction.followUp(
            "Please provide a reason for denying this application in the next 60 seconds (max 500 words). Alternatively, send `cancel` to cancel."
        );

        const reasonCollector = reasonMessage.channel.createMessageCollector({
            filter: (m) => m.author.id === interaction.user.id && m.content.length <= 500,
            time: 60000,
            max: 1
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

            outcomeChannel.send(`<@${member.id}>, your role application for ${shortRoleToName(role)} has unfortunately been denied for: ${reasonMessage.content}`);
        });

        reasonCollector.on("end", () => {
            reasonMessage.delete();
        });
    }

    if (interaction.customId === "ap-infraction") {
        embed.setDescription(`Infraction given by <@${interaction.user.id}>`).setColor("Red");
        interaction.update({ embeds: [embed], components: [] });

        increaseCheaterPoint(member.id);

        const cheatpoint = (
            db.query(`SELECT cheatpoint FROM cheatpoints WHERE userid = '${member.id}'`).get() as {
                cheatpoint: number;
            }
        ).cheatpoint;

        outcomeChannel.send(
            `<@${member.id}>, your role application for ${shortRoleToName(role)} has received an infraction. You now have ${cheatpoint}/3 infractions${
                cheatpoint === 3 ? " and have been permanently banned from role applications 💀" : ""
            }. ${cheatpoint === 2 ? "One more and you're permanently banned from role applications." : ""}`
        );
    }
}

const allowedFileTypes = ["mp4", "mov", "webm", "gif", "png", "jpeg"];
const allowedFileTypesString = allowedFileTypes.map((type) => `.${type}`).join(", ");
const allowedWebsites = ["www.youtube.com", "youtube.com", "youtu.be", "imgur.com", "medal.tv", "streamable.com"];

async function validateCommand(interaction: ChatInputCommandInteraction<"cached">) {
    const role = interaction.options.getString("role", true);
    let proof = interaction.options.getSubcommand(true) === "link" ? interaction.options.getString("proof", true) : interaction.options.getAttachment("proof", true);
    let proofString = "";
    const isLink = interaction.options.getSubcommand(true) === "link";

    if (!isApplyRole(role)) {
        throw new Error("Applied role is not part of config, wtf???");
    }

    // check if user has reacted to the guide message with a thumbsup
    const guideMessage = await GetGuild()
        .channels.fetch(config.Channels.Guide)
        .then((channel) => {
            if (!channel?.isTextBased()) {
                return;
            }

            return channel.messages.fetch(config.Channels.GuideMessage);
        });

    if (!guideMessage) {
        await interaction.editReply("Role guide message couldn't be found. This is not an epic moment, contact Mester.");
        return null;
    }

    const guideReaction = guideMessage.reactions.cache.get("👍");
    if (!guideReaction || (await guideReaction.users.fetch({ after: String(BigInt(interaction.user.id) - 1n), limit: 1 })).first()?.id !== interaction.user.id) {
        await interaction.editReply(`Please react to the [guide message](${guideMessage.url}) with a thumbs up before applying for a role.`);
        return null;
    }

    // check if user has at least 3 cheatpoints
    const cheatpoint = db.query<{ cheatpoint: number }, []>(`SELECT cheatpoint FROM cheatpoints WHERE userid = '${interaction.user.id}'`).get()?.cheatpoint;

    if (cheatpoint && cheatpoint >= 3) {
        await interaction.editReply("You have been banned from applying for roles due to having at least 3 cheater points.");
        return null;
    }

    // validate link proof
    if (typeof proof === "string") {
        proof = proof.trim();

        // pre-validation 1 - check if link contains spaces
        if (proof.includes(" ")) {
            await interaction.editReply("Proof link cannot contain spaces.");
            return null;
        }

        // pre-validation 2 - check if link contains periods
        if (!proof.includes(".")) {
            await interaction.editReply("Invalid proof link.");
            return null;
        }

        // check if proof is valid but is missing https
        let canParseProof = URL.canParse(proof);
        if (!canParseProof && URL.canParse("https://" + proof)) {
            proof = "https://" + proof; // make sure user cannot avoid duplicate system by removing/adding https
            canParseProof = true;
        }

        // verify the proof is a valid url
        if (!canParseProof) {
            await interaction.editReply("Invalid proof link.");
            return null;
        }

        const proofURL = new URL(proof);

        // check if link is from an allowed website
        if (!allowedWebsites.some((website) => proofURL.hostname === website)) {
            await interaction.editReply("The proof link must be from YouTube, Imgur, Medal or Streamable.");
            return null;
        }

        // check if video is private (either hostname is)
        if (proofURL.hostname === "youtu.be" || /(www\.)?youtube\.com/.test(proofURL.hostname)) {
            let isPrivate: VideoPrivacyResult;

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
                return null;
            }

            isPrivate = await checkVideoPrivacy(videoId);
            if (isPrivate !== VideoPrivacyResult.Failed) {
                await interaction.editReply("That video is private or doesn't exist.");
                return null;
            }
        }

        proofString = proof;
    } else {
        // check if the file is a valid type
        const fileType = proof.contentType?.split("/")[1] ?? "null";
        if (proof.contentType && !allowedFileTypes.includes(fileType)) {
            await interaction.editReply(`Invalid file type. Allowed file types: ${allowedFileTypesString}`);
            return null;
        }

        // check if the file is too big
        if (proof.size > 20 * 1024 * 1024) {
            await interaction.editReply("File is too big. Max 20MB.");
            return null;
        }

        // calculate file hash
        const file = await fetch(proof.url).then((res) => res.arrayBuffer());
        const fileHashRaw = new Uint8Array(32);
        SHA256.hash(file, fileHashRaw);
        const fileHashString = Buffer.from(fileHashRaw).toString("hex");

        proofString = proof.url;

        proof = fileHashString;
    }

    // check if the proof has been submitted before and not by the same user
    if (db.query(`SELECT * FROM proofs WHERE proof = $proof AND userid != '${interaction.user.id}'`).get({ $proof: proof })) {
        await interaction.editReply("This proof has already been used before by someone else.");
        return null;
    }

    // check if user already has this role
    const roleToCheck = shortRoleToRoleID(role);
    if (roleToCheck && interaction.member.roles.cache.has(roleToCheck)) {
        await interaction.editReply("You already have this role.");
        return null;
    }

    // check if user is on cooldown
    if (cooldowns.has(interaction.user.id) && !interaction.memberPermissions.has("Administrator")) {
        const time = cooldowns.get(interaction.user.id);
        if (!time) {
            return;
        }
        if (Date.now() / 1000 < time + 60) {
            await interaction.editReply(`You're on cooldown. Please wait ${Math.ceil(time + 60 - Date.now() / 1000)} seconds before running this command again.`);
            return null;
        }
    }
    cooldowns.set(interaction.user.id, Date.now() / 1000);

    // now that the command is valid, return the values to be used in the execute function
    return { role, proof, proofString, isLink };
}

const commandRoleOption = new SlashCommandStringOption()
    .setName("role")
    .setDescription("The role you want to apply for.")
    .setRequired(true)
    .setChoices(...Object.entries(config.RoleToName).map(([key, value]) => ({ name: value, value: key })));

export default {
    data: new SlashCommandBuilder()
        .setName("apply")
        .setDescription("Apply for a role")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("link")
                .setDescription("Apply with a link.")
                .addStringOption(commandRoleOption)
                .addStringOption((option) => option.setName("proof").setDescription("Accepts YouTube, Imgur, Medal and Streamable links.").setRequired(true))
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("file")
                .setDescription("Apply with a file.")
                .addStringOption(commandRoleOption)
                .addAttachmentOption((option) =>
                    option.setName("proof").setDescription("A file from your device. Allowed file types: mp4, mov, webm, gif, png, jpg, jpeg. Max 20MB.").setRequired(true)
                )
        ),

    interactions: ["ap-accept", "ap-deny", "ap-infraction"],

    processInteraction,

    async execute(interaction: ChatInputCommandInteraction) {
        try {
            if (!interaction.inCachedGuild()) {
                return await interaction.reply("This command can only be used in the server.");
            }

            await interaction.deferReply({ ephemeral: false });

            const values = await validateCommand(interaction);
            if (!values) {
                return;
            }

            const { role, proof, proofString, isLink } = values;

            // insert proof into database
            db.query(`INSERT OR IGNORE INTO proofs (proof, userid) VALUES ($proof, '${interaction.user.id}')`).run({ $proof: proof });

            interaction.editReply("Your application has been submitted for review.");

            const reviewChannel = (await client.channels.fetch(config.Channels.Toreview)) as TextBasedChannel;
            if (!reviewChannel) {
                throw new Error("No review channel");
            }

            const embed = new EmbedBuilder()
                .setTitle("Role Application")
                .setFields(
                    { name: "Username", value: interaction.user.username, inline: true },
                    { name: "Role applied for:", value: shortRoleToName(role), inline: true },
                    { name: "Proof", value: proofString, inline: false }
                )
                .setColor("DarkPurple")
                .setFooter({ text: interaction.user.id });

            const components = [
                new ActionRowBuilder<ButtonBuilder>().setComponents(
                    new ButtonBuilder().setCustomId("ap-accept").setLabel("Accept").setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId("ap-deny").setLabel("Deny").setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId("ap-infraction").setEmoji("907725559352664154").setLabel("Infraction").setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setURL(proofString).setLabel("View Proof").setStyle(ButtonStyle.Link)
                )
            ];

            reviewChannel.send({ embeds: [embed], components, files: !isLink ? [proofString] : [] });
        } catch (error) {
            console.log(error);
        }
    }
};
