// Cube Breakers: game rules (damage, destruction, explosions, detachment, shooting, ball callbacks).

import * as THREE from 'three';
import { N, HALF, SIZE, KIND, LAYERS, BALL_TYPES, MINI, TNT_BLAST, BALL_CAP, DOME_R } from './config.js';

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

  reset(seed) {
    this.seed = seed;
    this.balls.clear();
    this.chunks.clear();
    this.cube.generate(seed);
    this.buildColliders();
    this.explosions.length = 0;
    this.done = false;
    const p = this.player.feet;
    if (Math.abs(p.x) < HALF + 0.8 && Math.abs(p.z) < HALF + 0.8 && p.y < N + 1) this.player.teleport(0, 0, 30);
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
    if (src === BLAST || (src && src.cfg && src.cfg.boom)) return 'boom';
    return '';
  }

  damageCell(i, dmg, p, src, time) {
    const cube = this.cube;
    if (cube.kind[i] === KIND.EMPTY) return;
    const frozen = cube.frozen[i] > time;
    const d = dmg * (frozen ? 2 : 1);
    if (src && src.cfg && src.cfg.freeze) {
      cube.frozen[i] = time + src.cfg.freeze;
      this.cubeView.freeze(i);
    }
    cube.hp[i] -= d;
    this.fx.number(p, d, this.numberStyle(src, frozen));
    this.cubeView.hit(i, Math.min(1.5, 0.45 + d / 40));
    if (cube.hp[i] <= 0) this.destroyCell(i, src);
  }

  destroyCell(i, src) {
    const center = this.cube.center(i, new THREE.Vector3());
    const b = this.removeCell(i);
    this.broken(b, center, src);
  }

  damageChunk(ch, b, dmg, p, src, time) {
    if (!b.alive) return;
    const frozen = b.frozen > time;
    const d = dmg * (frozen ? 2 : 1);
    if (src && src.cfg && src.cfg.freeze) b.frozen = time + src.cfg.freeze;
    b.hp -= d;
    this.fx.number(p, d, this.numberStyle(src, frozen));
    this.chunks.hit(ch, b, Math.min(1.5, 0.45 + d / 40));
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
      this.queueExplosion(center, TNT_BLAST.radius, Math.max(TNT_BLAST.min, LAYERS[b.layer].hp * TNT_BLAST.hpMul), BLAST, 0.14, true);
    } else if (b.kind === KIND.GOLD) {
      this.fx.sparkle(center, '#ffd84a', 26, 6);
      this.fx.flashGlow(center, '#ffe27a', 2.2);
      this.audio.play('powerup', { pos: center });
    } else if (b.kind === KIND.CRATE) {
      this.audio.play('crate', { pos: center });
      this.fx.sparkle(center, '#bfe9ff', 14, 4);
      const owner = (src && src.owner) || this.owner;
      for (let k = 0; k < 4; k++) {
        const cfg = BALL_TYPES[1 + Math.floor(Math.random() * (BALL_TYPES.length - 1))];
        fw.set(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize();
        this.balls.spawn(cfg, center, fw, owner, this.time);
      }
      this.enforceCap(owner);
    }
  }

  queueExplosion(c, radius, damage, src, delay, big) {
    this.explosions.push({ t: this.time + delay, c: c.clone(), radius, damage, src, big });
  }

  explode(e) {
    const { c, radius, damage, big } = e;
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
    this.chunks.impulse(c, radius * 1.8, big ? 7 : 4.5);

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
      this.balls.spawn(MINI, b.pos, fw, b.owner, this.time);
    }
    this.fx.sparkle(b.pos, '#e3f53a', 12, 5);
    this.fx.flashGlow(b.pos, '#d9ff6a', 1.4);
    this.audio.play('split', { pos: b.pos });
    this.enforceCap(b.owner);
  }

  boom(b, p) {
    b.alive = false;
    this.queueExplosion(p, b.cfg.boom.radius, b.cfg.boom.damage, b, 0, false);
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
    while (n > BALL_CAP) {
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
    const cfg = BALL_TYPES[typeIdx];
    const start = new THREE.Vector3();
    const dir = this.shotStart(camera, launcher, start);
    this.balls.spawn(cfg, start, dir, this.owner, this.time);
    this.enforceCap(this.owner);
    this.audio.play('shot', { rate: cfg.mega ? 0.7 : cfg.boom ? 0.85 : 1, jitter: 0.08 });
    this.fx.flashGlow(start, cfg.color, 0.5);
    launcher.fire();
  }

  update(dt) {
    this.breakBudget = 20;
    if (!this.done && this.remaining === 0) {
      this.done = true;
      this.doneT = 7;
      this.hud.showBanner('<b>CUBE DESTROYED!</b><span>A new one grows in a moment</span>', 6);
      this.audio.play('bigboom', { vol: 0.7 });
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
      if (this.doneT <= 0) this.reset(this.seed + 1);
    }
  }
}
