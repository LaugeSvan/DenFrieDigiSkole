const { Client, GatewayIntentBits, Collection, REST, Routes, EmbedBuilder } = require('discord.js');
const dotenv = require('dotenv');
const fs = require('fs');

// Indlæs miljøvariabler fra .env filen
dotenv.config();

// Hent tokenet
const BOT_TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = '1438203144306823229'; // ERSTAT MED DIN BOTS CLIENT ID!

// Opret en ny Discord-klient
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // Nødvendig for at læse beskedindhold og dermed tælle point
    ],
});

// Sti til datafilen (brug f.eks. en simpel JSON-fil til dette eksempel)
const DATA_FILE = './leveldata.json';
let levelData = {}; // Gemmer brugerdata: { 'userID': { points: 0, level: 0, lastMessage: 0 } }
const POINTS_PER_MESSAGE = 1;
const COOLDOWN_MS = 10000; // 60 sekunders cooldown for at forhindre spam-leveling
const GUILD_ID = '1438918054796070913'; // ERSTAT MED ID'ET PÅ DEN SERVER, DFDS BOTTEN KØRER PÅ

// --- Funktionalitet for Level Data ---

/**
 * Indlæser leveldata fra filen.
 */
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

/**
 * Gemmer leveldata til filen.
 */
function saveLevelData() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(levelData, null, 2), 'utf8');
        // console.log(`Leveldata gemt til ${DATA_FILE}`);
    } catch (error) {
        console.error('Fejl ved gemme leveldata:', error);
    }
}

/**
 * Beregner de nødvendige point for det næste level.
 * Level 1 = 10 point
 * Level 2 = 20 point
 * Level 3 = 40 point
 * Level N = 10 * 2^(N-1) point
 * @param {number} level Det level, man går fra (f.eks. for at nå level 1 skal man have 10 point.
 * @returns {number} Antal nødvendige point.
 */
function getNextLevelPoints(level) {
    if (level === 0) return 10;
    return 10 * Math.pow(2, level);
}

// --- Funktionalitet for Discord Events ---

client.on('clientReady', () => {
    loadLevelData(); // Indlæs data, når botten er klar
    console.log(`✅ Logget ind som ${client.user.tag}!`);
    registerSlashCommands();
});

// Håndtering af beskeder for at tildele point
client.on('messageCreate', async message => {
    // Ignorer beskeder fra bots og systembeskeder
    if (message.author.bot || !message.guild) return;

    const userId = message.author.id;
    const now = Date.now();

    // Initialiser brugeren, hvis den ikke eksisterer
    if (!levelData[userId]) {
        levelData[userId] = { points: 0, level: 0, lastMessage: 0 };
    }

    const userData = levelData[userId];

    // Check for cooldown
    if (now - userData.lastMessage < COOLDOWN_MS) {
        // console.log(`${message.author.tag} er i cooldown.`);
        return;
    }

    // Tildel point og opdater tidspunkt
    userData.points += POINTS_PER_MESSAGE;
    userData.lastMessage = now;

    // Tjek for level up
    const requiredPoints = getNextLevelPoints(userData.level);

    if (userData.points >= requiredPoints) {
        userData.level += 1;
        
        // Log og send besked om Level Up
        console.log(`🎉 ${message.author.tag} har nået Level ${userData.level}!`);
        message.channel.send(`**Tillykke, ${message.author}!** Du har nået **Level ${userData.level}**! 🚀`);
        
        // Kald funktionen til at tildele level-rolle
        await handleLevelRole(message.member, userData.level);
    }
    
    saveLevelData(); // Gem data efter hver potentiel opdatering
});

/**
 * Håndterer oprettelse og tildeling af level-roller.
 * @param {GuildMember} member Brugeren, der har nået level.
 * @param {number} level Det niveau, brugeren har nået.
 */
async function handleLevelRole(member, level) {
    const guild = member.guild;
    const roleName = `Level ${level}`;
    
    // Find eller opret rollen
    let role = guild.roles.cache.find(r => r.name === roleName);

    if (!role) {
        try {
            // Opret rollen
            role = await guild.roles.create({
                name: roleName,
                color: 'Random', // Giv rollen en tilfældig farve
                reason: `Level-up til Level ${level}`,
                mentionable: true, // Gør rollen nævnbar, hvis det ønskes
            });
            console.log(`Rolle "${roleName}" oprettet.`);
        } catch (error) {
            console.error(`Fejl ved oprettelse af rolle ${roleName}:`, error);
            return;
        }
    }

    // Fjern tidligere level-roller, hvis de eksisterer (valgfrit, men anbefalet)
    const previousLevelRoles = guild.roles.cache.filter(r => 
        r.name.startsWith('Level ') && r.name !== roleName
    );

    for (const [id, prevRole] of previousLevelRoles) {
        if (member.roles.cache.has(id)) {
            await member.roles.remove(prevRole).catch(console.error);
        }
    }

    // Tildel den nye level-rolle
    if (!member.roles.cache.has(role.id)) {
        await member.roles.add(role).catch(console.error);
    }
}

// --- Slash Kommandoer (Commands) ---

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

// Funktion til at registrere slash-kommandoer (Applikationskommandoer)
async function registerSlashCommands() {
    const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
    
    try {
        console.log('Starter opdatering af (/) applikationskommandoer.');
        
        // Opdater kommandoer for en specifik guild/server
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands },
        );
        
        console.log('Alle (/) applikationskommandoer er indlæst.');
    } catch (error) {
        console.error(error);
    }
}

// Håndtering af kommandoer
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
 * Håndterer /leaderboard kommandoen.
 * @param {ChatInputCommandInteraction} interaction 
 */
async function handleLeaderboardCommand(interaction) {
    await interaction.deferReply(); // Sørg for at botten svarer hurtigt

    // Konverter levelData til en liste og sorter
    const sortedUsers = Object.keys(levelData)
        .map(id => ({ 
            id: id, 
            ...levelData[id] 
        }))
        .sort((a, b) => {
            // Sorter efter Level (højest først)
            if (b.level !== a.level) {
                return b.level - a.level;
            }
            // Hvis Levels er ens, sorter efter Point (højest først)
            return b.points - a.points;
        })
        .slice(0, 10); // Tag kun de 10 bedste

    // Opret leaderboard tekst
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

    // Opret embed
    const embed = new EmbedBuilder()
        .setTitle('🏆 DFDS Level Leaderboard')
        .setDescription(leaderboardText)
        .setColor('#2ecc71') // DFDS grøn?
        .setTimestamp()
        .setFooter({ text: 'Fortsæt med at chatte for at stige i niveau!' });

    await interaction.editReply({ embeds: [embed] });
}

/**
 * Håndterer /info kommandoen (TBD - To Be Determined)
 * @param {ChatInputCommandInteraction} interaction 
 */
async function handleInfoCommand(interaction) {
     // Opret embed
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


// Start botten
client.login(BOT_TOKEN);