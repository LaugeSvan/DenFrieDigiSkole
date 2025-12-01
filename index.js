const { 
    Client, GatewayIntentBits, Collection, REST, Routes,
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle 
} = require('discord.js');
const fs = require('fs');
const dotenv = require('dotenv');

// --- SETUP ---
console.log('✅ Loading environment variables...');
dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
// NOTE: These IDs are hardcoded as per your request, but are ideally loaded from .env.
const CLIENT_ID = '1438203144306823229'; 
const GUILD_ID = '1438918054796070913';
const PENDING_ROLE = '1438944157522595971';
const MEMBER_ROLE = '1438944177084956783';
const REVIEW_CHANNEL = '1438940778448683118';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ]
});

client.commands = new Collection();

const DATA_FILE = './applications.json';
let applications = {};

// --- UTILITY FUNCTIONS ---

function loadApplications() {
    console.log(`⏳ Attempting to load application data from ${DATA_FILE}...`);
    if (fs.existsSync(DATA_FILE)) {
        applications = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        console.log(`✅ Application data loaded. Found ${Object.keys(applications).length} existing applications.`);
    } else {
        console.log(`⚠️ Data file ${DATA_FILE} not found. Starting with empty application list.`);
    }
}

function saveApplications() {
    console.log('🔄 Saving application data to disk...');
    fs.writeFileSync(DATA_FILE, JSON.stringify(applications, null, 2));
    console.log('✅ Application data saved successfully.');
}

function loadCommands() {
    console.log('⏳ Loading bot commands...');
    const commandFiles = fs.readdirSync('./commands').filter(f => f.endsWith('.js'));
    console.log(`Found ${commandFiles.length} command file(s).`);

    for (const file of commandFiles) {
        const command = require(`./commands/${file}`);
        client.commands.set(command.data.name, command);
        console.log(`-> Loaded command: /${command.data.name}`);
    }
    console.log('✅ All commands loaded into collection.');
}

async function registerSlashCommands() {
    console.log('⏳ Registering slash commands with Discord...');
    const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
    const body = client.commands.map(cmd => cmd.data);

    try {
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body }
        );
        console.log(`✅ Successfully registered ${body.length} application commands for GUILD_ID: ${GUILD_ID}`);
    } catch (error) {
        console.error('❌ ERROR during slash command registration:', error);
    }
}

// ---------------- APPLICATION FLOW ----------------

async function startApplication(member) {
    console.log(`--- NEW APPLICATION: User ${member.user.tag} (${member.id}) initiated application.`);

    const questions = {
        elev: [
            'Hvad er dit navn? Skriv "anonym" hvis du vil skjule det.',
            'Indtast dit elevnummer (5 cifre).',
            'Hvor gammel er du? Eller skriv "anonym".'
        ],
        lærer: [
            'Hvad er dit navn? Skriv "anonym" hvis du vil skjule det.',
            'Hvor gammel er du? Eller skriv "anonym".'
        ]
    };

    let roleType = null;
    const answers = {};
    let step = 0;
    let year = null;

    const dm = await member.send('Velkommen! Du skal besvare nogle spørgsmål for at få adgang.').catch(() => {
        console.log(`⚠️ Could not send DM to ${member.user.tag}. They might have DMs disabled.`);
        return null;
    });
    if (!dm) return;
    console.log(`Sent initial welcome message to ${member.user.tag}'s DMs.`);
    
    await member.send('Er du **lærer** eller **elev**? Svar kun "lærer" eller "elev".');

    const collector = dm.channel.createMessageCollector({ time: 600000 });
    console.log('Message collector started in DM channel.');

    collector.on('collect', async msg => {
        if (msg.author.id !== member.id) return;
        const content = msg.content.trim();
        console.log(`-> Collector received message from ${member.user.tag}: "${content}" (Step: ${step}, RoleType: ${roleType})`);

        if (!roleType) {
            if (content !== 'elev' && content !== 'lærer') {
                console.log('-> Invalid role type response.');
                return member.send('Svar skal være "lærer" eller "elev".');
            }
            roleType = content;
            console.log(`-> Role type set to: ${roleType}. Moving to first question.`);
            return member.send(questions[roleType][step]);
        }
        
        // --- Elevated logging for step-by-step processing ---

        if (roleType === 'elev') {
            if (step === 0) {
                answers.name = content;
                step++;
                console.log(`-> ELEV Step 0 (Name) complete. Asking Q${step}.`);
                return member.send(questions.elev[step]);
            }

            if (step === 1) {
                if (!/^\d{5}$/.test(content)) {
                    console.log('-> ELEV Step 1 (Elevnummer) FAILED validation: not 5 digits.');
                    return member.send('Elevnummer skal være præcis 5 cifre.');
                }
                year = parseInt(content.slice(0, 2));
                const now = new Date().getFullYear() % 100;

                if (year < 20 || year > now) {
                     console.log(`-> ELEV Step 1 (Elevnummer) FAILED validation: Invalid year prefix (${year}).`);
                     return member.send('Ugyldigt elevnummer.');
                }

                answers.elevnummer = content;
                step++;
                console.log(`-> ELEV Step 1 (Elevnummer) complete. Asking Q${step}. Year extracted: 20${year}`);
                return member.send(questions.elev[step]);
            }

            if (step === 2) {
                answers.age = content;
                console.log('-> ELEV Step 2 (Age) complete. Application finished.');
                collector.stop('done');
            }
        }

        if (roleType === 'lærer') {
            if (step === 0) {
                answers.name = content;
                step++;
                console.log(`-> LÆRER Step 0 (Name) complete. Asking Q${step}.`);
                return member.send(questions.lærer[step]);
            }

            if (step === 1) {
                answers.age = content;
                answers.elevnummer = null;
                console.log('-> LÆRER Step 1 (Age) complete. Application finished.');
                collector.stop('done');
            }
        }
    });

    collector.on('end', async (_, reason) => {
        console.log(`--- Application collector ended. Reason: ${reason}`);

        if (reason !== 'done') {
            console.log(`Application for ${member.user.tag} stopped due to reason: ${reason}.`);
            return;
        }

        applications[member.id] = {
            role: roleType,
            name: answers.name,
            elevnummer: answers.elevnummer,
            age: answers.age,
            timestamp: Date.now()
        };
        saveApplications();
        console.log(`Saved application data for ${member.user.tag} (Role: ${roleType}).`);

        const channel = member.guild.channels.cache.get(REVIEW_CHANNEL);

        // --- ELEV: auto accept ---
        if (roleType === 'elev') {
            console.log('Processing ELEV application: Auto-approving.');
            
            if (channel) {
                const yearPrefix = answers.elevnummer ? answers.elevnummer.slice(0, 2) : 'XX';
                const embed = new EmbedBuilder()
                    .setTitle(`✅ Ny elev: ${member.user.tag} (Auto-godkendt)`)
                    .addFields(
                        { name: 'Navn', value: answers.name },
                        { name: 'Elevnummer', value: `Har gået på skolen siden 20${yearPrefix}` },
                        { name: 'Alder', value: answers.age }
                    );
                channel.send({ embeds: [embed] });
                console.log(`Sent auto-approved ELEV notice to REVIEW_CHANNEL (${REVIEW_CHANNEL}).`);
            }

            await member.roles.remove(PENDING_ROLE).catch(e => console.error('❌ Failed to remove PENDING_ROLE:', e.message));
            await member.roles.add(MEMBER_ROLE).catch(e => console.error('❌ Failed to add MEMBER_ROLE:', e.message));
            await member.send('Du er automatisk godkendt som elev. Velkommen!').catch(e => console.error('❌ Failed to send final DM:', e.message));
            
            console.log(`✅ ELEV ${member.user.tag} is approved and roles updated.`);
            return;
        }

        // --- LÆRER: send review ---
        if (roleType === 'lærer') {
            console.log('Processing LÆRER application: Sending for manual review.');
            
            if (channel) {
                const embed = new EmbedBuilder()
                    .setTitle(`⚠️ Ny lærer-ansøgning: ${member.user.tag} (Manual Review)`)
                    .addFields(
                        { name: 'Navn', value: answers.name },
                        { name: 'Elevnummer', value: 'Ingen' },
                        { name: 'Alder', value: answers.age }
                    );

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`approve_${member.id}`).setLabel('Godkend').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`deny_${member.id}`).setLabel('Afvis').setStyle(ButtonStyle.Danger)
                );

                channel.send({ embeds: [embed], components: [row] });
                console.log(`Sent LÆRER application for ${member.user.tag} to REVIEW_CHANNEL.`);
            }

            await member.send('Tak for dine svar! En lærer skal godkende dig.').catch(e => console.error('❌ Failed to send final DM:', e.message));
        }
    });
}

// Make startApplication available to commands
client.startApplication = startApplication;

// ---------------- EVENTS ----------------

client.on('ready', () => {
    console.log('----------------------------------------------------');
    console.log(`🤖 Bot is logged in as ${client.user.tag}! (ID: ${client.user.id})`);
    console.log('----------------------------------------------------');
    loadApplications();
    loadCommands();
    registerSlashCommands();
});

client.on('guildMemberAdd', async member => {
    console.log(`\n🔔 EVENT: guildMemberAdd for ${member.user.tag} (${member.id})`);
    if (member.user.bot) {
        console.log('-> User is a bot. Ignoring.');
        return;
    }
    if (applications[member.id]) {
        console.log('-> User already has an existing application record. Ignoring new application process.');
        return;
    }

    await member.roles.add(PENDING_ROLE).catch(e => console.error(`❌ Failed to assign PENDING_ROLE (${PENDING_ROLE}):`, e.message));
    console.log(`-> Assigned PENDING_ROLE to ${member.user.tag}.`);
    startApplication(member);
});

client.on('interactionCreate', async i => {
    if (i.isChatInputCommand()) {
        console.log(`\n🖱️ INTERACTION: Command received: /${i.commandName} from ${i.user.tag}.`);
        const cmd = client.commands.get(i.commandName);
        if (cmd) {
            console.log(`-> Executing command handler for /${i.commandName}.`);
            return cmd.execute(i, applications, saveApplications);
        }
    }

    if (i.isButton()) {
        const [action, userId] = i.customId.split('_');
        console.log(`\n🖱️ INTERACTION: Button click received: "${action}" for user ID ${userId} by ${i.user.tag}.`);
        
        if (!i.member.permissions.has('Administrator')) {
             console.log(`-> User ${i.user.tag} attempted button action without permission. Denied.`);
             return i.reply({ content: 'Du har ikke tilladelse til at gøre dette.', ephemeral: true });
        }

        const guild = i.guild;
        const member = await guild.members.fetch(userId).catch(() => null);

        if (!member) {
            console.log(`-> Target user ${userId} not found in guild.`);
            return i.reply({ content: 'Bruger ikke fundet.', ephemeral: true });
        }

        if (action === 'approve') {
            console.log(`-> APPROVING application for ${member.user.tag}.`);
            await member.roles.remove(PENDING_ROLE).catch(e => console.error('❌ Failed to remove PENDING_ROLE:', e.message));
            await member.roles.add(MEMBER_ROLE).catch(e => console.error('❌ Failed to add MEMBER_ROLE:', e.message));
            await member.send('Din ansøgning er godkendt!').catch(e => console.error('❌ Failed to send approval DM:', e.message));
            
            console.log(`✅ ${member.user.tag} approved and roles updated.`);
            return i.reply({ content: `Godkendte ${member.user.tag}`, ephemeral: true });
        }

        if (action === 'deny') {
            console.log(`-> DENYING application for ${member.user.tag}.`);
            await member.send('Din ansøgning blev afvist.').catch(e => console.error('❌ Failed to send denial DM:', e.message));
            
            delete applications[userId];
            saveApplications();
            
            await member.kick('Ansøgning afvist.').catch(e => console.error(`❌ Failed to kick ${member.user.tag}:`, e.message));
            
            console.log(`❌ ${member.user.tag} denied, application deleted, and user kicked.`);
            return i.reply({ content: `Afviste ${member.user.tag}`, ephemeral: true });
        }
    }
});

console.log(`\n🚀 Attempting to log in with BOT_TOKEN...`);
client.login(BOT_TOKEN).catch(error => {
    // If the login fails, it catches the error here.
    console.error('----------------------------------------------------');
    console.error('❌ FATAL ERROR: FAILED TO LOG IN TO DISCORD!');
    console.error('❌ Check your BOT_TOKEN in the .env file.');
    console.error(`Error Message: ${error.message}`);
    console.error('----------------------------------------------------');
    process.exit(1); 
});