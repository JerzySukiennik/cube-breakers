// Cube Breakers: zero-gravity constant-speed balls that bounce forever (blocks, chunks, ground, dome, players, each other).

import * as THREE from 'three';
import { DOME_R, DOME_BIAS, BASE_SPEED } from './config.js';

const CAP = 640;
const C = Array.from({ length: 96 }, () => ({}));
const tv = new THREE.Vector3();
const tw = new THREE.Vector3();
const tq = new THREE.Vector3();
const tcol = new THREE.Color();

export class Balls {
  constructor(scene) {
    this.list = [];
    this.pending = [];
    this.ctx = null;
    this.nextId = 1;
    this.hash = new Map();
    const geo = new THREE.SphereGeometry(1, 22, 16);
    this.gloss = new THREE.InstancedMesh(geo, new THREE.MeshPhysicalMaterial({
      color: '#ffffff', roughness: 0.1, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04,
      emissive: '#ffffff', emissiveIntensity: 0.06, envMapIntensity: 1.2,
    }), CAP);
    this.gold = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#ffc531', metalness: 1, roughness: 0.16, envMapIntensity: 1.4 }), 256);
    for (const m of [this.gloss, this.gold]) {
      m.castShadow = true;
      m.frustumCulled = false;
      m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
    }
    this.gloss.setColorAt(0, tcol.set('#fff'));
    this.gloss.instanceColor.setUsage(THREE.DynamicDrawUsage);
  }

  spawn(cfg, pos, dir, owner, time) {
    const b = {
      id: this.nextId++, cfg, owner, born: time, alive: true,
      pos: pos.clone(), dir: dir.clone().normalize(),
      speed: BASE_SPEED * cfg.speed, r: cfg.radius, dmg: cfg.damage, m: cfg.radius ** 3,
      color: new THREE.Color(cfg.color),
      pierce: cfg.pierce || 0, pierceSet: new Set(),
      split: false, target: new THREE.Vector3(), hasTarget: false, homeT: 0, homeCd: 0.25,
      lastKey: null, lastT: -1, deepFrames: 0,
    };
    this.pending.push(b);
    return b;
  }

  countOwned(owner) {
    let n = 0;
    for (const b of this.list) if (b.alive && b.owner === owner) n++;
    for (const b of this.pending) if (b.alive && b.owner === owner) n++;
    return n;
  }

  oldestOwned(owner) {
    let o = null;
    for (const b of this.list) if (b.alive && b.owner === owner && (!o || b.born < o.born)) o = b;
    return o;
  }

  clear(owner) {
    for (const b of this.list) if (!owner || b.owner === owner) b.alive = false;
    this.pending = this.pending.filter((b) => owner && b.owner !== owner);
  }

  flushPending() {
    if (this.pending.length) {
      for (const b of this.pending) this.list.push(b);
      this.pending.length = 0;
    }
  }

  step(h, time) {
    this.flushPending();
    const ctx = this.ctx;
    for (const b of this.list) {
      if (!b.alive) continue;
      if (b.cfg.homing) this.steer(b, h);
      const dist = b.speed * h;
      const n = Math.max(1, Math.ceil(dist / (b.r * 0.55)));
      const s = dist / n;
      for (let k = 0; k < n && b.alive; k++) {
        b.pos.addScaledVector(b.dir, s);
        this.collide(b, time);
      }
    }
    this.ballBall();
    let w = 0;
    for (let i = 0; i < this.list.length; i++) {
      const b = this.list[i];
      if (b.alive) this.list[w++] = b;
    }
    this.list.length = w;
    ctx.afterStep && ctx.afterStep();
  }

  steer(b, h) {
    b.homeCd -= h;
    b.homeT -= h;
    if (b.homeT <= 0) {
      b.hasTarget = this.ctx.pickNear(b.pos, b.target);
      b.homeT = 0.35;
    }
    if (!b.hasTarget || b.homeCd > 0) return;
    tv.copy(b.target).sub(b.pos);
    const L = tv.length();
    if (L < 0.01) return;
    tv.divideScalar(L);
    const k = Math.min(1, b.cfg.homing * h);
    b.dir.lerp(tv, k).normalize();
  }

  refill(b) {
    if (b.cfg.pierce) {
      b.pierce = b.cfg.pierce;
      b.pierceSet.clear();
    }
  }

  collide(b, time) {
    const ctx = this.ctx;
    const p = b.pos, r = b.r, d = b.dir;
    if (p.y < r) {
      p.y = r;
      if (d.y < 0) {
        d.y = -d.y;
        ctx.groundHit(b);
      }
      this.refill(b);
    }
    const L = p.length();
    if (L > DOME_R - r) {
      tv.copy(p).multiplyScalar(-1 / L);
      p.multiplyScalar((DOME_R - r) / L);
      const dn = d.dot(tv);
      if (dn < 0) {
        d.addScaledVector(tv, -2 * dn);
        if (ctx.pickTarget(tw)) {
          tw.sub(p).normalize();
          d.multiplyScalar(1 - DOME_BIAS).addScaledVector(tw, DOME_BIAS);
        }
        d.x += (Math.random() - 0.5) * 0.04;
        d.y += (Math.random() - 0.5) * 0.04;
        d.z += (Math.random() - 0.5) * 0.04;
        d.normalize();
        if (d.dot(tv) < 0.05) d.addScaledVector(tv, 0.1 - d.dot(tv)).normalize();
        tw.copy(p).multiplyScalar(DOME_R / (DOME_R - r));
        ctx.domeHit(b, tw);
      }
      this.refill(b);
    }
    let nc = ctx.cube.sphereContacts(p, r, C, 0);
    nc = ctx.chunks.sphereContacts(p, r, C, nc);
    if (nc > 0) this.resolveBlocks(b, nc, time);
    if (!b.alive) return;
    const cap = ctx.player.capsule;
    tq.subVectors(cap.b, cap.a);
    const segL2 = tq.lengthSq();
    let t = segL2 > 0 ? tv.subVectors(p, cap.a).dot(tq) / segL2 : 0;
    t = Math.max(0, Math.min(1, t));
    tw.copy(cap.a).addScaledVector(tq, t);
    tv.subVectors(p, tw);
    const dist = tv.length();
    const minD = r + cap.r;
    if (dist < minD) {
      if (dist < 1e-5) tv.set(0, 1, 0); else tv.divideScalar(dist);
      p.copy(tw).addScaledVector(tv, minD + 0.002);
      const dn = d.dot(tv);
      if (dn < 0) {
        ctx.playerHit(b, d);
        d.addScaledVector(tv, -2 * dn).normalize();
        b.homeCd = 0.2;
      }
    }
  }

  resolveBlocks(b, nc, time) {
    const ctx = this.ctx;
    if (b.cfg.pierce) {
      if (b.pierce > 0) {
        for (let k = 0; k < nc; k++) {
          const c = C[k];
          const key = c.i >= 0 ? c.i : c.block;
          if (b.pierceSet.has(key)) continue;
          b.pierceSet.add(key);
          ctx.hitBlock(b, c, b.dmg, time);
          b.pierce--;
          if (b.pierce <= 0) break;
        }
        return;
      }
      let w = 0;
      for (let k = 0; k < nc; k++) {
        const c = C[k];
        if (!b.pierceSet.has(c.i >= 0 ? c.i : c.block)) { if (w !== k) { const t = C[w]; C[w] = C[k]; C[k] = t; } w++; }
      }
      nc = w;
      if (nc === 0) return;
    }
    let nx = 0, ny = 0, nz = 0, deep = C[0];
    for (let k = 0; k < nc; k++) {
      const c = C[k];
      nx += c.nx * c.depth; ny += c.ny * c.depth; nz += c.nz * c.depth;
      if (c.depth > deep.depth) deep = c;
    }
    let nl = Math.hypot(nx, ny, nz);
    if (nl < 1e-6) { nx = -b.dir.x; ny = -b.dir.y; nz = -b.dir.z; nl = 1; }
    nx /= nl; ny /= nl; nz /= nl;
    const push = Math.min(deep.depth, b.r * 1.5) + 0.001;
    b.pos.x += nx * push; b.pos.y += ny * push; b.pos.z += nz * push;
    const dn = b.dir.x * nx + b.dir.y * ny + b.dir.z * nz;
    if (dn < 0) {
      b.dir.x -= 2 * dn * nx; b.dir.y -= 2 * dn * ny; b.dir.z -= 2 * dn * nz;
      b.dir.normalize();
      b.homeCd = 0.18;
    }
    if (deep.depth > b.r * 0.95) {
      if (++b.deepFrames > 90) { ctx.pop(b); return; }
    } else b.deepFrames = 0;
    if (b.cfg.boom) {
      ctx.boom(b, tv.set(deep.px, deep.py, deep.pz));
      return;
    }
    if (b.cfg.mega) {
      for (let k = 0; k < nc; k++) this.tryHit(b, C[k], time);
    } else {
      this.tryHit(b, deep, time);
    }
    if (b.cfg.split && !b.split && b.alive) {
      b.split = true;
      ctx.split(b, tv.set(nx, ny, nz));
    }
  }

  tryHit(b, c, time) {
    const key = c.i >= 0 ? c.i : c.block;
    if (key === b.lastKey && time - b.lastT < 0.08) return;
    b.lastKey = key;
    b.lastT = time;
    this.ctx.hitBlock(b, c, b.dmg, time);
  }

  ballBall() {
    const H = this.hash;
    H.clear();
    const cs = 1.4;
    for (const b of this.list) {
      if (!b.alive) continue;
      const k = (Math.floor(b.pos.x / cs) + 64) + (Math.floor(b.pos.y / cs) + 64) * 128 + (Math.floor(b.pos.z / cs) + 64) * 16384;
      b.hk = k;
      let a = H.get(k);
      if (!a) H.set(k, (a = []));
      a.push(b);
    }
    for (const a of this.list) {
      if (!a.alive) continue;
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const cell = H.get(a.hk + dx + dy * 128 + dz * 16384);
        if (!cell) continue;
        for (const o of cell) {
          if (o.id <= a.id || !o.alive) continue;
          this.pair(a, o);
        }
      }
    }
  }

  pair(a, o) {
    tv.subVectors(o.pos, a.pos);
    const dist = tv.length();
    const minD = a.r + o.r;
    if (dist >= minD || dist < 1e-6) return;
    tv.divideScalar(dist);
    const vax = a.dir.x * a.speed, vay = a.dir.y * a.speed, vaz = a.dir.z * a.speed;
    const vox = o.dir.x * o.speed, voy = o.dir.y * o.speed, voz = o.dir.z * o.speed;
    const rel = (vax - vox) * tv.x + (vay - voy) * tv.y + (vaz - voz) * tv.z;
    const ia = 1 / a.m, io = 1 / o.m;
    if (rel > 0) {
      const j = (2 * rel) / (ia + io);
      a.dir.set(vax - tv.x * j * ia, vay - tv.y * j * ia, vaz - tv.z * j * ia);
      o.dir.set(vox + tv.x * j * io, voy + tv.y * j * io, voz + tv.z * j * io);
      if (a.dir.lengthSq() < 1e-8) a.dir.copy(tv).negate();
      if (o.dir.lengthSq() < 1e-8) o.dir.copy(tv);
      a.dir.normalize();
      o.dir.normalize();
      this.ctx.ballBall(a, o, rel);
    }
    const ov = minD - dist;
    const wa = ia / (ia + io), wo = io / (ia + io);
    a.pos.addScaledVector(tv, -ov * wa);
    o.pos.addScaledVector(tv, ov * wo);
  }

  trace(cfg, pos, dir, maxBounces, maxLen, dots, bounces) {
    const ctx = this.ctx;
    const p = tw.copy(pos), d = tq.copy(dir).normalize();
    const r = cfg.radius;
    const step = 0.1;
    let travelled = 0, nb = 0, nextDot = 0.35;
    dots.length = 0;
    bounces.length = 0;
    while (travelled < maxLen) {
      p.addScaledVector(d, step);
      travelled += step;
      let bounced = false;
      if (p.y < r) { p.y = r; if (d.y < 0) { d.y = -d.y; bounced = true; } }
      if (p.length() > DOME_R - r) { bounces.push(p.clone()); break; }
      let nc = ctx.cube.sphereContacts(p, r, C, 0);
      nc = ctx.chunks.sphereContacts(p, r, C, nc);
      if (nc > 0) {
        let nx = 0, ny = 0, nz = 0, deep = 0;
        for (let k = 0; k < nc; k++) { const c = C[k]; nx += c.nx * c.depth; ny += c.ny * c.depth; nz += c.nz * c.depth; deep = Math.max(deep, c.depth); }
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;
        p.x += nx * deep; p.y += ny * deep; p.z += nz * deep;
        const dn = d.x * nx + d.y * ny + d.z * nz;
        if (dn < 0) { d.x -= 2 * dn * nx; d.y -= 2 * dn * ny; d.z -= 2 * dn * nz; d.normalize(); bounced = true; }
      }
      if (bounced) {
        bounces.push(p.clone());
        if (++nb > maxBounces) break;
        nextDot = travelled + 0.35;
      }
      if (travelled >= nextDot) {
        dots.push(p.clone());
        nextDot += 0.42;
      }
    }
  }

  render() {
    const gm = this.gloss.instanceMatrix.array;
    const gc = this.gloss.instanceColor.array;
    const om = this.gold.instanceMatrix.array;
    let g = 0, o = 0;
    for (const b of this.list) {
      if (!b.alive) continue;
      let arr, off;
      if (b.cfg.gold) {
        if (o >= 256) continue;
        arr = om; off = o * 16; o++;
      } else {
        if (g >= CAP) continue;
        arr = gm; off = g * 16;
        gc[g * 3] = b.color.r; gc[g * 3 + 1] = b.color.g; gc[g * 3 + 2] = b.color.b;
        g++;
      }
      const s = b.r;
      arr[off] = s; arr[off + 1] = 0; arr[off + 2] = 0; arr[off + 3] = 0;
      arr[off + 4] = 0; arr[off + 5] = s; arr[off + 6] = 0; arr[off + 7] = 0;
      arr[off + 8] = 0; arr[off + 9] = 0; arr[off + 10] = s; arr[off + 11] = 0;
      arr[off + 12] = b.pos.x; arr[off + 13] = b.pos.y; arr[off + 14] = b.pos.z; arr[off + 15] = 1;
    }
    this.gloss.count = g;
    this.gold.count = o;
    this.gloss.instanceMatrix.needsUpdate = true;
    this.gloss.instanceColor.needsUpdate = true;
    this.gold.instanceMatrix.needsUpdate = true;
  }
}
