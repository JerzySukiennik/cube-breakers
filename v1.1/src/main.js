// Cube Breakers: bootstrap, fixed-step simulation loop, rendering, shop interaction, saving, menu and settings.

import * as THREE from 'three';
import RAPIER from 'rapier';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BALL_TYPES, BALL_CAP, SIM_HZ, PHYS_HZ, GRAVITY } from './config.js';
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
import { Progress, PACKS, UPGRADES } from './progress.js';
import { Drops } from './drops.js';
import { Pavilion } from './pavilion.js';
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
const ONLINE_KEY = 'cb.online.v1';
const NO_KEYS = new Set();
const DEMO = new URLSearchParams(location.search).has('demo');
const UP = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));
const fmt = (n) => Math.round(n).toLocaleString('en-US');

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
  const blockMat = createBlockMaterial();
  const cube = new Cube();
  const cubeView = new CubeView(cube, blockMat, scene);
  const chunks = new Chunks(physics, RAPIER, scene, blockMat);
  const drops = new Drops(scene, blockMat);
  const balls = new Balls(scene);
  const player = new Player(physics, RAPIER, camera);
  const fx = new FX(scene);
  const dome = new Dome(scene);
  const hud = new HUD();
  const launcher = new Launcher(env);
  const aim = new Aim(scene);
  const pavilion = new Pavilion(scene, physics, RAPIER);
  const input = new Input(canvas);
  const game = new Game({ physics, R: RAPIER, cube, cubeView, chunks, balls, player, fx, audio, dome, hud, progress, drops, pavilion });
  game.onLevel = (lvl) => hud.setLevel(lvl, shapeFor(lvl).name);
  const avatars = new Avatars(scene);
  const profile = {
    nick: (store.get('nick', '') || '').slice(0, 16) || 'Player' + Math.floor(100 + Math.random() * 900),
    color: Math.min(PLAYER_COLORS.length - 1, store.get('color', Math.floor(Math.random() * PLAYER_COLORS.length))),
  };
  store.set('nick', profile.nick);
  store.set('color', profile.color);
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
    if (progress.ammo[0] > 0) return 0;
    let best = -1;
    progress.ammo.forEach((a, i) => { if (a > 0 && (best < 0 || a > progress.ammo[best])) best = i; });
    return best;
  };
  game.onEmpty = (t) => {
    const f = fallbackType();
    if (f >= 0 && f !== t) { select(f, true); hud.toast(`Out of ${BALL_TYPES[t].name}s`); }
    else hud.toast('Out of balls! Free AeroBalls at the Ball Shop', BALL_TYPES[0].color);
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
  };
  progress.onChange(applyProgress);
  applyProgress();
  player.fuel = player.maxFuel;
  player.onDoubleJump = () => {
    audio.play('djump');
    fx.dustPuff(player.feet, 3, 0.4, '#ffffff', 1.1);
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
      if (net) localStorage.setItem(ONLINE_KEY, JSON.stringify({ epoch: net.epoch, drops: drops.serialize() }));
      else localStorage.setItem(WORLD_KEY, JSON.stringify(game.serialize()));
    } catch { }
  };
  addEventListener('pagehide', saveAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveAll(); });

  let playing = false;
  let started = false;
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
      hud.showBanner('<b>BREAK THE CUBE!</b><span>Loot drops into your backpack. Recycle it at the Ball Shop behind you.</span>', 5);
    }
    if (locked) { started = true; menuUI.setPaused(true); }
    if (!locked) { saveAll(); menuUI.show('play'); }
    menu.classList.toggle('hidden', locked);
    hudEl.classList.toggle('dim', !locked);
    hudEl.classList.toggle('hidden', !started);
  };
  $('btn-clear').addEventListener('click', () => { audio.play('click'); balls.clear(game.owner); });
  if (new URLSearchParams(location.search).has('debug')) {
    $('debug-row').classList.remove('hidden');
    $('dbg-gems').addEventListener('click', () => progress.earn(5000));
    $('dbg-ammo').addEventListener('click', () => { progress.ammo = progress.ammo.map((a) => a + 50); progress.changed(); });
    $('dbg-level').addEventListener('click', () => game.startLevel(game.level + 1, game.seed + 1, true));
    $('dbg-world').addEventListener('click', () => { if (net) net.resetWorld(); });
    $('dbg-reset').addEventListener('click', () => {
      try { localStorage.removeItem(WORLD_KEY); localStorage.removeItem('cb.progress.v2'); } catch { }
      removeEventListener('pagehide', saveAll);
      location.reload();
    });
  }

  await audioLoad;
  stageP = 1; showLoad();

  let physAcc = 0, simAcc = 0, simTime = 0, fireCd = 0, saveT = 5, syncT = 0, menuT = 0, orbit = 0.6;
  const tabData = () => {
    const online = [{ nick: profile.nick, color: PLAYER_COLORS[profile.color], dmg: game.dealt, me: true }];
    if (net) for (const p of net.livePlayers()) online.push({ nick: p.v.n || 'Player', color: PLAYER_COLORS[p.v.c % PLAYER_COLORS.length], dmg: p.v.d || 0 });
    online.sort((a, b) => b.dmg - a.dmg);
    const records = net ? net.records.map((r) => ({ n: r.n, b: r.b, me: r.uid === net.uid })) : [];
    return { title: `Level ${game.level} · ${shapeFor(game.level).name} · ${game.remaining.toLocaleString('en-US')} blocks to go`, online, records, offline: !net };
  };
  let hover = null;
  const right = new THREE.Vector3();
  const fw = new THREE.Vector3();
  const chest = new THREE.Vector3();

  const describe = (it) => {
    if (!it) return null;
    if (it.kind === 'pack') {
      const pk = PACKS[it.idx];
      const t = BALL_TYPES[pk.type];
      return { title: `${t.name} Pack`, price: pk.price, poor: progress.gems < pk.price, desc: `${t.desc} Contains ${pk.count}.`, note: `You have ${progress.ammo[pk.type]}.`, action: 'Get' };
    }
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
      return { title: 'Free AeroBalls', desc: 'Tops your AeroBalls up to 20. Come back whenever you run dry.', note: full ? `You have ${progress.ammo[0]}, that's plenty.` : `You have ${progress.ammo[0]}.`, action: 'Take' };
    }
    if (it.kind === 'bin') {
      const n = progress.bag.count;
      return { title: 'Recycle', price: n ? progress.recycleValue() : null, desc: n ? `Turn ${fmt(n)} ${n === 1 ? 'block' : 'blocks'} from your backpack into gems.` : 'Your backpack is empty. Break blocks and walk over what drops.', action: 'Recycle' };
    }
    return null;
  };

  const use = (it) => {
    if (!it) return;
    if (it.kind === 'pack') {
      const pk = PACKS[it.idx];
      const t = BALL_TYPES[pk.type];
      if (progress.buyPack(it.idx) === 'ok') {
        audio.play('powerup');
        hud.toast(`+${pk.count} ${t.name}s`, t.color);
        fx.sparkle(it.pos, t.color, 16, 3);
        if (progress.ammo[selected] <= 0 || selected === 0) select(pk.type, true);
      } else { audio.play('error'); hud.toast('Not enough gems'); }
    } else if (it.kind === 'upgrade') {
      const r = progress.buyUpgrade(it.id);
      if (r === 'ok') {
        audio.play('levelup');
        const u = UP[it.id];
        hud.toast(u.max > 1 ? `${u.name} level ${progress.lvl(it.id)}!` : `${u.name} unlocked!`);
        fx.sparkle(it.pos, '#ffd34a', 20, 3.5);
        if (it.id === 'jet' || it.id === 'fuel') player.fuel = player.maxFuel;
      } else {
        audio.play('error');
        hud.toast(r === 'poor' ? 'Not enough gems' : r === 'locked' ? 'Buy the Jetpack first' : 'Already maxed out');
      }
    } else if (it.kind === 'dispenser') {
      const need = 20 - progress.ammo[0];
      if (need > 0) {
        progress.addAmmo(0, need);
        audio.play('take');
        hud.toast(`+${need} AeroBalls`, BALL_TYPES[0].color);
        if (progress.ammo[selected] <= 0) select(0, true);
      } else { audio.play('error'); hud.toast('You already have plenty'); }
    } else if (it.kind === 'bin') {
      const v = progress.recycle();
      if (v > 0) {
        audio.play('cash');
        hud.toast(`+◇ ${fmt(v)}`);
        fx.sparkle(it.pos, '#9fe6ff', 30, 5);
        fx.flashGlow(it.pos, '#c9f2ff', 2);
      } else { audio.play('error'); hud.toast('Backpack is empty'); }
    }
  };

  function tick(dt) {
    const inp = input.consume();
    if (demoTick) demoTick(dt);
    fireCd -= dt;
    if (playing) {
      player.look(inp.dx, inp.dy);
      for (const code of inp.pressed) {
        if (code.startsWith('Digit')) {
          const k = parseInt(code.slice(5), 10) - 1;
          if (k >= 0 && k < BALL_TYPES.length) select(k);
        } else if (code === 'Space') player.queueJump();
        else if (code === 'KeyE') use(hover);
        else if (code === 'Mouse0') {
          if (fireCd <= 0) {
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
      if (inp.wheel) select((selected + inp.wheel + BALL_TYPES.length) % BALL_TYPES.length);
      if (input.left && fireCd <= 0) {
        if (game.shoot(selected, camera, launcher)) fireCd = progress.fireCd;
        else fireCd = 0.4;
      }
      if (progress.ammo[selected] <= 0 && !input.left) {
        const f = fallbackType();
        if (f >= 0 && f !== selected) select(f, true);
      }
    }

    physAcc += dt;
    let n = 0;
    while (physAcc >= 1 / PHYS_HZ && n < 5) {
      player.fixedUpdate(1 / PHYS_HZ, playing ? input.keys : NO_KEYS);
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

    if (started) player.applyCamera(physAcc * PHYS_HZ, dt, fx.shake);
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
    drops.update(dt, cube, chunks, chest, progress.magnet, game.owner);
    player.forward(fw);
    hover = playing ? pavilion.pick(camera.position, fw) : null;
    hud.tooltip(describe(hover));
    pavilion.update(dt, hover);

    const jet = audio.loop('jet');
    if (jet) jet.set(player.jetting ? 1 : 0);
    hud.fuel(player.fuel / player.maxFuel, player.jetEnabled && (player.jetting || player.fuel < player.maxFuel - 0.02));

    world.update(dt, simTime, player.renderFeet, camera.position);
    blockUniforms.uTime.value = simTime;
    cubeView.update(dt, simTime);
    chunks.update(dt, simTime);
    balls.render();
    dome.update(dt, camera.position, simTime);
    aim.update(dt, playing && input.right, game, camera, launcher, BALL_TYPES[selected], simTime);
    launcher.update(dt, simTime, inp.dx, inp.dy, player.speedNow, playing && input.right);
    fx.update(dt);
    hud.progress(game.remaining, cube.total);
    hud.balls(balls.countOwned(game.owner), Math.min(BALL_CAP, progress.cap));
    hud.ammo(progress.ammo);
    if (net) {
      net.update(dt, () => ({ x: player.feet.x, y: player.feet.y, z: player.feet.z, yaw: player.yaw, pitch: player.pitch, ball: selected, dmg: game.dealt, emote, emoteT }));
      avatars.update(dt, camera, net.now());
      game.remoteCaps = avatars.capsules;
      syncT -= dt;
      if (syncT <= 0) { syncT = 1; avatars.sync(net.livePlayers()); hud.online(net.livePlayers().length + 1, net.connected, false); }
    }
    hud.tab(playing && input.keys.has('Tab'), tabData());
    hud.update(dt);

    saveT -= dt;
    if (saveT <= 0) {
      saveT = 6;
      if (started) saveAll();
    }

    renderer.clear();
    renderer.render(scene, camera);
    renderer.clearDepth();
    if (started) renderer.render(launcher.scene, launcher.camera);
    const menuOpen = !menu.classList.contains('hidden');
    if (menuOpen) {
      menuUI.render(dt, true);
      menuT -= dt;
      if (menuT <= 0) {
        menuT = 0.5;
        const td = tabData();
        menuUI.world({ level: game.level, shape: shapeFor(game.level).name, remaining: game.remaining, total: cube.total, online: td.online, top: td.records, offline: !net });
        menuUI.stats({ gems: progress.gems, blocks: progress.stats.blocks, levels: progress.stats.levels });
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
  BALL_TYPES.forEach((t, k) => balls.spawn(t, warm.clone().setX(k - 4), new THREE.Vector3(0, 0, 1), 'warm', 0));
  fx.spawnDebris(warm, '#3aa9f5', 6, 2, 0.2);
  fx.spawnOrbs(warm, 1.5, 6, ['#ffd23a']);
  fx.dustPuff(warm, 2, 0.5);
  fx.sparkle(warm, '#ffffff', 4);
  fx.flashGlow(warm, '#ffcf6a', 1);
  fx.number(warm, 10, '');
  drops.spawn(warm, { value: 1, key: 'L0', r: 0.2, g: 0.5, b: 0.9, pattern: 0, kind: 1 }, 'warm');
  dome.hit(new THREE.Vector3(0, 6, -23));
  for (let i = 0; i < 3; i++) tick(1 / 60);
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
    try {
      const raw = JSON.parse(localStorage.getItem(ONLINE_KEY) || 'null');
      if (raw && raw.epoch === net.epoch && raw.drops) drops.restore(raw.drops);
    } catch { }
    net.cb = {
      damage: (i, v) => game.netDamage(i, v),
      kill: (i, u) => game.netKill(i, u),
      ice: (i, v) => game.netIce(i, v),
      chunk: (id, st) => game.netChunk(id, st),
      meta: (m) => game.netMeta(m),
      shot: (v, age) => game.remoteShot(v, age),
      players: () => {},
      records: () => {},
      status: (c) => menuUI.setStatus(c ? 'Connected to the shared world' : 'Reconnecting…', c),
    };
    net.attach();
    net.join(profile.nick, profile.color);
    menuUI.setStatus('Connected to the shared world', true);
    hud.online(1, true, false);
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
  window.__cb = { game, cube, chunks, balls, player, camera, renderer, launcher, input, audio, progress, drops, pavilion, hud, avatars, net, profile, tick, BALL_TYPES, THREE, select: (k) => select(k), saveAll };
  tick(1 / 60);
  $('loading').classList.add('hidden');
  if (DEMO) {
    started = true;
    hudEl.classList.remove('hidden');
    $('online').classList.add('hidden');
    progress.ammo = progress.ammo.map(() => 999);
    progress.gems = 1240;
    progress.changed();
    player.teleport(7, 0, 19);
    player.yaw = Math.atan2(7, 19);
    player.pitch = 0.2;
    const demoTypes = [0, 0, 1, 2, 5, 3, 0, 4, 2, 7];
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
