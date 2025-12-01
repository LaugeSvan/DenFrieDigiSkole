const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('apply')
        .setDescription('Start ansøgnings-/adgangsprocessen'),

    async execute(interaction, applications, saveApplications) {
        const member = interaction.member;

        if (applications[member.id]) {
            return interaction.reply({
                content: 'Du har allerede udfyldt adgangsprocessen.',
                ephemeral: true
            });
        }

        await interaction.reply({
            content: 'Starter din ansøgning… tjek dine DM\'s!',
            ephemeral: true
        });

        interaction.client.startApplication(member);
    }
};