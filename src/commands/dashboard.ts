import { EmbedBuilder } from "discord.js";
import type { ClientCommand } from "..";
import { api } from "../dashboard";

export default {
    data: null,
    name: "dash",
    interactions: ["dash-comment-approve", "dash-comment-deny", "dash-comment-spam"],
    async processInteraction(interaction) {
        const commentid = interaction.message.embeds[0]?.footer?.text;
        if (!commentid) {
            interaction.reply("Comment ID not found. This is an error, contact Mester.");
            return;
        }

        const action = interaction.customId.split("-")[2] as "approve" | "deny" | "spam";
        let success: boolean;
        try {
            success = await api.ManagePackComment(commentid, action);
        } catch {
            success = false;
        }

        if (!success) {
            interaction.reply("An error occurred while processing the comment. This is an error, contact Mester.");
            return;
        }

        const finalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
        if (action === "approve") {
            finalEmbed.setColor("Green");
            finalEmbed.setDescription(`Approved by <@${interaction.user.id}>`);
        }
        if (action === "deny") {
            finalEmbed.setColor("Red");
            finalEmbed.setDescription(`Denied by <@${interaction.user.id}>`);
        }
        if (action === "spam") {
            finalEmbed.setColor("DarkRed");
            finalEmbed.setDescription(`Marked as spam by <@${interaction.user.id}>`);
        }

        interaction.update({ embeds: [finalEmbed], components: [] });
    },
    async execute(_) {
        return;
    }
} satisfies ClientCommand;
