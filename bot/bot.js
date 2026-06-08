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
  PATCHNOTES_WEBHOOK_URL = '',
} = process.env;

// Post a formatted patch-notes embed to a Discord webhook
async function postPatchNotes(title, notes, author) {
  if (!PATCHNOTES_WEBHOOK_URL) { console.warn('No PATCHNOTES_WEBHOOK_URL set'); return; }
  const embed = {
    title: `📝 ${title}`,
    description: notes.slice(0, 4000),
    color: 0x5dd6ff,
    footer: { text: `Token Casino VR • released by ${author?.username || 'admin'}` },
    timestamp: new Date().toISOString(),
  };
  try {
    await fetch(PATCHNOTES_WEBHOOK_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Token Casino Patch Notes', embeds: [embed] }),
    });
  } catch (e) { console.error('patchnotes webhook failed', e); }
}

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
        const user = i.options.getString('user') ?? undefined;
        publish({ cmd: 'tokens', amount, target: user });
        return i.reply(`🎁 Granted **🪙${amount}** to ${user ? `**${user}**` : 'everyone'}.`);
      }
      case 'luckboost': {
        const mult = i.options.getNumber('multiplier', true);
        const seconds = i.options.getInteger('seconds') ?? 60;
        const user = i.options.getString('user') ?? undefined;
        publish({ cmd: 'luckboost', mult, seconds, target: user });
        return i.reply(`🍀 Luck **x${mult}** for **${seconds}s** ${user ? `for **${user}**` : '(everyone)'}.`);
      }
      case 'event': {
        const name = i.options.getString('name', true);
        const seconds = i.options.getInteger('seconds', true);
        const luck = i.options.getNumber('luck') ?? undefined;
        const payout = i.options.getNumber('payout') ?? undefined;
        const user = i.options.getString('user') ?? undefined;
        publish({ cmd: 'event', name, seconds, luck, payout, target: user });
        const extra = name === 'rainbow' ? ` (luck x${luck ?? 5}, payout x${payout ?? 5})` : '';
        return i.reply(`✨ Event **${name}** for **${seconds}s**${extra} ${user ? `for **${user}**` : ''}.`);
      }
      case 'payout': {
        const amount = i.options.getInteger('amount', true);
        const user = i.options.getString('user') ?? undefined;
        publish({ cmd: 'payout', amount, target: user });
        return i.reply(`🎲 Double-or-nothing **🪙${amount}** for ${user ? `**${user}**` : 'everyone'}.`);
      }
      case 'say': {
        const text = i.options.getString('message', true);
        publish({ cmd: 'chat', text });
        return i.reply(`📢 Announced: "${text}"`);
      }
      case 'kick': {
        const user = i.options.getString('user', true);
        publish({ cmd: 'kick', target: user });
        return i.reply(`👢 Kicked **${user}**.`);
      }
      case 'ban': {
        const user = i.options.getString('user', true);
        publish({ cmd: 'ban', target: user });
        return i.reply(`⛔ Banned **${user}**.`);
      }
      case 'unban': {
        const user = i.options.getString('user', true);
        publish({ cmd: 'unban', target: user });
        return i.reply(`✅ Unbanned **${user}** (they reload to play).`);
      }
      case 'mute': {
        const user = i.options.getString('user', true);
        publish({ cmd: 'mute', target: user });
        return i.reply(`🔇 Muted **${user}**.`);
      }
      case 'unmute': {
        const user = i.options.getString('user', true);
        publish({ cmd: 'unmute', target: user });
        return i.reply(`🎤 Unmuted **${user}**.`);
      }
      case 'rename': {
        const user = i.options.getString('user', true);
        const name = i.options.getString('name', true);
        publish({ cmd: 'rename', target: user, name });
        return i.reply(`✏️ Renamed **${user}** → **${name}**.`);
      }
      case 'admin': {
        const user = i.options.getString('user', true);
        const on = i.options.getBoolean('on');
        publish({ cmd: 'admin', target: user, ...(on === null ? {} : { on }) });
        return i.reply(`⚡ Admin ${on === false ? 'removed from' : 'granted to'} **${user}**.`);
      }
      case 'freebuy': {
        const user = i.options.getString('user', true);
        const on = i.options.getBoolean('on');
        publish({ cmd: 'freebuy', target: user, ...(on === null ? {} : { on }) });
        return i.reply(`🆓 Free upgrades ${on === false ? 'off for' : 'on for'} **${user}**.`);
      }
      case 'freelevels': {
        const levels = i.options.getInteger('levels', true);
        const user = i.options.getString('user') ?? undefined;
        publish({ cmd: 'freelevels', levels, target: user });
        return i.reply(`🎁 +${levels} free upgrade levels for ${user ? `**${user}**` : 'everyone'}.`);
      }
      case 'jackpotall': {
        const amount = i.options.getInteger('amount', true);
        publish({ cmd: 'jackpotall', amount });
        return i.reply(`🌐 Global jackpot of **🪙${amount}** sent to everyone!`);
      }
      case 'patchnotes': {
        const title = i.options.getString('title', true);
        const notes = i.options.getString('notes', true).replace(/\\n/g, '\n').replace(/•/g, '\n• ');
        await postPatchNotes(title, notes, i.user);
        return i.reply({ content: `📝 Posted patch notes: **${title}**`, ephemeral: true });
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
