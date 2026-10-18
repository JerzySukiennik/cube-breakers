// Cube Breakers: loot blocks that pop out of broken blocks, hover above the grass and fly into your backpack.

import * as THREE from 'three';
import { DOME_R } from './config.js';
import { mulberry32 } from './rng.js';
import { createBlockGeometry, addBlockAttributes } from './blockMaterial.js';

const CAP = 700;
const SIZE = 0.36;
const H = SIZE / 2;
const C = Array.from({ length: 48 }, () => ({}));
const tv = new THREE.Vector3();
const tq = new THREE.Quaternion();
const ts = new THREE.Vector3();
const tm = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const te = new THREE.Euler();

export class Drops {
  constructor(scene, material) {
    this.mesh = new THREE.InstancedMesh(createBlockGeometry(), material, CAP);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, new THREE.Color('#fff'));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    const a = addBlockAttributes(this.mesh, CAP);
    this.patternAttr = a.pattern;
    this.fxAttr = a.fx;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.list = [];
    this.onCollect = null;
    this.claim = null;
    this.byId = new Map();
    this.time = 0;
    this.me = 'me';
  }

  clear() {
    this.list.length = 0;
    this.byId.clear();
  }

  spawn(pos, info, owner, burst = 1, id = null, seed = null) {
    if (this.list.length >= CAP) {
      const old = this.list.shift();
      if (old.id) this.byId.delete(old.id);
    }
    const rnd = seed == null ? Math.random : mulberry32(seed);
    const a = rnd() * Math.PI * 2;
    const sp = (1.5 + rnd() * 2.5) * burst;
    const d = {
      id, pos: pos.clone(),
      vel: new THREE.Vector3(Math.cos(a) * sp, 3 + rnd() * 3, Math.sin(a) * sp),
      q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6)),
      spin: new THREE.Vector3((rnd() - 0.5) * 12, (rnd() - 0.5) * 12, (rnd() - 0.5) * 12),
      info, owner, age: 0, state: 0, base: 0, top: 0, check: 0, yaw: rnd() * 6, magT: 0, pop: 0,
      claim: 0, target: null,
    };
    this.list.push(d);
    if (id) this.byId.set(id, d);
    return d;
  }

  takenBy(id, pos) {
    const d = this.byId.get(id);
    if (!d || d.claim === 2) return;
    d.claim = 3;
    d.state = 3;
    d.magT = 0;
    d.target = pos ? new THREE.Vector3(pos.x, pos.y, pos.z) : null;
  }

  restore(arr) {
    for (const r of arr) {
      const d = this.spawn(new THREE.Vector3(r[0], r[1], r[2]), { value: r[3], key: r[4], r: r[5], g: r[6], b: r[7], pattern: r[8], kind: r[9] }, 'me', 0);
      d.vel.set(0, 0, 0);
      d.age = 1;
      d.pop = 1;
    }
  }

  serialize() {
    return this.list.filter((d) => d.state < 2).map((d) => [
      +d.pos.x.toFixed(2), +d.pos.y.toFixed(2), +d.pos.z.toFixed(2), d.info.value, d.info.key,
      +d.info.r.toFixed(3), +d.info.g.toFixed(3), +d.info.b.toFixed(3), d.info.pattern, d.info.kind,
    ]);
  }

  support(d, cube, chunks) {
    if (d.top <= 0.02) return 0;
    tv.set(d.pos.x, d.top - 0.06, d.pos.z);
    let n = cube.sphereContacts(tv, 0.1, C, 0);
    n = chunks.sphereContacts(tv, 0.1, C, n);
    if (!n) return -1;
    let top = -1;
    for (let k = 0; k < n; k++) if (C[k].py > top) top = C[k].py;
    return top;
  }

  update(dt, cube, chunks, chest, magnetR, owner) {
    this.time += dt;
    this.me = owner;
    const list = this.list;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      d.age += dt;
      d.pop = Math.min(1, d.pop + dt * 6);
      if (d.state === 3) {
        d.magT += dt;
        if (!d.target || d.magT > 0.8) { if (d.id) this.byId.delete(d.id); continue; }
        tv.subVectors(d.target, d.pos);
        const L = tv.length();
        if (L < 0.6) { if (d.id) this.byId.delete(d.id); continue; }
        d.vel.lerp(tv.multiplyScalar((8 + d.magT * 30) / L), Math.min(1, dt * 9));
        d.pos.addScaledVector(d.vel, dt);
        list[w++] = d;
        continue;
      }
      if (d.state !== 2 && d.age > 0.4 && d.pos.distanceToSquared(chest) < magnetR * magnetR) {
        d.state = 2;
        if (this.claim && d.id && d.claim === 0) {
          d.claim = 1;
          this.claim(d.id).then((ok) => { if (d.claim === 1) d.claim = ok ? 2 : 3; });
        } else d.claim = 2;
      }
      if (d.state === 2) {
        d.magT += dt;
        tv.subVectors(chest, d.pos);
        const L = tv.length();
        if (d.claim === 3) { d.state = 3; d.magT = 0.6; list[w++] = d; continue; }
        if (L < 0.5 || d.magT > 3) {
          if (d.claim === 1 && d.magT < 3) { d.pos.copy(chest); list[w++] = d; continue; }
          if (d.id) this.byId.delete(d.id);
          if (d.claim === 2 && this.onCollect) this.onCollect(d);
          continue;
        }
        d.vel.lerp(tv.multiplyScalar((7 + d.magT * 26) / L), Math.min(1, dt * 9));
        d.pos.addScaledVector(d.vel, dt);
        list[w++] = d;
        continue;
      }
      if (d.state === 1) {
        d.check -= dt;
        if (d.check <= 0) {
          d.check = 0.4 + Math.random() * 0.2;
          const top = this.support(d, cube, chunks);
          if (top < 0) { d.state = 0; d.vel.set(0, 0, 0); }
          else { d.top = Math.max(top, 0); d.base = d.top + H + (d.top <= 0.02 ? 0.55 : 0.18); }
        }
        d.yaw += dt * 1.4;
        list[w++] = d;
        continue;
      }
      d.vel.y -= 20 * dt;
      d.pos.addScaledVector(d.vel, dt);
      tq.setFromEuler(te.set(d.spin.x * dt, d.spin.y * dt, d.spin.z * dt));
      d.q.multiply(tq);
      let grounded = false;
      if (d.pos.y < H) {
        d.pos.y = H;
        if (d.vel.y < 0) d.vel.y *= -0.3;
        d.vel.x *= 0.6; d.vel.z *= 0.6;
        grounded = true;
      }
      let n = cube.sphereContacts(d.pos, H, C, 0);
      n = chunks.sphereContacts(d.pos, H, C, n);
      for (let k = 0; k < n; k++) {
        const c = C[k];
        d.pos.x += c.nx * c.depth; d.pos.y += c.ny * c.depth; d.pos.z += c.nz * c.depth;
        const vn = d.vel.x * c.nx + d.vel.y * c.ny + d.vel.z * c.nz;
        if (vn < 0) {
          d.vel.x -= 1.3 * vn * c.nx; d.vel.y -= 1.3 * vn * c.ny; d.vel.z -= 1.3 * vn * c.nz;
        }
        if (c.ny > 0.7) { grounded = true; d.vel.x *= 0.7; d.vel.z *= 0.7; }
      }
      const r = Math.hypot(d.pos.x, d.pos.y, d.pos.z);
      if (r > DOME_R - 1) {
        d.pos.multiplyScalar((DOME_R - 1) / r);
        d.vel.multiplyScalar(-0.3);
      }
      if (grounded) d.spin.multiplyScalar(0.85);
      if (grounded && d.vel.lengthSq() < 0.6 && d.age > 0.3) {
        d.state = 1;
        d.top = Math.max(0, d.pos.y - H);
        d.base = d.top + H + (d.top <= 0.02 ? 0.55 : 0.18);
        d.check = 0.4;
      }
      list[w++] = d;
    }
    list.length = w;
    this.render();
  }

  render() {
    const m = this.mesh.instanceMatrix.array;
    const col = this.mesh.instanceColor.array;
    const pat = this.patternAttr.array;
    const fx = this.fxAttr.array;
    let n = 0;
    for (const d of this.list) {
      let s = SIZE * (0.4 + 0.6 * d.pop);
      if (d.state === 1) {
        const bob = Math.sin(this.time * 2.4 + d.yaw * 3) * 0.07;
        d.pos.y += (d.base + bob - d.pos.y) * 0.15;
        tq.setFromAxisAngle(UP, d.yaw);
        d.q.slerp(tq, 0.12);
      }
      if (d.state >= 2) s *= Math.max(0.35, 1 - d.magT * 1.5);
      tm.compose(d.pos, d.q, ts.setScalar(s));
      tm.toArray(m, n * 16);
      col[n * 3] = d.info.r; col[n * 3 + 1] = d.info.g; col[n * 3 + 2] = d.info.b;
      pat[n] = d.info.pattern;
      fx[n * 3] = d.state === 1 ? 0.16 + 0.1 * Math.sin(this.time * 4 + d.yaw) : 0.1;
      fx[n * 3 + 1] = 0;
      n++;
    }
    this.mesh.count = n;
    if (n) {
      this.mesh.instanceMatrix.addUpdateRange(0, n * 16);
      this.mesh.instanceColor.addUpdateRange(0, n * 3);
      this.patternAttr.addUpdateRange(0, n);
      this.fxAttr.addUpdateRange(0, n * 3);
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor.needsUpdate = true;
      this.patternAttr.needsUpdate = true;
      this.fxAttr.needsUpdate = true;
    }
  }
}
