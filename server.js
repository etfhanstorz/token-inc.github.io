import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const COUNTER_FILE = path.join(__dirname, '.player-counter.json');

// Load or initialize counter
function loadCounter() {
  try {
    const data = JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf-8'));
    return data.next || 1;
  } catch {
    return 1;
  }
}

function saveCounter(num) {
  fs.writeFileSync(COUNTER_FILE, JSON.stringify({ next: num }, null, 2));
}

let playerCounter = loadCounter();

app.use(express.static('.'));

app.get('/api/next-player', (req, res) => {
  const playerNum = playerCounter++;
  saveCounter(playerCounter);
  res.json({ number: playerNum });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🎰 Token Casino server running on http://localhost:${PORT}`);
  console.log(`📊 Current player counter: ${playerCounter}`);
});
