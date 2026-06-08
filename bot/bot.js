// Token Casino VR — Discord admin bot.
// Listens for slash commands and publishes admin events to the game over MQTT.
import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import mqtt from 'mqtt';

const {
  DISCORD_TOKEN,
  ADMIN_CHANNEL = 'token-casino-abcd1234',
  MQTT_URL = 'wss://broker.emqx.io:8084/mqtt',
  ADMINS = '',
} = process.env;

if (!DISCORD_TOKEN) { console.error('Missing DISCORD_TOKEN in .env'); process.exit(1); }

const allowed = ADMINS.split(',').map(s => s.trim()).filter(Boolean);
const TOPIC = `tokencasino/${ADMIN_CHANNEL}/cmd`;

// ---- MQTT ----
const mq = mqtt.connect(MQTT_URL, { reconnectPeriod: 4000 });
mq.on('connect', () => console.log(`🔗 MQTT connected -> ${MQTT_URL} (topic ${TOPIC})`));
mq.on('error', e => console.error('MQTT error:', e.message));
function publish(payload) { mq.publish(TOPIC, JSON.stringify(payload)); }

// ---- Discord ----
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once('clientReady', () => console.log(`🤖 Logged in as ${client.user.tag}`));

client.on('interactionCreate', async (i) => {
  if (!i.isChatInputCommand()) return;

  // permission gate (if ADMINS set, only those users may run commands)
  if (allowed.length && !allowed.includes(i.user.id)) {
    return i.reply({ content: '⛔ You are not an admin.', ephemeral: true });
  }

  try {
    switch (i.commandName) {
      case 'tokens': {
        const amount = i.options.getInteger('amount', true);
        publish({ cmd: 'tokens', amount });
        return i.reply(`🎁 Granted **🪙${amount}** to everyone.`);
      }
      case 'luckboost': {
        const mult = i.options.getNumber('multiplier', true);
        const seconds = i.options.getInteger('seconds') ?? 60;
        publish({ cmd: 'luckboost', mult, seconds });
        return i.reply(`🍀 Luck **x${mult}** for **${seconds}s**.`);
      }
      case 'event': {
        const name = i.options.getString('name', true);
        const seconds = i.options.getInteger('seconds', true);
        const luck = i.options.getNumber('luck') ?? undefined;
        const payout = i.options.getNumber('payout') ?? undefined;
        publish({ cmd: 'event', name, seconds, luck, payout });
        const extra = name === 'rainbow' ? ` (luck x${luck ?? 5}, payout x${payout ?? 5})` : '';
        return i.reply(`✨ Event **${name}** for **${seconds}s**${extra}.`);
      }
      case 'payout': {
        const amount = i.options.getInteger('amount', true);
        publish({ cmd: 'payout', amount });
        return i.reply(`🎲 Double-or-nothing payout of **🪙${amount}** sent to everyone.`);
      }
      default:
        return i.reply({ content: 'Unknown command.', ephemeral: true });
    }
  } catch (err) {
    console.error(err);
    if (!i.replied) i.reply({ content: 'Something went wrong.', ephemeral: true }).catch(() => {});
  }
});

client.login(DISCORD_TOKEN);
