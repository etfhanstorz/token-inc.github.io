# Token Casino VR 🎰

A WebXR incremental gambling game built with three.js. Earn tokens, gamble them across a casino floor, and spend winnings on a tappable wall of upgrades.

## Play
It's a single static `index.html` — open it over HTTPS (required for WebXR). On GitHub Pages: visit the repo's Pages URL. Locally:

```
npx serve .
```

Then open the page and click **Enter VR**. No headset? It drops into a desktop fallback.

## Controls
**VR**
- **Left thumbstick** — smooth locomotion
- **Right thumbstick** — snap turn
- **Trigger / squeeze** — tap buttons, machines, and upgrade blocks (point and pull)

**Desktop fallback**
- **WASD** — move, **mouse** — look (click once to lock pointer)
- **Click** — interact with whatever's in the center of the screen

## The gambling
- 🎰 **Slots** — match symbols for big payouts
- 🔵 **Plinko** — drop a ball, land on a multiplier slot
- 🎟️ **Scratchers** — buy a ticket, scratch all 9 cells, match 3
- 🎡 **Wheel** — spin for up to 50x
- 🎲 **Double-or-nothing** — bet, then keep doubling or cash out

## The upgrade wall
Tap the 2D blocks to spend tokens on:
- 🍀 **Luck** — better odds everywhere
- 💰 **Payout** — bigger wins
- 💥 **Crit** — chance to 5x a win
- 🎰 **Slot Odds** / 🔵 **Plinko** — game-specific boosts
- ⚙️ **Auto** — passive tokens per second

Progress is saved to `localStorage`.
