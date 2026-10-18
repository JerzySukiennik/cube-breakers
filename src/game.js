// Cube Breakers: game rules (damage, destruction, explosions, detachment, shooting, special balls, poison, black holes, powerups, sky events).

import * as THREE from 'three';
import { N, HALF, SIZE, KIND, LAYERS, BALL_TYPES, MINI, SPARK, ACID, METEOR, TNT_BLAST, BALL_CAP, DOME_R, PATTERN } from './config.js';
import { shapeFor, levelValueMul } from './shapes.js';
import { cellOf } from './chunks.js';
import { hash2, mulberry32 } from './rng.js';

const SPAWN = [0, 0, 30];
const NN = N * N;

function toB64(buf) {
  const u = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromB64(str) {
  const s = atob(str);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u.buffer;
}

const tv = new THREE.Vector3();
const tw = new THREE.Vector3();
const tu = new THREE.Vector3();
const fw = new THREE.Vector3();
const mz = new THREE.Vector3();
const tc = new THREE.Color();
const BLAST = { cfg: { id: 'blast' } };
const ORB_COLORS = ['#ffd23a', '#ffb31f', '#ffe36a', '#ff9d1a', '#fff1a8'];
const GHOST_COLORS = ['#ffffff', '#dff3ff', '#bfe6ff', '#e9e1ff'];
const METEOR_COLORS = ['#ff8a1a', '#ffb347', '#ffd23a', '#ff6a1a', '#fff1a8'];
const FIREWORK = ['#2f9bff', '#8fe032', '#ffc531', '#ff6fcf', '#b08cff', '#46d7ff', '#ff9a1f'];
const TOX = { id: 'tox' };
const HOLE = { id: 'hole' };
const ORBITAL = { id: 'orbital' };
const DRILLC = { id: 'drill' };
const GOLD_RGB = [1, 0.77, 0.19];
const CAPS = { sky: 220, fx: 140, tur: 40 };

export class Game {
  constructor(o) {
    Object.assign(this, o);
    this.time = 0;
    this.explosions = [];
    this.colliders = new Array(SIZE).fill(null);
    this.balls.ctx = this;
    this.chunks.onLand = (ch, k) => this.chunkLanded(ch, k);
    this.owner = 'me';
    this.seed = 1;
    this.done = false;
    this.doneT = 0;
    this.fireworkT = 0;
    this.breakBudget = 0;
    this.groundCd = 0;
    this.level = 1;
    this.growT = 1;
    this.rumbleT = 0;
    this.obstacles = [];
    this.obstacleMinZ = Infinity;
    this.drops.onCollect = (d) => this.collect(d);
    this.pickStreak = 0;
    this.lastPick = -1;
    this.onLevel = null;
    this.onEmpty = null;
    this.onCombo = null;
    this.net = null;
    this.dealt = 0;
    this.remoteCaps = null;
    this.advanceSent = false;
    this.chunkT = 0;
    this.poison = new Map();
    this.poisonFx = 0;
    this.holes = [];
    this.powers = {};
    this.sky = new Map();
    this.orbitals = [];
    this.seenEvents = new Set();
    this.combo = { n: 0, t: -9 };
    this.milestone = 0;
    this.trailT = 0;
    this.chunks.onCreate = (ch) => {
      if (this.net && !this.net.isLeader) {
        const st = this.net.chunks.get(ch.id);
        if (st) this.chunks.applyState(ch, st);
      }
    };
  }

  setObstacles(boxes) {
    this.obstacles = boxes;
    this.obstacleMinZ = boxes.reduce((m, o) => Math.min(m, o.min.z), Infinity);
  }

  nowMs() { return this.net ? this.net.now() : Date.now(); }
  active(id) { const u = this.powers[id]; return !!u && u > this.nowMs(); }
  left(id) { return Math.max(0, ((this.powers[id] || 0) - this.nowMs()) / 1000); }
  get authority() { return !this.net || this.net.isLeader; }

  buildColliders() {
    for (let i = 0; i < SIZE; i++) {
      if (this.colliders[i]) { this.physics.removeCollider(this.colliders[i], false); this.colliders[i] = null; }
      if (this.cube.kind[i] !== KIND.EMPTY && this.cube.isExposed(i)) this.addCellCollider(i);
    }
  }

  addCellCollider(i) {
    this.cube.center(i, tw);
    this.colliders[i] = this.physics.createCollider(
      this.R.ColliderDesc.cuboid(0.5, 0.5, 0.5).setTranslation(tw.x, tw.y, tw.z).setFriction(0.8),
    );
  }

  removeCell(i) {
    if (this.colliders[i]) { this.physics.removeCollider(this.colliders[i], false); this.colliders[i] = null; }
    const b = this.cube.take(i);
    const x = i % N, z = ((i / N) | 0) % N, y = (i / NN) | 0;
    const nb = [[x + 1, y, z], [x - 1, y, z], [x, y + 1, z], [x, y - 1, z], [x, y, z + 1], [x, y, z - 1]];
    for (const [a, b2, c] of nb) {
      if (!this.cube.solidAt(a, b2, c)) continue;
      const j = this.cube.idx(a, b2, c);
      if (!this.colliders[j]) this.addCellCollider(j);
    }
    return b;
  }

  clearColliders() {
    for (let i = 0; i < SIZE; i++) {
      if (this.colliders[i]) { this.physics.removeCollider(this.colliders[i], false); this.colliders[i] = null; }
    }
  }

  startLevel(level, seed, grow) {
    this.level = level;
    this.seed = seed;
    this.balls.clear();
    this.chunks.clear();
    this.cube.generate(level, seed);
    this.explosions.length = 0;
    this.poison.clear();
    this.clearHoles();
    this.done = false;
    this.advanceSent = false;
    this.dealt = 0;
    this.milestone = 0;
    if (grow) {
      this.growT = 0;
      this.cube.locked = true;
      this.clearColliders();
      this.cubeView.setOffset(-N - 2);
    } else {
      this.growT = 1;
      this.cube.locked = false;
      this.cubeView.setOffset(0);
      this.buildColliders();
    }
    this.ensurePlayerOutside();
    if (this.onLevel) this.onLevel(level);
  }

  reset(seed) { this.startLevel(this.level, seed, false); }

  ensurePlayerOutside() {
    const p = this.player.feet;
    for (const h of [0.3, 1.0, 1.7]) {
      const x = Math.floor(p.x + HALF), y = Math.floor(p.y + h), z = Math.floor(p.z + HALF);
      if (this.cube.solidAt(x, y, z)) { this.player.teleport(SPAWN[0], SPAWN[1], SPAWN[2]); return; }
    }
  }

  serialize() {
    const c = this.cube;
    const hp = new Float32Array(SIZE);
    for (let i = 0; i < SIZE; i++) hp[i] = c.kind[i] === KIND.EMPTY ? -1 : c.hp[i];
    return {
      v: 2, level: this.level, seed: this.seed, hp: toB64(hp.buffer),
      chunks: this.chunks.list.map((ch) => ({
        o: ch.o, t: [ch.t.x, ch.t.y, ch.t.z], q: [ch.q.x, ch.q.y, ch.q.z, ch.q.w],
        b: ch.blocks.map((b) => [b.gx, b.gy, b.gz, b.kind, b.layer, Math.round(b.hp), b.maxHp, b.pattern, +b.r.toFixed(4), +b.g.toFixed(4), +b.b.toFixed(4)]),
      })),
      drops: this.drops.serialize(),
    };
  }

  restore(d) {
    if (!d || d.v !== 2) return false;
    try {
      this.level = d.level;
      this.seed = d.seed;
      this.balls.clear();
      this.chunks.clear();
      this.drops.clear();
      this.cube.generate(d.level, d.seed);
      const hp = new Float32Array(fromB64(d.hp));
      const c = this.cube;
      for (let i = 0; i < SIZE; i++) {
        if (c.kind[i] === KIND.EMPTY) continue;
        if (hp[i] < 0) { c.kind[i] = KIND.EMPTY; c.count--; } else c.hp[i] = hp[i];
      }
      c.dirty = true;
      this.growT = 1;
      c.locked = false;
      this.cubeView.setOffset(0);
      this.buildColliders();
      for (const ch of d.chunks || []) {
        const blocks = ch.b.map((a) => ({ gx: a[0], gy: a[1], gz: a[2], kind: a[3], layer: a[4], hp: a[5], maxHp: a[6], pattern: a[7], r: a[8], g: a[9], b: a[10], frozen: 0, poison: 0 }));
        if (blocks.length) this.chunks.make(blocks, ch.o, { x: ch.t[0], y: ch.t[1], z: ch.t[2] }, { x: ch.q[0], y: ch.q[1], z: ch.q[2], w: ch.q[3] }, null, null);
      }
      this.drops.restore(d.drops || []);
      this.ensurePlayerOutside();
      this.milestone = this.milestoneOf();
      if (this.onLevel) this.onLevel(this.level);
      return true;
    } catch (e) {
      console.warn('restore failed', e);
      this.startLevel(1, 1, false);
      return false;
    }
  }

  get remaining() { return this.cube.count + this.chunks.blockCount; }

  hitBlock(ball, c, dmg, time) {
    tv.set(c.px, c.py, c.pz);
    const cfg = ball.cfg;
    let d = dmg;
    let crit = false;
    if (!ball.remote && d > 0 && Math.random() < 0.08) { d *= 2; crit = true; }
    if (c.i >= 0) this.damageCell(c.i, d, tv, ball, time, false, crit);
    else this.damageChunk(c.chunk, c.block, d, tv, ball, time, false, crit);
    if (cfg.toxic) this.applyPoison(c.i >= 0 ? c.i : cellOf(c.block), cfg.toxic, ball.dmgMul, !!ball.remote, 0, ball.owner);
    const rate = cfg.mega ? 0.62 : cfg.id === 'mini' || cfg.id === 'spark' ? 1.35 : 1;
    if (crit) {
      this.audio.play('crit', { pos: tv, vol: 0.55, rate: 1.1 });
      this.fx.sparkle(tv, '#ffd34a', 6, 5);
    }
    if (cfg.freeze) {
      this.audio.play('ice', { pos: tv, rate });
      this.fx.sparkle(tv, '#d8f7ff', 3, 2.5);
    } else if (cfg.gold) {
      this.audio.play('metal', { pos: tv, rate: 1.25 });
      this.fx.sparkle(tv, '#ffd84a', 3, 3);
    } else if (cfg.toxic) {
      this.audio.play('slime', { pos: tv, rate: 0.9 + Math.random() * 0.4, vol: 0.6 });
      this.fx.sparkle(tv, '#7dff8a', 4, 2.5);
    } else {
      this.audio.play('bounce', { pos: tv, rate, vol: cfg.mega ? 1.4 : 1 });
    }
    if (cfg.pierce) this.fx.sparkle(tv, '#c9b3ff', 2, 2);
  }

  numberStyle(src, frozen, crit) {
    if (crit) return 'crit';
    if (frozen) return 'ice';
    const id = src && src.cfg ? src.cfg.id : '';
    if (id === 'tox') return 'tox';
    if (id === 'hole') return 'hole';
    if (src && src.cfg && src.cfg.gold) return 'gold';
    if (id === 'blast' || (src && src.cfg && src.cfg.boom)) return 'boom';
    return '';
  }

  isFrozen(cell, local) {
    if (this.active('freeze')) return true;
    return this.net ? this.net.frozen(cell) : local > this.time;
  }

  damageCell(i, dmg, p, src, time, quiet, crit) {
    const cube = this.cube;
    if (cube.kind[i] === KIND.EMPTY) return;
    const net = this.net;
    const frozen = this.isFrozen(i, cube.frozen[i]);
    const d = dmg * (frozen ? 2 : 1);
    if (!quiet || Math.random() < 0.04) this.fx.number(p, d, this.numberStyle(src, frozen, crit));
    this.cubeView.hit(i, quiet ? 0.25 : Math.min(1.5, 0.45 + d / 40));
    if (src && src.remote) return;
    if (src && src.cfg && src.cfg.freeze) {
      cube.frozen[i] = time + src.cfg.freeze;
      this.cubeView.freeze(i);
      if (net) net.freeze(i, src.cfg.freeze * 1000);
    }
    this.dealt += d;
    if (net) {
      net.damage(i, d, !!(src && src.cfg && src.cfg.gold));
      const tot = net.total(i);
      cube.hp[i] = Math.max(1, cube.maxHp[i] - tot);
      if (tot >= cube.maxHp[i]) net.flushT = 0;
      return;
    }
    cube.hp[i] -= d;
    if (cube.hp[i] <= 0) this.destroyCell(i, src);
  }

  destroyCell(i, src) {
    const center = this.cube.center(i, new THREE.Vector3());
    const b = this.removeCell(i);
    this.broken(b, center, src);
  }

  damageChunk(ch, b, dmg, p, src, time, quiet, crit) {
    if (!b.alive) return;
    const net = this.net;
    const cell = cellOf(b);
    const frozen = this.isFrozen(cell, b.frozen);
    const d = dmg * (frozen ? 2 : 1);
    if (!quiet || Math.random() < 0.04) this.fx.number(p, d, this.numberStyle(src, frozen, crit));
    this.chunks.hit(ch, b, quiet ? 0.25 : Math.min(1.5, 0.45 + d / 40));
    if (src && src.remote) return;
    if (src && src.cfg && src.cfg.freeze) {
      b.frozen = time + src.cfg.freeze;
      if (net) net.freeze(cell, src.cfg.freeze * 1000);
    }
    this.dealt += d;
    if (net) {
      net.damage(cell, d, !!(src && src.cfg && src.cfg.gold));
      const tot = net.total(cell);
      b.hp = Math.max(1, b.maxHp - tot);
      if (tot >= b.maxHp) net.flushT = 0;
      return;
    }
    b.hp -= d;
    if (b.hp <= 0) {
      const center = this.chunks.worldPos(ch, b, new THREE.Vector3());
      this.chunks.removeBlock(ch, b);
      this.broken(b, center, src);
    }
  }

  damageAny(cell, dmg, src, quiet) {
    if (this.cube.kind[cell] !== KIND.EMPTY) {
      this.cube.center(cell, tu);
      this.damageCell(cell, dmg, tu, src, this.time, quiet);
      return true;
    }
    const e = this.chunks.byCell.get(cell);
    if (e && e.b.alive) {
      this.chunks.worldPos(e.ch, e.b, tu);
      this.damageChunk(e.ch, e.b, dmg, tu.clone(), src, this.time, quiet);
      return true;
    }
    return false;
  }

  cellPos(cell, out) {
    if (this.cube.kind[cell] !== KIND.EMPTY) return this.cube.center(cell, out);
    const e = this.chunks.byCell.get(cell);
    if (e && e.b.alive) return this.chunks.worldPos(e.ch, e.b, out);
    return null;
  }

  broken(b, center, src) {
    tc.setRGB(b.r, b.g, b.b);
    const rich = this.breakBudget-- > 0;
    this.fx.spawnDebris(center, tc, rich ? 8 : 2, 4.8, 0.2);
    if (rich && this.breakBudget > 16) this.fx.dustPuff(center, 1, 0.5, '#ffffff', 0.9);
    if (rich) this.fx.flashGlow(center, '#ffffff', 0.9);
    this.audio.play('break', { pos: center, rate: 0.9 + Math.random() * 0.25 });
    this.audio.play('pop', { pos: center, rate: 1.1 + Math.random() * 0.4, vol: 0.5 });
    const cell = cellOf(b);
    this.poison.delete(cell);
    if (b.kind === KIND.TNT) {
      this.fx.flashGlow(center, '#ffb347', 2.5);
      const authority = !this.net || this.net.isLeader;
      this.queueExplosion(center, TNT_BLAST.radius, Math.max(TNT_BLAST.min, LAYERS[b.layer].hp * TNT_BLAST.hpMul), { cfg: BLAST.cfg, tnt: cell }, 0.14, true, !authority);
    } else if (b.kind === KIND.GOLD) {
      this.fx.sparkle(center, '#ffd84a', 26, 6);
      this.fx.flashGlow(center, '#ffe27a', 2.2);
      this.audio.play('powerup', { pos: center });
    } else if (b.kind === KIND.CRATE) {
      this.audio.play('crate', { pos: center });
      this.fx.sparkle(center, '#bfe9ff', 14, 4);
    }
    this.spawnLoot(b, center, !!(src && src.cfg && src.cfg.gold));
    if (this.net && this.net.isLeader) this.net.countBlocks(1);
    if (src && !src.remote && (src.owner === this.owner || src.mine)) this.bumpCombo();
  }

  bumpCombo() {
    const c = this.combo;
    c.n = this.time - c.t < 1.6 ? c.n + 1 : 1;
    c.t = this.time;
    if (c.n >= 3) this.audio.play('pep', { vol: 0.18 + Math.min(0.3, c.n * 0.01), rate: 0.8 + Math.min(1.2, c.n * 0.025), jitter: 0 });
    if (this.onCombo) this.onCombo(c.n);
  }

  spawnLoot(b, center, goldHit) {
    const cell = cellOf(b);
    const info = this.dropInfo(b);
    info.cell = cell;
    let n = 1;
    if (b.kind !== KIND.CRATE) {
      if (this.net ? this.net.gold.has(cell) : goldHit) n++;
      if (hash2(cell, 977) < this.progress.luck) n++;
    }
    for (let k = 0; k < n; k++) {
      const id = `${cell}_${k}`;
      if (this.net && this.net.loot.has(id)) continue;
      this.drops.spawn(center, info, this.owner, 1, this.net ? id : null, this.net ? cell * 31 + k * 7919 + this.seed : null);
    }
  }

  netDamage(i, total) {
    const c = this.cube;
    if (c.kind[i] !== KIND.EMPTY) {
      const maxHp = c.maxHp[i];
      if (total < maxHp) { c.hp[i] = maxHp - total; this.cubeView.touch(i); return; }
      this.destroyCell(i, null);
      return;
    }
    const e = this.chunks.byCell.get(i);
    if (e && e.b.alive) {
      if (total < e.b.maxHp) { e.b.hp = e.b.maxHp - total; this.chunks.hit(e.ch, e.b, 0); return; }
      const center = this.chunks.worldPos(e.ch, e.b, new THREE.Vector3());
      this.chunks.removeBlock(e.ch, e.b);
      this.broken(e.b, center, null);
    }
  }

  netLoot(id, uid) {
    if (uid === this.net.uid) return;
    this.drops.takenBy(id, this.net.playerPos(uid));
  }

  netIce(i, until) {
    const left = (until - this.net.now()) / 1000;
    if (left <= 0) return;
    if (this.cube.kind[i] !== KIND.EMPTY) {
      this.cube.frozen[i] = this.time + left;
      this.cubeView.freeze(i);
      return;
    }
    const e = this.chunks.byCell.get(i);
    if (e) { e.b.frozen = this.time + left; this.chunks.hit(e.ch, e.b, 0); }
  }

  netChunk(id, st) {
    if (this.net.isLeader) return;
    const ch = this.chunks.byId(id);
    if (ch) this.chunks.applyState(ch, st);
  }

  netMeta(m) {
    this.startLevel(m.level, m.seed, true);
  }

  applyNetWorld() {
    const net = this.net;
    const m = net.meta;
    this.level = m.level;
    this.seed = m.seed;
    this.balls.clear();
    this.chunks.clear();
    this.poison.clear();
    this.clearHoles();
    this.cube.generate(m.level, m.seed);
    const c = this.cube;
    const lootCells = [];
    for (const [i, total] of net.dmg) {
      if (c.kind[i] === KIND.EMPTY) continue;
      if (total >= c.maxHp[i]) {
        lootCells.push(i);
        c.kind[i] = KIND.EMPTY;
        c.count--;
      } else c.hp[i] = c.maxHp[i] - total;
    }
    for (const [i, until] of net.ice) {
      const left = (until - net.now()) / 1000;
      if (left > 0 && c.kind[i] !== KIND.EMPTY) c.frozen[i] = this.time + left;
    }
    c.dirty = true;
    this.growT = 1;
    c.locked = false;
    this.cubeView.setOffset(0);
    for (const comp of c.findDetached()) {
      const blocks = comp.map((i) => c.take(i));
      const ch = this.chunks.fromCube(blocks);
      const st = net.chunks.get(ch.id);
      if (st) this.chunks.applyState(ch, st);
    }
    c.structureChanged = false;
    this.buildColliders();
    this.drops.clear();
    const center = new THREE.Vector3();
    let spawned = 0;
    for (const i of lootCells) {
      if (spawned > 500) break;
      const b = { gx: i % N, gy: (i / NN) | 0, gz: ((i / N) | 0) % N, kind: c.genKind[i], layer: c.layer[i], pattern: c.pattern[i], r: c.color[i * 3], g: c.color[i * 3 + 1], b: c.color[i * 3 + 2] };
      c.center(i, center);
      this.spawnLoot(b, center, false);
      spawned++;
    }
    this.explosions.length = 0;
    this.done = false;
    this.advanceSent = false;
    this.dealt = 0;
    this.milestone = this.milestoneOf();
    this.ensurePlayerOutside();
    if (this.onLevel) this.onLevel(this.level);
  }

  dropInfo(b) {
    let value = LAYERS[b.layer].value * levelValueMul(this.level);
    let key = 'L' + b.layer;
    if (b.kind === KIND.TNT) { value *= 2; key = 'tnt'; }
    else if (b.kind === KIND.GOLD) { value = Math.max(20, value * 10); key = 'gold'; }
    else if (b.kind === KIND.CRATE) { value = 0; key = 'crate'; }
    const info = { value: b.kind === KIND.CRATE ? 0 : Math.max(1, Math.round(value)), key, r: b.r, g: b.g, b: b.b, pattern: b.pattern, kind: b.kind };
    if (b.kind !== KIND.CRATE && this.active('goldrush')) {
      info.value = Math.max(5, Math.round(value * 5));
      info.key = 'rush';
      info.r = GOLD_RGB[0]; info.g = GOLD_RGB[1]; info.b = GOLD_RGB[2];
      info.pattern = PATTERN.GOLD;
    }
    return info;
  }

  collect(d) {
    const info = d.info;
    if (info.kind === KIND.CRATE) {
      const t = 1 + Math.floor(Math.random() * (BALL_TYPES.length - 1));
      const n = BALL_TYPES[t].crate;
      this.progress.addAmmo(t, n);
      this.hud.toast(`+${n} ${BALL_TYPES[t].name}${n === 1 ? '' : 's'}`, BALL_TYPES[t].color);
      this.audio.play('powerup');
      this.fx.sparkle(d.pos, '#bfe9ff', 10, 3);
      return;
    }
    tc.setRGB(info.r, info.g, info.b);
    this.progress.stash(info.key, info.value, '#' + tc.getHexString(), info.pattern);
    this.pickStreak = this.time - this.lastPick < 0.5 ? this.pickStreak + 1 : 0;
    this.lastPick = this.time;
    this.audio.play('pickup', { rate: 1 + Math.min(14, this.pickStreak) * 0.05, vol: 0.45, jitter: 0.02 });
    this.fx.sparkle(d.pos, '#' + tc.getHexString(), 2, 1.5);
  }

  queueExplosion(c, radius, damage, src, delay, big, fxOnly, palette) {
    this.explosions.push({ t: this.time + delay, c: c.clone(), radius, damage, src, big, fxOnly, palette });
  }

  explode(e) {
    if (!e.fxOnly) this.explodeDamage(e);
    this.explodeFx(e);
  }

  explodeDamage(e) {
    const { c, radius, damage } = e;
    const src = e.src && e.src.cfg ? e.src : BLAST;
    const time = this.time;
    const cube = this.cube;
    const x0 = Math.max(0, Math.floor(c.x - radius + HALF)), x1 = Math.min(N - 1, Math.floor(c.x + radius + HALF));
    const y0 = Math.max(0, Math.floor(c.y - radius)), y1 = Math.min(N - 1, Math.floor(c.y + radius));
    const z0 = Math.max(0, Math.floor(c.z - radius + HALF)), z1 = Math.min(N - 1, Math.floor(c.z + radius + HALF));
    const hp = new THREE.Vector3();
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const i = cube.idx(x, y, z);
      if (cube.kind[i] === KIND.EMPTY) continue;
      cube.center(i, hp);
      const d = hp.distanceTo(c);
      if (d > radius + 0.5) continue;
      const k = 1 - Math.min(1, Math.max(0, d - 0.5) / radius) * 0.7;
      this.damageCell(i, damage * k, hp, src, time);
    }
    this.chunks.blocksInRadius(c, radius, (ch, b, d, wp) => {
      this.damageChunk(ch, b, damage * (1 - Math.min(1, d / radius) * 0.7), wp.clone(), src, time);
    });
  }

  explodeFx(e) {
    const { c, radius, big } = e;
    if (!this.net || this.net.isLeader) this.chunks.impulse(c, radius * 1.8, big ? 7 : 4.5);

    tv.copy(this.player.capsule.a).add(this.player.capsule.b).multiplyScalar(0.5).sub(c);
    const pd = tv.length();
    const reach = radius * 2.4;
    if (pd < reach) {
      const k = 1 - pd / reach;
      tv.normalize().multiplyScalar(k * (big ? 17 : 12));
      tv.y += k * (big ? 7 : 5);
      this.player.push(tv);
    }
    for (const b of this.balls.list) {
      tv.subVectors(b.pos, c);
      const d = tv.length();
      if (d < radius * 1.6 && d > 0.01) b.dir.lerp(tv.divideScalar(d), 0.75).normalize();
    }
    const pal = e.palette === 'ghost' ? GHOST_COLORS : e.palette === 'meteor' ? METEOR_COLORS : ORB_COLORS;
    this.fx.spawnOrbs(c, radius, big ? 34 : 24, pal);
    this.fx.flashGlow(c, e.palette === 'ghost' ? '#dff3ff' : '#ffcf6a', radius * 1.6);
    this.fx.dustPuff(c, big ? 6 : 4, radius * 0.8, '#fff1d6', 2);
    this.fx.sparkle(c, e.palette === 'ghost' ? '#ffffff' : '#ffe08a', big ? 18 : 12, 9);
    this.fx.shockwave(c, radius * 2.2, e.palette === 'ghost' ? '#cfeaff' : '#ffd890');
    const cd = c.distanceTo(this.player.feet);
    this.fx.addShake(Math.min(0.8, (big ? 0.9 : 0.6) * (1 - Math.min(1, cd / 45))));
    this.audio.play(big ? 'bigboom' : 'boom', { pos: c, range: 110, vol: big ? 1 : 0.85 });
    if (e.palette === 'ghost') this.audio.play('ghost', { pos: c, range: 70, rate: 0.7 });
  }

  afterStep() {
    if (this.explosions.length) {
      const due = this.explosions.filter((e) => e.t <= this.time);
      if (due.length) {
        this.explosions = this.explosions.filter((e) => e.t > this.time);
        for (const e of due) this.explode(e);
      }
    }
    if (this.cube.structureChanged) {
      this.cube.structureChanged = false;
      const comps = this.cube.findDetached();
      for (const comp of comps) {
        const blocks = comp.map((i) => this.removeCell(i));
        const ch = this.chunks.fromCube(blocks);
        this.audio.play('break', { pos: ch.t, rate: 0.55, vol: Math.min(1.2, 0.5 + blocks.length / 30) });
        this.fx.dustPuff(ch.t, Math.min(6, 2 + blocks.length), Math.min(4, ch.radius), '#ffffff', 1.3);
      }
      this.cube.structureChanged = false;
    }
  }

  chunkLanded(ch, k) {
    const size = Math.min(1, ch.blocks.length / 25);
    tv.copy(ch.t);
    this.audio.play('land', { pos: tv, vol: k * (0.45 + size * 0.75), rate: 1.15 - size * 0.4, range: 80 });
    tw.set(ch.t.x, Math.max(0.2, ch.t.y - ch.radius * 0.5), ch.t.z);
    this.fx.dustPuff(tw, Math.round(2 + 5 * size * k), Math.min(5, ch.radius), '#f6f1e2', 1.3 + size * 1.2);
    const d = ch.t.distanceTo(this.player.feet);
    this.fx.addShake(Math.min(0.6, k * (0.15 + size * 0.6) / (1 + d * 0.07)));
  }

  split(b, n) {
    b.alive = false;
    const k = b.cfg.split;
    for (let j = 0; j < k; j++) {
      fw.copy(b.dir);
      fw.x += (Math.random() - 0.5) * 1.1;
      fw.y += (Math.random() - 0.5) * 1.1;
      fw.z += (Math.random() - 0.5) * 1.1;
      fw.normalize();
      if (fw.dot(n) < 0.15) fw.addScaledVector(n, 0.4 - fw.dot(n)).normalize();
      const m = this.balls.spawn(MINI, b.pos, fw, b.owner, this.time, { dmg: b.dmgMul, speed: b.remote ? 1 : this.progress.speedMul });
      m.remote = !!b.remote;
    }
    this.fx.sparkle(b.pos, '#e3f53a', 12, 5);
    this.fx.flashGlow(b.pos, '#d9ff6a', 1.4);
    this.audio.play('split', { pos: b.pos });
    this.enforceCap(b.owner);
  }

  firework(b, n) {
    b.alive = false;
    const k = b.cfg.firework.sparks;
    const owner = 'fx:' + b.owner;
    for (let j = 0; j < k; j++) {
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = Math.sqrt(1 - u * u);
      fw.set(Math.cos(a) * s, u, Math.sin(a) * s);
      if (fw.dot(n) < 0) fw.addScaledVector(n, -1.6 * fw.dot(n)).normalize();
      const m = this.balls.spawn(SPARK, b.pos, fw, owner, this.time, { dmg: b.dmgMul, speed: b.remote ? 1 : this.progress.speedMul });
      m.remote = !!b.remote;
      m.mine = !b.remote && b.owner === this.owner;
    }
    this.fx.spawnOrbs(b.pos, 2.2, 26, FIREWORK);
    for (let j = 0; j < 3; j++) this.fx.sparkle(b.pos, FIREWORK[Math.floor(Math.random() * FIREWORK.length)], 12, 9);
    this.fx.flashGlow(b.pos, '#ffffff', 2.6);
    this.fx.shockwave(b.pos, 4, '#ffd1f4');
    this.audio.play('crack', { pos: b.pos, range: 90, vol: 0.9 });
    this.enforceCap(owner);
  }

  boom(b, p) {
    b.alive = false;
    this.queueExplosion(p, b.cfg.boom.radius, b.cfg.boom.damage * b.dmgMul, b, 0, !!b.cfg.meteor, !!b.remote, b.cfg.meteor ? 'meteor' : null);
  }

  ghostBurst(b, p) {
    b.alive = false;
    const g = b.cfg.ghost;
    this.fx.sparkle(p, '#ffffff', 16, 6);
    this.queueExplosion(p, g.radius, g.damage * b.dmgMul, b, 0, false, !!b.remote, 'ghost');
  }

  sniperHit(b, c, time) {
    b.alive = false;
    this.hitBlock(b, c, b.dmg, time);
    tv.set(c.px, c.py, c.pz);
    this.fx.beam(b.start, tv, '#7ffff0', 0.09, 0.35);
    this.fx.flashGlow(tv, '#bffff6', 2.4);
    this.fx.sparkle(tv, '#7ffff0', 22, 9);
    this.fx.spawnDebris(tv, '#dffffb', 6, 7, 0.14);
    this.fx.shockwave(tv, 3, '#9ffff4');
    this.audio.play('snipe', { pos: tv, range: 120, vol: 1 });
    this.audio.play('crit', { pos: tv, range: 80, rate: 0.8 });
    const d = tv.distanceTo(this.player.feet);
    this.fx.addShake(Math.min(0.35, 0.4 / (1 + d * 0.1)));
  }

  blackHole(b, p) {
    b.alive = false;
    const h = b.cfg.hole;
    this.holes.push({ pos: p.clone(), t: 0, dur: h.time, radius: h.radius, dps: h.dps * b.dmgMul, fxOnly: !!b.remote, tick: 0, mine: !b.remote && b.owner === this.owner, mesh: null });
    this.audio.play('hole', { pos: p, range: 90, vol: 0.9 });
    this.audio.play('charge', { pos: p, range: 70, rate: 0.6 });
    this.fx.flashGlow(p, '#b77dff', 2.2);
  }

  clearHoles() {
    for (const h of this.holes) if (h.mesh) this.fx.releaseHole(h.mesh);
    this.holes.length = 0;
  }

  updateHoles(dt) {
    for (let k = this.holes.length - 1; k >= 0; k--) {
      const h = this.holes[k];
      h.t += dt;
      if (!h.mesh) h.mesh = this.fx.takeHole();
      const grow = Math.min(1, h.t / 0.35) * (h.t > h.dur - 0.3 ? Math.max(0, (h.dur - h.t) / 0.3) : 1);
      if (h.mesh) this.fx.drawHole(h.mesh, h.pos, h.radius, grow, h.t);
      if (Math.random() < 0.7) this.fx.implode(h.pos, h.radius * 1.3, Math.random() < 0.5 ? '#b77dff' : '#ffffff', 2);
      h.tick -= dt;
      if (h.tick <= 0) {
        h.tick = 0.1;
        if (!h.fxOnly) this.crush(h);
        if (this.authority) this.chunks.impulse(h.pos, h.radius * 2.6, -1.2);
      }
      for (const b of this.balls.list) {
        if (!b.alive || b.cfg.hole) continue;
        tv.subVectors(h.pos, b.pos);
        const d = tv.length();
        if (d < 5 && d > 0.05) b.dir.lerp(tv.divideScalar(d), Math.min(1, dt * 2.2 * (1 - d / 5))).normalize();
      }
      tv.copy(this.player.capsule.a).add(this.player.capsule.b).multiplyScalar(0.5);
      tw.subVectors(h.pos, tv);
      const pd = tw.length();
      if (pd < 7 && pd > 0.5) this.player.push(tw.multiplyScalar((dt * 9 * (1 - pd / 7)) / pd));
      if (h.t >= h.dur) {
        if (h.mesh) this.fx.releaseHole(h.mesh);
        this.fx.flashGlow(h.pos, '#e3ccff', 3.5);
        this.fx.spawnOrbs(h.pos, 2, 20, ['#3a1670', '#b77dff', '#ffffff']);
        this.fx.shockwave(h.pos, 6, '#c9a6ff');
        this.audio.play('boom', { pos: h.pos, range: 90, rate: 0.7 });
        this.fx.addShake(Math.min(0.4, 0.5 / (1 + h.pos.distanceTo(this.player.feet) * 0.08)));
        this.holes.splice(k, 1);
      }
    }
  }

  crush(h) {
    const src = { cfg: HOLE, mine: h.mine };
    const c = h.pos, radius = h.radius;
    const cube = this.cube;
    const x0 = Math.max(0, Math.floor(c.x - radius + HALF)), x1 = Math.min(N - 1, Math.floor(c.x + radius + HALF));
    const y0 = Math.max(0, Math.floor(c.y - radius)), y1 = Math.min(N - 1, Math.floor(c.y + radius));
    const z0 = Math.max(0, Math.floor(c.z - radius + HALF)), z1 = Math.min(N - 1, Math.floor(c.z + radius + HALF));
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const i = cube.idx(x, y, z);
      if (cube.kind[i] === KIND.EMPTY) continue;
      cube.center(i, tw);
      const d = tw.distanceTo(c);
      if (d > radius) continue;
      this.damageCell(i, h.dps * 0.1 * (1 - (d / radius) * 0.6), tw, src, this.time, true);
    }
    this.chunks.blocksInRadius(c, radius - 0.5, (ch, b, d, wp) => {
      this.damageChunk(ch, b, h.dps * 0.1 * (1 - Math.min(1, d / radius) * 0.6), wp.clone(), src, this.time, true);
    });
  }

  applyPoison(cell, tox, mul, fxOnly, gen, owner) {
    let e = this.poison.get(cell);
    const until = this.time + tox.time;
    if (e) {
      e.until = Math.max(e.until, until);
      if (!fxOnly && e.fxOnly) { e.fxOnly = false; e.mine = owner === this.owner; }
    } else {
      if (this.poison.size > 900) return;
      e = { until, next: this.time + 0.5, gen, tox, mul, fxOnly, mine: !fxOnly && owner === this.owner };
      this.poison.set(cell, e);
    }
    this.markPoison(cell, e.until);
  }

  markPoison(cell, until) {
    if (this.cube.kind[cell] !== KIND.EMPTY) {
      this.cube.poison[cell] = until;
      this.cubeView.touch(cell);
      return;
    }
    const en = this.chunks.byCell.get(cell);
    if (en && en.b.alive) { en.b.poison = until; this.chunks.hit(en.ch, en.b, 0); }
  }

  solidCell(cell) {
    if (cell < 0 || cell >= SIZE) return false;
    if (this.cube.kind[cell] !== KIND.EMPTY) return true;
    const e = this.chunks.byCell.get(cell);
    return !!(e && e.b.alive);
  }

  updatePoison() {
    let bubbles = 6;
    for (const [cell, e] of this.poison) {
      if (this.time >= e.until || !this.solidCell(cell)) { this.poison.delete(cell); continue; }
      if (this.time < e.next) continue;
      e.next += 0.5;
      if (!e.fxOnly) this.damageAny(cell, e.tox.dps * e.mul * 0.5, { cfg: TOX, mine: e.mine }, true);
      if (bubbles > 0 && Math.random() < 0.3 && this.cellPos(cell, tw)) {
        bubbles--;
        this.fx.bubble(tw, '#6dff7e');
      }
      if (e.gen < e.tox.gen && Math.random() < e.tox.spread) {
        const x = cell % N, z = ((cell / N) | 0) % N, y = (cell / NN) | 0;
        const d = Math.floor(Math.random() * 6);
        const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0), ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0), nz = z + (d === 4 ? 1 : d === 5 ? -1 : 0);
        if (nx >= 0 && ny >= 0 && nz >= 0 && nx < N && ny < N && nz < N) {
          const nc = nx + nz * N + ny * NN;
          if (!this.poison.has(nc) && this.solidCell(nc)) this.applyPoison(nc, e.tox, e.mul, e.fxOnly, e.gen + 1, e.mine ? this.owner : null);
        }
      }
    }
  }

  pop(b) {
    b.alive = false;
    this.fx.sparkle(b.pos, '#' + b.color.getHexString(), 10, 3);
    this.fx.flashGlow(b.pos, '#ffffff', b.r * 4);
    this.audio.play('plop', { pos: b.pos, rate: 1.6 });
  }

  expire(b) {
    b.alive = false;
    this.fx.sparkle(b.pos, '#' + b.color.getHexString(), 4, 2);
  }

  fieldHit(b, p) {
    b.alive = false;
    this.dome.hit(p, 0.8 + b.r / 0.22 * 0.4);
    this.fx.sparkle(p, '#' + b.color.getHexString(), 8, 3);
    this.fx.flashGlow(p, '#9fe9ff', 1.6);
    this.audio.play('dome', { pos: p, range: 140, vol: 1.6, rate: 0.9 + Math.random() * 0.3 });
  }

  obstacleHit(b) {
    this.audio.play('soft', { pos: b.pos, vol: 0.5, rate: 1.4 });
  }

  groundHit(b) {
    if (b.cfg.meteor) { this.boom(b, b.pos.clone()); return; }
    if (this.groundCd > this.time) return;
    this.groundCd = this.time + 0.05;
    this.audio.play('soft', { pos: b.pos, vol: 0.35, rate: 1.3 });
  }

  ballBall(a, o, rel) {
    this.audio.play('plop', { pos: a.pos, vol: Math.min(1, rel / 18), rate: 0.9 + Math.random() * 0.4 });
  }

  playerHit(b, d) {
    const s = b.cfg.mega ? 10 : 2.8 * (b.r / 0.22);
    tv.copy(d).multiplyScalar(s);
    tv.y += s * 0.35;
    this.player.push(tv);
    this.audio.play('soft', { pos: b.pos, vol: b.cfg.mega ? 1.4 : 0.9, rate: b.cfg.mega ? 0.7 : 1 });
    this.fx.addShake(b.cfg.mega ? 0.35 : 0.12);
  }

  pickNear(pos, out) {
    let best = Infinity;
    const ex = this.cube.exposed;
    const n = Math.min(ex.length, 48);
    for (let k = 0; k < n; k++) {
      const i = ex[Math.floor(Math.random() * ex.length)];
      if (this.cube.kind[i] === KIND.EMPTY) continue;
      this.cube.center(i, tw);
      const d = tw.distanceToSquared(pos);
      if (d < best) { best = d; out.copy(tw); }
    }
    for (const ch of this.chunks.list) {
      for (let k = 0; k < Math.min(4, ch.blocks.length); k++) {
        const b = ch.blocks[Math.floor(Math.random() * ch.blocks.length)];
        this.chunks.worldPos(ch, b, tw);
        const d = tw.distanceToSquared(pos);
        if (d < best) { best = d; out.copy(tw); }
      }
    }
    return best < Infinity;
  }

  pickTarget(origin, out) {
    const cube = this.cube;
    const ex = cube.exposed;
    let best = -Infinity;
    const n = Math.min(ex.length, 70);
    for (let k = 0; k < n; k++) {
      const i = ex[Math.floor(Math.random() * ex.length)];
      if (cube.kind[i] === KIND.EMPTY) continue;
      cube.center(i, tw);
      tv.subVectors(tw, origin);
      const dist = tv.length();
      tv.divideScalar(dist);
      if (cube.raycastCell(origin, tv, dist + 1) !== i) continue;
      const left = this.net ? cube.maxHp[i] - this.net.total(i) : cube.hp[i];
      const kind = cube.kind[i];
      const bonus = kind === KIND.TNT ? 3 : kind === KIND.GOLD ? 2.4 : kind === KIND.CRATE ? 1.8 : 0;
      const score = bonus + 2 / (1 + left / 40) + LAYERS[cube.layer[i]].value * 0.002 - dist * 0.01;
      if (score > best) { best = score; out.copy(tw); }
    }
    for (const ch of this.chunks.list) {
      const b = ch.blocks[Math.floor(Math.random() * ch.blocks.length)];
      if (!b) continue;
      this.chunks.worldPos(ch, b, tw);
      const dist = tw.distanceTo(origin);
      const score = 1.6 / (1 + b.hp / 40) - dist * 0.01 + 0.4;
      if (score > best) { best = score; out.copy(tw); }
    }
    return best > -Infinity;
  }

  enforceCap(owner) {
    let n = this.balls.countOwned(owner);
    const pre = typeof owner === 'string' ? owner.split(':')[0] : '';
    const cap = owner === this.owner ? Math.min(BALL_CAP, this.progress.cap) : CAPS[pre] || BALL_CAP;
    while (n > cap) {
      const o = this.balls.oldestOwned(owner);
      if (!o) break;
      if (CAPS[pre]) this.expire(o); else this.pop(o);
      n--;
    }
  }

  raycast(origin, dir, max) {
    let best = max;
    const ray = new this.R.Ray(origin, dir);
    const hit = this.physics.castRay(ray, max, true, undefined, undefined, this.player.collider);
    if (hit && hit.timeOfImpact < best) best = hit.timeOfImpact;
    const b = origin.dot(dir), c = origin.lengthSq() - DOME_R * DOME_R;
    const disc = b * b - c;
    if (disc > 0) {
      const t = -b + Math.sqrt(disc);
      if (t > 0 && t < best) best = t;
    }
    if (dir.y < -1e-4) {
      const t = -origin.y / dir.y;
      if (t > 0 && t < best) best = t;
    }
    return best;
  }

  shotStart(camera, launcher, out) {
    this.player.forward(fw);
    const origin = camera.position;
    launcher.muzzleWorld(camera, mz);
    tv.subVectors(mz, origin);
    const ml = tv.length();
    tv.divideScalar(ml);
    const ray = new this.R.Ray(origin, tv);
    const hit = this.physics.castRay(ray, ml + 0.25, true, undefined, undefined, this.player.collider);
    if (hit) out.copy(origin).addScaledVector(fw, 0.15);
    else out.copy(mz);
    const t = this.raycast(origin, fw, 260);
    tw.copy(origin).addScaledVector(fw, t);
    const dir = new THREE.Vector3().subVectors(tw, out);
    if (t < 1.5 || dir.lengthSq() < 0.01) dir.copy(fw); else dir.normalize();
    return dir;
  }

  spreadDirs(dir, k) {
    if (k <= 1) return [dir];
    const up = Math.abs(dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(dir, up).normalize();
    return [dir, dir.clone().addScaledVector(right, 0.075).normalize(), dir.clone().addScaledVector(right, -0.075).normalize()];
  }

  shoot(typeIdx, camera, launcher) {
    const inf = this.active('infinite');
    if (inf ? this.progress.ammo[typeIdx] <= 0 : !this.progress.useAmmo(typeIdx)) {
      this.audio.play('click');
      if (this.onEmpty) this.onEmpty(typeIdx);
      return false;
    }
    const cfg = BALL_TYPES[typeIdx];
    const start = new THREE.Vector3();
    const dir = this.shotStart(camera, launcher, start);
    const k = this.active('triple') ? 3 : 1;
    for (const d of this.spreadDirs(dir, k)) this.balls.spawn(cfg, start, d, this.owner, this.time, { dmg: this.progress.damageMul, speed: this.progress.speedMul });
    if (this.net) {
      const r = (v, q) => Math.round(v * q) / q;
      this.net.shot({ t: typeIdx, p: [r(start.x, 1000), r(start.y, 1000), r(start.z, 1000)], d: [r(dir.x, 1e4), r(dir.y, 1e4), r(dir.z, 1e4)], s: r(this.progress.speedMul, 1000), m: r(this.progress.damageMul, 1000), k });
    }
    this.enforceCap(this.owner);
    this.audio.play(cfg.sniper ? 'snipe' : 'shot', { rate: cfg.mega ? 0.7 : cfg.boom || cfg.hole ? 0.85 : 1, jitter: 0.08 });
    if (k > 1) this.audio.play('shot', { rate: 1.25, vol: 0.5 });
    this.fx.flashGlow(start, cfg.color, cfg.sniper ? 1 : 0.5);
    this.fx.recoil = Math.min(1, this.fx.recoil + (cfg.sniper ? 0.9 : cfg.mega ? 0.6 : 0.25));
    launcher.fire();
    return true;
  }

  remoteShot(v, age) {
    const cfg = BALL_TYPES[v.t];
    if (!cfg || !v.p || !v.d) return;
    tv.set(v.p[0], v.p[1], v.p[2]);
    tw.set(v.d[0], v.d[1], v.d[2]).normalize();
    for (const d of this.spreadDirs(tw.clone(), v.k || 1)) {
      const b = this.balls.spawn(cfg, tv, d, v.o, this.time, { dmg: v.m || 1, speed: v.s || 1 });
      b.remote = true;
      if (age > 0.02) this.balls.advance(b, age, this.time);
    }
    this.enforceCap(v.o);
    this.audio.play(cfg.sniper ? 'snipe' : 'shot', { pos: tv, vol: 0.6, jitter: 0.1 });
  }

  turretFire(t, origin, dir, real) {
    const cfg = BALL_TYPES[t.type];
    if (!cfg) return;
    const owner = 'tur:' + t.id;
    const b = this.balls.spawn(cfg, origin, dir, owner, this.time, { dmg: this.progress.damageMul, speed: this.progress.speedMul });
    b.remote = !real;
    this.enforceCap(owner);
  }

  setEvents(list, myUid) {
    const now = this.nowMs();
    for (const ev of list) {
      if (!ev || this.seenEvents.has(ev.key)) continue;
      this.seenEvents.add(ev.key);
      if (ev.k === 'orbital') {
        const strike = ev.s + 1500;
        if (now > strike + 4000) continue;
        this.orbitals.push({ x: ev.x, z: ev.z, at: this.time + Math.max(0, (strike - now) / 1000), real: ev.u === myUid, warnT: 0, done: false, fade: 0 });
        this.audio.play('charge', { pos: tv.set(ev.x, 2, ev.z), range: 160, vol: 1.2 });
      } else if (ev.k === 'toxicrain' || ev.k === 'meteor') {
        if (now > ev.e) continue;
        this.sky.set(ev.key, { k: ev.k, s: ev.s, e: ev.e, seed: ev.seed, n: -1 });
      }
    }
  }

  updateSky(dt) {
    if (!this.sky.size) return;
    const now = this.nowMs();
    for (const [key, e] of this.sky) {
      if (now > e.e + 500) { this.sky.delete(key); continue; }
      const interval = e.k === 'toxicrain' ? 0.07 : 0.55;
      const target = Math.floor((Math.min(now, e.e) - e.s) / 1000 / interval);
      if (e.n < 0) e.n = Math.max(0, target - 6);
      let spawned = 0;
      while (e.n <= target && spawned < 8) {
        this.skyBall(e, e.n);
        e.n++;
        spawned++;
      }
    }
  }

  skyBall(e, k) {
    const rnd = mulberry32((e.seed * 31 + k * 7919) >>> 0);
    const real = this.authority;
    const mods = { dmg: this.progress.damageMul, speed: 1 };
    if (e.k === 'toxicrain') {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 14;
      tv.set(Math.cos(a) * r, 34 + rnd() * 10, Math.sin(a) * r);
      tw.set(-tv.x * 0.015 + (rnd() - 0.5) * 0.2, -1, -tv.z * 0.015 + (rnd() - 0.5) * 0.2).normalize();
      const b = this.balls.spawn(ACID, tv, tw, 'sky:rain', this.time, mods);
      b.remote = !real;
      this.enforceCap('sky:rain');
      if (k % 6 === 0) this.audio.play('slime', { pos: tv, range: 120, vol: 0.5, rate: 0.7 + rnd() * 0.5 });
    } else {
      const a = rnd() * Math.PI * 2;
      const ht = Math.max(4, this.cube.height || 12);
      tu.set((rnd() - 0.5) * 14, 1 + rnd() * (ht - 2), (rnd() - 0.5) * 14);
      tv.set(tu.x + Math.cos(a) * 34, 62 + rnd() * 12, tu.z + Math.sin(a) * 34);
      tw.subVectors(tu, tv).normalize();
      const b = this.balls.spawn(METEOR, tv, tw, 'sky:meteor', this.time, mods);
      b.remote = !real;
      this.enforceCap('sky:meteor');
      this.audio.play('thrust', { pos: tu, range: 160, vol: 0.5, rate: 1.4 });
    }
  }

  updateOrbitals(dt) {
    for (let k = this.orbitals.length - 1; k >= 0; k--) {
      const o = this.orbitals[k];
      const cx = Math.floor(o.x + HALF) - HALF + 0.5, cz = Math.floor(o.z + HALF) - HALF + 0.5;
      if (!o.done) {
        const left = o.at - this.time;
        this.fx.orbitalMark(cx, cz, Math.max(0, left), this.time);
        o.warnT -= dt;
        if (o.warnT <= 0) { o.warnT = Math.max(0.08, left * 0.25); this.audio.play('tick', { pos: tv.set(cx, 1, cz), range: 120, vol: 0.9, rate: 1.6 }); }
        if (left <= 0) {
          o.done = true;
          this.strikeColumn(cx, cz, o.real);
        }
      } else {
        o.fade += dt;
        if (o.fade > 1.2) this.orbitals.splice(k, 1);
      }
    }
  }

  strikeColumn(cx, cz, real) {
    const gx = Math.floor(cx + HALF), gz = Math.floor(cz + HALF);
    const src = { cfg: ORBITAL, mine: real };
    if (real) {
      if (gx >= 0 && gz >= 0 && gx < N && gz < N) {
        for (let y = N - 1; y >= 0; y--) {
          const i = gx + gz * N + y * NN;
          if (this.cube.kind[i] === KIND.EMPTY) continue;
          this.cube.center(i, tw);
          this.damageCell(i, this.cube.maxHp[i] * 2 + 10, tw, src, this.time, true);
        }
      }
      for (const ch of this.chunks.list.slice()) {
        for (const b of ch.blocks.slice()) {
          this.chunks.worldPos(ch, b, tw);
          if (Math.abs(tw.x - cx) < 0.65 && Math.abs(tw.z - cz) < 0.65) this.damageChunk(ch, b, b.maxHp * 2 + 10, tw.clone(), src, this.time, true);
        }
      }
    }
    tv.set(cx, 0, cz);
    this.fx.beam(tv.clone().setY(220), tv, '#9ff2ff', 0.75, 0.9);
    this.fx.beam(tv.clone().setY(220), tv, '#ffffff', 0.32, 0.7);
    for (let y = 1; y < Math.max(4, this.cube.height); y += 2) {
      this.fx.sparkle(tw.set(cx, y, cz), '#bff6ff', 6, 7);
      this.fx.spawnDebris(tw, '#dff7ff', 2, 6, 0.18);
    }
    this.fx.shockwave(tv.setY(0.2), 9, '#9ff2ff');
    this.fx.dustPuff(tv, 8, 2.5, '#eaf8ff', 2.6);
    this.fx.flashGlow(tv.setY(3), '#dffaff', 7);
    this.audio.play('beam', { pos: tv, range: 220, vol: 1.3, rate: 0.7 });
    this.audio.play('bigboom', { pos: tv, range: 220, vol: 1 });
    this.audio.play('rumble', { pos: tv, range: 220, vol: 1 });
    const d = tv.distanceTo(this.player.feet);
    this.fx.addShake(Math.min(1, 1.3 / (1 + d * 0.05)));
  }

  drillDig(center, radius, amount, real) {
    const cube = this.cube;
    const src = { cfg: DRILLC, mine: true };
    let hits = 0, color = null;
    const x0 = Math.max(0, Math.floor(center.x - radius + HALF)), x1 = Math.min(N - 1, Math.floor(center.x + radius + HALF));
    const y0 = Math.max(0, Math.floor(center.y - radius)), y1 = Math.min(N - 1, Math.floor(center.y + radius));
    const z0 = Math.max(0, Math.floor(center.z - radius + HALF)), z1 = Math.min(N - 1, Math.floor(center.z + radius + HALF));
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const i = cube.idx(x, y, z);
      if (cube.kind[i] === KIND.EMPTY) continue;
      cube.center(i, tw);
      if (tw.distanceTo(center) > radius) continue;
      hits++;
      if (!color) color = tc.setRGB(cube.color[i * 3], cube.color[i * 3 + 1], cube.color[i * 3 + 2]).getHexString();
      if (real) this.damageCell(i, amount, tw, src, this.time, true);
      else this.cubeView.hit(i, 0.3);
    }
    this.chunks.blocksInRadius(center, radius - 0.5, (ch, b, d, wp) => {
      hits++;
      if (!color) color = tc.setRGB(b.r, b.g, b.b).getHexString();
      if (real) this.damageChunk(ch, b, amount, wp.clone(), src, this.time, true);
      else this.chunks.hit(ch, b, 0.3);
    });
    return { hits, color: color ? '#' + color : null };
  }

  milestoneOf() {
    const total = this.cube.total || 1;
    return Math.min(3, Math.floor(((total - this.remaining) / total) * 4));
  }

  trails(dt) {
    this.trailT += dt;
    if (this.trailT < 1 / 50) return;
    this.trailT = 0;
    const fx = this.fx;
    for (const b of this.balls.list) {
      if (!b.alive) continue;
      const c = b.cfg;
      if (c.meteor) {
        fx.trail(b.pos, '#ffb347', 1.2, 0.5);
        fx.trail(b.pos, '#ff6a1a', 0.7, 0.8);
      } else if (c.sniper) {
        fx.trail(b.pos, '#9ffff4', 0.35, 0.25);
        tv.copy(b.pos).addScaledVector(b.dir, -0.4);
        fx.trail(tv, '#9ffff4', 0.3, 0.22);
      } else if (c.toxic) {
        if (Math.random() < 0.45) fx.trail(b.pos, '#5dff7a', 0.45, 0.45);
      } else if (c.firework || c.id === 'spark') {
        if (Math.random() < 0.6) fx.trail(b.pos, FIREWORK[(b.id + Math.floor(this.time * 8)) % FIREWORK.length], 0.32, 0.35);
      } else if (c.hole) {
        fx.trail(b.pos, '#9a5cff', 0.5, 0.35);
      } else if (c.ghost) {
        if (Math.random() < 0.5) fx.trail(b.pos, '#e3f3ff', 0.45, 0.5);
      } else if (c.mega && Math.random() < 0.3) fx.trail(b.pos, '#8f7dff', 0.6, 0.3);
    }
  }

  broadcastChunks(dt) {
    this.chunkT -= dt;
    if (this.chunkT > 0) return;
    this.chunkT = 0.125;
    const r = (v, k) => Math.round(v * k) / k;
    const states = [];
    const live = new Set();
    for (const ch of this.chunks.list) {
      live.add(ch.id);
      const sleeping = ch.body.isSleeping();
      if (sleeping && ch.sentSleep) continue;
      const t = ch.body.translation(), q = ch.body.rotation(), v = ch.body.linvel(), a = ch.body.angvel();
      states.push({ id: ch.id, t: [r(t.x, 1000), r(t.y, 1000), r(t.z, 1000)], q: [r(q.x, 1e4), r(q.y, 1e4), r(q.z, 1e4), r(q.w, 1e4)], v: [r(v.x, 100), r(v.y, 100), r(v.z, 100)], a: [r(a.x, 100), r(a.y, 100), r(a.z, 100)], s: sleeping });
      ch.sentSleep = sleeping;
    }
    this.net.sendChunks(states, live);
  }

  update(dt) {
    this.breakBudget = 20;
    if (this.net && this.net.isLeader) this.broadcastChunks(dt);
    this.trails(dt);
    this.updateHoles(dt);
    this.updateOrbitals(dt);
    if (this.growT < 1) {
      this.growT = Math.min(1, this.growT + dt / 3.2);
      const e = 1 - Math.pow(1 - this.growT, 3);
      this.cubeView.setOffset(-(1 - e) * (N + 2));
      this.rumbleT -= dt;
      if (this.rumbleT <= 0) {
        this.rumbleT = 0.35;
        this.audio.play('land', { vol: 0.6, rate: 0.5 + Math.random() * 0.1 });
        this.fx.dustPuff(tv.set((Math.random() - 0.5) * 18, 0.4, (Math.random() - 0.5) * 18), 3, 4, '#f6f1e2', 2.4);
      }
      this.fx.addShake(0.05);
      if (this.growT >= 1) {
        this.cube.locked = false;
        this.cubeView.setOffset(0);
        this.buildColliders();
        this.ensurePlayerOutside();
      }
      return;
    }
    this.updatePoison();
    this.updateSky(dt);
    const ms = this.milestoneOf();
    if (ms > this.milestone && !this.done) {
      this.milestone = ms;
      if (ms < 4) {
        this.hud.showBanner(`<b>${ms * 25}% DESTROYED!</b><span>${this.remaining.toLocaleString('en-US')} blocks to go. Keep smashing!</span>`, 3);
        this.audio.play('pw', { vol: 0.8 });
        for (let j = 0; j < 4; j++) {
          tv.set((Math.random() - 0.5) * 26, 16 + Math.random() * 10, (Math.random() - 0.5) * 26);
          this.fx.spawnOrbs(tv, 2, 14, [FIREWORK[j % FIREWORK.length], '#ffffff']);
          this.fx.sparkle(tv, FIREWORK[(j + 2) % FIREWORK.length], 14, 8);
        }
      }
    }
    if (!this.done && this.remaining === 0) {
      this.done = true;
      this.doneT = 7;
      const bonus = Math.round(250 * levelValueMul(this.level));
      if (!this.net || this.net.isLeader) {
        this.progress.earn(bonus);
        this.progress.levelCleared();
      }
      const next = shapeFor(this.level + 1);
      this.hud.showBanner(`<b>LEVEL ${this.level} CLEARED!</b><span>+◇ ${bonus.toLocaleString('en-US')} bonus · Next up: ${next.name}</span>`, 6);
      this.audio.play('levelup');
      this.audio.play('bigboom', { vol: 0.6 });
    }
    if (this.done) {
      this.doneT -= dt;
      this.fireworkT -= dt;
      if (this.fireworkT <= 0 && this.doneT > 1.5) {
        this.fireworkT = 0.35;
        tv.set((Math.random() - 0.5) * 30, 14 + Math.random() * 10, (Math.random() - 0.5) * 30);
        this.fx.spawnOrbs(tv, 2.5, 22, [FIREWORK[Math.floor(Math.random() * FIREWORK.length)], '#ffffff']);
        this.fx.sparkle(tv, FIREWORK[Math.floor(Math.random() * FIREWORK.length)], 20, 10);
        this.audio.play('boom', { pos: tv, vol: 0.5, rate: 1.3, range: 120 });
      }
      if (this.doneT <= 0) {
        if (!this.net) this.startLevel(this.level + 1, this.seed + 1, true);
        else if (!this.advanceSent && (this.net.isLeader || this.doneT < -6)) {
          this.advanceSent = true;
          this.net.advance(this.net.epoch);
        }
      }
    }
  }
}
