# Hosting the bot 24/7 on Oracle Cloud (Always Free)

This runs the bot on a free Linux VM in Oracle's cloud. Your Windows PC is only
used to connect to it. The VM stays on 24/7 even when your PC is off.

> You do **not** change your computer's OS. The VM is a separate remote machine.

---

## Part A — Create the free VM (in your browser)

1. Sign up at **https://www.oracle.com/cloud/free/** → "Start for free".
   - You'll need an email and a credit/debit card **for identity verification only**.
     Always Free resources are not charged. (To be safe, you can leave the account on
     the Free tier and not "upgrade".)
   - Pick a **Home Region** close to you (this can't be changed later).

2. In the Oracle dashboard, open the menu (☰) → **Compute** → **Instances** → **Create instance**.

3. Settings:
   - **Name:** `casino-bot` (anything).
   - **Image and shape:** click **Edit**.
     - Image: **Canonical Ubuntu** (e.g. 22.04) — easiest.
     - Shape: pick an **Always Free-eligible** shape. Either:
       - `VM.Standard.E2.1.Micro` (AMD, x86) — simplest, or
       - `VM.Standard.A1.Flex` (Ampere/ARM) — set 1 OCPU / 6 GB; also free.
     - It shows an **"Always Free-eligible"** label — make sure that's selected.
   - **SSH keys:** choose **Generate a key pair for me** → **Save private key**
     (download it; you'll get a file like `ssh-key-XXXX.key`). Also save the public key.
     Put the private key somewhere you'll remember, e.g.
     `C:\Users\ethan\.ssh\oracle.key`.

4. Click **Create**. Wait until the instance is **RUNNING**, then copy its
   **Public IP address** (you'll need it below).

---

## Part B — Connect from Windows PowerShell

PowerShell already has `ssh`. First, lock down the key file permissions (Oracle
refuses keys that are too open), then connect.

```powershell
# move/rename your downloaded key (adjust the source path to where it downloaded)
mkdir $HOME\.ssh -Force
Copy-Item "$HOME\Downloads\ssh-key-*.key" "$HOME\.ssh\oracle.key"

# restrict the key so SSH will accept it
icacls "$HOME\.ssh\oracle.key" /inheritance:r
icacls "$HOME\.ssh\oracle.key" /grant:r "$($env:USERNAME):(R)"

# connect (replace <PUBLIC_IP> with your instance's IP)
ssh -i "$HOME\.ssh\oracle.key" ubuntu@<PUBLIC_IP>
```

Type `yes` at the "authenticity" prompt the first time. You're now "inside" the VM
(the prompt changes to something like `ubuntu@casino-bot:~$`).

---

## Part C — Install Node, get the bot, run it (on the VM)

Paste these one block at a time **in the SSH session**.

```bash
# 1) install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git

# 2) get the project (it's public) and enter the bot folder
git clone https://github.com/etfhanstorz/token-inc.github.io.git
cd token-inc.github.io/bot

# 3) install dependencies
npm install
```

Now create the `.env` file on the VM (the token is NOT in the repo, so you add it here):

```bash
nano .env
```

Paste this, filling in your real values (same ones from your Windows `.env`):

```
DISCORD_TOKEN=your-bot-token
CLIENT_ID=1513340327778320594
GUILD_ID=1512845726198005760
ADMIN_CHANNEL=token-casino-abcd1234
MQTT_URL=wss://broker.emqx.io:8084/mqtt
ADMINS=your-discord-user-id
```

Save in nano: **Ctrl+O**, **Enter**, then **Ctrl+X**.

```bash
# register slash commands once (only needed again if you change commands)
npm run deploy
```

---

## Part D — Keep it running forever with pm2

`pm2` restarts the bot if it crashes and on reboot.

```bash
sudo npm install -g pm2
pm2 start bot.js --name casino-bot
pm2 save
pm2 startup        # it prints ONE command — copy that line, paste it, run it
```

Useful pm2 commands:
```bash
pm2 logs casino-bot     # watch output (Ctrl+C to stop watching)
pm2 restart casino-bot  # after pulling new code
pm2 stop casino-bot
pm2 list
```

You can now **close PowerShell** — the bot keeps running on the VM.

---

## Updating the bot later

When the repo changes:
```bash
ssh -i "$HOME\.ssh\oracle.key" ubuntu@<PUBLIC_IP>
cd token-inc.github.io && git pull
cd bot && npm install
pm2 restart casino-bot
```

---

## Troubleshooting
- **SSH "Permission denied (publickey)":** the username is `ubuntu` for Ubuntu images;
  the key path/permissions are wrong; or you used the wrong IP. Re-check Part B.
- **SSH "UNPROTECTED PRIVATE KEY FILE":** re-run the two `icacls` lines.
- **Bot logs in but events don't reach the game:** `ADMIN_CHANNEL` on the VM must match
  the `ADMIN_CHANNEL` in `index.html` exactly.
- **`npm run deploy` Missing Access:** re-invite the bot with the `applications.commands`
  scope (see main README), and confirm `GUILD_ID` is the server you invited it to.
- Outbound only: no firewall/port changes are needed for the bot itself.
