// XIVBuddy Discord Bot
// Run with: node bot.js
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, InteractionType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
require('dotenv').config();
const { User, Server, ServerUser, Channel, sequelize } = require('./models');

const TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.BOT_CLIENT_ID;
const GUILD_ID = process.env.BOT_GUILD_ID; // Optional: for testing in a single guild

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Register slash command
async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('xivbuddy')
      .setDescription('Open XIVBuddy actions menu'),
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      console.log('Registered commands (guild)');
    } else {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log('Registered commands (global)');
    }
  } catch (err) {
    console.error(err);
  }
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  // Handle Mark All Tended button for all plots in a channel
  if (interaction.isButton() && interaction.customId.startsWith('tendall_channel_')) {
    const channelId = interaction.customId.replace('tendall_channel_', '');
    const member = interaction.member || (interaction.guild && await interaction.guild.members.fetch(interaction.user.id));
    if (!member || !member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: 'You do not have permission to mark these plots as tended.', ephemeral: true });
      return;
    }
    const { Crop, AlertQueue, Plot } = require('./models');
    // Get all alert queue entries for this channel
    const queueEntries = await AlertQueue.findAll({ where: { channelId } });
    const plotIds = queueEntries.map(e => e.plotId);
    const crops = await Crop.findAll({ where: { PlotId: plotIds } });
    const now = new Date();
    for (const crop of crops) {
      crop.lastTendedAt = now;
      await crop.save();
    }
    // Remove all alert queue entries for this channel
    await AlertQueue.destroy({ where: { channelId } });
    await interaction.reply({ content: 'All crops in all alerted plots for this channel have been marked as tended!', ephemeral: false });
    return;
  }
  if (interaction.type === InteractionType.ApplicationCommand && interaction.commandName === 'xivbuddy') {
    // Ensure DB has user and server
    const [user] = await User.findOrCreate({
      where: { discordId: interaction.user.id },
      defaults: { username: interaction.user.username, discriminator: interaction.user.discriminator }
    });
    const [server] = await Server.findOrCreate({
      where: { discordId: interaction.guild.id },
      defaults: { name: interaction.guild.name }
    });
    // Check if user is registered to this server
    const serverUser = await ServerUser.findOne({ where: { UserId: user.id, ServerId: server.id } });
    const userRegistered = !!serverUser;
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

    const buttons = [
      new ButtonBuilder()
        .setCustomId(userRegistered ? 'unregister_user' : 'register_user')
        .setLabel(userRegistered ? 'Unregister User from Server' : 'Register User to Server')
        .setStyle(userRegistered ? ButtonStyle.Danger : ButtonStyle.Primary),
      isAdmin && new ButtonBuilder()
        .setCustomId('register_channel')
        .setLabel('Register Channel')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setLabel('Open XIVBuddy')
        .setStyle(ButtonStyle.Link)
        .setURL('https://xivbuddy.katos.xyz'),
    ].filter(Boolean);

    const row = new ActionRowBuilder().addComponents(buttons);

    await interaction.reply({
      content: 'XIVBuddy Actions:',
      components: [row],
      ephemeral: true
    });
  }

  // Button interactions
  if (interaction.isButton()) {
    // Always ensure user/server exist
    const [user] = await User.findOrCreate({
      where: { discordId: interaction.user.id },
      defaults: { username: interaction.user.username, discriminator: interaction.user.discriminator }
    });
    const [server] = await Server.findOrCreate({
      where: { discordId: interaction.guild.id },
      defaults: { name: interaction.guild.name }
    });
    if (interaction.customId === 'register_user') {
      await ServerUser.findOrCreate({
        where: { UserId: user.id, ServerId: server.id },
        defaults: { isAdmin: interaction.member.permissions.has(PermissionFlagsBits.Administrator) }
      });
      await interaction.reply({ content: 'You have been registered to this server!', ephemeral: true });
    } else if (interaction.customId === 'unregister_user') {
      await ServerUser.destroy({ where: { UserId: user.id, ServerId: server.id } });
      await interaction.reply({ content: 'You have been unregistered from this server.', ephemeral: true });
    } else if (interaction.customId === 'register_channel') {
      // Only allow admins
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: 'Only server admins can register channels.', ephemeral: true });
        return;
      }
      await Channel.findOrCreate({
        where: { discordId: interaction.channel.id },
        defaults: { name: interaction.channel.name, ServerId: server.id }
      });
      await interaction.reply({ content: `Channel <#${interaction.channel.id}> registered for XIVBuddy alerts!`, ephemeral: true });
    }
  }
});

// Alert queue processing: send Discord notifications for overdue plots
const { AlertQueue, Plot } = require('./models');
async function processAlertQueue() {
  const entries = await AlertQueue.findAll({ include: [Plot] });
  const now = new Date();
  // Group unsent entries by channelId
  const channelMap = {};
  for (const entry of entries) {
    // Check if plot is no longer overdue (<23h since lastTendedAt for all crops)
    if (entry.plantInfo && Array.isArray(entry.plantInfo)) {
      const allTended = entry.plantInfo.every(crop => crop.lastTendedAt && (now - new Date(crop.lastTendedAt)) < 23 * 60 * 60 * 1000);
      if (allTended) {
        await entry.destroy(); // Clear alert if plot has been tended
        continue;
      }
    }
    if (entry.sent) continue; // Only notify if not already sent
    if (!channelMap[entry.channelId]) channelMap[entry.channelId] = [];
    channelMap[entry.channelId].push(entry);
  }
  // Send a single message per channel
  for (const channelId of Object.keys(channelMap)) {
    const entries = channelMap[channelId];
    if (!entries.length) continue;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) continue;
    let msg = `:warning: **Plot Alerts** :warning:\n`;
    entries.forEach(entry => {
      msg += `\n__Plot: ${entry.plotName}__`;
      if (entry.plantInfo && Array.isArray(entry.plantInfo)) {
        msg += "\nCrops:";
        entry.plantInfo.forEach(crop => {
          msg += `\n- Bed ${crop.bedNumber}: ${crop.cropName} (Last tended: ${crop.lastTendedAt ? new Date(crop.lastTendedAt).toLocaleString() : 'Never'})`;
        });
      }
      msg += "\n";
    });
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`tendall_channel_${channelId}`)
        .setLabel('Mark All Tended')
        .setStyle(ButtonStyle.Success)
    );
    await channel.send({ content: msg, components: [row] }).catch(() => {});
    // Mark all entries as sent
    for (const entry of entries) {
      entry.sent = true;
      await entry.save();
    }
  }
}

setInterval(processAlertQueue, 60 * 1000); // every minute

// Ensure DB tables exist before starting the bot
(async () => {
  try {
    // In production, do not sync DB here. Ensure migrations are run manually.
    await registerCommands();
    client.login(TOKEN);
  } catch (err) {
    console.error('Failed to start bot:', err);
    process.exit(1);
  }
})();
