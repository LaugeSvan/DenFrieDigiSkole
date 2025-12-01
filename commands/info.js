const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('info')
        .setDescription('Viser info om en bruger')
        .addUserOption(o =>
            o.setName('bruger')
             .setDescription('Vælg en bruger')
             .setRequired(true)
        ),

    async execute(interaction, applications) {
        const user = interaction.options.getUser('bruger');

        if (!applications[user.id]) {
            return interaction.reply({
                content: 'Ingen data fundet for denne bruger.',
                ephemeral: true
            });
        }

        const data = applications[user.id];

        const embed = new EmbedBuilder()
            .setTitle(`Info om ${user.tag}`)
            .addFields(
                { name: 'Rolle', value: data.role },
                { name: 'Navn', value: data.name },
                { name: 'Elevnummer', value: data.role === 'elev' ? 'Skjult' : 'Ingen' },
                { name: 'Alder', value: data.age }
            )
            .setTimestamp(data.timestamp);

        return interaction.reply({ embeds: [embed] });
    }
};