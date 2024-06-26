import { EmbedBuilder } from "discord.js";
import type { ClientCommand } from "..";
import { dashboardApi } from "../dashboard";

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

        const commentBody = interaction.message.embeds[0]?.fields[2]?.value;

        const action = interaction.customId.split("-")[2] as "approve" | "deny" | "spam";
        let success: boolean;
        try {
            success = await dashboardApi.ManagePackComment(commentid, action);
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
            
            dashboardApi.SendPushNotification("userid", {
                title: "Comment approved",
                body: `Your comment (${commentBody.slice(0, 15)}...) has been approved.`,
                tag: `comment-${commentid}`
            });
        }
        if (action === "deny") {
            finalEmbed.setColor("Red");
            finalEmbed.setDescription(`Denied by <@${interaction.user.id}>`);

            dashboardApi.SendPushNotification("userid", {
                title: "Comment denied",
                body: `Your comment (${commentBody.slice(0, 15)}...) has been denied.`,
                tag: `comment-denied`
            });
        }
        if (action === "spam") {
            finalEmbed.setColor("DarkRed");
            finalEmbed.setDescription(`Marked as spam by <@${interaction.user.id}>`);

            dashboardApi.SendPushNotification("userid", {
                title: "Comment marked as spam",
                body: `Your comment (${commentBody.slice(0, 15)}...) has been marked as spam.`,
                tag: `comment-spam`
            });
        }

        interaction.update({ embeds: [finalEmbed], components: [] });
    },
    async execute(_) {
        return;
    }
} satisfies ClientCommand;
