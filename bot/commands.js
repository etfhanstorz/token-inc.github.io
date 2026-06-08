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
    .setDescription('Grant tokens to everyone in the casino')
    .addIntegerOption(o => o.setName('amount').setDescription('How many tokens (+)').setRequired(true)),

  new SlashCommandBuilder()
    .setName('luckboost')
    .setDescription('Multiply everyone\'s luck')
    .addNumberOption(o => o.setName('multiplier').setDescription('e.g. 2 for x2 luck').setRequired(true))
    .addIntegerOption(o => o.setName('seconds').setDescription('Duration (default 60)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('event')
    .setDescription('Trigger a casino-wide event')
    .addStringOption(o => o.setName('name').setDescription('Which event').setRequired(true).addChoices(...EVENT_CHOICES))
    .addIntegerOption(o => o.setName('seconds').setDescription('Duration in seconds').setRequired(true))
    .addNumberOption(o => o.setName('luck').setDescription('Rainbow only: luck multiplier').setRequired(false))
    .addNumberOption(o => o.setName('payout').setDescription('Rainbow only: payout multiplier').setRequired(false)),

  new SlashCommandBuilder()
    .setName('payout')
    .setDescription('Give everyone a double-or-nothing payout')
    .addIntegerOption(o => o.setName('amount').setDescription('Stake amount (50/50 to double it)').setRequired(true)),
].map(c => c.toJSON());
