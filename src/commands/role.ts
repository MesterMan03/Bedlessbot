import { ChatInputCommandInteraction, GuildMember, PermissionsBitField, SlashCommandBuilder } from "discord.js";
import config from "../config";

export default {
    data: new SlashCommandBuilder()
        .setName("role")
        .setDescription("Add or remove a role from a user")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("add")
                .setDescription("Add a role to a user")
                .addUserOption((option) => option.setName("member").setDescription("The user to add the role to").setRequired(true))
                .addRoleOption((option) => option.setName("role").setDescription("The role to add").setRequired(true))
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("remove")
                .setDescription("Remove a role from a user")
                .addUserOption((option) => option.setName("member").setDescription("The user to remove the role from").setRequired(true))
                .addRoleOption((option) => option.setName("role").setDescription("The role to remove").setRequired(true))
        )
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageRoles),

    async execute(interaction: ChatInputCommandInteraction) {
        const member = interaction.options.getMember("member");
        const role = interaction.options.getRole("role", true);

        if (!(member instanceof GuildMember)) {
            await interaction.reply("User not found");
            return;
        }

        if (!config.AllowedRolesComand.includes(role.id)) {
            await interaction.reply("You are not allowed to add or remove this role");
            return;
        }

        if (interaction.options.getSubcommand() === "add") {
            await member.roles.add(role.id);
            await interaction.reply(`Added the role ${role.name} to ${member.user.tag}`);
        }

        if (interaction.options.getSubcommand() === "remove") {
            await member.roles.remove(role.id);
            await interaction.reply(`Removed the role ${role.name} from ${member.user.tag}`);
        }
    },
};
