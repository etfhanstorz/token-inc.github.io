
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

// ---------- State ----------
const S = {
  tokens: 100,
  luckLv: 1,        // increases win chance
  payLv: 1,         // payout multiplier level
  autoLv: 0,        // passive income per second
  slotLuckLv: 1,
  plinkoLv: 1,
  critLv: 0,        // chance to multiply a win
  topWins: [],      // leaderboard of highest single payouts ever (desc)
};
const save = () => localStorage.setItem('tokenCasino', JSON.stringify(S));
const load = () => { try { Object.assign(S, JSON.parse(localStorage.getItem('tokenCasino')||'{}')); } catch(e){} };
load();

// ---------- Player identity ----------
const DEVICE_ID = (()=>{ let d=localStorage.getItem('casinoDeviceId'); if(!d){ d='dev-'+Math.random().toString(36).slice(2,10); localStorage.setItem('casinoDeviceId',d);} return d; })();
async function initUsername(){ if(!S.username){ try{ const r=await fetch('/api/next-player'); if(r.ok){ const d=await r.json(); S.username='Player-'+d.number; save(); return; } }catch(e){} S.username='Player-'+Math.floor(Math.random()*10000); } }
if(!S.username) S.username = 'Player-'+DEVICE_ID.slice(4,8);
function isBanned(){ return localStorage.getItem('casinoBanned')==='1'; }
function setBanned(b){ if(b) localStorage.setItem('casinoBanned','1'); else localStorage.removeItem('casinoBanned'); }

// ---------- Discord webhook ----------
// Paste your Discord webhook URL between the quotes to enable high-payout pings.
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1513324557220708513/W9UayWH6rKptEtgwk6TDllmwNG0B9b1YnBWUDid0QQ6GEYRIolE2R85B3z-yg28WMOnE';
// Optional separate webhook for player presence (joins). Leave '' to reuse the one above.
const PLAYER_WEBHOOK_URL = '';
function webhookSend(url, content){ if(!url) return; try{ const fd=new FormData(); fd.append('content', content); fetch(url,{method:'POST',mode:'no-cors',body:fd}); }catch(e){} }
function notifyPresence(){
  const url = PLAYER_WEBHOOK_URL || DISCORD_WEBHOOK_URL;
  webhookSend(url, `🟢 **${S.username}** entered the casino  ·  id \`${DEVICE_ID}\`  ·  🪙${fmt(S.tokens)}`);
}
const LEADERBOARD_SIZE = 10; // a win that ranks in the top N highest payouts ever triggers a ping
const MIN_NOTIFY = 250;      // ...but only if it's also at least this big (kills early-game spam)
function notifyDiscord(amount, game, rank){
  if(!DISCORD_WEBHOOK_URL) return;
  try {
    const medal = rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':'🏅';
    const fd = new FormData();
    fd.append('content', `${medal} **Top-${LEADERBOARD_SIZE} payout!** **${S.username}** just hit **🪙 ${amount.toLocaleString()}** on **${game}** — that's the **#${rank} highest payout ever** (Luck Lv${S.luckLv}, Payout x${payMul().toFixed(1)}).`);
    fetch(DISCORD_WEBHOOK_URL, { method:'POST', mode:'no-cors', body: fd });
  } catch(e){ /* fire-and-forget */ }
}
// Trigger if this win is good enough to make the all-time top-N leaderboard.
function reportWin(amount, game){
  if(amount<=0) return;
  const board = S.topWins || (S.topWins=[]);
  const qualifies = board.length < LEADERBOARD_SIZE || amount > board[board.length-1];
  if(!qualifies) return;
  board.push(amount);
  board.sort((a,b)=>b-a);
  if(board.length>LEADERBOARD_SIZE) board.length=LEADERBOARD_SIZE;
  const rank = board.indexOf(amount)+1;
  save();
  // sound: big fanfare for notable hits, small chime otherwise
  if(amount >= MIN_NOTIFY) sfxBig(); else sfxWin();
  // only ping/broadcast for genuinely big hits — kills early-game spam
  if(amount >= MIN_NOTIFY){
    notifyDiscord(amount, game, rank);
    if(typeof mpBroadcastWin==='function') mpBroadcastWin(amount, game);
  }
}

const VOICE = { muted:false, forced:false };   // hoist-safe mute state (forced = admin-muted)

// ---------- Admin events (driven by the Discord bot via MQTT) ----------
// Pick a secret channel name and put the SAME value in the bot's .env ADMIN_CHANNEL.
const ADMIN_CHANNEL = 'token-casino-abcd1234';
const AE = { luckMul:1, payMul:1, until:0, name:null, color:null, rain:false, disco:false };
function aeActive(){ return AE.until>performance.now(); }

const luckBonus = () => (1 + (S.luckLv-1)*0.04) * (1 + (S.cloverLv||0)*0.08) * (1 + (S.omniLv||0)*0.15) * (aeActive()?AE.luckMul:1);
const payMul    = () => Math.max(0,(1 + (S.payLv-1)*0.35) * (1 + (S.fortuneLv||0)*0.08) * (1 + (S.overLv||0)*0.15) * (1 + (S.cosmicLv||0)*0.20) * (1 + (S.apotheosisLv||0)*0.5) * (aeActive()?AE.payMul:1));
const critChance= () => Math.min(0.5, S.critLv*0.03);

// ---------- HUD ----------
const tokEl = document.getElementById('tok');
const luckEl = document.getElementById('luckLv');
const payEl = document.getElementById('payMul');
const logEl = document.getElementById('log');
let logLines = [];
function log(msg){ logLines.push(msg); if(logLines.length>4) logLines.shift(); logEl.innerHTML = logLines.join('<br>'); }
// compact number formatting: 1500 -> "1.5K", 2_300_000 -> "2.3M", etc.
const NUM_SUFFIX=['','K','M','B','T','Qa','Qi','Sx','Sp','Oc','No','Dc','UDc','DDc','TDc','QaDc','QiDc','SxDc','SpDc','OcDc','NoDc','Vg','UVg','DVg','TVg','QaVg','QiVg','SxVg','SpVg','OcVg','NoVg','Tg','UTg','DTg','TTg'];
function fmt(n){ n=Math.floor(n); if(!isFinite(n)) return '∞'; const neg=n<0; n=Math.abs(n); if(n<1000) return (neg?'-':'')+n;
  let i=Math.floor(Math.log10(n)/3);
  if(i>=NUM_SUFFIX.length) return (neg?'-':'')+n.toExponential(2).replace('e+','e');
  let v=n/Math.pow(1000,i); let s=(v>=100?v.toFixed(0):v.toFixed(2)).replace(/\.?0+$/,'');
  return (neg?'-':'')+s+NUM_SUFFIX[i]; }
function updateHUD(){ tokEl.textContent = fmt(S.tokens); luckEl.textContent=S.luckLv; payEl.textContent=payMul().toFixed(1); }
function addTokens(n){ S.tokens += n; updateHUD(); }
updateHUD();

// ---------- Three setup ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);
scene.fog = new THREE.Fog(0x05060a, 12, 40);

const camera = new THREE.PerspectiveCamera(70, innerWidth/innerHeight, 0.05, 200);
const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
renderer.domElement.style.position='fixed'; renderer.domElement.style.inset='0';

// Player rig (move this for locomotion)
const rig = new THREE.Group();
rig.add(camera);
camera.position.set(0,1.6,0);
scene.add(rig);
rig.position.set(0,0,4);

// Outdoor daylight lighting
scene.add(new THREE.HemisphereLight(0xbcd6ff, 0x5a6a3a, 1.0));
const key = new THREE.DirectionalLight(0xfff3d6, 1.1);
key.position.set(12,18,8); key.castShadow=true;
key.shadow.mapSize.set(1024,1024); key.shadow.camera.near=1; key.shadow.camera.far=60;
key.shadow.camera.left=-25; key.shadow.camera.right=25; key.shadow.camera.top=25; key.shadow.camera.bottom=-25;
scene.add(key);
const ambient = new THREE.AmbientLight(0xffffff, 0.25); scene.add(ambient);

// Sky dome (gradient) + horizon fog
const skyCanvas=document.createElement('canvas'); skyCanvas.width=16; skyCanvas.height=256;
{ const x=skyCanvas.getContext('2d'); const g=x.createLinearGradient(0,0,0,256);
  g.addColorStop(0,'#4d86d6'); g.addColorStop(0.55,'#9cc2ec'); g.addColorStop(1,'#dce9f6'); x.fillStyle=g; x.fillRect(0,0,16,256); }
const skyTex=new THREE.CanvasTexture(skyCanvas);
const skyDome=new THREE.Mesh(new THREE.SphereGeometry(120,32,16), new THREE.MeshBasicMaterial({map:skyTex, side:THREE.BackSide, fog:false}));
scene.add(skyDome);
scene.background=new THREE.Color(0xbcd6ee);
scene.fog=new THREE.Fog(0xcfe0f0, 30, 110);
// soft sun disc
const sunMesh=new THREE.Mesh(new THREE.CircleGeometry(5,24), new THREE.MeshBasicMaterial({color:0xfff6e0, fog:false}));
sunMesh.position.set(34,30,-60); sunMesh.lookAt(0,2,0); scene.add(sunMesh);

// Grass ground — flat clearing for the casino, rolling hills beyond
const texLoader = new THREE.TextureLoader();
const grassTex = texLoader.load('textures/grass.jpg');
grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping; grassTex.repeat.set(44,44); grassTex.anisotropy = 8;
function terrainH(x,z){ const r=Math.hypot(x,z); const amp=Math.min(1,Math.max(0,(r-16)/16))*2.6;
  return (Math.sin(x*0.16)*Math.cos(z*0.13)+Math.sin(x*0.07+z*0.10)*0.8+Math.sin(z*0.21)*0.5)*amp; }
const groundGeo = new THREE.PlaneGeometry(190,190,170,170);
{ const pos=groundGeo.attributes.position; for(let i=0;i<pos.count;i++){ pos.setZ(i, terrainH(pos.getX(i), pos.getY(i))); } groundGeo.computeVertexNormals(); }
const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ map:grassTex, roughness:1, metalness:0 }));
ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; scene.add(ground);

// ---------- Interactables ----------
const interactables = []; // {mesh, onTap, hover()}
function registerInteractable(mesh, onTap){ mesh.userData.onTap = onTap; interactables.push(mesh); }

// ---------- Canvas-texture helper for 2D blocks ----------
function makePanel(w,h,draw){
  const cw=512, ch=Math.round(512*h/w);
  const canvas=document.createElement('canvas'); canvas.width=cw; canvas.height=ch;
  const ctx=canvas.getContext('2d');
  const tex=new THREE.CanvasTexture(canvas); tex.anisotropy=4;
  const mat=new THREE.MeshBasicMaterial({ map:tex, transparent:true });
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h), mat);
  mesh.userData.redraw = ()=>{ draw(ctx,cw,ch); tex.needsUpdate=true; };
  mesh.userData.redraw();
  return mesh;
}
function roundRect(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }

// ==================================================================
// UPGRADE WALL — 2D blocks you tap with your hands
// ==================================================================
// gx = column (0..2), gy = row (0..3). start = level the upgrade begins at (0 or 1).
// req = prerequisite {key, lv} that must be reached before this unlocks.
const upgradeDefs = [
  // Tier 0 — always available
  { key:'luckLv',    name:'LUCK',     icon:'🍀', color:'#39ff14', base:50,  grow:1.5,  start:1, gx:0,gy:0, desc:()=>'Win chance +4%' },
  { key:'payLv',     name:'PAYOUT',   icon:'💰', color:'#ffe347', base:75,  grow:1.55, start:1, gx:1,gy:0, desc:()=>'Payouts +35%' },
  { key:'autoLv',    name:'AUTO',     icon:'⚙️', color:'#ff8a3d', base:200, grow:1.8,  start:0, gx:2,gy:0, desc:()=>'+1 token/sec' },
  // Tier 1
  { key:'critLv',    name:'CRIT',     icon:'💥', color:'#ff2e97', base:120, grow:1.7,  start:0, gx:0,gy:1, req:{key:'luckLv',lv:3}, desc:()=>'+3% to crit a win' },
  { key:'slotLuckLv',name:'SLOT ODDS',icon:'🎰', color:'#00eaff', base:90,  grow:1.6,  start:1, gx:1,gy:1, req:{key:'payLv',lv:3}, desc:()=>'Better slot symbols' },
  { key:'plinkoLv',  name:'SLOT BOOST',icon:'💎', color:'#b46bff', base:90,  grow:1.6,  start:1, gx:2,gy:1, req:{key:'slotLuckLv',lv:1}, desc:()=>'Better slot payouts' },
  // Tier 2
  { key:'wheelLv',   name:'WHEEL',    icon:'🎡', color:'#ffd34d', base:140, grow:1.65, start:0, gx:0,gy:2, req:{key:'critLv',lv:2}, desc:()=>'Better wheel odds' },
  { key:'diceLv',    name:'DICE',     icon:'🎲', color:'#5dd6ff', base:140, grow:1.65, start:0, gx:1,gy:2, req:{key:'slotLuckLv',lv:2}, desc:()=>'+2.5% dice odds' },
  { key:'scratchLv', name:'SCRATCH',  icon:'🎟️', color:'#39ff14', base:140, grow:1.65, start:0, gx:2,gy:2, req:{key:'slotLuckLv',lv:2}, desc:()=>'Better scratch luck' },
  // Tier 3 — endgame
  { key:'megaCritLv',name:'MEGACRIT', icon:'⚡', color:'#ff2e97', base:400, grow:1.9,  start:0, gx:0,gy:3, req:{key:'critLv',lv:5}, desc:()=>'+2x crit multiplier' },
  { key:'fortuneLv', name:'FORTUNE',  icon:'🌟', color:'#ffe347', base:400, grow:1.9,  start:0, gx:1,gy:3, req:{key:'payLv',lv:6}, desc:()=>'+8% to ALL payouts' },
  { key:'interestLv',name:'INTEREST', icon:'🏦', color:'#ff8a3d', base:500, grow:2.0,  start:0, gx:2,gy:3, req:{key:'autoLv',lv:3}, desc:()=>'+0.2%/s of your bank' },
  // Tier 4 — prestige
  { key:'overLv',    name:'OVERDRIVE',icon:'🚀', color:'#ff2e97', base:2500, grow:2.15, start:0, gx:0,gy:4, req:{key:'megaCritLv',lv:3}, desc:()=>'+15% to all payouts' },
  { key:'cloverLv',  name:'4-LEAF',   icon:'☘️', color:'#39ff14', base:2500, grow:2.15, start:0, gx:1,gy:4, req:{key:'fortuneLv',lv:3}, desc:()=>'+8% luck' },
  { key:'vaultLv',   name:'VAULT',    icon:'🏰', color:'#ffcf6a', base:4000, grow:2.25, start:0, gx:2,gy:4, req:{key:'interestLv',lv:3}, desc:()=>'+0.3%/s interest' },
  // Tier 5 — cosmic
  { key:'cosmicLv',  name:'COSMIC',   icon:'🌌', color:'#9b5dff', base:25000, grow:2.5, start:0, gx:0,gy:5, req:{key:'overLv',lv:3}, desc:()=>'+20% all payouts' },
  { key:'omniLv',    name:'OMNILUCK', icon:'♾️', color:'#39ff14', base:25000, grow:2.5, start:0, gx:1,gy:5, req:{key:'cloverLv',lv:3}, desc:()=>'+15% luck' },
  { key:'eternityLv',name:'ETERNITY', icon:'⏳', color:'#5dd6ff', base:35000, grow:2.6, start:0, gx:2,gy:5, req:{key:'vaultLv',lv:3}, desc:()=>'+1%/s interest' },
  { key:'infinityLv',name:'INFINITY', icon:'∞', color:'#ff2e97', base:50000, grow:2.75, start:0, gx:3,gy:5, req:{key:'megaCritLv',lv:5}, desc:()=>'+5x crit mult' },
  { key:'apotheosisLv',name:'APOTHEOSIS',icon:'👑', color:'#ffcf6a', base:75000, grow:3.0, start:0, gx:4,gy:5, req:{key:'fortuneLv',lv:5}, desc:()=>'+50% everything' },
];
const upgradeByKey = Object.fromEntries(upgradeDefs.map(d=>[d.key,d]));
function upCost(def){ const lv=S[def.key]||0; return Math.floor(def.base*Math.pow(def.grow, lv-(def.start||0))); }
function isUnlocked(def){ return !def.req || (S[def.req.key]||0) >= def.req.lv; }
// ground position of each node — a branching tree laid out on the floor behind spawn
function nodePos(def){ return { x:(def.gx-1)*3.0, z:5.5 + def.gy*2.2 }; }

const treeGroup = new THREE.Group(); scene.add(treeGroup);
// entrance sign
const treeSign = makePanel(2.4,0.5,(c,w,h)=>{ c.clearRect(0,0,w,h); c.fillStyle='#ffd34d'; c.font='bold 70px Segoe UI'; c.textAlign='center'; c.textBaseline='middle'; c.fillText('⬆ UPGRADES', w/2,h/2); });
treeSign.position.set(0,2.4,4.7); treeSign.rotation.y=Math.PI; treeGroup.add(treeSign);

// branches along the ground connecting each upgrade to its prerequisite
const branches=[];
function colorHex(s){ return new THREE.Color(s); }
upgradeDefs.forEach(def=>{ if(!def.req) return;
  const a=nodePos(upgradeByKey[def.req.key]), b=nodePos(def);
  const dx=b.x-a.x, dz=b.z-a.z, len=Math.hypot(dx,dz);
  const mat=new THREE.MeshStandardMaterial({color:0x2a2f55, emissive:0x000000});
  const bar=new THREE.Mesh(new THREE.BoxGeometry(len,0.06,0.16), mat);
  bar.position.set((a.x+b.x)/2, 0.06, (a.z+b.z)/2); bar.rotation.y=Math.atan2(-dz,dx);
  treeGroup.add(bar); branches.push({bar,def,baseColor:def.color});
});
function refreshConnectors(){ branches.forEach(o=>{ const on=isUnlocked(o.def); o.bar.material.color.set(on?o.baseColor:'#1c2038'); o.bar.material.emissive.set(on?o.baseColor:'#000000'); o.bar.material.emissiveIntensity=on?0.35:0; }); }

// each node = a pedestal box on the floor + a sign (tap to buy) facing the player
const upBlocks=[];
upgradeDefs.forEach((def)=>{
  const p=nodePos(def);
  const ped=new THREE.Mesh(new THREE.BoxGeometry(1.0,0.5,1.0), new THREE.MeshStandardMaterial({color:0x14182e, metalness:0.5, roughness:0.5}));
  ped.position.set(p.x,0.25,p.z); ped.castShadow=true; treeGroup.add(ped);
  const cap=new THREE.Mesh(new THREE.BoxGeometry(1.04,0.06,1.04), new THREE.MeshStandardMaterial({color:def.color, emissive:def.color, emissiveIntensity:0.5}));
  cap.position.set(p.x,0.53,p.z); treeGroup.add(cap); def._cap=cap;
  const sign=makePanel(1.3,1.0, drawUpgrade(def));
  sign.position.set(p.x,1.35,p.z); sign.rotation.y=Math.PI;
  sign.userData.def=def; sign.userData.ped=ped;
  treeGroup.add(sign);
  registerInteractable(sign, ()=>buyUpgrade(def, sign));
  upBlocks.push(sign);
});
function drawUpgrade(def){
  return (ctx,w,h)=>{
    const lv=S[def.key]||0, cost=upCost(def), unlocked=isUnlocked(def), afford=S.tokens>=cost && unlocked;
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = !unlocked? '#0c0e18' : (afford? '#181c34':'#10131f');
    roundRect(ctx,6,6,w-12,h-12,22); ctx.fill();
    ctx.lineWidth=6; ctx.strokeStyle = unlocked? def.color : '#3a3f55'; ctx.stroke();
    ctx.textAlign='center';
    if(!unlocked){
      const rq=upgradeByKey[def.req.key];
      ctx.textBaseline='middle';
      ctx.font='100px Segoe UI'; ctx.fillText('🔒', w/2, h*0.4);
      ctx.fillStyle='#9aa3c0'; ctx.font='bold 40px Segoe UI'; ctx.fillText('LOCKED', w/2, h*0.66);
      ctx.fillStyle='#7d86ab'; ctx.font='28px Segoe UI'; ctx.fillText('Need '+rq.name+' Lv'+def.req.lv, w/2, h*0.78);
      return;
    }
    ctx.textBaseline='top';
    ctx.font='72px Segoe UI'; ctx.fillText(def.icon, w/2, 24);              // icon
    ctx.fillStyle=def.color; ctx.font='bold 48px Segoe UI'; ctx.fillText(def.name, w/2, 110);  // title
    ctx.fillStyle='#c7d0e8'; ctx.font='30px Segoe UI'; ctx.fillText(def.desc(), w/2, 178);     // boost
    ctx.fillStyle='#fff'; ctx.font='bold 34px Segoe UI'; ctx.fillText('Lv '+lv, w/2, h-130);
    ctx.fillStyle= afford? '#ffd34d':'#6a7196'; ctx.font='bold 44px Segoe UI'; ctx.fillText('🪙 '+fmt(cost), w/2, h-78);
  };
}
function buyUpgrade(def, block){
  if(!isUnlocked(def)){ const rq=upgradeByKey[def.req.key]; log(`🔒 ${def.name} locked — need ${rq.name} Lv${def.req.lv}`); pulse(block,0xff3b5b); sfxLose(); return; }
  const cost=freeBuy?0:upCost(def);
  if(S.tokens>=cost){
    S.tokens-=cost; S[def.key]=(S[def.key]||0)+1; updateHUD(); save();
    log(`Bought ${def.name} → Lv ${S[def.key]}`);
    block.userData.flash=1; pulse(block,0x3ddc84); sfxBuy();
  } else { log(`Not enough tokens for ${def.name}`); pulse(block,0xff3b5b); sfxLose(); }
  refreshUpgrades();
}
function refreshUpgrades(){ upBlocks.forEach(b=>b.userData.redraw()); refreshConnectors(); }
refreshConnectors();
// new gameplay multipliers from the expanded tree
const critMult   = () => 5 + (S.megaCritLv||0)*2 + (S.infinityLv||0)*5;
const wheelLuck  = () => 1 + (S.wheelLv||0)*0.15;
const diceBonus  = () => (S.diceLv||0)*0.025;
const scratchLuck= () => 1 + (S.scratchLv||0)*0.25;

// ==================================================================

// pulse animation helper
const pulses=[];
function pulse(mesh,color){ pulses.push({mesh,t:0,color:new THREE.Color(color)}); }

// ==================================================================
// STATS PANEL — small in-world board (HUD is invisible in VR)
// ==================================================================
const statsPanel = makePanel(0.9,0.5,(c,w,h)=>{
  c.fillStyle='rgba(8,10,20,0.92)'; roundRect(c,2,2,w-4,h-4,22); c.fill();
  c.lineWidth=4; c.strokeStyle='#2a2f55'; c.stroke();
  c.textAlign='left'; c.textBaseline='middle';
  c.fillStyle='#ffd34d'; c.font='bold 48px Segoe UI';
  c.fillText('🪙 '+fmt(S.tokens), 26, 56);
  c.font='30px Segoe UI'; c.fillStyle='#3ddc84'; c.fillText('🍀 Luck Lv'+S.luckLv, 26, 130);
  c.fillStyle='#ffd34d'; c.fillText('💰 Payout x'+payMul().toFixed(1), 26, 178);
  c.fillStyle='#ff5db1'; c.fillText('💥 Crit '+(critChance()*100|0)+'%', 270, 130);
  c.fillStyle='#ff9b3d'; c.fillText('⚙️ '+S.autoLv+'/s', 270, 178);
});
statsPanel.position.set(0,-0.35,-0.9); statsPanel.rotation.x=-0.5; camera.add(statsPanel); // follows your view
function refreshStats(){ statsPanel.userData.redraw(); }
// mic mute toggle, tappable in VR (follows your view)
const muteBtn = makePanel(0.28,0.18,(c,w,h)=>{ c.clearRect(0,0,w,h); const m=VOICE.muted;
  c.fillStyle=m?'rgba(60,12,20,0.92)':'rgba(8,20,12,0.92)'; roundRect(c,2,2,w-4,h-4,18); c.fill();
  c.lineWidth=4; c.strokeStyle=m?'#ff3b5b':'#3ddc84'; c.stroke();
  c.fillStyle='#fff'; c.font='bold 60px Segoe UI'; c.textAlign='center'; c.textBaseline='middle'; c.fillText(m?'🔇':'🎤', w/2, h/2); };
muteBtn.position.set(0.42,-0.32,-0.9); muteBtn.rotation.x=-0.5; camera.add(muteBtn);
registerInteractable(muteBtn, ()=>{ toggleMute(); muteBtn.userData.redraw(); };
// the in-world HUD is for VR only; flat screens (desktop/mobile) use the DOM HUD
statsPanel.visible=false; muteBtn.visible=false;
// keep the in-world board in sync with the DOM HUD
const _updateHUD = updateHUD;
updateHUD = function(){ _updateHUD(); refreshStats(); };

// ==================================================================
// SLOT MACHINE
// ==================================================================
const SYMS = ['🍒','🍋','🔔','⭐','💎','7️⃣'];
const SYM_PAY = { '🍒':3,'🍋':5,'🔔':10,'⭐':20,'💎':50,'7️⃣':100 };
const slotGroup = new THREE.Group(); slotGroup.position.set(4.5,0,-8); slotGroup.rotation.y=-0.5; scene.add(slotGroup);
const slotCab = new THREE.Mesh(new THREE.BoxGeometry(2.6,3.4,1), new THREE.MeshStandardMaterial({color:0x2a1140, metalness:0.4, roughness:0.4}));
slotCab.position.y=1.7; slotGroup.add(slotCab);
let slotReels = ['🍒','🍋','🔔'];
let slotSpinning=false;
const slotScreen = makePanel(2.2,1.1,(c,w,h)=>{
  c.fillStyle='#000'; c.fillRect(0,0,w,h);
  c.textAlign='center'; c.textBaseline='middle'; c.font='110px serif';
  for(let i=0;i<3;i++){ c.fillText(slotReels[i], w*(i+0.5)/3, h/2); }
});
slotScreen.position.set(0,2.2,0.52); slotGroup.add(slotScreen);
const slotBtn = makePanel(1.6,0.55,(c,w,h)=>{ c.fillStyle='#ff5db1'; roundRect(c,0,0,w,h,30); c.fill(); c.fillStyle='#1a0b2e'; c.font='bold 56px Segoe UI'; c.textAlign='center'; c.textBaseline='middle'; c.fillText('SPIN 🪙'+fmt(10), w/2,h/2); }; slotBtn);
slotBtn.position.set(0,1.1,0.52); slotGroup.add(slotBtn);
const slotLabel = makePanel(2.4,0.45,(c,w,h)=>{ c.clearRect(0,0,w,h); c.fillStyle='#5dd6ff'; c.font='bold 60px Segoe UI'; c.textAlign='center'; c.textBaseline='middle'; c.fillText('🎰 SLOTS', w/2,h/2); };
slotLabel.position.set(0,3.55,0.52); slotGroup.add(slotLabel);
registerInteractable(slotBtn, spinSlots);
function weightedSym(){
  // higher slotLuck biases toward valuable symbols
  const luck=S.slotLuckLv;
  const r=Math.random()*100;
  const top = 5 + luck*1.2; // chance for 7 or diamond
  if(r < top*0.4) return '7️⃣';
  if(r < top) return '💎';
  if(r < top+12) return '⭐';
  if(r < top+28) return '🔔';
  if(r < 60) return '🍋';
  return '🍒';
}
function spinSlots(){
  if(slotSpinning) return;
  const cost=10; if(S.tokens<cost){ log('Need 🪙'+fmt(cost)+' to spin'); return; }
  addTokens(-cost); save(); slotSpinning=true;
  let ticks=0; const final=[weightedSym(),weightedSym(),weightedSym()];
  const iv=setInterval(()=>{
    ticks++;
    for(let i=0;i<3;i++){ if(ticks < 10+i*6) slotReels[i]=SYMS[(Math.random()*SYMS.length)|0]; else slotReels[i]=final[i]; }
    slotScreen.userData.redraw();
    if(ticks>=22){ clearInterval(iv); slotSpinning=false; resolveSlots(final); }
  },60);
}
function resolveSlots(r){
  let win=0;
  if(r[0]===r[1]&&r[1]===r[2]) win = SYM_PAY[r[0]]*10;
  else if(r[0]===r[1]||r[1]===r[2]||r[0]===r[2]){ const s = r[0]===r[1]?r[0]:(r[1]===r[2]?r[1]:r[0]); win = SYM_PAY[s]; }
  win = Math.floor(win*payMul()*(1+(S.plinkoLv-1)*0.25));
  if(win>0 && Math.random()<critChance()){ win*=critMult(); log('💥 CRIT!'); }
  if(win>0){ addTokens(win); log(`🎰 ${r.join(' ')} → +${fmt(win)}`); pulse(slotScreen,0xffd34d); reportWin(win,'Slots'); }
  else log(`🎰 ${r.join(' ')} → no win`);
  save(); refreshUpgrades();
}

// ==================================================================
// SCRATCH TICKET
// ==================================================================
const scratchGroup=new THREE.Group(); scratchGroup.position.set(-4.5,0,-8); scratchGroup.rotation.y=0.5; scene.add(scratchGroup);
const sStand=new THREE.Mesh(new THREE.BoxGeometry(2.4,0.2,1),new THREE.MeshStandardMaterial({color:0x222}));
let scratchState=null; // {cells:[], revealed:[], prize}
const scratchPanel=makePanel(2.2,1.6,drawScratch);
scratchPanel.position.set(0,2,0); scratchGroup.add(scratchPanel);
const sLabel=makePanel(2.4,0.4,(c,w,h)=>{ c.clearRect(0,0,w,h); c.fillStyle='#3ddc84'; c.font='bold 56px Segoe UI'; c.textAlign='center'; c.textBaseline='middle'; c.fillText('🎟️ SCRATCHERS',w/2,h/2); };
sLabel.position.set(0,3.1,0); scratchGroup.add(sLabel);
const buyTicket=makePanel(2,0.5,(c,w,h)=>{ c.fillStyle='#3ddc84'; roundRect(c,0,0,w,h,28); c.fill(); c.fillStyle='#06210f'; c.font='bold 50px Segoe UI'; c.textAlign='center'; c.textBaseline='middle'; c.fillText('TICKET 🪙'+fmt(25),w/2,h/2); }; buyTicket);
buyTicket.position.set(0,1.0,0); scratchGroup.add(buyTicket);
registerInteractable(buyTicket, newTicket);
registerInteractable(scratchPanel, (hit)=>scratchAt(hit));
function newTicket(){
  { const cost=25; if(S.tokens<cost){ log('Need 🪙'+fmt(cost)+' for a ticket'); return; }
  addTokens(-cost); save(); }
  // clean prize values shown on each cell; match 3 of a value to win it
  const prizes=[0,0,0,10,10,25,25,50,100,250];
  const cells=[]; for(let i=0;i<9;i++){ cells.push(prizes[(Math.random()*prizes.length)|0]); }
  // luck: small chance to seed a jackpot triple
  if(Math.random()<0.04*luckBonus()*scratchLuck()){ cells[0]=cells[4]=cells[8]=500; }
  scratchState={cells, revealed:Array(9).fill(false), done:false};
  scratchPanel.userData.redraw(); log('🎟️ New ticket! Scratch all 9.');
}
function scratchAt(hit){
  if(!scratchState||scratchState.done){ return; }
  if(!hit||!hit.uv){ // reveal one unrevealed if no uv (desktop)
    const idx=scratchState.revealed.indexOf(false); if(idx>=0) scratchState.revealed[idx]=true;
  } else {
    const col=Math.min(2,Math.floor(hit.uv.x*3)); const row=Math.min(2,Math.floor((1-hit.uv.y)*3)); const idx=row*3+col;
    scratchState.revealed[idx]=true;
  }
  scratchPanel.userData.redraw();
  if(scratchState.revealed.every(Boolean)){
    scratchState.done=true;
    // win = match 3+ of a value pays that value once per triple (no fractional consolation)
    const counts={}; scratchState.cells.forEach(v=>counts[v]=(counts[v]||0)+1);
    let base=0; for(const v in counts){ if(+v>0) base += (+v) * Math.floor(counts[v]/3); }
    // apply payout multiplier once, then crit, rounded to a clean number
    let win = Math.round(base * payMul() / 5) * 5;
    if(win>0 && Math.random()<critChance()){ win*=critMult(); log('💥 CRIT!'); }
    if(win>0){ addTokens(win); log(`🎟️ Ticket → +${fmt(win)}`); pulse(scratchPanel,0x3ddc84); reportWin(win,'Scratcher'); }
    else log('🎟️ No match — better luck next ticket.');
    save(); refreshUpgrades();
  }
}
function drawScratch(ctx,w,h){
  ctx.fillStyle='#1a1330'; ctx.fillRect(0,0,w,h);
  if(!scratchState){ ctx.fillStyle='#9aa3c0'; ctx.font='bold 40px Segoe UI'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('Buy a ticket below', w/2,h/2); return; }
  for(let i=0;i<9;i++){ const col=i%3,row=(i/3)|0; const cw=w/3, ch=h/3, x=col*cw, y=row*ch;
    if(scratchState.revealed[i]){ ctx.fillStyle='#0c0e1a'; ctx.fillRect(x+6,y+6,cw-12,ch-12);
      const v=scratchState.cells[i]; ctx.fillStyle = v>0?'#ffd34d':'#5a6080'; ctx.font='bold 56px Segoe UI'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(v>0?('🪙'+v):'✖', x+cw/2, y+ch/2);
    } else { ctx.fillStyle='#7a7f9c'; roundRect(ctx,x+6,y+6,cw-12,ch-12,10); ctx.fill(); ctx.fillStyle='#555a78'; ctx.font='40px Segoe UI'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('?', x+cw/2,y+ch/2); }
  }
}

// ==================================================================
// ROULETTE / SPIN WHEEL (more gambling!)
// ==================================================================
const wheelGroup=new THREE.Group(); wheelGroup.position.set(7,0,-3); wheelGroup.rotation.y=-1.0; scene.add(wheelGroup);
const WHEEL_SEGMENTS=[0,2,0,3,0,5,0,2,0,10,0,3,0,2,0,50];
const wheelDisc=makePanel(2.4,2.4,(c,w,h)=>{
  const n=WHEEL_SEGMENTS.length, cx=w/2,cy=h/2,R=w/2-8;
  for(let i=0;i<n;i++){ const a0=i/n*Math.PI*2, a1=(i+1)/n*Math.PI*2; c.beginPath(); c.moveTo(cx,cy); c.arc(cx,cy,R,a0,a1); c.closePath();
    const m=WHEEL_SEGMENTS[i]; c.fillStyle = m===0?'#1a1330':(m>=10?'#ffd34d':(m>=3?'#ff5db1':'#5dd6ff')); c.fill(); c.strokeStyle='#05060a'; c.lineWidth=3; c.stroke();
    c.save(); c.translate(cx,cy); c.rotate((a0+a1)/2); c.fillStyle = m===0?'#555':'#0a0c1a'; c.font='bold 34px Segoe UI'; c.textAlign='right'; c.textBaseline='middle'; c.fillText(m===0?'✖':(m+'x'), R-14, 0); c.restore();
  }
});
wheelDisc.position.set(0,2.4,0); wheelGroup.add(wheelDisc);
const wheelBtn=makePanel(1.8,0.5,(c,w,h)=>{ c.fillStyle='#ffd34d'; roundRect(c,0,0,w,h,28); c.fill(); c.fillStyle='#1a0b2e'; c.font='bold 50px Segoe UI'; c.textAlign='center'; c.textBaseline='middle'; c.fillText('WHEEL 🪙'+fmt(30),w/2,h/2); }; wheelBtn);
wheelBtn.position.set(0,0.9,0.1); wheelGroup.add(wheelBtn);
const wLabel=makePanel(2.2,0.4,(c,w,h)=>{ c.clearRect(0,0,w,h); c.fillStyle='#ffd34d'; c.font='bold 56px Segoe UI'; c.textAlign='center'; c.textBaseline='middle'; c.fillText('🎡 WHEEL',w/2,h/2); };
wLabel.position.set(0,3.85,0); wheelGroup.add(wLabel);
// pointer
const ptr=new THREE.Mesh(new THREE.ConeGeometry(0.1,0.25,3), new THREE.MeshStandardMaterial({color:0xffffff})); ptr.position.set(0,3.65,0.05); ptr.rotation.z=Math.PI; wheelGroup.add(ptr);
registerInteractable(wheelBtn, spinWheel);
let wheelSpin=null;
function spinWheel(){
  if(wheelSpin){ return; } { const cost=30; if(S.tokens<cost){ log('Need 🪙'+fmt(cost)+' for wheel'); return; }
  addTokens(-cost); save(); }
  const n=WHEEL_SEGMENTS.length;
  // luck biases landing on higher segments
  let target=(Math.random()*n)|0; if(Math.random()<0.15*luckBonus()*wheelLuck()){ // re-roll toward a winner
    for(let k=0;k<n;k++){ if(WHEEL_SEGMENTS[(target)%n]>0) break; target=(target+1)%n; } }
  const targetAngle = -(target+0.5)/n*Math.PI*2;
  wheelSpin={ t:0, dur:3+Math.random(), from:wheelDisc.rotation.z, to: wheelDisc.rotation.z - Math.PI*8 + targetAngle, seg:target };
}
function stepWheel(dt){
  if(!wheelSpin) return; wheelSpin.t+=dt; const p=Math.min(1,wheelSpin.t/wheelSpin.dur); const e=1-Math.pow(1-p,3);
  wheelDisc.rotation.z = wheelSpin.from+(wheelSpin.to-wheelSpin.from)*e;
  if(p>=1){ const m=WHEEL_SEGMENTS[wheelSpin.seg]; let win=Math.floor(30*m*payMul()); if(win>0&&Math.random()<critChance()){win*=critMult();log('💥 CRIT!');}
    if(win>0){ addTokens(win); log(`🎡 ${m}x → +${fmt(win)}`); pulse(wheelDisc,0xffd34d); reportWin(win,'Wheel');} else log('🎡 Lost the spin');
    wheelSpin=null; save(); refreshUpgrades(); }
}

// ==================================================================
// COIN FLIP / HIGH-LOW DICE (even more gambling)
// ==================================================================
const diceGroup=new THREE.Group(); diceGroup.position.set(-7,0,-1); diceGroup.rotation.y=1.1; scene.add(diceGroup);
const dLabel=makePanel(2,0.4,(c,w,h)=>{c.clearRect(0,0,w,h);c.fillStyle='#ff9b3d';c.font='bold 54px Segoe UI';c.textAlign='center';c.textBaseline='middle';c.fillText('🎲 DOUBLE',w/2,h/2);});
dLabel.position.set(0,2.7,0); diceGroup.add(dLabel);
let dicePot=0;
const diceDisp=makePanel(2,0.9,(c,w,h)=>{ c.fillStyle='#1a1330'; roundRect(c,0,0,w,h,20); c.fill(); c.fillStyle='#ffd34d'; c.font='bold 60px Segoe UI'; c.textAlign='center'; c.textBaseline='middle'; c.fillText('Pot: 🪙'+fmt(dicePot), w/2,h/2); };
diceDisp.position.set(0,2,0); diceGroup.add(diceDisp);
const betBtn=makePanel(0.95,0.5,(c,w,h)=>{c.fillStyle='#5dd6ff';roundRect(c,0,0,w,h,24);c.fill();c.fillStyle='#06210f';c.font='bold 40px Segoe UI';c.textAlign='center';c.textBaseline='middle';c.fillText('BET 🪙'+fmt(25),w/2,h/2);}); betBtn);
betBtn.position.set(-0.52,1.2,0); diceGroup.add(betBtn);
const flipBtn=makePanel(0.95,0.5,(c,w,h)=>{c.fillStyle='#ff5db1';roundRect(c,0,0,w,h,24);c.fill();c.fillStyle='#1a0b2e';c.font='bold 40px Segoe UI';c.textAlign='center';c.textBaseline='middle';c.fillText('DOUBLE',w/2,h/2);});
flipBtn.position.set(0.52,1.2,0); diceGroup.add(flipBtn);
const cashBtn=makePanel(2,0.4,(c,w,h)=>{c.fillStyle='#3ddc84';roundRect(c,0,0,w,h,20);c.fill();c.fillStyle='#06210f';c.font='bold 40px Segoe UI';c.textAlign='center';c.textBaseline='middle';c.fillText('CASH OUT',w/2,h/2);});
cashBtn.position.set(0,0.65,0); diceGroup.add(cashBtn);
registerInteractable(betBtn, ()=>{ if(dicePot>0){log('Resolve current pot first');return;} { const cost=25; if(S.tokens<cost){log('Need 🪙'+fmt(cost));return;} addTokens(-cost); dicePot=cost; } diceDisp.userData.redraw(); log('🎲 Pot started at 🪙'+fmt(dicePot)+'. Double or cash.'); save(); };
registerInteractable(flipBtn, ()=>{ if(dicePot<=0){log('Place a bet first');return;}
  const winP=Math.min(0.9, 0.5*Math.min(1.3,luckBonus()) + diceBonus()); if(Math.random()<winP){ dicePot=Math.floor(dicePot*2); log('🎲 Won! Pot doubled to 🪙'+fmt(dicePot)); pulse(diceDisp,0x3ddc84);} else { log('🎲 Busted! Lost pot.'); dicePot=0; pulse(diceDisp,0xff3b5b);} diceDisp.userData.redraw(); save(); };
registerInteractable(cashBtn, ()=>{ if(dicePot<=0){log('Nothing to cash');return;} addTokens(dicePot); log('🎲 Cashed out 🪙'+fmt(dicePot)); reportWin(dicePot,'Double-or-Nothing'); dicePot=0; diceDisp.userData.redraw(); save(); refreshUpgrades(); };

// ==================================================================
// BLACKJACK
// ==================================================================
let bjHand=[], bjDealerCard=0, bjOver=false;
const bjBtn=makePanel(0.95,0.5,(c,w,h)=>{ c.fillStyle='#3ddc84'; roundRect(c,0,0,w,h,24); c.fill(); c.fillStyle='#06210f'; c.font='bold 36px Segoe UI'; c.textAlign='center'; c.textBaseline='middle'; c.fillText('BLACKJACK 🂡', w/2, h/2); };
bjBtn.position.set(-9.5,-5.2,1); scene.add(bjBtn);
const bjBtns=[
  {pos:{x:-10.5,y:-4.2}, label:'HIT', tap:()=>{ if(bjOver) return; bjHand.push((Math.random()*13+1)|0); const s=bjHand.reduce((a,b)=>a+b); if(s>21){ log('🂡 Bust! You lose.'); bjOver=true; } else { log('🂡 Hit: '+s); } }},
  {pos:{x:-9.5,y:-4.2}, label:'STAND', tap:()=>{ if(bjOver) return; const yours=bjHand.reduce((a,b)=>a+b); const d=bjDealerCard+(Math.random()*10+5)|0; const win = yours<=21 && yours>d ? Math.floor(50*payMul()) : 0; if(win>0) { addTokens(win); log('🂡 Won! Dealer: '+d+' → +'+fmt(win)); reportWin(win,'Blackjack'); } else { log('🂡 Dealer: '+d+' wins'); } bjOver=true; save(); refreshUpgrades(); }},
  {pos:{x:-8.5,y:-4.2}, label:'NEW HAND', tap:()=>{ if(!bjOver) { log('Finish your hand first'); return; } const cost=35; if(S.tokens<cost){ log('Need 🪙'+fmt(cost)); return; } addTokens(-cost); bjHand=[]; bjDealerCard=(Math.random()*11+10)|0; bjOver=false; log('🂡 New hand started. Bet: 🪙'+fmt(cost)); }},
];
bjBtns.forEach(o=>{ const b=makePanel(0.8,0.4,(c,w,h)=>{ c.fillStyle='#1b2140'; roundRect(c,0,0,w,h,16); c.fill(); c.fillStyle='#ffd34d'; c.font='bold 28px Segoe UI'; c.textAlign='center'; c.textBaseline='middle'; c.fillText(o.label, w/2, h/2); }; b.position.set(o.pos.x,o.pos.y,1); scene.add(b); registerInteractable(b, o.tap); };

// ==================================================================
// KENO
// ==================================================================
let kenoSelection=[], kenoDrawn=[];
const kenoBtn=makePanel(0.95,0.5,(c,w,h)=>{ c.fillStyle='#5dd6ff'; roundRect(c,0,0,w,h,24); c.fill(); c.fillStyle='#06210f'; c.font='bold 38px Segoe UI'; c.textAlign='center'; c.textBaseline='middle'; c.fillText('KENO 🔢', w/2, h/2); };
kenoBtn.position.set(-7.5,-5.2,1); scene.add(kenoBtn);
const kenoDrawBtn=makePanel(0.9,0.45,(c,w,h)=>{ c.fillStyle='#9b5dff'; roundRect(c,0,0,w,h,20); c.fill(); c.fillStyle='#fff'; c.font='bold 32px Segoe UI'; c.textAlign='center'; c.textBaseline='middle'; c.fillText('DRAW & WIN', w/2, h/2); };
kenoDrawBtn.position.set(-7.5,-4.2,1); scene.add(kenoDrawBtn);
registerInteractable(kenoDrawBtn, ()=>{ if(kenoSelection.length<5){ log('🔢 Pick 5 numbers first'); return; } const cost=40; if(S.tokens<cost){ log('Need 🪙'+fmt(cost)); return; } addTokens(-cost); kenoDrawn=[]; for(let i=0;i<20;i++) kenoDrawn.push((Math.random()*80+1)|0); const matches=kenoSelection.filter(n=>kenoDrawn.includes(n)).length; const payout=[0,0,10,30,200,1500].map(x=>Math.floor(x*payMul()))[matches]||0; if(payout>0) { addTokens(payout); log('🔢 Matched '+matches+' → +'+fmt(payout)); reportWin(payout,'Keno'); } else { log('🔢 No matches'); } save(); refreshUpgrades(); };

// ==================================================================
// HIGH-LOW
// ==================================================================
let hlCard=0, hlGuessing=false;
const hlBtn=makePanel(0.95,0.5,(c,w,h)=>{ c.fillStyle='#ff9b3d'; roundRect(c,0,0,w,h,24); c.fill(); c.fillStyle='#06210f'; c.font='bold 36px Segoe UI'; c.textAlign='center'; c.textBaseline='middle'; c.fillText('HIGH-LOW 🃏', w/2, h/2); };
hlBtn.position.set(-5.5,-5.2,1); scene.add(hlBtn);
const hlBtns=[
  {pos:{x:-6.3,y:-4.2}, label:'HIGHER', tap:()=>{ if(!hlGuessing) return; const next=(Math.random()*13+1)|0; const win=next>hlCard ? Math.floor(45*payMul()) : 0; hlGuessing=false; if(win>0) { addTokens(win); log('🃏 Higher! '+next+' → +'+fmt(win)); reportWin(win,'High-Low'); } else { log('🃏 Card: '+next+', not higher'); } save(); refreshUpgrades(); }},
  {pos:{x:-5.5,y:-4.2}, label:'LOWER', tap:()=>{ if(!hlGuessing) return; const next=(Math.random()*13+1)|0; const win=next<hlCard ? Math.floor(45*payMul()) : 0; hlGuessing=false; if(win>0) { addTokens(win); log('🃏 Lower! '+next+' → +'+fmt(win)); reportWin(win,'High-Low'); } else { log('🃏 Card: '+next+', not lower'); } save(); refreshUpgrades(); }},
  {pos:{x:-4.7,y:-4.2}, label:'DEAL', tap:()=>{ if(hlGuessing) { log('Finish your guess'); return; } const cost=30; if(S.tokens<cost){ log('Need 🪙'+fmt(cost)); return; } addTokens(-cost); hlCard=(Math.random()*13+1)|0; hlGuessing=true; log('🃏 Card: '+hlCard+'. Higher or Lower?'); }},
];
hlBtns.forEach(o=>{ const b=makePanel(0.75,0.4,(c,w,h)=>{ c.fillStyle='#1b2140'; roundRect(c,0,0,w,h,16); c.fill(); c.fillStyle='#ffd34d'; c.font='bold 24px Segoe UI'; c.textAlign='center'; c.textBaseline='middle'; c.fillText(o.label, w/2, h/2); }; b.position.set(o.pos.x,o.pos.y,1); scene.add(b); registerInteractable(b, o.tap); };

// ==================================================================
// SPINNING WHEEL
// ==================================================================
let wheelSpinning2=false;
const wheelBtn2=makePanel(0.95,0.5,(c,w,h)=>{ c.fillStyle='#ffcf6a'; roundRect(c,0,0,w,h,24); c.fill(); c.fillStyle='#1a0b2e'; c.font='bold 38px Segoe UI'; c.textAlign='center'; c.textBaseline='middle'; c.fillText('SPIN WHEEL 🎡', w/2, h/2); };
wheelBtn2.position.set(-3.5,-5.2,1); scene.add(wheelBtn2);
const spinWheelBtn=makePanel(0.9,0.45,(c,w,h)=>{ c.fillStyle='#3ddc84'; roundRect(c,0,0,w,h,20); c.fill(); c.fillStyle='#06210f'; c.font='bold 32px Segoe UI'; c.textAlign='center'; c.textBaseline='middle'; c.fillText('SPIN!', w/2, h/2); };
spinWheelBtn.position.set(-3.5,-4.2,1); scene.add(spinWheelBtn);
registerInteractable(spinWheelBtn, ()=>{ if(wheelSpinning2){ log('Already spinning'); return; } const cost=45; if(S.tokens<cost){ log('Need 🪙'+fmt(cost)); return; } addTokens(-cost); wheelSpinning2=true; const mults=[0.5,1,2,5,0.2,3,1.5,2.5]; const m=mults[(Math.random()*mults.length)|0]; const win=Math.floor(cost*m*payMul()); addTokens(win); log('🎡 '+m+'x → +'+fmt(win)); reportWin(win,'Spin Wheel'); wheelSpinning2=false; save(); refreshUpgrades(); };

// ==================================================================
// CARD FLIP
// ==================================================================
let cardFlipPairs=[], cardFlipRevealed=[], cardFlipMatched=0;
const cfBtn=makePanel(0.95,0.5,(c,w,h)=>{ c.fillStyle='#ff5db1'; roundRect(c,0,0,w,h,24); c.fill(); c.fillStyle='#fff'; c.font='bold 36px Segoe UI'; c.textAlign='center'; c.textBaseline='middle'; c.fillText('CARD FLIP 🎴', w/2, h/2); };
cfBtn.position.set(-1.5,-5.2,1); scene.add(cfBtn);
const cfStartBtn=makePanel(0.9,0.45,(c,w,h)=>{ c.fillStyle='#b46bff'; roundRect(c,0,0,w,h,20); c.fill(); c.fillStyle='#fff'; c.font='bold 28px Segoe UI'; c.textAlign='center'; c.textBaseline='middle'; c.fillText('NEW GAME 🎴', w/2, h/2); };
cfStartBtn.position.set(-1.5,-4.2,1); scene.add(cfStartBtn);
registerInteractable(cfStartBtn, ()=>{ const cost=35; if(S.tokens<cost){ log('Need 🪙'+fmt(cost)); return; } addTokens(-cost); cardFlipPairs=[]; for(let i=0;i<8;i++) cardFlipPairs.push(i,i); cardFlipPairs.sort(()=>Math.random()-0.5); cardFlipRevealed=new Array(16).fill(false); cardFlipMatched=0; log('🎴 New game: match '+cost+' bet.'); };

// ==================================================================
// BINGO
// ==================================================================
let bingoCard=[], bingoDrawn=[], bingoWon=false;
const bingoBtn=makePanel(0.95,0.5,(c,w,h)=>{ c.fillStyle='#00eaff'; roundRect(c,0,0,w,h,24); c.fill(); c.fillStyle='#06210f'; c.font='bold 38px Segoe UI'; c.textAlign='center'; c.textBaseline='middle'; c.fillText('BINGO 🎰', w/2, h/2); };
bingoBtn.position.set(0.5,-5.2,1); scene.add(bingoBtn);
const bingoDrawBtn=makePanel(0.9,0.45,(c,w,h)=>{ c.fillStyle='#3ddc84'; roundRect(c,0,0,w,h,20); c.fill(); c.fillStyle='#06210f'; c.font='bold 32px Segoe UI'; c.textAlign='center'; c.textBaseline='middle'; c.fillText('DRAW', w/2, h/2); };
bingoDrawBtn.position.set(0.5,-4.2,1); scene.add(bingoDrawBtn);
registerInteractable(bingoDrawBtn, ()=>{ if(!bingoCard.length){ const cost=50; if(S.tokens<cost){ log('Need 🪙'+fmt(cost)); return; } addTokens(-cost); bingoCard=new Array(25).fill(0).map(()=>(Math.random()*90+1)|0); bingoDrawn=[]; bingoWon=false; log('🎰 New BINGO card! Match 5 in a row.'); } else { const num=(Math.random()*90+1)|0; if(!bingoDrawn.includes(num)) bingoDrawn.push(num); const bingo=bingoCard.some((r,i)=>i%5===0&&bingoCard.slice(i,i+5).every(n=>bingoDrawn.includes(n))); if(bingo && !bingoWon) { bingoWon=true; const win=Math.floor(200*payMul()); addTokens(win); log('🎰 BINGO! → +'+fmt(win)); reportWin(win,'Bingo'); bingoCard=[]; } } save(); refreshUpgrades(); };

// ==================================================================
// CONTROLLERS + RAY INTERACTION
// ==================================================================
const raycaster=new THREE.Raycaster();
const tmpMat=new THREE.Matrix4();
const controllers=[];
const controllerModelFactory=new XRControllerModelFactory();
function setupController(i){
  const c=renderer.xr.getController(i); rig.add(c);
  const grip=renderer.xr.getControllerGrip(i); grip.add(controllerModelFactory.createControllerModel(grip)); rig.add(grip);
  // ray line
  const geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0),new THREE.Vector3(0,0,-5)]);
  const line=new THREE.Line(geo,new THREE.LineBasicMaterial({color:0x5dd6ff})); line.scale.z=5; c.add(line);
  c.userData.line=line; c.userData.index=i;
  c.addEventListener('selectstart', ()=>onSelect(c));
  controllers.push(c);
  // hand support: also fire on 'squeeze' as tap fallback
  c.addEventListener('squeezestart', ()=>onSelect(c));
  return c;
}
setupController(0); setupController(1);

function intersectFrom(originObj){
  tmpMat.identity().extractRotation(originObj.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(originObj.matrixWorld);
  raycaster.ray.direction.set(0,0,-1).applyMatrix4(tmpMat);
  return raycaster.intersectObjects(interactables,false);
}
function onSelect(originObj){
  const hits=intersectFrom(originObj);            // sets raycaster.ray
  if(hammerActive && banUnderRay()) return;
  if(hits.length){ const h=hits[0]; const m=h.object; if(m.userData.onTap){ sfxClick(); m.userData.onTap(h); pulse(m,0x5dd6ff); } }
}

// Hover highlight
let lastHover=null;
function updateHover(){
  let hovered=null;
  for(const c of controllers){ const hits=intersectFrom(c); if(hits.length){ hovered=hits[0].object; c.userData.line.scale.z=hits[0].distance; } else c.userData.line.scale.z=5; }
  lastHover=hovered;
}

// ==================================================================
// MULTIPLAYER (PeerJS, star topology — host relays to ~5 peers)
// ==================================================================
const MP = {
  peer:null, isHost:false, conns:[], hostConn:null, id:null,
  myId: 'p'+Math.random().toString(36).slice(2,8),
  avatars:{}, // id -> {group, head, hands[], targets}
  localStream:null, calls:{}, audioEls:{}, muted:false,
};
const avatarRoot = new THREE.Group(); scene.add(avatarRoot);
const PLAYER_COLORS = [0xff5db1,0x5dd6ff,0xffd34d,0x3ddc84,0x9b5dff,0xff9b3d];
function colorFor(id){ let h=0; for(const c of id) h=(h*31+c.charCodeAt(0))>>>0; return PLAYER_COLORS[h%PLAYER_COLORS.length]; }

function makeAvatar(id){
  const g=new THREE.Group(); const col=colorFor(id);
  const mat=new THREE.MeshStandardMaterial({color:col, emissive:col, emissiveIntensity:0.3});
  const head=new THREE.Mesh(new THREE.BoxGeometry(0.22,0.24,0.26), mat); g.add(head);
  // visor
  const visor=new THREE.Mesh(new THREE.BoxGeometry(0.2,0.07,0.02), new THREE.MeshStandardMaterial({color:0x05060a}));
  visor.position.set(0,0.02,0.13); head.add(visor);
  const hands=[0,1].map(()=>{ const h=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.08,0.12), mat); g.add(h); return h; });
  // nametag above head
  const tagCanvas=document.createElement('canvas'); tagCanvas.width=256; tagCanvas.height=64;
  const tagTex=new THREE.CanvasTexture(tagCanvas);
  const tag=new THREE.Mesh(new THREE.PlaneGeometry(0.5,0.125), new THREE.MeshBasicMaterial({map:tagTex,transparent:true}));
  tag.position.set(0,0.3,0); head.add(tag);
  g.userData.avatarId=id; head.userData.avatarId=id;
  avatarRoot.add(g);
  const a={ group:g, head, hands, tag, tagCanvas, tagTex, username:'',
    t:{ head:{p:new THREE.Vector3(),q:new THREE.Quaternion()}, hands:[{p:new THREE.Vector3(),q:new THREE.Quaternion()},{p:new THREE.Vector3(),q:new THREE.Quaternion()}] } };
  MP.avatars[id]=a; return a;
}
function drawTag(a){ const x=a.tagCanvas.getContext('2d'); x.clearRect(0,0,256,64);
  x.fillStyle='rgba(8,10,20,0.7)'; x.fillRect(0,12,256,40);
  x.fillStyle='#fff'; x.font='bold 30px Segoe UI'; x.textAlign='center'; x.textBaseline='middle';
  x.fillText((a.username||'player').slice(0,16),128,33); a.tagTex.needsUpdate=true; }
function removeAvatar(id){ const a=MP.avatars[id]; if(a){ avatarRoot.remove(a.group); delete MP.avatars[id]; } }

function setMpStatus(t){ const el=document.getElementById('mpStatus'); if(el) el.textContent=t; }

function localState(){
  // world transforms of head + hands
  const hp=new THREE.Vector3(), hq=new THREE.Quaternion(), s=new THREE.Vector3();
  camera.matrixWorld.decompose(hp,hq,s);
  const hands=controllers.map(c=>{ const p=new THREE.Vector3(),q=new THREE.Quaternion(); c.matrixWorld.decompose(p,q,s); return {p:[p.x,p.y,p.z],q:[q.x,q.y,q.z,q.w]}; });
  return { id:MP.myId, name:S.username, head:{p:[hp.x,hp.y,hp.z],q:[hq.x,hq.y,hq.z,hq.w]}, hands };
}
function applyState(st){
  if(st.id===MP.myId) return;
  const a=MP.avatars[st.id]||makeAvatar(st.id);
  if(st.name && st.name!==a.username){ a.username=st.name; drawTag(a); }
  a.t.head.p.fromArray(st.head.p); a.t.head.q.fromArray(st.head.q);
  (st.hands||[]).forEach((h,i)=>{ if(a.t.hands[i]){ a.t.hands[i].p.fromArray(h.p); a.t.hands[i].q.fromArray(h.q); } });
  a.lastSeen=performance.now();
}
function broadcast(obj, exceptConn){
  const msg=JSON.stringify(obj);
  for(const c of MP.conns){ if(c!==exceptConn && c.open) try{ c.send(msg); }catch(e){} }
}
function sendState(){
  if(!MP.peer) return; const st=localState();
  if(MP.isHost){ broadcast({t:'state', s:st}); }
  else if(MP.hostConn && MP.hostConn.open){ try{ MP.hostConn.send(JSON.stringify({t:'state', s:st})); }catch(e){} }
}
function handleMsg(data, conn){
  let m; try{ m=JSON.parse(data); }catch(e){ return; }
  if(m.t==='state'){ applyState(m.s); if(MP.isHost) broadcast({t:'state', s:m.s}, conn); }
  else if(m.t==='bigwin'){ log(`🌐 ${m.name||'Player'}: 🪙${m.amount} on ${m.game}`); if(MP.isHost) broadcast(m, conn); }
  else if(m.t==='roster'){ applyRoster(m.ids); }
}

// ICE servers: STUN for discovery + free public TURN relays so audio can cross
// stricter home-network NATs (the default PeerJS broker gives STUN only).
const PEER_OPTS = { config: { iceServers: [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
] } };

// ---------- Voice chat (WebRTC audio, full mesh) ----------
// initMic returns a shared promise; calls below AWAIT it so a stream is always
// attached before we answer/place a call (otherwise the audio is silent).
function initMic(){
  if(MP.micReady) return MP.micReady;
  MP.micReady = (async ()=>{
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}, video:false });
      MP.localStream = stream;
      stream.getAudioTracks().forEach(t=>t.enabled=!VOICE.muted);
      log('🎤 Mic on — voice chat enabled.');
    } catch(e){ console.error('getUserMedia failed', e); log('🎤 Mic blocked — playing without voice.'); MP.localStream=null; }
    return MP.localStream;
  })();
  return MP.micReady;
}
function unlockAudio(){ for(const id in MP.audioEls){ MP.audioEls[id].play().catch(()=>{}); } }
addEventListener('pointerdown', unlockAudio);
function attachRemoteAudio(id, stream){
  let el=MP.audioEls[id];
  if(!el){ el=document.createElement('audio'); el.autoplay=true; el.dataset.peer=id; document.body.appendChild(el); MP.audioEls[id]=el; log('🔊 Hearing a player.'); }
  el.srcObject=stream; el.play().catch(e=>{ log('🔊 Tap the screen to enable audio.'); };
}
async function handleCall(call){
  await initMic();                       // ensure our stream is ready before answering
  call.answer(MP.localStream || undefined);
  call.on('stream', s=>attachRemoteAudio(call.peer, s));
  call.on('error', e=>{ console.error('call error', e); log('🔇 Voice connect failed.'); };
  call.on('close', ()=>{ if(MP.audioEls[call.peer]){ MP.audioEls[call.peer].remove(); delete MP.audioEls[call.peer]; } });
  MP.calls[call.peer]=call;
}
async function maybeCall(otherId){
  if(!MP.peer || otherId===MP.peer.id) return;
  if(MP.calls[otherId]) return;
  if(MP.peer.id >= otherId) return;      // deterministic single initiator per pair
  MP.calls[otherId]='pending';           // reserve synchronously to avoid double calls
  await initMic();                       // wait for our mic before placing the call
  const call=MP.peer.call(otherId, MP.localStream || undefined);
  if(!call){ delete MP.calls[otherId]; return; }
  call.on('stream', s=>attachRemoteAudio(otherId, s));
  call.on('error', e=>{ console.error('call error', e); log('🔇 Voice connect failed.'); };
  call.on('close', ()=>{ if(MP.audioEls[otherId]){ MP.audioEls[otherId].remove(); delete MP.audioEls[otherId]; } });
  MP.calls[otherId]=call;
}
function applyRoster(ids){ (ids||[]).forEach(maybeCall); }
function broadcastRoster(){
  if(!MP.isHost||!MP.peer) return;
  const ids=[MP.peer.id, ...MP.conns.map(c=>c.peer)];
  broadcast({t:'roster', ids}); applyRoster(ids);
}
function toggleMute(){
  if(VOICE.forced && VOICE.muted){ log('🔇 You are muted by an admin.'); return; } // can't unmute
  VOICE.muted=!VOICE.muted; MP.muted=VOICE.muted;
  if(MP.localStream) MP.localStream.getAudioTracks().forEach(t=>t.enabled=!VOICE.muted);
  const dm=document.getElementById('domMute'); if(dm){ dm.textContent=VOICE.muted?'🔇':'🎤'; dm.classList.toggle('muted',VOICE.muted); }
  log(VOICE.muted?'🔇 Muted':'🎤 Unmuted');
}
function mpBroadcastWin(amount, game){
  if(!MP.peer) return;
  const msg={t:'bigwin', amount, game, name:MP.myId};
  if(MP.isHost) broadcast(msg); else if(MP.hostConn&&MP.hostConn.open){ try{MP.hostConn.send(JSON.stringify(msg));}catch(e){} }
}
function hostRoom(code){
  if(typeof Peer==='undefined'){ log('Multiplayer lib failed to load'); setMpStatus('lib error'); return; }
  if(MP.peer){ try{ MP.peer.destroy(); }catch(e){} MP.peer=null; MP.conns=[]; }
  initMic(); // start mic in background; don't block hosting on the permission dialog
  MP.isHost=true; MP.id='casino-'+code;
  setMpStatus('connecting…');
  MP.peer=new Peer(MP.id, PEER_OPTS);
  MP.peer.on('open', id=>{ setMpStatus('hosting "'+code+'" 🎤'); log('🌐 Hosting room "'+code+'" (id '+id+'). Share the code.'); };
  MP.peer.on('call', handleCall);
  MP.peer.on('connection', conn=>{
    conn.on('open', ()=>{ MP.conns.push(conn); setMpStatus('hosting "'+code+'" • '+(MP.conns.length+1)+' players 🎤'); log('🌐 A player joined.'); broadcastRoster(); };
    conn.on('data', d=>handleMsg(d, conn));
    conn.on('close', ()=>{ MP.conns=MP.conns.filter(c=>c!==conn); if(conn.peer){ removeAvatar(conn.peer); if(MP.audioEls[conn.peer]){MP.audioEls[conn.peer].remove(); delete MP.audioEls[conn.peer];} delete MP.calls[conn.peer]; } broadcastRoster(); };
  });
  MP.peer.on('error', e=>{ console.error('PeerJS host error', e); const t=e.type||'error';
    log('🌐 Host error: '+t+(t==='unavailable-id'?' (room code in use — pick another or wait ~30s)':''));
    setMpStatus('error: '+t); };
}
function joinRoom(code){
  if(typeof Peer==='undefined'){ log('Multiplayer lib failed to load'); setMpStatus('lib error'); return; }
  if(MP.peer){ try{ MP.peer.destroy(); }catch(e){} MP.peer=null; }
  initMic();
  MP.isHost=false; setMpStatus('connecting…'); MP.peer=new Peer(PEER_OPTS);
  MP.peer.on('call', handleCall);
  MP.peer.on('open', ()=>{
    const conn=MP.peer.connect('casino-'+code, {reliable:false});
    MP.hostConn=conn;
    conn.on('open', ()=>{ setMpStatus('joined "'+code+'" 🎤'); log('🌐 Connected to room "'+code+'".'); };
    conn.on('data', d=>handleMsg(d, conn));
    conn.on('close', ()=>{ setMpStatus('disconnected'); log('🌐 Lost connection to host.'); };
  });
  MP.peer.on('error', e=>{ console.error('PeerJS join error', e); const t=e.type||'error';
    log('🌐 Join error: '+t+(t==='peer-unavailable'?' (no host with that code yet)':''));
    setMpStatus('error: '+t); };
}
let mpSendAccum=0;
function mpUpdate(dt){
  if(!MP.peer) return;
  mpSendAccum+=dt; if(mpSendAccum>=0.066){ sendState(); mpSendAccum=0; } // ~15Hz
  const now=performance.now();
  for(const id in MP.avatars){ const a=MP.avatars[id];
    if(a.lastSeen && now-a.lastSeen>5000){ removeAvatar(id); continue; }
    a.head.position.lerp(a.t.head.p, 0.3); a.head.quaternion.slerp(a.t.head.q, 0.3);
    a.hands.forEach((h,i)=>{ h.position.lerp(a.t.hands[i].p,0.3); h.quaternion.slerp(a.t.hands[i].q,0.3); };
    if(a.tag){ a.tag.lookAt(camera.getWorldPosition(new THREE.Vector3())); }
  }
}

// ==================================================================
// SOUND EFFECTS (WebAudio, synthesized — no asset files)
// ==================================================================
let actx=null;
function audio(){ if(!actx){ try{ actx=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} } if(actx&&actx.state==='suspended') actx.resume(); return actx; }
function tone(freq, dur=0.12, type='sine', gain=0.18, when=0){
  const a=audio(); if(!a) return; const t=a.currentTime+when;
  const o=a.createOscillator(), g=a.createGain();
  o.type=type; o.frequency.setValueAtTime(freq,t);
  g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(gain,t+0.01); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t+dur+0.02);
}
function sfxClick(){ tone(420,0.05,'square',0.12); }
function sfxTick(){ tone(900,0.03,'square',0.06); }
function sfxBuy(){ tone(520,0.08,'triangle',0.2); tone(780,0.1,'triangle',0.18,0.06); }
function sfxWin(){ tone(660,0.1,'triangle',0.2); tone(990,0.12,'triangle',0.18,0.08); }
function sfxBig(){ [523,659,784,1047,1319].forEach((f,i)=>tone(f,0.18,'sawtooth',0.16,i*0.07)); }
function sfxLose(){ tone(200,0.2,'sawtooth',0.14); tone(150,0.25,'sawtooth',0.12,0.08); }
function sfxCoin(){ tone(1200,0.05,'square',0.1); tone(1600,0.05,'square',0.08,0.04); }
function sfxEvent(){ [392,523,659,784,1047].forEach((f,i)=>tone(f,0.25,'square',0.18,i*0.09)); }

// ==================================================================
// DECORATION & ATMOSPHERE
// ==================================================================
function buildDecor(){
  // smaller wooden patio under the central area (machines mostly sit on grass)
  const deck=new THREE.Mesh(new THREE.CircleGeometry(7.5,56), new THREE.MeshStandardMaterial({color:0x8a6a44, roughness:0.85, metalness:0}));
  deck.rotation.x=-Math.PI/2; deck.position.y=0.02; deck.receiveShadow=true; scene.add(deck);
  const deckRim=new THREE.Mesh(new THREE.TorusGeometry(7.5,0.12,8,64), new THREE.MeshStandardMaterial({color:0x5a4430, roughness:0.9}));
  deckRim.rotation.x=Math.PI/2; deckRim.position.y=0.06; scene.add(deckRim);
  // wooden lamp posts around the patio with warm lights
  const postMat=new THREE.MeshStandardMaterial({color:0x4a3826, roughness:0.85});
  for(let i=0;i<8;i++){ const a=i/8*Math.PI*2, R=10.6; const x=Math.cos(a)*R, z=Math.sin(a)*R;
    const post=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.14,4.2,8), postMat); post.position.set(x,2.1,z); post.castShadow=true; scene.add(post);
    const lamp=new THREE.Mesh(new THREE.SphereGeometry(0.22,12,12), new THREE.MeshStandardMaterial({color:0xfff1c0, emissive:0xffd98a, emissiveIntensity:0.9}));
    lamp.position.set(x,4.2,z); scene.add(lamp);
    const pl=new THREE.PointLight(0xffe2a0, 0.5, 9); pl.position.set(x,4.2,z); scene.add(pl);
  }
  // big CASINO sign over the entrance (warm marquee, no neon party gradient)
  const sign=makePanel(6,1.2,(c,w,h)=>{ c.clearRect(0,0,w,h); c.fillStyle='rgba(20,12,6,0.85)'; roundRect(c,0,0,w,h,24); c.fill();
    c.lineWidth=8; c.strokeStyle='#ffcf6a'; c.stroke();
    c.fillStyle='#ffcf6a'; c.font='bold 150px Segoe UI'; c.textAlign='center'; c.textBaseline='middle'; c.fillText('★ CASINO ★', w/2, h/2); };
  sign.position.set(0,5.4,-11.4); scene.add(sign);
  // a few distant bushes/trees on the hills for life
  for(let i=0;i<22;i++){ const a=Math.random()*Math.PI*2, R=22+Math.random()*40; const x=Math.cos(a)*R, z=Math.sin(a)*R; const gy=terrainH(x,z);
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.24,1.4,6), new THREE.MeshStandardMaterial({color:0x5a3d22})); trunk.position.set(x,gy+0.7,z); scene.add(trunk);
    const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(1.0+Math.random()*0.6,0), new THREE.MeshStandardMaterial({color:0x2f6b2a, flatShading:true})); crown.position.set(x,gy+1.9,z); scene.add(crown);
  }
}
const decorState={ sparks:null };
buildDecor();

// Disco ball (hidden until disco event)
const discoBall=new THREE.Group(); discoBall.position.set(0,6.5,-2); discoBall.visible=false; scene.add(discoBall);
const ballCore=new THREE.Mesh(new THREE.IcosahedronGeometry(0.7,1), new THREE.MeshStandardMaterial({color:0xcfd8ff, metalness:1, roughness:0.15, emissive:0x223, emissiveIntensity:0.4, flatShading:true}));
discoBall.add(ballCore);
const discoLights=[0xff3b5b,0x3ddc84,0x5dd6ff,0xffd34d,0xff5db1].map((c,i)=>{ const l=new THREE.SpotLight(c,0,30,0.5,0.6); l.position.set(Math.cos(i)*4,7,Math.sin(i)*4-2); l.target.position.set(Math.cos(i*2)*6,0,Math.sin(i*2)*6-2); scene.add(l); scene.add(l.target); return l; });

// Token rain pool
const rainPool=[]; const rainMat=new THREE.MeshStandardMaterial({color:0xffd34d, emissive:0x6b5210, metalness:0.7, roughness:0.3});
for(let i=0;i<120;i++){ const coin=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.12,0.03,12), rainMat); coin.visible=false; coin.rotation.x=Math.PI/2; scene.add(coin); rainPool.push({m:coin, vy:0, spin:0, active:false}); }
function spawnRainCoin(){ const c=rainPool.find(c=>!c.active); if(!c) return; c.active=true; c.m.visible=true; c.m.position.set((Math.random()-0.5)*16, 8, -4+(Math.random()-0.5)*14); c.vy=-(1.5+Math.random()*1.5); c.spin=(Math.random()-0.5)*0.4; }

// Event banner (announces the active admin event)
const eventBanner=makePanel(5,0.8,(c,w,h)=>{ c.clearRect(0,0,w,h); if(!AE.name) return;
  c.fillStyle='rgba(10,8,24,0.7)'; roundRect(c,0,0,w,h,24); c.fill();
  c.lineWidth=6; c.strokeStyle=AE.color||'#ffd34d'; c.stroke();
  const left=Math.max(0,(AE.until-performance.now())/1000);
  c.fillStyle=AE.color||'#ffd34d'; c.font='bold 70px Segoe UI'; c.textAlign='center'; c.textBaseline='middle';
  c.fillText(AE.name+'  ·  '+left.toFixed(0)+'s', w/2, h/2); };
eventBanner.position.set(0,4.6,-8.9); eventBanner.visible=false; scene.add(eventBanner);

// Announcement banner (admin chat messages)
let announceText='', announceUntil=0;
// wrap text into lines that fit maxW at the current font; long unbreakable words
// are split character-by-character so they never overflow.
function wrapText(c, text, maxW){
  const lines=[];
  for(const rawWord of text.split(/\s+/)){
    let word=rawWord;
    // break a single word that's wider than the box
    while(c.measureText(word).width>maxW && word.length>1){
      let i=1; while(i<word.length && c.measureText(word.slice(0,i+1)).width<=maxW) i++;
      lines.push(word.slice(0,i)); word=word.slice(i);
    }
    const last=lines.length-1;
    if(last>=0 && c.measureText(lines[last]+' '+word).width<=maxW) lines[last]+=' '+word;
    else lines.push(word);
  }
  return lines.length?lines:[''];
}
const announcePanel=makePanel(5,2.2,(c,w,h)=>{ c.clearRect(0,0,w,h); if(!announceText) return;
  c.fillStyle='rgba(10,8,24,0.85)'; roundRect(c,0,0,w,h,28); c.fill();
  c.lineWidth=6; c.strokeStyle='#5dd6ff'; c.stroke();
  c.fillStyle='#5dd6ff'; c.font='bold 30px Segoe UI'; c.textAlign='center'; c.textBaseline='top'; c.fillText('📢 ANNOUNCEMENT', w/2, 18);
  // auto-fit: shrink font until all wrapped lines fit the width AND height
  const maxW=w-48, bodyTop=70, availH=h-bodyTop-18;
  let fs=64, lines;
  while(fs>=12){
    c.font='bold '+fs+'px Segoe UI';
    lines=wrapText(c, announceText, maxW);
    const lineH=fs*1.18;
    const widest=Math.max(...lines.map(l=>c.measureText(l).width));
    if(widest<=maxW && lines.length*lineH<=availH) break;
    fs-=2;
  }
  c.fillStyle='#fff'; c.textBaseline='middle';
  const lineH=fs*1.18, startY=bodyTop + (availH-lines.length*lineH)/2 + lineH/2;
  lines.forEach((ln,i)=>c.fillText(ln, w/2, startY+i*lineH));
});
announcePanel.position.set(0,2.6,-3); announcePanel.visible=false; scene.add(announcePanel);
function showAnnouncement(text){ announceText=String(text||'').slice(0,140); announceUntil=performance.now()+9000; announcePanel.visible=true; announcePanel.userData.redraw(); sfxEvent(); flashScreen('#5dd6ff'); log('📢 '+announceText); }

// ==================================================================
// ADMIN COMMANDS (received from the Discord bot over MQTT)
// ==================================================================
function flashScreen(color){ // brief fullscreen tint via DOM
  const d=document.createElement('div'); d.style.cssText='position:fixed;inset:0;z-index:4;pointer-events:none;transition:opacity .6s;opacity:.5;background:'+color;
  document.body.appendChild(d); requestAnimationFrame(()=>d.style.opacity='0'); setTimeout(()=>d.remove(),700);
}
function disconnectVoiceAndPeers(){ try{ if(MP.peer) MP.peer.destroy(); }catch(e){} MP.peer=null; MP.conns=[]; MP.hostConn=null; }
function exitVR(){ try{ const s=renderer.xr.getSession(); if(s) s.end(); }catch(e){} }
function showBlock(title, message, permanent){
  disconnectVoiceAndPeers();                 // remove from multiplayer/voice (keep MQTT so /unban can reach)
  let el=document.getElementById('blockScreen');
  if(!el){ el=document.createElement('div'); el.id='blockScreen'; document.body.appendChild(el); }
  el.style.cssText='position:fixed;inset:0;z-index:50;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(5,6,10,.97);text-align:center;padding:24px;';
  el.innerHTML='<h1 style="font-size:52px;color:#ff5db1;margin-bottom:12px;">'+title+'</h1><p style="color:#9aa3c0;max-width:480px;line-height:1.5;">'+message+'</p>'+(permanent?'':'<button id="rejoinBtn" style="margin-top:22px;padding:12px 30px;border:none;border-radius:24px;font-weight:700;cursor:pointer;background:#5dd6ff;color:#06210f;">Rejoin</button>');
  if(!permanent){ const b=document.getElementById('rejoinBtn'); if(b) b.onclick=()=>location.reload(); }
}
function startEvent(name, color, seconds, luckMul, payMul, opts={}){
  AE.name=name; AE.color=color; AE.luckMul=luckMul; AE.payMul=payMul; AE.until=performance.now()+seconds*1000;
  AE.rain=!!opts.rain; AE.disco=!!opts.disco;
  discoBall.visible=AE.disco; eventBanner.visible=true; eventBanner.userData.redraw();
  sfxEvent(); flashScreen(color); log(`✨ EVENT: ${name} for ${seconds}s`);
}
function endEvent(){ AE.name=null; AE.luckMul=1; AE.payMul=1; AE.rain=false; AE.disco=false; AE.until=0; discoBall.visible=false; eventBanner.visible=false; }
// Is a (possibly targeted) command meant for this client? No target = everyone.
function isForMe(msg){
  const t=(msg.target||msg.user||'').trim().toLowerCase();
  if(!t) return true;
  return t===(S.username||'').toLowerCase() || t===DEVICE_ID.toLowerCase();
}
function applyAdmin(msg){
  try{ if(typeof msg==='string') msg=JSON.parse(msg); }catch(e){ return; }
  if(!msg||!msg.cmd) return;
  if(!isForMe(msg)) return;            // targeted command for someone else
  const sec = +msg.seconds||30;
  switch(msg.cmd){
    case 'kick': { exitVR(); showBlock('👢 KICKED', 'An admin kicked you from the casino.', false); break; }
    case 'ban':  { setBanned(true); localStorage.removeItem('tokenCasino'); // wipe their progress
      Object.assign(S,{tokens:0}); exitVR(); showBlock('⛔ BANNED', 'An admin banned you. Your progress has been wiped.', true); break; }
    case 'unban':{ setBanned(false); log('✅ You were unbanned. Reload to play.'); break; }
    case 'mute': { VOICE.forced=true; if(!VOICE.muted) toggleMute(); else { const dm=document.getElementById('domMute'); if(dm){dm.textContent='🔇';dm.classList.add('muted');} } log('🔇 An admin muted your mic.'); break; }
    case 'unmute':{ VOICE.forced=false; log('🎤 An admin unmuted you.'); break; }
    case 'rename':{ const nm=(msg.name||'').trim().slice(0,16); if(nm){ const old=S.username; S.username=nm; save(); log('✏️ An admin renamed you: '+old+' → '+nm); const ni=document.getElementById('nameInput'); if(ni) ni.value=nm; } break; }
    case 'chat': case 'say': { showAnnouncement(msg.text||msg.message||''); break; }
    case 'tokens': { const amt=+msg.amount||0; addTokens(amt); flashScreen('#ffd34d'); sfxCoin(); log(`🎁 Admin granted 🪙${fmt(amt)}`); save(); refreshUpgrades(); break; }
    case 'luckboost': { const mult=+msg.mult||2; startEvent('🍀 LUCK x'+mult, '#3ddc84', +msg.seconds||60, mult, 1); break; }
    case 'payout': { // server-wide double-or-nothing
      const amt=+msg.amount||100; const won=Math.random()<0.5;
      if(won){ addTokens(amt*2); flashScreen('#3ddc84'); sfxBig(); log(`🎲 Admin payout: DOUBLED → +${fmt(amt*2)}!`); }
      else { flashScreen('#ff3b5b'); sfxLose(); log(`🎲 Admin payout: nothing… (lost ${fmt(amt)})`); }
      save(); refreshUpgrades(); break; }
    case 'event': {
      const name=(msg.name||'').toLowerCase();
      if(name==='rain') startEvent('🌧️ TOKEN RAIN', '#ffd34d', sec, 1, 1.5, {rain:true});
      else if(name==='payout'||name==='-50'||name==='nerf') startEvent('💀 -50% PAYOUT', '#ff3b5b', sec, 1, 0.5);
      else if(name==='golden'||name==='goldenhour') startEvent('🌟 GOLDEN HOUR', '#ffcf33', sec, 2, 3);
      else if(name==='jackpot'||name==='50x') startEvent('💎 50x LUCK & PAYOUT', '#5dd6ff', sec, 50, 50);
      else if(name==='rainbow') startEvent('🌈 RAINBOW', '#ff5db1', sec, +msg.luck||5, +msg.payout||5);
      else if(name==='disco') startEvent('🪩 DISCO PARTY', '#9b5dff', sec, 1.5, 1.5, {disco:true});
      else { log('Unknown event: '+name); return; }
      break; }
    case 'admin': { setAdmin(msg.on===undefined? !adminMode : !!msg.on); log(adminMode?'⚡ You are now an ADMIN.':'Admin removed.'); break; }
    case 'freebuy': { freeBuy = msg.on===undefined? !freeBuy : !!msg.on; log(freeBuy?'🆓 Free upgrades enabled!':'Free upgrades off.'); refreshUpgrades(); break; }
    case 'freelevels': { // instantly grant N free levels of every unlocked upgrade
      const n=Math.max(1,+msg.levels||1); upgradeDefs.forEach(d=>{ if(isUnlocked(d)) S[d.key]=(S[d.key]||0)+n; }); updateHUD(); save(); refreshUpgrades(); flashScreen('#3ddc84'); log(`🎁 +${n} free levels to all unlocked upgrades!`); break; }
    case 'jackpotall': { const amt=+msg.amount||10000; addTokens(amt); flashScreen('#ffd34d'); sfxBig(); log(`🌐 GLOBAL JACKPOT +🪙${fmt(amt)}!`); save(); refreshUpgrades(); break; }
    default: log('Unknown admin cmd: '+msg.cmd);
  }
}

// MQTT bridge — every client subscribes; the bot publishes admin commands here.
let mqttClient=null;
function connectAdminBridge(){
  if(typeof mqtt==='undefined'){ log('MQTT lib not loaded'); return; }
  try{
    mqttClient=mqtt.connect('wss://broker.emqx.io:8084/mqtt', { reconnectPeriod:4000, connectTimeout:8000 });
    const topic='tokencasino/'+ADMIN_CHANNEL+'/cmd';
    mqttClient.on('connect', ()=>{ mqttClient.subscribe(topic); log('🔗 Admin bridge connected.'); };
    mqttClient.on('message', (t,payload)=>{ applyAdmin(payload.toString()); };
    mqttClient.on('error', e=>{ console.error('MQTT error',e); };
  }catch(e){ console.error('MQTT connect failed', e); }
}
connectAdminBridge();
function publishAdmin(obj){ try{ if(mqttClient && mqttClient.connected) mqttClient.publish('tokencasino/'+ADMIN_CHANNEL+'/cmd', JSON.stringify(obj)); }catch(e){} }

// ---------- Admin mode + in-game admin panel + ban hammer ----------
let adminMode = localStorage.getItem('casinoAdmin')==='1';
let freeBuy = false;
let hammerActive = false;
function setAdmin(on){ adminMode=on; if(on) localStorage.setItem('casinoAdmin','1'); else { localStorage.removeItem('casinoAdmin'); hammerActive=false; }
  const ap=document.getElementById('adminPanel'); if(ap) ap.style.display = (on && overlay.style.display==='none')?'block':'none'; updateHammerBtn(); }
function updateHammerBtn(){ const b=document.getElementById('ahHammer'); if(b){ b.textContent = hammerActive?'🔨 BAN HAMMER: ON':'🔨 Ban Hammer'; b.classList.toggle('on',hammerActive); } }
// try to ban whatever avatar the current ray hits; returns true if it consumed the action
function banUnderRay(){
  if(!hammerActive) return false;
  const hits=raycaster.intersectObjects(avatarRoot.children,true);
  if(!hits.length) return false;
  let o=hits[0].object; while(o && !o.userData.avatarId) o=o.parent;
  if(!o) return false;
  const a=MP.avatars[o.userData.avatarId]; const target=a&&a.username;
  if(target){ publishAdmin({cmd:'ban', target}); log('🔨 Banned '+target); flashScreen('#ff2e97'); sfxBig(); }
  else log('🔨 That player has no name yet.');
  return true;
}

// Nature events — random pleasant weather that grants temporary boosts
const NATURE=[
  {name:'☀️ SUNNY SPELL',  color:'#ffcf33', luck:1,   pay:1.8, opts:{}},
  {name:'🍀 LUCKY BREEZE', color:'#39ff14', luck:2.5, pay:1,   opts:{}},
  {name:'🌈 RAINBOW',      color:'#ff5db1', luck:2,   pay:2,   opts:{}},
  {name:'🌧️ TOKEN RAIN',   color:'#5dd6ff', luck:1,   pay:1.6, opts:{rain:true}},
  {name:'🌻 HARVEST',      color:'#ff9b3d', luck:1.5, pay:1.5, opts:{}},
];
let natureAccum=0, nextNature=60+Math.random()*60;
function triggerNature(){ const n=NATURE[(Math.random()*NATURE.length)|0]; startEvent(n.name, n.color, 25+Math.random()*20|0, n.luck, n.pay, n.opts); log('🍃 A nature event began!'); }

// Per-frame updates for events
function stepEvents(dt){
  const t=performance.now();
  if(AE.name && AE.until<=t) endEvent();
  // randomly start a nature event when nothing is active
  if(!AE.name){ natureAccum+=dt; if(natureAccum>=nextNature){ triggerNature(); natureAccum=0; nextNature=80+Math.random()*120; } }
  if(eventBanner.visible){ eventBanner.userData.redraw(); eventBanner.lookAt(camera.getWorldPosition(new THREE.Vector3())); }
  if(announcePanel.visible){ announcePanel.lookAt(camera.getWorldPosition(new THREE.Vector3())); if(t>announceUntil){ announcePanel.visible=false; announceText=''; } }
  // rain
  if(AE.rain && Math.random()<0.6) spawnRainCoin();
  for(const c of rainPool){ if(!c.active) continue; c.m.position.y+=c.vy*dt; c.m.rotation.z+=c.spin; if(c.m.position.y<0.1){ c.active=false; c.m.visible=false; } }
  // disco
  if(AE.disco){ discoBall.rotation.y+=dt*1.5; const ti=t*0.004; discoLights.forEach((l,i)=>{ l.intensity=2+Math.sin(ti+i)*1.5; l.target.position.set(Math.cos(ti+i*1.3)*7,0,Math.sin(ti+i*1.7)*7-2); }; }
  else discoLights.forEach(l=>l.intensity=0);
  // sparkle drift
  if(decorState.sparks){ decorState.sparks.rotation.y+=dt*0.02; }
}

// ==================================================================
// LOCOMOTION (thumbstick)
// ==================================================================
let snapCooldown=0;
function locomotion(dt){
  const session=renderer.xr.getSession(); if(!session) return;
  for(const src of session.inputSources){
    if(!src.gamepad) continue; const ax=src.gamepad.axes; if(ax.length<4) continue;
    const hand=src.handedness;
    if(hand==='left'){
      const x=ax[2]||0, y=ax[3]||0;
      if(Math.abs(x)>0.15||Math.abs(y)>0.15){
        const speed=3*dt; const dir=new THREE.Vector3();
        camera.getWorldDirection(dir); dir.y=0; dir.normalize();
        const right=new THREE.Vector3().crossVectors(dir,new THREE.Vector3(0,1,0));
        rig.position.addScaledVector(dir, -y*speed); rig.position.addScaledVector(right, x*speed);
      }
    } else if(hand==='right'){
      const x=ax[2]||0;
      if(snapCooldown<=0 && Math.abs(x)>0.7){ rig.rotateY(-Math.sign(x)*Math.PI/6); snapCooldown=0.3; }
    }
  }
  if(snapCooldown>0) snapCooldown-=dt;
}

// ==================================================================
// DESKTOP FALLBACK (no headset)
// ==================================================================
const keys={};
addEventListener('keydown',e=>{ keys[e.code]=true; if(e.code==='KeyM'){ toggleMute(); muteBtn.userData.redraw(); } }); addEventListener('keyup',e=>keys[e.code]=false);
let yaw=0,pitch=0, pointerLocked=false;
renderer.domElement.addEventListener('click', ()=>{
  if(renderer.xr.isPresenting) return;
  if(isTouch) return; // touch devices use the touch handlers instead of pointer lock
  if(!pointerLocked){ renderer.domElement.requestPointerLock(); return; }
  // raycast from camera center
  raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
  if(hammerActive && banUnderRay()) return;
  const hits=raycaster.intersectObjects(interactables,false);
  if(hits.length){ const h=hits[0]; if(h.object.userData.onTap){ sfxClick(); h.object.userData.onTap(h); pulse(h.object,0x5dd6ff); } }
});
document.addEventListener('pointerlockchange', ()=>{ pointerLocked=document.pointerLockElement===renderer.domElement; });
addEventListener('mousemove', e=>{ if(!pointerLocked) return; yaw-=e.movementX*0.002; pitch-=e.movementY*0.002; pitch=Math.max(-1.4,Math.min(1.4,pitch)); };
const mobileMove={x:0,y:0}; // from on-screen joystick (-1..1)
function desktopControls(dt){
  if(renderer.xr.isPresenting) return;
  rig.rotation.y=yaw; camera.rotation.x=pitch;
  const speed=4*dt; const dir=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(0,yaw,0));
  const right=new THREE.Vector3(1,0,0).applyEuler(new THREE.Euler(0,yaw,0));
  if(keys['KeyW'])rig.position.addScaledVector(dir,speed);
  if(keys['KeyS'])rig.position.addScaledVector(dir,-speed);
  if(keys['KeyA'])rig.position.addScaledVector(right,-speed);
  if(keys['KeyD'])rig.position.addScaledVector(right,speed);
  // mobile joystick: y forward/back, x strafe
  if(mobileMove.x||mobileMove.y){ rig.position.addScaledVector(dir,-mobileMove.y*speed); rig.position.addScaledVector(right,mobileMove.x*speed); }
}

// ==================================================================
// MOBILE / TOUCH CONTROLS — left thumb = move, right drag = look, tap = interact
// ==================================================================
const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints>0;
const joyBase=document.getElementById('joyBase'), joyKnob=document.getElementById('joyKnob');
let moveTouchId=null, joyCx=0, joyCy=0;
let lookTouchId=null, lookLastX=0, lookLastY=0, lookMoved=0, lookStartT=0;
const JOY_R=55;
function isLeftHalf(x){ return x < window.innerWidth*0.45; }
function onTouchStart(e){
  if(renderer.xr.isPresenting) return;
  audio(); // unlock sound on first touch
  for(const t of e.changedTouches){
    if(moveTouchId===null && isLeftHalf(t.clientX)){
      moveTouchId=t.identifier; joyCx=t.clientX; joyCy=t.clientY;
      joyBase.style.left=(joyCx-JOY_R)+'px'; joyBase.style.top=(joyCy-JOY_R)+'px'; joyBase.style.display='block';
      joyKnob.style.transform='translate(0px,0px)';
    } else if(lookTouchId===null){
      lookTouchId=t.identifier; lookLastX=t.clientX; lookLastY=t.clientY; lookMoved=0; lookStartT=performance.now();
    }
  }
  e.preventDefault();
}
function onTouchMove(e){
  for(const t of e.changedTouches){
    if(t.identifier===moveTouchId){
      let dx=t.clientX-joyCx, dy=t.clientY-joyCy; const d=Math.hypot(dx,dy);
      if(d>JOY_R){ dx*=JOY_R/d; dy*=JOY_R/d; }
      joyKnob.style.transform=`translate(${dx}px,${dy}px)`;
      mobileMove.x=dx/JOY_R; mobileMove.y=dy/JOY_R;
    } else if(t.identifier===lookTouchId){
      const dx=t.clientX-lookLastX, dy=t.clientY-lookLastY; lookLastX=t.clientX; lookLastY=t.clientY;
      lookMoved+=Math.abs(dx)+Math.abs(dy);
      yaw-=dx*0.005; pitch-=dy*0.005; pitch=Math.max(-1.4,Math.min(1.4,pitch));
    }
  }
  e.preventDefault();
}
function onTouchEnd(e){
  for(const t of e.changedTouches){
    if(t.identifier===moveTouchId){ moveTouchId=null; mobileMove.x=0; mobileMove.y=0; joyBase.style.display='none'; }
    else if(t.identifier===lookTouchId){
      // a short tap that didn't drag = interact at the crosshair
      if(lookMoved<12 && performance.now()-lookStartT<300){
        raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
        if(!(hammerActive && banUnderRay())){
          const hits=raycaster.intersectObjects(interactables,false);
          if(hits.length){ const h=hits[0]; if(h.object.userData.onTap){ sfxClick(); h.object.userData.onTap(h); pulse(h.object,0x5dd6ff); } }
        }
      }
      lookTouchId=null;
    }
  }
  e.preventDefault();
}
if(isTouch){
  renderer.domElement.addEventListener('touchstart', onTouchStart, {passive:false});
  renderer.domElement.addEventListener('touchmove', onTouchMove, {passive:false});
  renderer.domElement.addEventListener('touchend', onTouchEnd, {passive:false});
  renderer.domElement.addEventListener('touchcancel', onTouchEnd, {passive:false});
}

// ==================================================================
// LOOP
// ==================================================================
// COLLISION — stop the player walking through machines, crates, posts
const colliders=[];
function buildColliders(){
  [[0,-9,1.7],[4.5,-8,1.9],[-4.5,-8,1.6],[7,-3,1.6],[-7,-1,1.3],[0,2.7,1.0]].forEach(o=>colliders.push({x:o[0],z:o[1],r:o[2]}));
  for(let i=0;i<8;i++){ const a=i/8*Math.PI*2,R=10.6; colliders.push({x:Math.cos(a)*R,z:Math.sin(a)*R,r:0.4}); }
  upgradeDefs.forEach(d=>{ const p=nodePos(d); colliders.push({x:p.x,z:p.z,r:0.95}); };
}
buildColliders();
function resolveCollisions(){
  const pr=0.3; let px=rig.position.x, pz=rig.position.z;
  for(const o of colliders){ let dx=px-o.x, dz=pz-o.z, d=Math.hypot(dx,dz); const min=o.r+pr;
    if(d<min){ if(d<1e-4){ dx=1; dz=0; d=1; } px=o.x+dx/d*min; pz=o.z+dz/d*min; } }
  rig.position.x=px; rig.position.z=pz;
}

let autoAccum=0;
const clock=new THREE.Clock();
function animate(){
  const dt=Math.min(0.05,clock.getDelta());
  locomotion(dt); desktopControls(dt); resolveCollisions(); updateHover(); stepWheel(dt); mpUpdate(dt); stepEvents(dt);
  // passive income
  if(S.autoLv>0 || (S.interestLv||0)>0){ autoAccum+=dt; if(autoAccum>=1){ const g=Math.floor(autoAccum);
      let gain=S.autoLv*g*Math.max(1,Math.floor(payMul()));
      const intLv=(S.interestLv||0)+(S.vaultLv||0)*1.5;
      if(intLv>0) gain += Math.floor(S.tokens*0.002*intLv)*g; // interest (vault boosts rate)
      if(gain>0) addTokens(gain); autoAccum-=g; save(); } }
  // pulses
  for(let i=pulses.length-1;i>=0;i--){ const p=pulses[i]; p.t+=dt*3; const s=1+Math.sin(Math.min(Math.PI,p.t*Math.PI))*0.06; p.mesh.scale.setScalar(s); if(p.t>=1){ p.mesh.scale.setScalar(1); pulses.splice(i,1);} }
  // hover scale on upgrade blocks
  upBlocks.forEach(b=>{ const target = (b===lastHover)?1.06:1; b.scale.x += (target-b.scale.x)*0.2; b.scale.y += (target-b.scale.y)*0.2; });
  renderer.render(scene,camera);
}
renderer.setAnimationLoop(animate);
initUsername();

addEventListener('resize', ()=>{ camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); });

// ---------- Enter button ----------
const overlay=document.getElementById('overlay');
const enterBtn=document.getElementById('enterBtn');
// hidden real VR button
const vrBtn=VRButton.createButton(renderer); vrBtn.style.display='none'; document.body.appendChild(vrBtn);
const crosshairEl=document.getElementById('crosshair');
const domMute=document.getElementById('domMute');
domMute.addEventListener('click', ()=>{ audio(); toggleMute(); });
// admin panel wiring
document.getElementById('ahFree').addEventListener('click', (e)=>{ freeBuy=!freeBuy; e.target.classList.toggle('on',freeBuy); e.target.textContent=freeBuy?'🆓 Free Mode: ON':'🆓 Free Mode'; log(freeBuy?'🆓 Everything is FREE':'Free mode off'); refreshUpgrades(); });
document.getElementById('ahHammer').addEventListener('click', ()=>{ hammerActive=!hammerActive; updateHammerBtn(); log(hammerActive?'🔨 Ban hammer ON — tap a player to ban':'Ban hammer off'); });
document.querySelectorAll('#adminPanel [data-give]').forEach(b=>b.addEventListener('click', ()=>{ addTokens(+b.dataset.give); flashScreen('#ffd34d'); sfxCoin(); save(); refreshUpgrades(); }));
document.querySelectorAll('#adminPanel [data-ev]').forEach(b=>b.addEventListener('click', ()=>{ publishAdmin({cmd:'event', name:b.dataset.ev, seconds:30}); log('✨ Triggered '+b.dataset.ev+' for everyone'); }));
renderer.xr.addEventListener('sessionstart', ()=>{ crosshairEl.style.display='none'; statsPanel.visible=true; muteBtn.visible=true; domMute.style.display='none'; });
renderer.xr.addEventListener('sessionend', ()=>{ crosshairEl.style.display='block'; statsPanel.visible=false; muteBtn.visible=false; });
// username field
const nameInput=document.getElementById('nameInput');
nameInput.value=S.username||'';
enterBtn.addEventListener('click', ()=>{
  const nm=(nameInput.value||'').trim().slice(0,16); if(nm){ S.username=nm; save(); }
  overlay.style.display='none';
  crosshairEl.style.display='block';
  domMute.style.display='block';
  if(adminMode){ document.getElementById('adminPanel').style.display='block'; updateHammerBtn(); }
  notifyPresence();
  if(navigator.xr){ navigator.xr.isSessionSupported('immersive-vr').then(ok=>{ if(ok) vrBtn.click(); else log('No VR — desktop mode. Click to look/interact, WASD to move.'); }); }
  else log('Desktop mode. Click to look/interact, WASD to move.');
});
// reset progress
document.getElementById('resetBtn').addEventListener('click', ()=>{
  if(confirm('Reset all progress? Tokens and upgrades will be wiped (your username is kept).')){
    const name=S.username; localStorage.removeItem('tokenCasino');
    Object.assign(S,{tokens:100,luckLv:1,payLv:1,autoLv:0,slotLuckLv:1,plinkoLv:1,critLv:0,
      wheelLv:0,diceLv:0,scratchLv:0,megaCritLv:0,fortuneLv:0,interestLv:0,
      overLv:0,cloverLv:0,vaultLv:0,cosmicLv:0,omniLv:0,eternityLv:0,infinityLv:0,apotheosisLv:0,
      topWins:[],username:name});
    save(); location.reload();
  }
});
// Multiplayer buttons
const roomInput=document.getElementById('roomInput');
document.getElementById('hostBtn').addEventListener('click', ()=>{
  const code=(roomInput.value||'').trim().toLowerCase().replace(/[^a-z0-9-]/g,'') || Math.random().toString(36).slice(2,7);
  roomInput.value=code; hostRoom(code);
});
document.getElementById('joinBtn').addEventListener('click', ()=>{
  const code=(roomInput.value||'').trim().toLowerCase().replace(/[^a-z0-9-]/g,'');
  if(!code){ setMpStatus('enter a code first'); return; } joinRoom(code);
});

// register service worker so the game is installable as a PWA / packageable as an APK
if('serviceWorker' in navigator){ navigator.serviceWorker.register('sw.js').catch(()=>{}); }

log('Welcome! Earn tokens, buy upgrades, gamble it all.');
refreshUpgrades();
// if previously banned, block entry (admin can /unban, then reload)
if(isBanned()){ showBlock('⛔ BANNED', 'You are banned from the casino. An admin can lift this.', true); }
