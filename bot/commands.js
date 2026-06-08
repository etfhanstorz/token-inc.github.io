// Slash command definitions, shared by deploy-commands.js and bot.js
import { SlashCommandBuilder } from 'discord.js';

export const EVENT_CHOICES = [
  { name: 'Token Rain',        value: 'rain' },
  { name: '-50% Payout (nerf)', value: 'payout' },
  { name: 'Golden Hour',       value: 'golden' },
  { name: '50x Luck & Payout', value: 'jackpot' },
  { name: 'Rainbow (custom)',  value: 'rainbow' },
  { name: 'Disco Party',       value: 'disco' },
];

export const commands = [
  new SlashCommandBuilder()
    .setName('tokens')
    .setDescription('Grant tokens (everyone, or one user)')
    .addIntegerOption(o => o.setName('amount').setDescription('How many tokens (+)').setRequired(true))
    .addStringOption(o => o.setName('user').setDescription('Username or device id (blank = everyone)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('luckboost')
    .setDescription('Multiply luck (everyone, or one user)')
    .addNumberOption(o => o.setName('multiplier').setDescription('e.g. 2 for x2 luck').setRequired(true))
    .addIntegerOption(o => o.setName('seconds').setDescription('Duration (default 60)').setRequired(false))
    .addStringOption(o => o.setName('user').setDescription('Username or device id (blank = everyone)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('event')
    .setDescription('Trigger a casino-wide event')
    .addStringOption(o => o.setName('name').setDescription('Which event').setRequired(true).addChoices(...EVENT_CHOICES))
    .addIntegerOption(o => o.setName('seconds').setDescription('Duration in seconds').setRequired(true))
    .addNumberOption(o => o.setName('luck').setDescription('Rainbow only: luck multiplier').setRequired(false))
    .addNumberOption(o => o.setName('payout').setDescription('Rainbow only: payout multiplier').setRequired(false))
    .addStringOption(o => o.setName('user').setDescription('Target one user (blank = everyone)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('payout')
    .setDescription('Give a double-or-nothing payout (everyone, or one user)')
    .addIntegerOption(o => o.setName('amount').setDescription('Stake amount (50/50 to double it)').setRequired(true))
    .addStringOption(o => o.setName('user').setDescription('Username or device id (blank = everyone)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('say')
    .setDescription('Broadcast an announcement to everyone in the casino')
    .addStringOption(o => o.setName('message').setDescription('What to say').setRequired(true)),

  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a player (they can rejoin)')
    .addStringOption(o => o.setName('user').setDescription('Username or device id').setRequired(true)),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a player from the casino')
    .addStringOption(o => o.setName('user').setDescription('Username or device id').setRequired(true)),

  new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Lift a ban (they reload to play)')
    .addStringOption(o => o.setName('user').setDescription('Username or device id').setRequired(true)),

  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Force-mute a player\'s mic')
    .addStringOption(o => o.setName('user').setDescription('Username or device id').setRequired(true)),

  new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Let a muted player talk again')
    .addStringOption(o => o.setName('user').setDescription('Username or device id').setRequired(true)),
].map(c => c.toJSON());
