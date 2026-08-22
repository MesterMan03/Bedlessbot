import { ChatInputCommandInteraction, MessageFlags, PermissionsBitField, SlashCommandBuilder } from "discord.js";
import { FixBirthdayDatenums, WishBirthdays } from "../birthdaymanager.js";
import { clearConversation, getConversationKey } from "../chatbot/conversation.js";
import { GetXPMultiplier, SetXPMultiplier } from "../levelmanager.js";
import { StartQuickTime } from "../quicktime.js";
import client from "../runtime.js";

export default {
    data: new SlashCommandBuilder()
        .setName("admin")
        .setDescription("Administrative bot controls")
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("xp-multiplier")
                .setDescription("View or change the XP multiplier")
                .addNumberOption((option) => option.setName("value").setDescription("The new XP multiplier"))
        )
        .addSubcommand((subcommand) => subcommand.setName("wish-birthdays").setDescription("Run the birthday job now"))
        .addSubcommand((subcommand) =>
            subcommand.setName("fix-birthday-datenums").setDescription("Recalculate stored birthday date numbers")
        )
        .addSubcommand((subcommand) => subcommand.setName("ping").setDescription("Show the Discord gateway latency"))
        .addSubcommand((subcommand) =>
            subcommand
                .setName("quick-time")
                .setDescription("Start a quick-time event")
                .addStringOption((option) =>
                    option
                        .setName("type")
                        .setDescription("The event type")
                        .addChoices(
                            { name: "Random text", value: "text" },
                            { name: "Reaction", value: "emoji" },
                            { name: "Button", value: "button" },
                            { name: "Word scramble", value: "scramble" }
                        )
                )
        )
        .addSubcommand((subcommand) => subcommand.setName("clear-chat").setDescription("Clear this channel's chatbot history")),

    async execute(interaction: ChatInputCommandInteraction<"cached">) {
        const subcommand = interaction.options.getSubcommand(true);

        if (subcommand === "xp-multiplier") {
            const multiplier = interaction.options.getNumber("value");
            if (multiplier === null) {
                await interaction.reply({ content: `Current XP multiplier: ${GetXPMultiplier()}`, flags: MessageFlags.Ephemeral });
                return;
            }
            if (!Number.isFinite(multiplier)) {
                await interaction.reply({ content: "Invalid XP multiplier", flags: MessageFlags.Ephemeral });
                return;
            }
            SetXPMultiplier(multiplier);
            await interaction.reply({ content: `Set XP multiplier to ${multiplier}`, flags: MessageFlags.Ephemeral });
            return;
        }

        if (subcommand === "wish-birthdays") {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            await WishBirthdays();
            await interaction.editReply("Wished birthdays");
            return;
        }

        if (subcommand === "fix-birthday-datenums") {
            FixBirthdayDatenums();
            await interaction.reply({ content: "Fixed birthday datenums", flags: MessageFlags.Ephemeral });
            return;
        }

        if (subcommand === "ping") {
            await interaction.reply({
                content: `Hi! API Latency: ${Math.round(client.ws.ping)}ms`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        if (subcommand === "quick-time") {
            if (!interaction.channel?.isTextBased() || interaction.channel.isDMBased()) {
                await interaction.reply({ content: "Quick-time events require a server text channel.", flags: MessageFlags.Ephemeral });
                return;
            }
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            await StartQuickTime(interaction.channel, interaction.options.getString("type") ?? undefined);
            await interaction.editReply("Started quick-time event");
            return;
        }

        if (subcommand === "clear-chat") {
            clearConversation(getConversationKey(interaction));
            await interaction.reply({ content: "Successfully cleared the chatbot history.", flags: MessageFlags.Ephemeral });
            return;
        }

        throw new Error(`Unknown admin subcommand: ${subcommand}`);
    }
};
