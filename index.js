const { Client, GatewayIntentBits, Collection, REST, Routes, EmbedBuilder } = require('discord.js');
const dotenv = require('dotenv');
const fs = require('fs');

dotenv.config();

// Hent tokenet
const BOT_TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = '1438203144306823229';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

const DATA_FILE = './leveldata.json';
let levelData = {};
const POINTS_PER_MESSAGE = 1;
const COOLDOWN_MS = 10000;
const GUILD_ID = '1438918054796070913';

function loadLevelData() {
    if (fs.existsSync(DATA_FILE)) {
        try {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            levelData = JSON.parse(data);
            console.log(`Leveldata indlæst fra ${DATA_FILE}`);
        } catch (error) {
            console.error('Fejl ved indlæsning af leveldata:', error);
            levelData = {};
        }
    } else {
        console.log('Leveldatafil ikke fundet, starter med tom data.');
        levelData = {};
    }
}

function saveLevelData() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(levelData, null, 2), 'utf8');
    } catch (error) {
        console.error('Fejl ved gemme leveldata:', error);
    }
}

/**
 * @param {number} level Det level, man går fra (f.eks. for at nå level 1 skal man have 10 point.
 * @returns {number} Antal nødvendige point.
 */

function getNextLevelPoints(level) {
    if (level === 0) return 10;
    return 10 * Math.pow(2, level);
}


client.on('clientReady', () => {
    loadLevelData();
    console.log(`✅ Logget ind som ${client.user.tag}!`);
    registerSlashCommands();
});

client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const userId = message.author.id;
    const now = Date.now();

    if (!levelData[userId]) {
        levelData[userId] = { points: 0, level: 0, lastMessage: 0 };
    }

    const userData = levelData[userId];

    if (now - userData.lastMessage < COOLDOWN_MS) {
        return;
    }

    userData.points += POINTS_PER_MESSAGE;
    userData.lastMessage = now;

    const requiredPoints = getNextLevelPoints(userData.level);

    if (userData.points >= requiredPoints) {
        userData.level += 1;
        
        console.log(`🎉 ${message.author.tag} har nået Level ${userData.level}!`);
        message.channel.send(`**Tillykke, ${message.author}!** Du har nået **Level ${userData.level}**! 🚀`);
        
        await handleLevelRole(message.member, userData.level);
    }
    
    saveLevelData();
});

/**
 * @param {GuildMember} member Brugeren, der har nået level.
 * @param {number} level Det niveau, brugeren har nået.
 */

async function handleLevelRole(member, level) {
    const guild = member.guild;
    const roleName = `Level ${level}`;
    
    let role = guild.roles.cache.find(r => r.name === roleName);

    if (!role) {
        try {
            role = await guild.roles.create({
                name: roleName,
                color: 'Random',
                reason: `Level-up til Level ${level}`,
                mentionable: true,
            });
            console.log(`Rolle "${roleName}" oprettet.`);
        } catch (error) {
            console.error(`Fejl ved oprettelse af rolle ${roleName}:`, error);
            return;
        }
    }

    const previousLevelRoles = guild.roles.cache.filter(r => 
        r.name.startsWith('Level ') && r.name !== roleName
    );

    for (const [id, prevRole] of previousLevelRoles) {
        if (member.roles.cache.has(id)) {
            await member.roles.remove(prevRole).catch(console.error);
        }
    }

    if (!member.roles.cache.has(role.id)) {
        await member.roles.add(role).catch(console.error);
    }
}

client.commands = new Collection();
const commands = [
    {
        name: 'leaderboard',
        description: 'Viser de 10 bedste brugere baseret på level og point.',
    },
    {
        name: 'info',
        description: 'Viser information om DFDS botten.',
    },
];

async function registerSlashCommands() {
    const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
    
    try {
        console.log('Starter opdatering af (/) applikationskommandoer.');
        
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands },
        );
        
        console.log('Alle (/) applikationskommandoer er indlæst.');
    } catch (error) {
        console.error(error);
    }
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'leaderboard') {
        await handleLeaderboardCommand(interaction);
    } else if (commandName === 'info') {
        await handleInfoCommand(interaction);
    }
});

/**
 * @param {ChatInputCommandInteraction} interaction 
 */
async function handleLeaderboardCommand(interaction) {
    await interaction.deferReply();

    const sortedUsers = Object.keys(levelData)
        .map(id => ({ 
            id: id, 
            ...levelData[id] 
        }))
        .sort((a, b) => {
            if (b.level !== a.level) {
                return b.level - a.level;
            }
            return b.points - a.points;
        })
        .slice(0, 10);

    let leaderboardText = '';
    
    if (sortedUsers.length === 0) {
        leaderboardText = 'Der er endnu ingen på leaderboardet! Skriv en besked for at komme i gang.';
    } else {
        for (let i = 0; i < sortedUsers.length; i++) {
            const user = sortedUsers[i];
            const member = await interaction.guild.members.fetch(user.id).catch(() => null);
            
            const username = member ? member.user.tag : 'Ukendt bruger';
            const rank = i + 1;
            
            leaderboardText += `**#${rank}** - **${username}**\nLevel: \`${user.level}\` | Point: \`${user.points}\`\n\n`;
        }
    }

    const embed = new EmbedBuilder()
        .setTitle('🏆 DFDS Level Leaderboard')
        .setDescription(leaderboardText)
        .setColor('#2ecc71')
        .setTimestamp()
        .setFooter({ text: 'Fortsæt med at chatte for at stige i niveau!' });

    await interaction.editReply({ embeds: [embed] });
}

/**
 * @param {ChatInputCommandInteraction} interaction 
 */

async function handleInfoCommand(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('ℹ️ DFDS Bot Information')
        .setDescription('Denne bot er udviklet til Den Frie Digitale Skole (DFDS) for at tilføje et sjovt level-system.')
        .addFields(
            { name: 'Funktioner', value: 'Level System (1 point pr. besked, 60s cooldown)\n/leaderboard kommando\nAutomatisk Level Rolle-tildeling', inline: true },
            { name: 'Point System', value: 'Level 1: 10 Point\nLevel 2: 20 Point\nLevel 3: 40 Point\n... og så videre - pointene dobler for hvert level.', inline: true },
        )
        .setColor('#3498db')
        .setFooter({ text: `Botten er online siden ${client.readyAt.toLocaleDateString()}` });

    await interaction.reply({ embeds: [embed] });
}

client.login(BOT_TOKEN);