// Cube Breakers: bootstrap, fixed-step simulation loop, rendering, interactions (tablet, Plinko, drill, Auto-Shooters, powerups), saving, menu and settings.

import * as THREE from 'three';
import RAPIER from 'rapier';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BALL_TYPES, BALL_KEYS, BALL_CAP, SIM_HZ, PHYS_HZ, GRAVITY, POWERUPS, TURRET, DRILL, VEND_PRICE, HALF } from './config.js';
import { World } from './world.js';
import { Cube, CubeView } from './cube.js';
import { Chunks } from './chunks.js';
import { createBlockMaterial, blockUniforms } from './blockMaterial.js';
import { Balls } from './balls.js';
import { Player } from './player.js';
import { Launcher } from './launcher.js';
import { FX } from './fx.js';
import { Dome } from './dome.js';
import { AudioBank } from './audio.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { Aim } from './aim.js';
import { Game } from './game.js';
import { Progress, UPGRADES, itemName } from './progress.js';
import { Drops } from './drops.js';
import { Pavilion } from './pavilion.js';
import { Machine } from './machine.js';
import { Vending } from './vending.js';
import { Drill } from './drill.js';
import { Turrets } from './turrets.js';
import { shapeFor } from './shapes.js';
import { Net } from './net.js';
import { Avatars, PLAYER_COLORS, EMOTES } from './avatars.js';
import { Menu } from './menu.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('cb.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('cb.' + k, JSON.stringify(v)); } catch { } },
};
const WORLD_KEY = 'cb.world.v2';
const NO_KEYS = new Set();
const DEMO = new URLSearchParams(location.search).has('demo');
const UP = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));
const PWI = Object.fromEntries(POWERUPS.map((p) => [p.id, p]));
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const VIG = { goldrush: '#ffc531', freeze: '#9fe6ff', toxicrain: '#43ff7a', meteor: '#ff9a1f', infinite: '#2f9bff', triple: '#b08cff', magnet: '#ff6fcf' };

async function boot() {
  const bar = $('load-fill');
  let audioP = 0, stageP = 0;
  const showLoad = () => { bar.style.transform = `scaleX(${0.15 + 0.45 * audioP + 0.4 * stageP})`; };
  const audio = new AudioBank();
  const audioLoad = audio.load((p) => { audioP = p; showLoad(); });
  await RAPIER.init();
  stageP = 0.3; showLoad();

  const canvas = $('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.autoClear = false;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(74, 1, 0.05, 2800);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.6;

  const world = new World(scene);
  const physics = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  physics.timestep = 1 / PHYS_HZ;
  physics.createCollider(RAPIER.ColliderDesc.cuboid(400, 1, 400).setTranslation(0, -1, 0).setFriction(0.9));

  try { await Promise.race([Promise.all([document.fonts.load('italic 900 92px Nunito'), document.fonts.load('900 40px Nunito'), document.fonts.load('800 30px Nunito')]), new Promise((r) => setTimeout(r, 2500))]); } catch { }

  const progress = new Progress();
  const blockMat = createBlockMaterial(true);
  const cube = new Cube();
  const cubeView = new CubeView(cube, blockMat, scene);
  const chunks = new Chunks(physics, RAPIER, scene, blockMat);
  const drops = new Drops(scene, createBlockMaterial(false));
  const balls = new Balls(scene);
  const player = new Player(physics, RAPIER, camera);
  const fx = new FX(scene);
  const dome = new Dome(scene);
  const hud = new HUD();
  const launcher = new Launcher(env);
  const aim = new Aim(scene);
  const pavilion = new Pavilion(scene, physics, RAPIER);
  const machine = new Machine(scene, physics, RAPIER);
  const vending = new Vending(scene, physics, RAPIER);
  const drill = new Drill(scene, physics, RAPIER);
  const turrets = new Turrets(scene);
  const input = new Input(canvas);
  const game = new Game({ physics, R: RAPIER, cube, cubeView, chunks, balls, player, fx, audio, dome, hud, progress, drops, pavilion });
  game.setObstacles([...pavilion.boxes, ...machine.boxes, ...vending.boxes]);
  game.onLevel = (lvl) => hud.setLevel(lvl, shapeFor(lvl).name);
  game.onCombo = (n) => hud.combo(n);
  machine.audio = audio;
  vending.audio = audio;
  vending.fx = fx;
  turrets.audio = audio;
  turrets.fx = fx;
  const avatars = new Avatars(scene);
  const profile = {
    nick: (store.get('nick', '') || '').slice(0, 16) || 'Player' + Math.floor(100 + Math.random() * 900),
    color: Math.min(PLAYER_COLORS.length - 1, store.get('color', Math.floor(Math.random() * PLAYER_COLORS.length))),
  };
  store.set('nick', profile.nick);
  store.set('color', profile.color);
  progress.nick = profile.nick;
  const nickEl = $('nick');
  nickEl.value = profile.nick;
  const colorsEl = $('colors');
  PLAYER_COLORS.forEach((c, i) => {
    const b = document.createElement('button');
    b.style.background = c;
    b.title = 'Colour ' + (i + 1);
    b.addEventListener('click', () => { profile.color = i; store.set('color', i); paintColors(); if (menuUI) menuUI.setColor(i); audio.play('click'); if (net) net.setProfile(profile.nick, profile.color); });
    colorsEl.appendChild(b);
  });
  const paintColors = () => [...colorsEl.children].forEach((b, i) => b.classList.toggle('sel', i === profile.color));
  paintColors();
  nickEl.addEventListener('input', () => {
    const v = nickEl.value.replace(/[^\p{L}\p{N} _.-]/gu, '').slice(0, 16);
    if (v !== nickEl.value) nickEl.value = v;
    profile.nick = v.trim() || 'Player';
    progress.nick = profile.nick;
    store.set('nick', profile.nick);
    if (net) net.setProfile(profile.nick, profile.color);
  });
  nickEl.addEventListener('keydown', (e) => e.stopPropagation());
  let net = null;
  let menuUI = null;
  let demoTick = null;
  let emote = -1, emoteT = 0;
  stageP = 0.7; showLoad();

  let selected = Math.min(BALL_TYPES.length - 1, store.get('type', 0));
  let pwSel = store.get('pw', null);
  hud.select(selected, false);
  launcher.setType(BALL_TYPES[selected], false);
  const select = (k, quiet) => {
    if (k === selected) return;
    selected = k;
    hud.select(k, !quiet);
    launcher.setType(BALL_TYPES[k], true);
    if (!quiet) audio.play('select');
    store.set('type', k);
  };
  const fallbackType = () => {
    const am = progress.ammo;
    if (am[0] > 0) return 0;
    let best = -1;
    am.forEach((a, i) => { if (a > 0 && (best < 0 || a > am[best])) best = i; });
    return best;
  };
  game.onEmpty = (t) => {
    const f = fallbackType();
    if (f >= 0 && f !== t) { select(f, true); hud.toast(`Out of ${BALL_TYPES[t].name}s`); }
    else hud.toast('Out of balls! Free AeroBalls at the pavilion', BALL_TYPES[0].color);
  };

  const myUid = () => (net ? net.uid : 'me');
  const fxSeen = new Map();
  const evSeen = new Set();
  let fxPrimed = false;
  const announce = (p, by) => {
    hud.showBanner(`<b>${p.name.toUpperCase()}!</b><span>${by ? `${by} fired it · ` : ''}${p.desc}</span>`, 3.2);
    audio.play('pw', { vol: 1 });
    audio.play('levelup', { vol: 0.5, rate: 1.3 });
    fx.addShake(0.2);
  };
  const watchPowers = () => {
    const now = progress.now();
    const f = progress.fx;
    for (const p of POWERUPS) {
      const v = f[p.id];
      const u = v ? v.u : 0;
      const prev = fxSeen.get(p.id) || 0;
      if (fxPrimed && u > prev + 500 && u > now) announce(p, v.by !== profile.nick ? v.by : '');
      fxSeen.set(p.id, u);
    }
    const evs = [];
    for (const [key, v] of Object.entries(progress.ev)) {
      if (!v) continue;
      evs.push({ key, ...v });
      if (!evSeen.has(key)) {
        evSeen.add(key);
        const p = PWI[v.k];
        if (fxPrimed && p && now - v.s < 6000) announce(p, v.u !== myUid() ? v.by : '');
      }
    }
    fxPrimed = true;
    const pw = {};
    for (const p of POWERUPS) if (!p.aim && !p.sky && f[p.id]) pw[p.id] = f[p.id].u;
    game.powers = pw;
    game.setEvents(evs, myUid());
  };

  const applyProgress = () => {
    player.runMul = progress.runMul;
    player.maxJumps = progress.jumps;
    player.jetEnabled = progress.jet;
    player.maxFuel = progress.fuel;
    if (player.fuel > player.maxFuel) player.fuel = player.maxFuel;
    pavilion.refresh(progress);
    hud.ammo(progress.ammo);
    hud.wallet(progress.gems);
    hud.bag(progress.bag, progress.recycleValue());
    machine.setGems(progress.gems);
    machine.sync(progress.tray, progress.now(), myUid());
    turrets.sync(progress.turrets);
    drill.setOwned(progress.drillOwned);
    pwSel = hud.powerups(progress.pw, pwSel);
    watchPowers();
  };
  progress.onChange(applyProgress);
  applyProgress();
  player.fuel = player.maxFuel;
  player.onDoubleJump = () => {
    audio.play('djump');
    fx.dustPuff(player.feet, 3, 0.4, '#ffffff', 1.1);
  };

  machine.onPay = async (cart) => {
    const r = await progress.order(cart);
    if (r === 'ok') {
      machine.cart.clear();
      machine.flash('ORDER PLACED!', 'Walk over the tray to grab your stuff');
      audio.play('cash');
      audio.play('win', { vol: 0.6 });
    } else {
      machine.flash('NOT ENOUGH GEMS', 'Recycle more loot at the pavilion');
      audio.play('error');
    }
  };
  machine.onGrant = (u) => {
    const it = u.kind === 'p' ? POWERUPS[u.i] : BALL_TYPES[u.i];
    hud.toast(`+${itemName(u.kind, u.i, u.n)}`, it.color);
    audio.play(u.kind === 'p' ? 'powerup' : 'pickup', { vol: 0.6, rate: 1.1 + Math.random() * 0.2 });
    fx.sparkle(player.feet.clone().setY(player.feet.y + 1), it.color, 8, 3);
    if (u.kind === 'b' && progress.ammo[selected] <= 0) select(u.i, true);
  };
  vending.onResult = async (res, pos) => {
    const ok = await progress.vendPrize(res.prize);
    if (!ok) {
      const alt = { kind: 'b', i: 2, n: Math.max(1, Math.round(res.value / BALL_TYPES[2].price)) };
      alt.label = itemName('b', alt.i, alt.n);
      await progress.vendPrize(alt);
      res.prize = alt;
    }
    const jackpot = res.value >= 2000;
    hud.bigToast(`${jackpot ? 'JACKPOT! ' : ''}${res.prize.label}`, res.prize.color || '#ffd34a');
    audio.play(jackpot ? 'jackpot' : 'win');
    if (jackpot) audio.play('levelup');
    fx.spawnOrbs(pos, 1.6, jackpot ? 40 : 16, ['#ffd34a', '#ff6fcf', '#2f9bff', '#8fe032', '#ffffff']);
    fx.sparkle(pos, '#ffd34a', jackpot ? 40 : 16, 6);
    if (jackpot) fx.shockwave(pos, 5, '#ffe27a');
  };

  const settings = {
    music: store.get('music', 0.35),
    sfx: store.get('sfx', 0.8),
    sens: store.get('sens', 1),
    grass: store.get('grass', 'medium'),
    res: store.get('res', 1.5),
    fps: store.get('fps', false),
  };
  const applySettings = () => {
    audio.setMusic(settings.music);
    audio.setSfx(settings.sfx);
    player.sens = settings.sens;
    $('fps').classList.toggle('hidden', !settings.fps);
  };
  world.setGrass(settings.grass);
  menuUI = new Menu({
    settings,
    onClick: () => audio.play('click'),
    onSetting: (key, v) => {
      settings[key] = v;
      store.set(key, v);
      if (key === 'grass') world.setGrass(v);
      if (key === 'res') resize();
      applySettings();
    },
  });
  menuUI.setColor(profile.color);
  applySettings();

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio, settings.res));
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    launcher.resize(w / h);
    fx.setScale(renderer.domElement.height / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), h, renderer.domElement.height);
  }
  addEventListener('resize', resize);
  resize();

  const saveAll = () => {
    if (DEMO) return;
    progress.save();
    try {
      if (!net) localStorage.setItem(WORLD_KEY, JSON.stringify(game.serialize()));
    } catch { }
  };
  addEventListener('pagehide', saveAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveAll(); });

  let playing = false;
  let started = false;
  let placing = false;
  const menu = $('menu');
  const hudEl = $('hud');
  const playBtn = $('play');
  playBtn.addEventListener('click', async () => {
    await audio.unlock();
    input.lock();
  });
  canvas.addEventListener('click', () => { if (started && !playing) input.lock(); });
  input.onLockChange = (locked) => {
    playing = locked;
    if (locked && !started && progress.stats.blocks === 0) {
      hud.showBanner('<b>BREAK THE CUBE!</b><span>Loot drops into your backpack. Recycle it at the pavilion behind you.</span>', 5);
    }
    if (locked) { started = true; menuUI.setPaused(true); }
    if (!locked) { saveAll(); menuUI.show('play'); placing = false; }
    menu.classList.toggle('hidden', locked);
    hudEl.classList.toggle('dim', !locked);
    hudEl.classList.toggle('hidden', !started);
  };
  $('btn-clear').addEventListener('click', () => { audio.play('click'); balls.clear(game.owner); });
  if (new URLSearchParams(location.search).has('debug')) {
    $('debug-row').classList.remove('hidden');
    $('dbg-gems').addEventListener('click', () => progress.earn(25000));
    $('dbg-ammo').addEventListener('click', () => progress.debugAmmo(50));
    $('dbg-level').addEventListener('click', () => game.startLevel(game.level + 1, game.seed + 1, true));
    $('dbg-world').addEventListener('click', () => { if (net) net.resetWorld(); });
    $('dbg-reset').addEventListener('click', () => {
      try { localStorage.removeItem(WORLD_KEY); localStorage.removeItem('cb.progress.v2'); localStorage.removeItem('cb.progress.v3'); } catch { }
      removeEventListener('pagehide', saveAll);
      location.reload();
    });
  }

  await audioLoad;
  stageP = 1; showLoad();

  let physAcc = 0, simAcc = 0, simTime = 0, fireCd = 0, saveT = 5, syncT = 0, menuT = 0, orbit = 0.6, loadT = 0;
  const tabData = () => {
    const online = [{ nick: profile.nick, color: PLAYER_COLORS[profile.color], me: true }];
    if (net) for (const p of net.livePlayers()) online.push({ nick: p.v.n || 'Player', color: PLAYER_COLORS[p.v.c % PLAYER_COLORS.length] });
    const st = progress.stats;
    return { title: `Level ${game.level} · ${shapeFor(game.level).name} · ${game.remaining.toLocaleString('en-US')} blocks to go`, online, team: { blocks: st.blocks || 0, levels: st.levels || 0, gems: st.gems || 0, wallet: progress.gems }, offline: !net };
  };

  let hover = null;
  let onTablet = false;
  const right = new THREE.Vector3();
  const fw = new THREE.Vector3();
  const chest = new THREE.Vector3();
  const tv = new THREE.Vector3();
  const place = new THREE.Vector3();
  let placeOk = false;

  const pickAny = (origin, dir, maxDist = 4.6) => {
    let best = null, bestT = Infinity;
    for (const list of [pavilion.items, vending.items, drill.items, turrets.items]) {
      for (const it of list) {
        tv.subVectors(it.pos, origin);
        const t = tv.dot(dir);
        if (t < 0 || t > maxDist) continue;
        const d2 = tv.lengthSq() - t * t;
        if (d2 > it.r * it.r) continue;
        if (t < bestT) { bestT = t; best = it; }
      }
    }
    return best;
  };

  const owns = () => (net ? 'The team has' : 'You have');
  const drillBusy = () => (drill.remoteDriver && net ? net.nickOf(drill.remoteDriver) : null);
  const describe = (it) => {
    if (!it) return null;
    if (it.kind === 'upgrade') {
      const u = UP[it.id];
      const lv = progress.lvl(u.id);
      if (progress.locked(u.id)) return { title: u.name, desc: u.desc, note: 'Buy the Jetpack first.', poor: true, action: 'Locked' };
      if (progress.maxed(u.id)) return { title: u.name, desc: u.desc, note: 'Maxed out!', action: 'Done' };
      const p = progress.price(u.id);
      return { title: u.max > 1 ? `${u.name} · Lv ${lv + 1}` : u.name, price: p, poor: progress.gems < p, desc: u.desc, note: u.max > 1 ? `Level ${lv} of ${u.max}` : '', action: u.max > 1 ? 'Upgrade' : 'Unlock' };
    }
    if (it.kind === 'dispenser') {
      const full = progress.ammo[0] >= 20;
      return { title: 'Free AeroBalls', desc: 'Tops the AeroBalls up to 20. Come back whenever you run dry.', note: full ? `${owns()} ${progress.ammo[0]}, that's plenty.` : `${owns()} ${progress.ammo[0]}.`, action: 'Take' };
    }
    if (it.kind === 'bin') {
      const n = progress.bag.count;
      return { title: 'Recycle', price: n ? progress.recycleValue() : null, desc: n ? `Turn ${fmt(n)} ${n === 1 ? 'block' : 'blocks'} from your backpack into gems${net ? ' for the whole team' : ''}.` : 'Your backpack is empty. Break blocks and walk over what drops.', action: 'Recycle' };
    }
    if (it.kind === 'turretbuy') {
      const n = Object.keys(progress.turrets).length;
      if (n >= TURRET.max) return { title: 'Auto-Shooter', desc: 'Every Auto-Shooter the team can have is already out on the meadow.', note: `${n} of ${TURRET.max} placed`, action: 'Max' };
      return { title: 'Auto-Shooter', price: TURRET.price, poor: progress.gems < TURRET.price, desc: 'Place it once anywhere on the meadow. Hold a ball and press E next to it to load 50. It aims at the best block and fires super fast until it runs dry.', note: `${n} of ${TURRET.max} placed`, action: 'Buy and place' };
    }
    if (it.kind === 'turret') {
      const t = turrets.map.get(it.id);
      if (!t) return null;
      const n = turrets.left(t, net);
      const cfg = BALL_TYPES[selected];
      const have = progress.ammo[selected];
      return { title: 'Auto-Shooter', desc: n > 0 ? `Loaded with ${fmt(n)} ${BALL_TYPES[t.type].name}${n === 1 ? '' : 's'}.` : 'Empty. Feed it any ball you hold.', note: have > 0 ? `E loads ${Math.min(TURRET.load, have)} ${cfg.name}${have === 1 ? '' : 's'} (hold E for more)` : `${owns()} no ${cfg.name}s to load.`, poor: have <= 0, action: 'Load' };
    }
    if (it.kind === 'vending') {
      if (vending.busy) return null;
      return { title: 'Plinko', price: VEND_PRICE, poor: progress.gems < VEND_PRICE, desc: 'Click once to pick the drop point, again for the power. The gold edge slots pay ◇2,000 in prizes, a lazy drop about ◇800. Prizes are random balls, powerups or upgrades.', action: 'Play' };
    }
    if (it.kind === 'drill') {
      if (!progress.drillOwned) return { title: 'The Drill', price: DRILL.price, poor: progress.gems < DRILL.price, desc: 'A hover drill for the whole team. Fly anywhere and dig tunnels straight through the shape.', note: 'One driver at a time.', action: 'Buy' };
      const busy = drillBusy();
      if (busy) return { title: 'The Drill', desc: `${busy} is driving it right now.`, action: 'Busy', poor: true };
      return { title: 'The Drill', desc: 'WASD to fly, Space up, Shift down, the mouse aims the drill. Drive into blocks to dig.', action: 'Drive' };
    }
    return null;
  };

  const enterDrill = async () => {
    if (net) {
      const ok = await net.claimDrill(drill.state());
      if (!ok) { audio.play('error'); hud.toast('Someone else is driving'); return; }
    }
    drill.driving = true;
    player.yaw = drill.yaw;
    player.pitch = 0;
    audio.play('thrust', { vol: 0.8 });
    audio.play('hatch');
    hud.toast('Drill engaged! E to get out');
  };
  const exitDrill = () => {
    if (!drill.driving) return;
    drill.driving = false;
    drill.digging = false;
    drill.target.copy(drill.pos);
    drill.targetYaw = drill.yaw;
    if (net) net.releaseDrill(drill.state());
    const p = drill.exitSpot(game);
    player.teleport(p.x, p.y, p.z);
    audio.play('hatch', { rate: 0.8 });
  };

  let busy = false;
  const use = async (it) => {
    if (!it || busy) return;
    busy = true;
    try {
      if (it.kind === 'upgrade') {
        const r = await progress.buyUpgrade(it.id);
        if (r === 'ok') {
          audio.play('levelup');
          const u = UP[it.id];
          hud.toast(u.max > 1 ? `${u.name} level ${progress.lvl(it.id)}!` : `${u.name} unlocked!`);
          fx.sparkle(it.pos, '#ffd34a', 20, 3.5);
          fx.shockwave(it.pos, 1.5, '#ffe27a');
          if (it.id === 'jet' || it.id === 'fuel') player.fuel = player.maxFuel;
        } else {
          audio.play('error');
          hud.toast(r === 'poor' ? 'Not enough gems' : r === 'locked' ? 'Buy the Jetpack first' : 'Already maxed out');
        }
      } else if (it.kind === 'dispenser') {
        const add = await progress.topUpAero(20);
        if (add > 0) {
          audio.play('take');
          hud.toast(`+${add} AeroBalls`, BALL_TYPES[0].color);
          if (progress.ammo[selected] <= 0) select(0, true);
        } else { audio.play('error'); hud.toast(net ? 'The team already has plenty' : 'You already have plenty'); }
      } else if (it.kind === 'bin') {
        const v = progress.recycle();
        if (v > 0) {
          audio.play('cash');
          hud.toast(net ? `+◇ ${fmt(v)} for the team` : `+◇ ${fmt(v)}`);
          fx.sparkle(it.pos, '#9fe6ff', 30, 5);
          fx.flashGlow(it.pos, '#c9f2ff', 2);
        } else { audio.play('error'); hud.toast('Backpack is empty'); }
      } else if (it.kind === 'turretbuy') {
        if (Object.keys(progress.turrets).length >= TURRET.max) { audio.play('error'); hud.toast('The team has every Auto-Shooter already'); }
        else if (progress.gems < TURRET.price) { audio.play('error'); hud.toast('Not enough gems'); }
        else { placing = true; audio.play('select'); hud.toast('Aim at the meadow and click to place it'); }
      } else if (it.kind === 'turret') {
        const took = await progress.loadTurret(it.id, selected, TURRET.load);
        if (took > 0) {
          audio.play('take', { rate: 1.1 });
          hud.toast(`Loaded ${took} ${BALL_TYPES[selected].name}${took === 1 ? '' : 's'}`, BALL_TYPES[selected].color);
          fx.sparkle(it.pos, BALL_TYPES[selected].color, 10, 3);
        } else { audio.play('error'); hud.toast(`No ${BALL_TYPES[selected].name}s to load`); }
      } else if (it.kind === 'vending') {
        if (vending.state !== 'idle') return;
        if (await progress.vendPay()) vending.start();
        else { audio.play('error'); hud.toast('Not enough gems'); }
      } else if (it.kind === 'drill') {
        if (!progress.drillOwned) {
          const r = await progress.buyDrill();
          if (r === 'ok') {
            audio.play('levelup');
            audio.play('cash');
            hud.bigToast('The Drill is yours!', '#ff9a1f');
            fx.spawnOrbs(drill.pos, 2, 30, ['#ff9a1f', '#ffd34a', '#ffffff']);
          } else { audio.play('error'); hud.toast('Not enough gems'); }
        } else if (drillBusy()) { audio.play('error'); hud.toast(`${drillBusy()} is driving it`); }
        else await enterDrill();
      }
    } finally { busy = false; }
  };

  const firePowerup = async () => {
    const id = pwSel;
    const p = PWI[id];
    if (!p || (progress.pw[id] || 0) < 1) { audio.play('error'); return; }
    const extra = {};
    if (p.aim) {
      player.forward(fw);
      const t = game.raycast(camera.position, fw, 220);
      tv.copy(camera.position).addScaledVector(fw, t);
      if (Math.abs(tv.x) > HALF || Math.abs(tv.z) > HALF) { audio.play('error'); hud.toast('Aim at the shape first'); return; }
      extra.x = tv.x; extra.z = tv.z;
    }
    const ok = await progress.activate(id, extra);
    if (!ok) { audio.play('error'); hud.toast('Could not fire it, try again'); }
  };

  const cyclePowerup = () => {
    const owned = POWERUPS.filter((p) => (progress.pw[p.id] || 0) > 0);
    if (owned.length < 2) return;
    const k = owned.findIndex((p) => p.id === pwSel);
    pwSel = owned[(k + 1) % owned.length].id;
    store.set('pw', pwSel);
    hud.pwKey = '';
    pwSel = hud.powerups(progress.pw, pwSel);
    audio.play('select', { rate: 1.2 });
  };

  const others = [];
  const superFn = (pos) => {
    const dm = pos.distanceToSquared(chest);
    for (const o of others) if (o.distanceToSquared(pos) < dm) return false;
    return true;
  };

  const effectList = () => {
    const out = [];
    const now = game.nowMs();
    for (const p of POWERUPS) {
      if (p.aim) continue;
      if (p.sky) {
        for (const e of game.sky.values()) {
          if (e.k !== p.id || e.e < now || e.s > now) continue;
          const left = (e.e - now) / 1000;
          out.push({ id: p.id, name: p.short, color: p.color, left, frac: left / Math.max(1, (e.e - e.s) / 1000) });
          break;
        }
      } else if (game.active(p.id)) {
        const left = game.left(p.id);
        out.push({ id: p.id, name: p.short, color: p.color, left, frac: Math.min(1, left / p.dur) });
      }
    }
    for (const o of game.orbitals) if (!o.done) out.push({ id: 'orbital', name: 'Orbital', color: PWI.orbital.color, left: Math.max(0, o.at - game.time), frac: Math.max(0, o.at - game.time) / 1.5, label: 'INCOMING' });
    return out;
  };

  function tick(dt) {
    const inp = input.consume();
    if (demoTick) demoTick(dt);
    fireCd -= dt;
    player.forward(fw);
    onTablet = playing && !drill.driving && !placing ? machine.aim(camera, fw) : false;
    $('crosshair').classList.toggle('point', onTablet && !!machine.hover);
    if (playing) {
      player.look(inp.dx, inp.dy);
      for (const code of inp.pressed) {
        const bk = BALL_KEYS.indexOf(code);
        if (bk >= 0) { if (bk < BALL_TYPES.length) select(bk); continue; }
        if (code === 'Space') { if (!drill.driving) player.queueJump(); }
        else if (code === 'KeyE') {
          if (drill.driving) exitDrill();
          else if (placing) { placing = false; hud.toast('Placement cancelled'); }
          else if (onTablet && machine.hover) machine.click();
          else { use(hover); loadT = 0.4; }
        } else if (code === 'KeyF') { if (!drill.driving) firePowerup(); }
        else if (code === 'KeyQ') cyclePowerup();
        else if (code === 'Mouse0') {
          if (drill.driving) continue;
          if (placing) {
            if (placeOk) {
              placing = false;
              progress.placeTurret(place.x, place.z).then((r) => {
                if (r === 'ok') { audio.play('levelup'); audio.play('hatch'); fx.shockwave(place.clone().setY(0.3), 3, '#9fe6ff'); fx.dustPuff(place, 4, 1, '#f4efe6', 1.6); hud.toast('Auto-Shooter placed! Hold a ball and press E next to it'); }
                else { audio.play('error'); hud.toast(r === 'max' ? 'The team has every Auto-Shooter already' : 'Not enough gems'); }
              });
            } else { audio.play('error'); hud.toast('Pick a free spot on the meadow'); }
          } else if (vending.wantsClick && player.feet.distanceTo(vending.group.position) < 12) vending.click();
          else if (onTablet) machine.click();
          else if (fireCd <= 0) {
            if (game.shoot(selected, camera, launcher)) fireCd = progress.fireCd;
            else fireCd = 0.25;
          }
        } else {
          const ei = EMOTES.findIndex((e) => e.key === code);
          if (ei >= 0) {
            emote = ei;
            emoteT = net ? net.now() : Date.now();
            hud.toast(`${EMOTES[ei].icon} ${EMOTES[ei].text}`);
            audio.play('select', { rate: 1.3 });
          }
        }
      }
      if (inp.wheel && !drill.driving) {
        const am = progress.ammo;
        let k = selected;
        for (let j = 0; j < BALL_TYPES.length; j++) {
          k = (k + Math.sign(inp.wheel) + BALL_TYPES.length) % BALL_TYPES.length;
          if (k === 0 || am[k] > 0) break;
        }
        select(k);
      }
      const busyAim = onTablet || placing || drill.driving || (vending.wantsClick && player.feet.distanceTo(vending.group.position) < 12);
      if (input.left && fireCd <= 0 && !busyAim) {
        if (game.shoot(selected, camera, launcher)) fireCd = progress.fireCd;
        else fireCd = 0.4;
      }
      if (progress.ammo[selected] <= 0 && !input.left && !game.active('infinite')) {
        const f = fallbackType();
        if (f >= 0 && f !== selected) select(f, true);
      }
      if (input.keys.has('KeyE') && hover && hover.kind === 'turret' && !drill.driving) {
        loadT -= dt;
        if (loadT <= 0) { loadT = 0.3; use(hover); }
      }
    }

    physAcc += dt;
    let n = 0;
    while (physAcc >= 1 / PHYS_HZ && n < 5) {
      if (drill.driving) {
        drill.drive(1 / PHYS_HZ, playing ? input.keys : NO_KEYS, player.yaw, player.pitch, game, progress);
        player.ride(drill.pos.x, drill.pos.y - 0.9, drill.pos.z);
      } else player.fixedUpdate(1 / PHYS_HZ, playing ? input.keys : NO_KEYS);
      physics.step();
      chunks.sync(1 / PHYS_HZ);
      physAcc -= 1 / PHYS_HZ;
      n++;
    }
    if (n === 5) physAcc = 0;

    simAcc += dt;
    n = 0;
    while (simAcc >= 1 / SIM_HZ && n < 10) {
      simTime += 1 / SIM_HZ;
      game.time = simTime;
      balls.step(1 / SIM_HZ, simTime);
      simAcc -= 1 / SIM_HZ;
      n++;
    }
    if (n === 10) simAcc = 0;
    game.update(dt);

    drill.update(dt, game, net);
    if (drill.driving) drill.cameraPose(camera, player.yaw + fx.shake.x * 0.6, player.pitch + fx.shake.y * 0.6);
    else if (started) player.applyCamera(physAcc * PHYS_HZ, dt, fx.shake, fx.recoil);
    else {
      orbit += dt * 0.06;
      const ht = cube.height || 16;
      const rad = 24 + ht * 0.55;
      const ca = Math.cos(orbit), sa = Math.sin(orbit);
      camera.position.set(sa * rad, ht * 0.5 + 3 + Math.sin(orbit * 0.7) * 1.5, ca * rad);
      const side = innerWidth > 1080 ? rad * 0.16 : 0;
      camera.lookAt(-ca * side, ht * 0.42, sa * side);
    }
    camera.updateMatrixWorld();
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    audio.setListener(camera.position, right);

    chest.copy(player.renderFeet).y += 1.0;
    others.length = 0;
    if (net) for (const p of net.livePlayers()) { const q = net.playerPos(p.uid); if (q) others.push(new THREE.Vector3(q.x, q.y, q.z)); }
    drops.update(dt, cube, chunks, chest, progress.magnet, game.owner, game.active('magnet') ? superFn : null);
    player.forward(fw);
    hover = playing && !drill.driving && !placing && !onTablet ? pickAny(camera.position, fw) : null;
    hud.tooltip(describe(hover));
    pavilion.update(dt, hover);
    machine.update(dt, player.feet, net, progress, net ? (uid) => net.playerPos(uid) : null);
    vending.update(dt, player.feet, progress);
    turrets.update(dt, game, progress, net, !net || net.isLeader);

    if (placing && playing) {
      const t = game.raycast(camera.position, fw, 32);
      place.copy(camera.position).addScaledVector(fw, t);
      const onGround = place.y < 0.15 && t < 31.5;
      place.y = 0;
      placeOk = onGround && turrets.valid(place, game);
      turrets.showPreview(onGround ? place : null, placeOk, simTime);
    } else turrets.showPreview(null);

    let prompt = '';
    if (drill.driving) prompt = `<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> fly · <kbd>Space</kbd> up · <kbd>Shift</kbd> down · <kbd>E</kbd> get out · ${Math.max(0, drill.pos.y - 0.8).toFixed(1)} m`;
    else if (placing) prompt = placeOk ? 'Click to place the Auto-Shooter · <kbd>E</kbd> cancel' : 'Aim at a free spot on the meadow · <kbd>E</kbd> cancel';
    else if (vending.wantsClick && player.feet.distanceTo(vending.group.position) < 12) prompt = vending.prompt;
    hud.prompt(playing ? prompt : '');

    const jet = audio.loop('jet');
    if (jet) jet.set(player.jetting && !drill.driving ? 1 : 0);
    const eng = audio.loop('drill');
    if (eng) eng.set(drill.driving ? (drill.digging ? 1 : 0.35 + Math.min(0.5, drill.vel.length() / 12)) : 0);
    hud.fuel(player.fuel / player.maxFuel, !drill.driving && player.jetEnabled && (player.jetting || player.fuel < player.maxFuel - 0.02));

    const fxList = effectList();
    hud.effects(fxList);
    const top = fxList.find((e) => VIG[e.id]);
    hud.vignette(top ? VIG[top.id] : null, top ? 0.55 : 0);
    blockUniforms.uGold.value += ((game.active('goldrush') ? 1 : 0) - blockUniforms.uGold.value) * Math.min(1, dt * 3);
    blockUniforms.uFreeze.value += ((game.active('freeze') ? 1 : 0) - blockUniforms.uFreeze.value) * Math.min(1, dt * 3);

    world.update(dt, simTime, player.renderFeet, camera.position);
    blockUniforms.uTime.value = simTime;
    cubeView.update(dt, simTime);
    chunks.update(dt, simTime);
    balls.render(simTime);
    dome.update(dt, camera.position, simTime);
    aim.update(dt, playing && input.right && !drill.driving && !placing, game, camera, launcher, BALL_TYPES[selected], simTime);
    launcher.update(dt, simTime, inp.dx, inp.dy, player.speedNow, playing && input.right);
    fx.update(dt, camera);
    hud.progress(game.remaining, cube.total);
    hud.balls(balls.countOwned(game.owner), Math.min(BALL_CAP, progress.cap));
    hud.ammo(progress.ammo);
    if (net) {
      net.update(dt, () => ({ x: player.feet.x, y: player.feet.y, z: player.feet.z, yaw: player.yaw, pitch: player.pitch, ball: selected, dmg: game.dealt, emote, emoteT, drive: drill.driving }));
      avatars.update(dt, camera, net.now());
      game.remoteCaps = avatars.capsules;
      syncT -= dt;
      if (syncT <= 0) { syncT = 1; avatars.sync(net.livePlayers()); hud.online(net.livePlayers().length + 1, net.connected, false); }
    }
    const tabOn = playing && input.keys.has('Tab');
    hud.tab(tabOn, tabOn ? tabData() : null);
    hud.update(dt);

    saveT -= dt;
    if (saveT <= 0) {
      saveT = 6;
      if (started) saveAll();
    }

    renderer.clear();
    renderer.render(scene, camera);
    renderer.clearDepth();
    if (started && !drill.driving) renderer.render(launcher.scene, launcher.camera);
    const menuOpen = !menu.classList.contains('hidden');
    if (menuOpen) {
      menuUI.render(dt, true);
      menuT -= dt;
      if (menuT <= 0) {
        menuT = 0.5;
        const td = tabData();
        menuUI.world({ level: game.level, shape: shapeFor(game.level).name, remaining: game.remaining, total: cube.total, online: td.online, team: td.team, offline: !net });
        menuUI.stats({ gems: progress.gems, blocks: progress.stats.blocks || 0, levels: progress.stats.levels || 0 });
      }
    }
  }

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    tick(dt);
  }

  game.startLevel(1, 1, false);
  try { renderer.compile(scene, camera); renderer.compile(launcher.scene, launcher.camera); } catch { }
  const warm = new THREE.Vector3(0, 6, 13);
  BALL_TYPES.forEach((t, k) => balls.spawn(t, warm.clone().setX(k - 6), new THREE.Vector3(0, 0, 1), 'warm', 0));
  fx.spawnDebris(warm, '#3aa9f5', 6, 2, 0.2);
  fx.spawnOrbs(warm, 1.5, 6, ['#ffd23a']);
  fx.dustPuff(warm, 2, 0.5);
  fx.sparkle(warm, '#ffffff', 4);
  fx.flashGlow(warm, '#ffcf6a', 1);
  fx.trail(warm, '#ffffff', 0.4, 0.3);
  fx.shockwave(warm, 2, '#ffffff');
  fx.beam(warm.clone().setY(30), warm, '#ffffff', 0.3, 0.3);
  const wh = fx.takeHole();
  if (wh) fx.drawHole(wh, warm, 2, 1, 0);
  fx.orbitalMark(0, 13, 1, 0);
  fx.number(warm, 10, '');
  drops.spawn(warm, { value: 1, key: 'L0', r: 0.2, g: 0.5, b: 0.9, pattern: 0, kind: 1 }, 'warm');
  dome.hit(new THREE.Vector3(0, 6, -23));
  for (let i = 0; i < 3; i++) tick(1 / 60);
  if (wh) fx.releaseHole(wh);
  balls.clear();
  balls.flushPending();
  fx.clear();
  drops.clear();
  $('load-text').textContent = 'Joining the shared world…';
  try {
    if (DEMO) throw new Error('demo mode stays offline');
    const n = new Net();
    await n.connect(9000);
    net = n;
    game.net = net;
    game.applyNetWorld();
    progress.attachTeam(net);
    drops.claim = (id) => net.claimLoot(id);
    hud.teamMode(true);
    try {
      if (!DEMO && !localStorage.getItem('cb.teamMigrated')) {
        const L = progress.local;
        const extra = L.ammo.map((a, i) => (i === 0 ? Math.max(0, a - 20) : a));
        const hasUp = Object.values(L.up).some((v) => v > 0);
        if (L.gems > 0 || hasUp || extra.some((a) => a > 0) || L.stats.blocks > 0) {
          net.teamTx((t) => {
            t.gems += L.gems;
            for (const [id, v] of Object.entries(L.up)) t.up[id] = Math.max(t.up[id] || 0, v);
            extra.forEach((a, i) => { if (a > 0) t.ammo[i] = (t.ammo[i] || 0) + a; });
            t.stats.blocks += L.stats.blocks || 0;
            t.lastWhat = 'added their solo stash to the pool';
            return t;
          }).then((ok) => {
            if (!ok) return;
            localStorage.setItem('cb.teamMigrated', '1');
            hud.toast('Your solo stash joined the team pool');
          });
        } else localStorage.setItem('cb.teamMigrated', '1');
      }
    } catch { }
    net.cb = {
      damage: (i, v) => game.netDamage(i, v),
      ice: (i, v) => game.netIce(i, v),
      chunk: (id, st) => game.netChunk(id, st),
      meta: (m) => game.netMeta(m),
      shot: (v, age) => game.remoteShot(v, age),
      loot: (id, u) => game.netLoot(id, u),
      team: (t, prev) => {
        applyProgress();
        const l = t.last;
        if (l && l.what && l.u !== net.uid && (!prev.last || prev.last.t !== l.t) && !l.what.startsWith('activated')) {
          hud.toast(`${l.by} ${l.what}`);
          audio.play('powerup', { vol: 0.5 });
        }
      },
      drill: (v) => {
        const live = v && v.d && v.d !== net.uid && net.now() - (v.t || 0) < 8000;
        drill.remoteDriver = live ? v.d : null;
        if (!drill.driving) drill.netState(v);
        else if (v && v.d && v.d !== net.uid) { drill.driving = false; const p = drill.exitSpot(game); player.teleport(p.x, p.y, p.z); hud.toast('Lost the Drill connection'); }
      },
      players: () => {},
      status: (c) => menuUI.setStatus(c ? 'Connected to the shared world' : 'Reconnecting…', c),
    };
    net.attach();
    net.join(profile.nick, profile.color);
    menuUI.setStatus('Connected to the shared world', true);
    hud.online(1, true, false);
    applyProgress();
  } catch (e) {
    console.warn('offline mode', e);
    net = null;
    menuUI.setStatus('Offline: playing solo with a local save', false);
    hud.online(0, false, true);
    let restored = false;
    try {
      const raw = DEMO ? null : localStorage.getItem(WORLD_KEY);
      if (raw) restored = game.restore(JSON.parse(raw));
    } catch { }
    if (!restored) game.startLevel(1, 1, false);
  }
  window.__cb = { game, cube, chunks, balls, player, camera, renderer, launcher, input, audio, progress, drops, pavilion, machine, vending, drill, turrets, hud, avatars, net, profile, tick, BALL_TYPES, THREE, fx, select: (k) => select(k), saveAll, use, firePowerup, setPlacing: (v) => { placing = v; }, enterDrill, exitDrill };
  tick(1 / 60);
  $('loading').classList.add('hidden');
  if (DEMO) {
    started = true;
    hudEl.classList.remove('hidden');
    $('online').classList.add('hidden');
    progress.local.ammo = progress.local.ammo.map(() => 999);
    progress.local.gems = 1240;
    progress.changed();
    player.teleport(7, 0, 19);
    player.yaw = Math.atan2(7, 19);
    player.pitch = 0.2;
    const demoTypes = [0, 0, 1, 2, 5, 3, 0, 8, 4, 2, 7, 11, 10, 0, 12];
    let demoT = 0.3, demoK = 0;
    const start = new THREE.Vector3(), off = new THREE.Vector3(), tgt = new THREE.Vector3();
    demoTick = (dt) => {
      demoT -= dt;
      if (demoT > 0) return;
      demoT = 0.11;
      const k = demoTypes[demoK++ % demoTypes.length];
      if (Math.random() < 0.6) tgt.set((Math.random() - 0.5) * 13, 1 + Math.random() * 13, 8);
      else tgt.set(8, 1 + Math.random() * 13, (Math.random() - 0.5) * 13);
      start.copy(camera.position).add(off.set(0.3, -0.3, -0.6).applyQuaternion(camera.quaternion));
      const b = balls.spawn(BALL_TYPES[k], start, tgt.sub(start).normalize(), game.owner, game.time, { dmg: 1, speed: 1 });
      b.demo = true;
      game.enforceCap(game.owner);
      launcher.fire();
    };
  } else menu.classList.remove('hidden');
  requestAnimationFrame(frame);
}

boot().catch((e) => {
  console.error(e);
  const t = $('load-text');
  if (t) t.textContent = 'Could not start: ' + (e && e.message ? e.message : e);
});
