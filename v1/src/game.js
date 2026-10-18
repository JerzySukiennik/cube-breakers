// Cube Breakers: game rules (damage, destruction, explosions, detachment, shooting, ball callbacks).

import * as THREE from 'three';
import { N, HALF, SIZE, KIND, LAYERS, BALL_TYPES, MINI, TNT_BLAST, BALL_CAP, DOME_R } from './config.js';
import { shapeFor, levelValueMul } from './shapes.js';
import { PACKS } from './progress.js';
import { cellOf } from './chunks.js';

const SPAWN = [0, 0, 30];

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
const fw = new THREE.Vector3();
const mz = new THREE.Vector3();
const tc = new THREE.Color();
const BLAST = { cfg: { id: 'blast' } };
const ORB_COLORS = ['#ffd23a', '#ffb31f', '#ffe36a', '#ff9d1a', '#fff1a8'];
const FIREWORK = ['#2f9bff', '#8fe032', '#ffc531', '#ff6fcf', '#b08cff', '#46d7ff', '#ff9a1f'];

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
    this.obstacles = this.pavilion ? this.pavilion.boxes : [];
    this.obstacleMinZ = this.obstacles.reduce((m, o) => Math.min(m, o.min.z), Infinity);
    this.drops.onCollect = (d) => this.collect(d);
    this.pickStreak = 0;
    this.lastPick = -1;
    this.onLevel = null;
    this.onEmpty = null;
    this.net = null;
    this.dealt = 0;
    this.remoteCaps = null;
    this.advanceSent = false;
    this.chunkT = 0;
    this.chunks.onCreate = (ch) => {
      if (this.net && !this.net.isLeader) {
        const st = this.net.chunks.get(ch.id);
        if (st) this.chunks.applyState(ch, st);
      }
    };
  }

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
    const x = i % N, z = ((i / N) | 0) % N, y = (i / (N * N)) | 0;
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
    this.done = false;
    this.advanceSent = false;
    this.dealt = 0;
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
        const blocks = ch.b.map((a) => ({ gx: a[0], gy: a[1], gz: a[2], kind: a[3], layer: a[4], hp: a[5], maxHp: a[6], pattern: a[7], r: a[8], g: a[9], b: a[10], frozen: 0 }));
        if (blocks.length) this.chunks.make(blocks, ch.o, { x: ch.t[0], y: ch.t[1], z: ch.t[2] }, { x: ch.q[0], y: ch.q[1], z: ch.q[2], w: ch.q[3] }, null, null);
      }
      this.drops.restore(d.drops || []);
      this.ensurePlayerOutside();
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
    if (c.i >= 0) this.damageCell(c.i, dmg, tv, ball, time);
    else this.damageChunk(c.chunk, c.block, dmg, tv, ball, time);
    const rate = cfg.mega ? 0.62 : cfg.id === 'mini' ? 1.35 : 1;
    if (cfg.freeze) {
      this.audio.play('ice', { pos: tv, rate });
      this.fx.sparkle(tv, '#d8f7ff', 3, 2.5);
    } else if (cfg.gold) {
      this.audio.play('metal', { pos: tv, rate: 1.25 });
      this.fx.sparkle(tv, '#ffd84a', 3, 3);
    } else {
      this.audio.play('bounce', { pos: tv, rate, vol: cfg.mega ? 1.4 : 1 });
    }
    if (cfg.pierce) this.fx.sparkle(tv, '#c9b3ff', 2, 2);
  }

  numberStyle(src, frozen) {
    if (frozen) return 'ice';
    if (src && src.cfg && src.cfg.gold) return 'gold';
    if (src && src.cfg && (src.cfg.id === 'blast' || src.cfg.boom)) return 'boom';
    return '';
  }

  damageCell(i, dmg, p, src, time) {
    const cube = this.cube;
    if (cube.kind[i] === KIND.EMPTY) return;
    const net = this.net;
    const frozen = net ? net.frozen(i) : cube.frozen[i] > time;
    const d = dmg * (frozen ? 2 : 1);
    this.fx.number(p, d, this.numberStyle(src, frozen));
    this.cubeView.hit(i, Math.min(1.5, 0.45 + d / 40));
    if (src && src.remote) return;
    if (src && src.cfg && src.cfg.freeze) {
      cube.frozen[i] = time + src.cfg.freeze;
      this.cubeView.freeze(i);
      if (net) net.freeze(i, src.cfg.freeze * 1000);
    }
    this.dealt += d;
    if (net) {
      net.damage(i, d, src && src.credit, !!(src && src.cfg && src.cfg.gold));
      if (net.total(i) >= cube.maxHp[i]) net.flushT = 0;
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

  damageChunk(ch, b, dmg, p, src, time) {
    if (!b.alive) return;
    const net = this.net;
    const cell = cellOf(b);
    const frozen = net ? net.frozen(cell) : b.frozen > time;
    const d = dmg * (frozen ? 2 : 1);
    this.fx.number(p, d, this.numberStyle(src, frozen));
    this.chunks.hit(ch, b, Math.min(1.5, 0.45 + d / 40));
    if (src && src.remote) return;
    if (src && src.cfg && src.cfg.freeze) {
      b.frozen = time + src.cfg.freeze;
      if (net) net.freeze(cell, src.cfg.freeze * 1000);
    }
    this.dealt += d;
    if (net) {
      net.damage(cell, d, src && src.credit, !!(src && src.cfg && src.cfg.gold));
      if (net.total(cell) >= b.maxHp) net.flushT = 0;
      return;
    }
    b.hp -= d;
    if (b.hp <= 0) {
      const center = this.chunks.worldPos(ch, b, new THREE.Vector3());
      this.chunks.removeBlock(ch, b);
      this.broken(b, center, src);
    }
  }

  broken(b, center, src) {
    tc.setRGB(b.r, b.g, b.b);
    const rich = this.breakBudget-- > 0;
    this.fx.spawnDebris(center, tc, rich ? 7 : 2, 4.6, 0.2);
    if (rich && this.breakBudget > 16) this.fx.dustPuff(center, 1, 0.5, '#ffffff', 0.9);
    this.audio.play('break', { pos: center, rate: 0.9 + Math.random() * 0.25 });
    this.audio.play('pop', { pos: center, rate: 1.1 + Math.random() * 0.4, vol: 0.5 });
    if (b.kind === KIND.TNT) {
      this.fx.flashGlow(center, '#ffb347', 2.5);
      const authority = !this.net || this.net.isLeader;
      this.queueExplosion(center, TNT_BLAST.radius, Math.max(TNT_BLAST.min, LAYERS[b.layer].hp * TNT_BLAST.hpMul), { cfg: BLAST.cfg, tnt: cellOf(b) }, 0.14, true, !authority);
    } else if (b.kind === KIND.GOLD) {
      this.fx.sparkle(center, '#ffd84a', 26, 6);
      this.fx.flashGlow(center, '#ffe27a', 2.2);
      this.audio.play('powerup', { pos: center });
    } else if (b.kind === KIND.CRATE) {
      this.audio.play('crate', { pos: center });
      this.fx.sparkle(center, '#bfe9ff', 14, 4);
    }
    const cell = cellOf(b);
    const info = this.dropInfo(b);
    info.cell = cell;
    let owner = (src && src.owner) || this.owner;
    let gold = !!(src && src.cfg && src.cfg.gold);
    if (this.net) {
      const u = this.net.kills.get(cell);
      owner = u ? (u === this.net.uid ? this.owner : u) : null;
      const h = this.net.hits.get(cell);
      gold = !!(h && h.gold);
    }
    let n = 1;
    if (b.kind !== KIND.CRATE) {
      if (gold) n++;
      if (Math.random() < this.progress.luck) n++;
    }
    for (let k = 0; k < n; k++) this.drops.spawn(center, info, owner);
    if (this.net && owner === null) this.net.claim(cell);
  }

  netDamage(i, total) {
    const c = this.cube;
    const maxHp = c.maxHp[i];
    if (total < maxHp) {
      if (c.kind[i] !== KIND.EMPTY) c.hp[i] = maxHp - total;
      return;
    }
    if (c.kind[i] !== KIND.EMPTY) { this.destroyCell(i, null); return; }
    const e = this.chunks.byCell.get(i);
    if (e && e.b.alive) {
      const center = this.chunks.worldPos(e.ch, e.b, new THREE.Vector3());
      this.chunks.removeBlock(e.ch, e.b);
      this.broken(e.b, center, null);
    }
  }

  netKill(i, uid) {
    const mine = uid === this.net.uid;
    if (mine) this.net.addKill();
    for (const d of this.drops.list) {
      if (d.owner === null && d.info.cell === i) d.owner = mine ? this.owner : uid;
    }
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
    this.cube.generate(m.level, m.seed);
    const c = this.cube;
    for (const [i, total] of net.dmg) {
      if (c.kind[i] === KIND.EMPTY) continue;
      if (total >= c.maxHp[i]) { c.kind[i] = KIND.EMPTY; c.count--; } else c.hp[i] = c.maxHp[i] - total;
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
    this.explosions.length = 0;
    this.done = false;
    this.advanceSent = false;
    this.dealt = 0;
    this.ensurePlayerOutside();
    if (this.onLevel) this.onLevel(this.level);
  }

  dropInfo(b) {
    let value = LAYERS[b.layer].value * levelValueMul(this.level);
    let key = 'L' + b.layer;
    if (b.kind === KIND.TNT) { value *= 2; key = 'tnt'; }
    else if (b.kind === KIND.GOLD) { value = Math.max(20, value * 10); key = 'gold'; }
    else if (b.kind === KIND.CRATE) { value = 0; key = 'crate'; }
    return { value: b.kind === KIND.CRATE ? 0 : Math.max(1, Math.round(value)), key, r: b.r, g: b.g, b: b.b, pattern: b.pattern, kind: b.kind };
  }

  collect(d) {
    const info = d.info;
    if (info.kind === KIND.CRATE) {
      const t = 1 + Math.floor(Math.random() * (BALL_TYPES.length - 1));
      const n = Math.max(2, Math.round(PACKS[t].count / 2));
      this.progress.addAmmo(t, n);
      this.hud.toast(`+${n} ${BALL_TYPES[t].name}s`, BALL_TYPES[t].color);
      this.audio.play('powerup');
      this.fx.sparkle(d.pos, '#bfe9ff', 10, 3);
      return;
    }
    tc.setRGB(info.r, info.g, info.b);
    this.progress.stash(info.key, info.value, '#' + tc.getHexString(), info.pattern);
    this.pickStreak = this.time - this.lastPick < 0.5 ? this.pickStreak + 1 : 0;
    this.lastPick = this.time;
    this.audio.play('pickup', { rate: 1 + Math.min(14, this.pickStreak) * 0.05, vol: 0.45, jitter: 0.02 });
  }

  queueExplosion(c, radius, damage, src, delay, big, fxOnly) {
    this.explosions.push({ t: this.time + delay, c: c.clone(), radius, damage, src, big, fxOnly });
  }

  explode(e) {
    if (!e.fxOnly) this.explodeDamage(e);
    this.explodeFx(e);
  }

  explodeDamage(e) {
    const { c, radius, damage } = e;
    let src = e.src && e.src.cfg ? e.src : BLAST;
    if (this.net && src.tnt != null) src = { cfg: src.cfg, credit: this.net.kills.get(src.tnt) || this.net.uid };
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
    this.fx.spawnOrbs(c, radius, big ? 34 : 24, ORB_COLORS);
    this.fx.flashGlow(c, '#ffcf6a', radius * 1.6);
    this.fx.dustPuff(c, big ? 6 : 4, radius * 0.8, '#fff1d6', 2);
    this.fx.sparkle(c, '#ffe08a', big ? 18 : 12, 9);
    const cd = c.distanceTo(this.player.feet);
    this.fx.addShake(Math.min(0.8, (big ? 0.9 : 0.6) * (1 - Math.min(1, cd / 45))));
    this.audio.play(big ? 'bigboom' : 'boom', { pos: c, range: 110, vol: big ? 1 : 0.85 });
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

  boom(b, p) {
    b.alive = false;
    this.queueExplosion(p, b.cfg.boom.radius, b.cfg.boom.damage * b.dmgMul, b, 0, false, !!b.remote);
  }

  pop(b) {
    b.alive = false;
    this.fx.sparkle(b.pos, '#' + b.color.getHexString(), 10, 3);
    this.fx.flashGlow(b.pos, '#ffffff', b.r * 4);
    this.audio.play('plop', { pos: b.pos, rate: 1.6 });
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

  enforceCap(owner) {
    let n = this.balls.countOwned(owner);
    const cap = owner === this.owner ? Math.min(BALL_CAP, this.progress.cap) : BALL_CAP;
    while (n > cap) {
      const o = this.balls.oldestOwned(owner);
      if (!o) break;
      this.pop(o);
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

  shoot(typeIdx, camera, launcher) {
    if (!this.progress.useAmmo(typeIdx)) {
      this.audio.play('click');
      if (this.onEmpty) this.onEmpty(typeIdx);
      return false;
    }
    const cfg = BALL_TYPES[typeIdx];
    const start = new THREE.Vector3();
    const dir = this.shotStart(camera, launcher, start);
    this.balls.spawn(cfg, start, dir, this.owner, this.time, { dmg: this.progress.damageMul, speed: this.progress.speedMul });
    if (this.net) {
      const r = (v, k) => Math.round(v * k) / k;
      this.net.shot({ t: typeIdx, p: [r(start.x, 1000), r(start.y, 1000), r(start.z, 1000)], d: [r(dir.x, 1e4), r(dir.y, 1e4), r(dir.z, 1e4)], s: r(this.progress.speedMul, 1000), m: r(this.progress.damageMul, 1000) });
    }
    this.enforceCap(this.owner);
    this.audio.play('shot', { rate: cfg.mega ? 0.7 : cfg.boom ? 0.85 : 1, jitter: 0.08 });
    this.fx.flashGlow(start, cfg.color, 0.5);
    launcher.fire();
    return true;
  }

  remoteShot(v, age) {
    const cfg = BALL_TYPES[v.t];
    if (!cfg || !v.p || !v.d) return;
    const b = this.balls.spawn(cfg, tv.set(v.p[0], v.p[1], v.p[2]), tw.set(v.d[0], v.d[1], v.d[2]), v.o, this.time, { dmg: v.m || 1, speed: v.s || 1 });
    b.remote = true;
    if (age > 0.02) this.balls.advance(b, age, this.time);
    this.enforceCap(v.o);
    this.audio.play('shot', { pos: b.pos, vol: 0.6, jitter: 0.1 });
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
    if (!this.done && this.remaining === 0) {
      this.done = true;
      this.doneT = 7;
      const bonus = Math.round(250 * levelValueMul(this.level));
      this.progress.earn(bonus);
      this.progress.stats.levels++;
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
