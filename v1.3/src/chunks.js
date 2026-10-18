// Cube Breakers: detached pieces of the cube as Rapier rigid bodies, still made of damageable blocks.

import * as THREE from 'three';
import { HALF, N } from './config.js';
import { createBlockGeometry, addBlockAttributes } from './blockMaterial.js';

const CAP = 4096;
const keyOf = (x, y, z) => (x + 64) | ((y + 64) << 8) | ((z + 64) << 16);
const tv = new THREE.Vector3();
const tq = new THREE.Quaternion();
const ts = new THREE.Vector3();
const tm = new THREE.Matrix4();
const pl = new THREE.Vector3();
const nl = new THREE.Vector3();
export const cellOf = (b) => b.gx + b.gz * N + b.gy * N * N;
const NB = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

export class Chunks {
  constructor(physics, R, scene, material) {
    this.physics = physics;
    this.R = R;
    this.list = [];
    this.blockCount = 0;
    this.dirty = false;
    this.mesh = new THREE.InstancedMesh(createBlockGeometry(), material, CAP);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, new THREE.Color('#fff'));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    const a = addBlockAttributes(this.mesh, CAP);
    this.patternAttr = a.pattern;
    this.fxAttr = a.fx;
    this.mesh.count = 0;
    this.active = new Set();
    this.byCell = new Map();
    this.onLand = null;
    this.onCreate = null;
    scene.add(this.mesh);
  }

  clear() {
    for (const ch of this.list) this.physics.removeRigidBody(ch.body);
    this.list.length = 0;
    this.byCell.clear();
    this.blockCount = 0;
    this.active.clear();
    this.dirty = true;
  }

  fromCube(blocks) {
    let ox = 0, oy = 0, oz = 0;
    for (const b of blocks) { ox += b.gx + 0.5; oy += b.gy + 0.5; oz += b.gz + 0.5; }
    ox /= blocks.length; oy /= blocks.length; oz /= blocks.length;
    const ch = this.make(blocks, { x: ox, y: oy, z: oz }, { x: ox - HALF, y: oy, z: oz - HALF }, { x: 0, y: 0, z: 0, w: 1 }, null, null);
    const s = 0.35 / Math.sqrt(blocks.length);
    ch.body.setAngvel({ x: (Math.random() - 0.5) * s, y: (Math.random() - 0.5) * s, z: (Math.random() - 0.5) * s }, true);
    return ch;
  }

  make(blocks, o, t, q, lin, ang) {
    const R = this.R;
    const desc = R.RigidBodyDesc.dynamic()
      .setTranslation(t.x, t.y, t.z)
      .setRotation(q)
      .setLinearDamping(0.04)
      .setAngularDamping(0.25);
    const body = this.physics.createRigidBody(desc);
    if (lin) body.setLinvel(lin, true);
    if (ang) body.setAngvel(ang, true);
    const ch = {
      id: 0, body, o, map: new Map(), blocks: [], radius: 0, colliders: [], colDirty: false, sentSleep: false,
      t: new THREE.Vector3(t.x, t.y, t.z), q: new THREE.Quaternion(q.x, q.y, q.z, q.w), qi: new THREE.Quaternion(),
      prevVy: 0, prevSpeed: 0, landCd: 0.3, sleeping: false,
    };
    ch.qi.copy(ch.q).invert();
    for (const b of blocks) {
      b.lx = b.gx + 0.5 - o.x; b.ly = b.gy + 0.5 - o.y; b.lz = b.gz + 0.5 - o.z;
      b.flash = b.flash || 0; b.wob = b.wob || 1; b.slot = -1; b.alive = true;
      ch.map.set(keyOf(b.gx, b.gy, b.gz), b);
      ch.blocks.push(b);
      ch.radius = Math.max(ch.radius, Math.hypot(b.lx, b.ly, b.lz) + 0.87);
      this.byCell.set(cellOf(b), { ch, b });
    }
    this.rekey(ch);
    this.buildColliders(ch);
    this.list.push(ch);
    this.blockCount += blocks.length;
    this.dirty = true;
    if (this.onCreate) this.onCreate(ch);
    return ch;
  }

  buildColliders(ch) {
    for (const c of ch.colliders) this.physics.removeCollider(c, false);
    ch.colliders.length = 0;
    ch.colDirty = false;
    const m = ch.map;
    const used = new Set();
    const sorted = ch.blocks.slice().sort((a, b) => a.gy - b.gy || a.gz - b.gz || a.gx - b.gx);
    const free = (x, y, z) => { const k = keyOf(x, y, z); return m.has(k) && !used.has(k); };
    for (const b of sorted) {
      if (used.has(keyOf(b.gx, b.gy, b.gz))) continue;
      const x0 = b.gx, y0 = b.gy, z0 = b.gz;
      let x1 = x0;
      while (free(x1 + 1, y0, z0)) x1++;
      let z1 = z0;
      grow: for (;;) {
        for (let x = x0; x <= x1; x++) if (!free(x, y0, z1 + 1)) break grow;
        z1++;
      }
      let y1 = y0;
      grow2: for (;;) {
        for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (!free(x, y1 + 1, z)) break grow2;
        y1++;
      }
      for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) used.add(keyOf(x, y, z));
      const hx = (x1 - x0 + 1) / 2, hy = (y1 - y0 + 1) / 2, hz = (z1 - z0 + 1) / 2;
      const cd = this.R.ColliderDesc.cuboid(hx - 0.015, hy - 0.015, hz - 0.015)
        .setTranslation(x0 + hx - ch.o.x, y0 + hy - ch.o.y, z0 + hz - ch.o.z)
        .setFriction(0.85).setRestitution(0.12).setDensity(1.6);
      ch.colliders.push(this.physics.createCollider(cd, ch.body));
    }
  }

  rekey(ch) {
    let m = Infinity;
    for (const b of ch.blocks) { const c = cellOf(b); if (c < m) m = c; }
    ch.id = String(m);
  }

  applyState(ch, st) {
    if (!st || !st.t || !st.q) return;
    const b = ch.body;
    b.setTranslation({ x: st.t[0], y: st.t[1], z: st.t[2] }, true);
    b.setRotation({ x: st.q[0], y: st.q[1], z: st.q[2], w: st.q[3] }, true);
    if (st.v) b.setLinvel({ x: st.v[0], y: st.v[1], z: st.v[2] }, true);
    if (st.a) b.setAngvel({ x: st.a[0], y: st.a[1], z: st.a[2] }, true);
    if (st.s) b.sleep();
    ch.t.set(st.t[0], st.t[1], st.t[2]);
    ch.q.set(st.q[0], st.q[1], st.q[2], st.q[3]);
    ch.qi.copy(ch.q).invert();
    this.dirty = true;
  }

  byId(id) {
    for (const ch of this.list) if (ch.id === id) return ch;
    return null;
  }

  removeBlock(ch, b) {
    if (!b.alive) return;
    b.alive = false;
    const e = this.byCell.get(cellOf(b));
    if (e && e.b === b) this.byCell.delete(cellOf(b));
    ch.map.delete(keyOf(b.gx, b.gy, b.gz));
    const k = ch.blocks.indexOf(b);
    if (k >= 0) ch.blocks.splice(k, 1);
    this.blockCount--;
    this.dirty = true;
    if (ch.blocks.length === 0) {
      this.physics.removeRigidBody(ch.body);
      this.list.splice(this.list.indexOf(ch), 1);
      return;
    }
    ch.colDirty = true;
    ch.splitDirty = true;
  }

  splitIfNeeded(ch) {
    const seen = new Set();
    const comps = [];
    for (const start of ch.blocks) {
      if (seen.has(start)) continue;
      const comp = [];
      const stack = [start];
      seen.add(start);
      while (stack.length) {
        const b = stack.pop();
        comp.push(b);
        for (const d of NB) {
          const n = ch.map.get(keyOf(b.gx + d[0], b.gy + d[1], b.gz + d[2]));
          if (n && !seen.has(n)) { seen.add(n); stack.push(n); }
        }
      }
      comps.push(comp);
    }
    if (comps.length < 2) {
      ch.radius = 0;
      for (const b of ch.blocks) ch.radius = Math.max(ch.radius, Math.hypot(b.lx, b.ly, b.lz) + 0.87);
      return;
    }
    comps.sort((a, b) => b.length - a.length);
    const t = ch.body.translation(), q = ch.body.rotation();
    const lin = ch.body.linvel(), ang = ch.body.angvel();
    for (let c = 1; c < comps.length; c++) {
      for (const b of comps[c]) {
        ch.map.delete(keyOf(b.gx, b.gy, b.gz));
        b.alive = false;
        this.active.delete(b);
      }
      this.blockCount -= comps[c].length;
      this.make(comps[c].map((b) => ({ ...b })), ch.o, t, q, lin, ang);
    }
    ch.blocks = comps[0];
    this.rekey(ch);
    this.buildColliders(ch);
    ch.radius = 0;
    for (const b of ch.blocks) ch.radius = Math.max(ch.radius, Math.hypot(b.lx, b.ly, b.lz) + 0.87);
    ch.body.wakeUp();
  }

  sync(dt) {
    let rebuilds = 0;
    for (const ch of this.list.slice()) if (ch.splitDirty) { ch.splitDirty = false; this.splitIfNeeded(ch); }
    for (const ch of this.list) {
      if (ch.colDirty && rebuilds < 6) { this.buildColliders(ch); ch.body.wakeUp(); rebuilds++; }
      const t = ch.body.translation(), q = ch.body.rotation();
      ch.t.set(t.x, t.y, t.z);
      ch.q.set(q.x, q.y, q.z, q.w);
      ch.qi.copy(ch.q).invert();
      const wasSleeping = ch.sleeping;
      ch.sleeping = ch.body.isSleeping();
      if (wasSleeping !== ch.sleeping) this.dirty = true;
      const v = ch.body.linvel();
      ch.landCd -= dt;
      if (ch.prevVy < -3.5 && v.y - ch.prevVy > 3 && ch.landCd <= 0) {
        ch.landCd = 0.25;
        if (this.onLand) this.onLand(ch, Math.min(1, -ch.prevVy / 14));
      }
      ch.prevVy = v.y;
      if (ch.t.y < -30) ch.body.setTranslation({ x: ch.t.x, y: 20, z: ch.t.z }, true);
    }
  }

  worldPos(ch, b, out) {
    return out.set(b.lx, b.ly, b.lz).applyQuaternion(ch.q).add(ch.t);
  }

  sphereContacts(p, r, out, n0) {
    let n = n0;
    for (const ch of this.list) {
      const rr = ch.radius + r;
      if (ch.t.distanceToSquared(p) > rr * rr) continue;
      pl.copy(p).sub(ch.t).applyQuaternion(ch.qi);
      const gx = pl.x + ch.o.x, gy = pl.y + ch.o.y, gz = pl.z + ch.o.z;
      const x0 = Math.floor(gx - r), x1 = Math.floor(gx + r);
      const y0 = Math.floor(gy - r), y1 = Math.floor(gy + r);
      const z0 = Math.floor(gz - r), z1 = Math.floor(gz + r);
      for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const b = ch.map.get(keyOf(x, y, z));
        if (!b) continue;
        const cx = Math.min(Math.max(gx, x), x + 1);
        const cy = Math.min(Math.max(gy, y), y + 1);
        const cz = Math.min(Math.max(gz, z), z + 1);
        const dx = gx - cx, dy = gy - cy, dz = gz - cz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= r * r) continue;
        const c = out[n++];
        c.chunk = ch; c.block = b; c.i = -1;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          nl.set(dx / d, dy / d, dz / d);
          c.depth = r - d;
        } else {
          const ex = [gx - x, x + 1 - gx, gy - y, y + 1 - gy, gz - z, z + 1 - gz];
          let k = 0;
          for (let j = 1; j < 6; j++) if (ex[j] < ex[k]) k = j;
          nl.set(k === 0 ? -1 : k === 1 ? 1 : 0, k === 2 ? -1 : k === 3 ? 1 : 0, k === 4 ? -1 : k === 5 ? 1 : 0);
          c.depth = r + ex[k];
        }
        nl.applyQuaternion(ch.q);
        c.nx = nl.x; c.ny = nl.y; c.nz = nl.z;
        tv.set(cx - ch.o.x, cy - ch.o.y, cz - ch.o.z).applyQuaternion(ch.q).add(ch.t);
        c.px = tv.x; c.py = tv.y; c.pz = tv.z;
        if (n >= out.length) return n;
      }
    }
    return n;
  }

  blocksInRadius(c, radius, cb) {
    for (const ch of this.list.slice()) {
      const rr = ch.radius + radius;
      if (ch.t.distanceToSquared(c) > rr * rr) continue;
      for (const b of ch.blocks.slice()) {
        this.worldPos(ch, b, tv);
        const d = tv.distanceTo(c);
        if (d < radius + 0.5) cb(ch, b, Math.max(0, d - 0.5), tv);
      }
    }
  }

  impulse(c, radius, strength) {
    for (const ch of this.list) {
      const d = ch.t.distanceTo(c);
      if (d > radius + ch.radius) continue;
      const k = 1 - Math.min(1, Math.max(0, d - ch.radius * 0.5) / radius);
      const m = ch.body.mass();
      tv.copy(ch.t).sub(c);
      if (tv.lengthSq() < 1e-4) tv.set(0, 1, 0);
      tv.normalize().multiplyScalar(strength * k * Math.sqrt(m));
      tv.y += strength * 0.5 * k * Math.sqrt(m);
      ch.body.applyImpulse({ x: tv.x, y: tv.y, z: tv.z }, true);
      ch.body.applyTorqueImpulse({ x: (Math.random() - 0.5) * m * k, y: (Math.random() - 0.5) * m * k, z: (Math.random() - 0.5) * m * k }, true);
    }
  }

  hit(ch, b, strength) {
    b.flash = Math.min(1, b.flash + 0.55 * strength);
    b.wob = Math.min(b.wob, 1 - 0.07 * Math.min(1.5, strength));
    this.active.add(b);
    b.chunkRef = ch;
  }

  randomBlock(out) {
    if (!this.list.length) return null;
    const ch = this.list[Math.floor(Math.random() * this.list.length)];
    const b = ch.blocks[Math.floor(Math.random() * ch.blocks.length)];
    return this.worldPos(ch, b, out);
  }

  writeBlock(ch, b, slot, time) {
    tv.set(b.lx, b.ly, b.lz).applyQuaternion(ch.q).add(ch.t);
    ts.setScalar(b.wob);
    tm.compose(tv, ch.q, ts);
    tm.toArray(this.mesh.instanceMatrix.array, slot * 16);
    const fx = this.fxAttr.array;
    const o = slot * 4;
    fx[o] = b.flash;
    fx[o + 1] = b.frozen > time ? Math.min(1, (b.frozen - time) * 2) : 0;
    fx[o + 2] = b.maxHp > 0 ? Math.max(0, 1 - b.hp / b.maxHp) : 0;
    fx[o + 3] = b.poison > time ? Math.min(1, (b.poison - time) * 2) : 0;
  }

  update(dt, time) {
    const col = this.mesh.instanceColor.array;
    const pat = this.patternAttr.array;
    if (this.dirty) {
      let n = 0;
      for (const ch of this.list) for (const b of ch.blocks) {
        b.slot = n++;
        col[b.slot * 3] = b.r; col[b.slot * 3 + 1] = b.g; col[b.slot * 3 + 2] = b.b;
        pat[b.slot] = b.pattern;
        this.writeBlock(ch, b, b.slot, time);
      }
      this.mesh.count = n;
      this.mesh.instanceColor.needsUpdate = true;
      this.patternAttr.needsUpdate = true;
      this.fxAttr.needsUpdate = true;
      this.mesh.instanceMatrix.needsUpdate = true;
      this.dirty = false;
    } else {
      let any = false;
      for (const ch of this.list) {
        if (ch.sleeping) continue;
        for (const b of ch.blocks) this.writeBlock(ch, b, b.slot, time);
        any = true;
      }
      for (const b of this.active) {
        b.flash = b.flash * Math.exp(-dt * 11);
        if (b.flash < 0.01) b.flash = 0;
        b.wob += (1 - b.wob) * Math.min(1, dt * 14);
        if (b.wob > 0.998) b.wob = 1;
        const lasting = b.frozen > time || b.poison > time;
        if (!b.alive || (b.flash === 0 && b.wob === 1 && !lasting)) this.active.delete(b);
        if (b.alive && b.slot >= 0) { this.writeBlock(b.chunkRef, b, b.slot, time); any = true; }
      }
      if (any) {
        this.mesh.instanceMatrix.needsUpdate = true;
        this.fxAttr.needsUpdate = true;
      }
    }
  }
}
