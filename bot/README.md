# Token Casino VR — Admin Discord Bot

Slash commands in Discord trigger live events in the game. The bot publishes to a
public **MQTT** channel; every player's browser is subscribed and reacts instantly.

```
Discord  ──slash command──▶  bot.js  ──MQTT publish──▶  broker  ──▶  every game tab
```

## Commands
| Command | What it does |
|---|---|
| `/tokens amount:100` | Gives everyone +100 tokens |
| `/luckboost multiplier:2 seconds:60` | Multiplies everyone's luck (x2) for 60s |
| `/event name:<event> seconds:<n>` | Triggers a casino-wide event |
| `/payout amount:500` | Everyone gets a 50/50 double-or-nothing on 500 |

**Events** (the `name` choices): Token Rain, -50% Payout, Golden Hour, 50x Luck & Payout,
Rainbow, Disco Party. For **Rainbow**, also pass `luck:` and `payout:` multipliers
(e.g. `/event name:Rainbow seconds:45 luck:8 payout:4`).

## One-time setup

### 1. Create the Discord app + bot
1. https://discord.com/developers/applications → **New Application**.
2. **Bot** tab → **Reset Token** → copy it → that's `DISCORD_TOKEN`.
3. **General Information** → copy **Application ID** → that's `CLIENT_ID`.
4. **Installation** (or **OAuth2 → URL Generator**): scope `bot` + `applications.commands`,
   then open the generated URL to invite the bot to your server.

### 2. Configure
```bash
cd bot
cp .env.example .env      # Windows: copy .env.example .env
```
Edit `.env` and fill in `DISCORD_TOKEN`, `CLIENT_ID`, optionally `GUILD_ID`
(your server ID, for instant command registration while testing), and `ADMINS`
(comma-separated Discord user IDs allowed to run commands).

> **Important:** `ADMIN_CHANNEL` in `.env` must **exactly match** the
> `ADMIN_CHANNEL` constant near the top of the `<script>` in `index.html`.
> Anyone who knows this string can trigger events, so keep it secret and change
> it from the default.

### 3. Install, register commands, run
```bash
npm install
npm run deploy     # registers the slash commands (re-run if you change commands.js)
npm start          # starts the bot
```

You should see `🤖 Logged in as ...` and `🔗 MQTT connected ...`. Now run the
commands in Discord and watch the game react.

## Hosting it 24/7 (optional)
Running `npm start` on your PC works while that terminal is open. To keep it always
on, deploy the `bot/` folder to a free host (Railway, Render, Fly.io, a Raspberry Pi,
etc.) and set the same environment variables there. No inbound ports are needed —
the bot only makes outbound connections to Discord and the MQTT broker.

## Notes / limits
- The public MQTT broker is unauthenticated and shared. The only thing protecting
  your channel is the secrecy of `ADMIN_CHANNEL`. For a locked-down setup, run your
  own broker (e.g. Mosquitto/EMQX) and point both the game and bot at it.
- Effects apply **per player browser** (each client receives the command and applies
  it locally), matching how the game stores tokens locally.
