// Cube Breakers: bootstrap, fixed-step simulation loop, rendering, menu and settings.

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

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('cb.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('cb.' + k, JSON.stringify(v)); } catch { } },
};
const NO_KEYS = new Set();

async function boot() {
  const bar = $('load-fill');
  let audioP = 0, stageP = 0;
  const progress = () => { bar.style.transform = `scaleX(${0.15 + 0.45 * audioP + 0.4 * stageP})`; };
  const audio = new AudioBank();
  const audioLoad = audio.load((p) => { audioP = p; progress(); });
  await RAPIER.init();
  stageP = 0.4; progress();

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

  const blockMat = createBlockMaterial();
  const cube = new Cube();
  const cubeView = new CubeView(cube, blockMat, scene);
  const chunks = new Chunks(physics, RAPIER, scene, blockMat);
  const balls = new Balls(scene);
  const player = new Player(physics, RAPIER, camera);
  try { await Promise.race([document.fonts.load("italic 900 92px Nunito"), new Promise((r) => setTimeout(r, 2500))]); } catch { }
  const fx = new FX(scene);
  const dome = new Dome(scene);
  const hud = new HUD();
  const launcher = new Launcher(env);
  const aim = new Aim(scene);
  const input = new Input(canvas);
  const game = new Game({ physics, R: RAPIER, cube, cubeView, chunks, balls, player, fx, audio, dome, hud });
  game.reset(1);
  stageP = 0.8; progress();

  let selected = Math.min(BALL_TYPES.length - 1, store.get('type', 0));
  hud.select(selected, false);
  launcher.setType(BALL_TYPES[selected], false);
  const select = (k) => {
    if (k === selected) return;
    selected = k;
    hud.select(k, true);
    launcher.setType(BALL_TYPES[k], true);
    audio.play('select');
    store.set('type', k);
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
  const bindRange = (id, key) => {
    const el = $(id);
    el.value = settings[key];
    el.addEventListener('input', () => { settings[key] = parseFloat(el.value); store.set(key, settings[key]); applySettings(); });
  };
  bindRange('set-music', 'music');
  bindRange('set-sfx', 'sfx');
  bindRange('set-sens', 'sens');
  const grassEl = $('set-grass');
  grassEl.value = settings.grass;
  world.setGrass(settings.grass);
  grassEl.addEventListener('change', () => { settings.grass = grassEl.value; store.set('grass', settings.grass); world.setGrass(settings.grass); });
  const resEl = $('set-res');
  resEl.value = String(settings.res);
  resEl.addEventListener('change', () => { settings.res = parseFloat(resEl.value); store.set('res', settings.res); resize(); });
  const fpsEl = $('set-fps');
  fpsEl.checked = settings.fps;
  fpsEl.addEventListener('change', () => { settings.fps = fpsEl.checked; store.set('fps', settings.fps); applySettings(); });
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
    if (locked) { started = true; playBtn.textContent = 'Resume'; }
    menu.classList.toggle('hidden', locked);
    hudEl.classList.toggle('dim', !locked);
    hudEl.classList.toggle('hidden', !started);
  };
  $('btn-reset').addEventListener('click', () => { audio.play('click'); game.reset(game.seed + 1); });
  $('btn-clear').addEventListener('click', () => { audio.play('click'); balls.clear(game.owner); });

  await audioLoad;
  stageP = 1; progress();

  let physAcc = 0, simAcc = 0, simTime = 0, fireCd = 0;
  const right = new THREE.Vector3();

  function tick(dt) {
    const inp = input.consume();
    if (playing) {
      player.look(inp.dx, inp.dy);
      for (const code of inp.pressed) {
        if (code.startsWith('Digit')) {
          const k = parseInt(code.slice(5), 10) - 1;
          if (k >= 0 && k < BALL_TYPES.length) select(k);
        } else if (code === 'Space') player.queueJump();
        else if (code === 'Mouse0') { game.shoot(selected, camera, launcher); fireCd = 0.18; }
      }
      if (inp.wheel) select((selected + inp.wheel + BALL_TYPES.length) % BALL_TYPES.length);
      if (input.left) {
        fireCd -= dt;
        if (fireCd <= 0) { game.shoot(selected, camera, launcher); fireCd = 0.18; }
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

    player.applyCamera(physAcc * PHYS_HZ, dt, fx.shake);
    camera.updateMatrixWorld();
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    audio.setListener(camera.position, right);

    world.update(dt, simTime, player.renderFeet, camera.position);
    blockUniforms.uTime.value = simTime;
    cubeView.update(dt, simTime);
    chunks.update(dt, simTime);
    balls.render();
    dome.update(dt);
    aim.update(dt, playing && input.right, game, camera, launcher, BALL_TYPES[selected], simTime);
    launcher.update(dt, simTime, inp.dx, inp.dy, player.speedNow, playing && input.right);
    fx.update(dt);
    hud.progress(game.remaining, cube.total);
    hud.balls(balls.countOwned(game.owner), BALL_CAP);
    hud.update(dt);

    renderer.clear();
    renderer.render(scene, camera);
    renderer.clearDepth();
    renderer.render(launcher.scene, launcher.camera);
  }

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    tick(dt);
  }

  try { renderer.compile(scene, camera); renderer.compile(launcher.scene, launcher.camera); } catch { }
  const warm = new THREE.Vector3(0, 6, 13);
  BALL_TYPES.forEach((t, k) => balls.spawn(t, warm.clone().setX(k - 4), new THREE.Vector3(0, 0, 1), 'warm', 0));
  fx.spawnDebris(warm, '#3aa9f5', 6, 2, 0.2);
  fx.spawnOrbs(warm, 1.5, 6, ['#ffd23a']);
  fx.dustPuff(warm, 2, 0.5);
  fx.sparkle(warm, '#ffffff', 4);
  fx.flashGlow(warm, '#ffcf6a', 1);
  fx.number(warm, 10, '');
  dome.hit(new THREE.Vector3(0, 6, -23));
  for (let i = 0; i < 3; i++) tick(1 / 60);
  balls.clear();
  balls.flushPending();
  fx.clear();
  game.reset(1);
  window.__cb = { game, cube, chunks, balls, player, camera, renderer, launcher, input, audio, tick, BALL_TYPES, THREE, select: (k) => select(k) };
  tick(1 / 60);
  $('loading').classList.add('hidden');
  menu.classList.remove('hidden');
  requestAnimationFrame(frame);
}

boot().catch((e) => {
  console.error(e);
  const t = $('load-text');
  if (t) t.textContent = 'Could not start: ' + (e && e.message ? e.message : e);
});
