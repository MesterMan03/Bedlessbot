import { SHA256 } from "bun";
import {
    ActionRowBuilder,
    ApplicationCommandType,
    Attachment,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    ChatInputCommandInteraction,
    ComponentType,
    ContextMenuCommandBuilder,
    EmbedBuilder,
    InteractionContextType,
    Message,
    MessageContextMenuCommandInteraction,
    MessageFlags,
    MessageMentions,
    ModalBuilder,
    PermissionsBitField,
    SlashCommandBuilder,
    SlashCommandStringOption,
    TextInputBuilder,
    TextInputStyle
} from "discord.js";
import { google } from "googleapis";
import client, { GenerateSnowflake, GetGuild, db } from "..";
import config, { isApplyRole, isClutchRole, type ApplyRole } from "../config";

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
    return config.RoleToName[role] ?? "unknown role/clutch";
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

async function processInteraction(interaction: ButtonInteraction<"cached">) {
    const outcomeChannel = await client.channels.fetch(config.Channels.Outcome);
    if (!outcomeChannel || outcomeChannel.isDMBased() || !outcomeChannel.isTextBased()) {
        throw new Error("what the fuck, missing outcome channel");
    }

    const embed = EmbedBuilder.from(interaction.message.embeds[0]);
    // use MessageMentions.UsersPattern to extract the user ID from the "User" field (the id group contains the id)
    const userid = embed.data.fields?.[0]?.value.match(MessageMentions.UsersPattern)?.groups?.id;
    const role = roleNameToShort(embed.data.fields?.[1]?.value);

    if (!role) {
        interaction.reply(`Unknown role/clutch for ${embed.data.fields?.[1]?.value}. This is an error, contact Mester.`);
        return;
    }

    if (!userid) {
        interaction.reply("No user ID found. This is an error, contact Mester.");
        return;
    }

    const member = await GetGuild()
        .members.fetch({ user: userid, force: true })
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

        outcomeChannel.send(`Congratulations <@${member.user.id}>! Your application for ${shortRoleToName(role)} has been accepted!`);

        const roleToAdd = shortRoleToRoleID(role);
        if (!roleToAdd || !GetGuild().roles.cache.has(roleToAdd)) {
            return;
        }

        // save role in db
        db.run(`INSERT OR IGNORE INTO roles_given (userid, roleid) VALUES ('${member.id}', '${roleToAdd}')`);

        member.roles.add(roleToAdd);
    }

    if (interaction.customId === "ap-deny") {
        // ask for reason
        const modalId = `ap-deny-modal-${GenerateSnowflake()}`;
        const reasonModal = new ModalBuilder()
            .setTitle("Reason for denial")
            .setCustomId(modalId)
            .setComponents(
                new ActionRowBuilder<TextInputBuilder>().setComponents(
                    new TextInputBuilder()
                        .setCustomId("reason")
                        .setMaxLength(1024)
                        .setMinLength(1)
                        .setRequired(true)
                        .setLabel("Reason")
                        .setPlaceholder("Provide a reason for denying this application.")
                        .setStyle(TextInputStyle.Paragraph)
                )
            );

        await interaction.showModal(reasonModal);
        interaction
            .awaitModalSubmit({ filter: (i) => i.user.id === interaction.user.id && i.customId === modalId, time: 120_000 })
            .then(async (modal) => {
                const reason = modal.fields.getTextInputValue("reason");
                if (!reason) {
                    return;
                }
                embed.setDescription(`Application denied by <@${interaction.user.id}>`).setColor("Red");
                embed.addFields({ name: "Reason for denial", value: reason });
                modal.deferUpdate();
                interaction.message.edit({ embeds: [embed], components: [] });

                outcomeChannel.send(
                    `<@${member.id}>, your application for ${shortRoleToName(role)} has unfortunately been denied for: ${reason}`
                );
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

        outcomeChannel
            .send(
                `<@${member.id}>, your application for ${shortRoleToName(
                    role
                )} has received an infraction. You now have ${cheatpoint}/3 infractions${
                    cheatpoint === 3 ? " and have been permanently banned from applications 💀" : ""
                }. ${cheatpoint === 2 ? "One more and you're permanently banned from applications." : ""}`
            )
            .then((message) => {
                if (cheatpoint === 3) {
                    message.react("💀");
                }
            });
    }
}

const allowedFileTypes = ["mp4", "mov", "webm", "gif", "png", "jpeg"];
const allowedFileTypesString = allowedFileTypes.map((type) => `.${type}`).join(", ");
const allowedWebsites = ["www.youtube.com", "youtube.com", "youtu.be", "imgur.com", "medal.tv", "streamable.com"];

async function validateLinkProof(interaction: ChatInputCommandInteraction<"cached">, proof: string) {
    proof = proof.trim();

    // pre-validation 1 - check if link contains spaces
    if (proof.includes(" ")) {
        await interaction.editReply("Proof link cannot contain spaces.");
        return false;
    }

    // pre-validation 2 - check if link contains periods
    if (!proof.includes(".")) {
        await interaction.editReply("Invalid proof link.");
        return false;
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
        return false;
    }

    const proofURL = new URL(proof);

    // check if link is from an allowed website
    if (!allowedWebsites.some((website) => proofURL.hostname === website)) {
        await interaction.editReply("The proof link must be from YouTube, Imgur, Medal or Streamable.");
        return false;
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
            return false;
        }

        isPrivate = await checkVideoPrivacy(videoId);
        if (isPrivate !== VideoPrivacyResult.Failed) {
            await interaction.editReply("That video is private or doesn't exist.");
            return false;
        }
    }

    return true;
}

async function validateFileProof(interaction: ChatInputCommandInteraction<"cached">, proof: Attachment) {
    // check if the file is a valid type
    const fileType = proof.contentType?.split("/")[1] ?? "null";
    if (proof.contentType && !allowedFileTypes.includes(fileType)) {
        await interaction.editReply(`Invalid file type. Allowed file types: ${allowedFileTypesString}`);
        return null;
    }

    // check if the file is too big
    if (proof.size > 50 * 1024 * 1024) {
        await interaction.editReply("File is too big. Max 50MB.");
        return null;
    }

    // calculate file hash
    const file = await fetch(proof.url).then((res) => res.arrayBuffer());
    const fileHashRaw = new Uint8Array(32);
    SHA256.hash(file, fileHashRaw);
    return Buffer.from(fileHashRaw).toString("hex");
}

async function validateGuideReaction(interaction: ChatInputCommandInteraction<"cached">, role: ApplyRole) {
    // check if user has reacted to the guide message with a thumbsup
    const guideMessage = await GetGuild()
        .channels.fetch(isClutchRole(role) ? config.Channels.ClutchGuide : config.Channels.Guide)
        .then((channel) => {
            if (!channel?.isTextBased()) {
                throw new Error("Guide channel is not a text channel");
            }

            return channel.messages.fetch(isClutchRole(role) ? config.Channels.ClutchGuideMessage : config.Channels.GuideMessage);
        });

    if (!guideMessage) {
        await interaction.editReply("Guide message couldn't be found. This is not an epic moment, contact Mester.");
        return false;
    }

    const guideReaction = guideMessage.reactions.cache.get("👍");
    if (
        !guideReaction ||
        (await guideReaction.users.fetch({ after: String(BigInt(interaction.user.id) - 1n), limit: 1 })).first()?.id !== interaction.user.id
    ) {
        await interaction.editReply(
            `Please react to the [guide message](${guideMessage.url}) with a thumbs up before applying for a role.`
        );
        return false;
    }
    return true;
}

async function validateCommand(interaction: ChatInputCommandInteraction<"cached">) {
    const role = interaction.options.getString("for", true);
    /**
     * The raw proof, either the link or an attachment.
     * By the end of this function, it becomes a unique identifier for the proof (either the raw link or the file's sha256 hash).
     */
    let proof =
        interaction.options.getSubcommand(true) === "link"
            ? interaction.options.getString("proof", true)
            : interaction.options.getAttachment("proof", true);
    /**
     * The string representation of the proof.
     * This is used to display the proof in the embed. It is either the raw link or the file's url.
     */
    let proofString = "";
    const isLink = interaction.options.getSubcommand(true) === "link";

    if (!isApplyRole(role)) {
        throw new Error("Applied role is not part of config, wtf???");
    }

    // check if user is on cooldown
    if (cooldowns.has(interaction.user.id) && !interaction.memberPermissions.has("Administrator")) {
        const cooldown = cooldowns.get(interaction.user.id);
        if (!cooldown) {
            return null;
        }
        const now = Date.now() / 1000;
        if (now - cooldown < 60) {
            await interaction.editReply(
                `You're on cooldown. Please wait ${Math.ceil(cooldown - now + 60)} seconds before running this command again.`
            );
            return null;
        }
    }

    // check if user already has this role
    const roleToCheck = shortRoleToRoleID(role);
    if (roleToCheck && interaction.member.roles.cache.has(roleToCheck) && !isClutchRole(role)) {
        await interaction.editReply("You already have this role.");
        return null;
    }

    const reactedToGuide = await validateGuideReaction(interaction, role);
    if (!reactedToGuide) {
        return;
    }

    // check if user has at least 3 cheatpoints
    const cheatpoint = db
        .query<{ cheatpoint: number }, []>(`SELECT cheatpoint FROM cheatpoints WHERE userid = '${interaction.user.id}'`)
        .get()?.cheatpoint;

    if (cheatpoint && cheatpoint >= 3) {
        await interaction.editReply("You have been banned from applying for roles/clutches due to having at least 3 cheater points.");
        return null;
    }

    // validate link proof
    if (typeof proof === "string") {
        const valid = await validateLinkProof(interaction, proof);
        if (!valid) {
            return null;
        }

        proofString = proof;
    } else {
        const fileHashString = await validateFileProof(interaction, proof);
        if (!fileHashString) {
            return null;
        }

        proofString = proof.url;
        proof = fileHashString;
    }

    // check if the proof has been submitted before and not by the same user
    if (db.query(`SELECT * FROM proofs WHERE proof = $proof AND userid != '${interaction.user.id}'`).get({ $proof: proof })) {
        await interaction.editReply("This proof has already been used before by someone else.");
        return null;
    }

    // set cooldown
    cooldowns.set(interaction.user.id, Date.now() / 1000);

    // now that the command is valid, return the values to be used in the execute function
    return { role, proof, proofString, isLink };
}

function validateApplicationMessage(message: Message<true>) {
    const messageEmbed = message.embeds[0];
    if (!messageEmbed) {
        return null;
    }

    const fields = messageEmbed.fields;
    if (fields.length < 2) {
        return null;
    }

    const userField = fields[0];
    const userid = MessageMentions.UsersPattern.exec(userField.value)?.groups?.id;
    if (!userid) {
        return null;
    }

    const roleField = fields[1];
    const role = roleNameToShort(roleField.value);
    if (!role) {
        return null;
    }

    return { userid, role } as { userid: string; role: ApplyRole };
}

async function processContextCommand(interaction: MessageContextMenuCommandInteraction<"cached">) {
    const validMessage = validateApplicationMessage(interaction.targetMessage);
    if (!validMessage) {
        interaction.reply({
            content: `This message is not an application message. Use this command on an application message in <#${config.Channels.ToReview}>.`,
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const components = [
        new ActionRowBuilder<ButtonBuilder>().setComponents(
            new ButtonBuilder().setCustomId("-accept").setLabel("Accept").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId("-deny").setLabel("Deny").setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId("-infraction")
                .setEmoji("907725559352664154")
                .setLabel("Infraction")
                .setStyle(ButtonStyle.Secondary)
        )
    ];

    const reply = await interaction.reply({
        content: "Please select the option to override the application with!",
        components,
        flags: MessageFlags.Ephemeral
    });

    reply
        .awaitMessageComponent({
            filter: (i) => ["-accept", "-deny", "-infraction"].includes(i.customId),
            componentType: ComponentType.Button
        })
        .then((oInteraction) => {
            oInteraction.deferUpdate();
            reply.edit({ content: "Application overriden!", components: [] });
            console.log(oInteraction.customId);
        });
}

const commandRoleOption = new SlashCommandStringOption()
    .setName("for")
    .setDescription("The role/clutch you want to apply for.")
    .setRequired(true)
    .setChoices(...Object.entries(config.RoleToName).map(([key, value]) => ({ name: value, value: key })));

export default {
    data: new SlashCommandBuilder()
        .setName("apply")
        .setDescription("Apply for a role/clutch")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("link")
                .setDescription("Apply with a link.")
                .addStringOption(commandRoleOption)
                .addStringOption((option) =>
                    option.setName("proof").setDescription("Accepts YouTube, Imgur, Medal and Streamable links.").setRequired(true)
                )
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("file")
                .setDescription("Apply with a file.")
                .addStringOption(commandRoleOption)
                .addAttachmentOption((option) =>
                    option
                        .setName("proof")
                        .setDescription("A file from your device. Allowed file types: mp4, mov, webm, gif, png, jpg, jpeg. Max 50MB.")
                        .setRequired(true)
                )
        ),

    interactions: ["ap-accept", "ap-deny", "ap-infraction"],
    processInteraction,

    contextCommands: {
        "Override Application": new ContextMenuCommandBuilder()
            .setName("Override Application")
            .setType(ApplicationCommandType.Message)
            .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
            .setContexts(InteractionContextType.Guild)
    },
    processContextCommand,

    async execute(interaction: ChatInputCommandInteraction<"cached">) {
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const validated = await validateCommand(interaction);
            if (!validated) {
                return;
            }

            const { role, proof, proofString, isLink } = validated;

            // insert proof into database
            db.query(`INSERT OR IGNORE INTO proofs (proof, userid) VALUES ($proof, '${interaction.user.id}')`).run({ $proof: proof });

            interaction.editReply("Your application has been submitted for review.");

            const reviewChannel = await client.channels.fetch(config.Channels.ToReview);
            if (!reviewChannel || reviewChannel.isDMBased() || !reviewChannel.isTextBased()) {
                throw new Error("No review channel / not a text channel");
            }

            const embed = new EmbedBuilder()
                .setTitle("Application")
                .setFields(
                    { name: "User", value: interaction.user.toString(), inline: true },
                    { name: "Applied for:", value: shortRoleToName(role), inline: true },
                    { name: "Proof", value: proofString, inline: false }
                )
                .setColor("DarkPurple");

            const components = [
                new ActionRowBuilder<ButtonBuilder>().setComponents(
                    new ButtonBuilder().setCustomId("ap-accept").setLabel("Accept").setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId("ap-deny").setLabel("Deny").setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId("ap-infraction")
                        .setEmoji("907725559352664154")
                        .setLabel("Infraction")
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setURL(proofString).setLabel("View Proof").setStyle(ButtonStyle.Link)
                )
            ];

            reviewChannel.send({ embeds: [embed], components, files: !isLink ? [proofString] : [] }).then((message) => {
                if (isLink) {
                    message.reply({ content: proofString, allowedMentions: { repliedUser: false } });
                }
            });
        } catch (error) {
            console.log(error);
        }
    }
};
