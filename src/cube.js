// Cube Breakers: the block grid (state, contacts, detachment) and its instanced view.

import * as THREE from 'three';
import { N, HALF, SIZE, KIND, LAYERS, SPECIAL } from './config.js';
import { mulberry32 } from './rng.js';
import { createBlockGeometry, addBlockAttributes } from './blockMaterial.js';

const NN = N * N;
const tmpColor = new THREE.Color();

export class Cube {
  constructor() {
    this.kind = new Uint8Array(SIZE);
    this.layer = new Uint8Array(SIZE);
    this.hp = new Float32Array(SIZE);
    this.maxHp = new Float32Array(SIZE);
    this.color = new Float32Array(SIZE * 3);
    this.frozen = new Float32Array(SIZE);
    this.pattern = new Uint8Array(SIZE);
    this.count = 0;
    this.total = 0;
    this.dirty = true;
    this.structureChanged = false;
    this.exposed = [];
    this.visited = new Uint8Array(SIZE);
    this.queue = new Int32Array(SIZE);
  }

  idx(x, y, z) { return x + z * N + y * NN; }

  solidAt(x, y, z) {
    if (x < 0 || y < 0 || z < 0 || x >= N || y >= N || z >= N) return false;
    return this.kind[x + z * N + y * NN] !== KIND.EMPTY;
  }

  center(i, out) {
    const x = i % N, z = ((i / N) | 0) % N, y = (i / NN) | 0;
    return out.set(x - HALF + 0.5, y + 0.5, z - HALF + 0.5);
  }

  generate(seed) {
    const rnd = mulberry32(seed);
    this.count = 0;
    for (let y = 0; y < N; y++) for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const i = this.idx(x, y, z);
      const d = Math.min(x, N - 1 - x, y, N - 1 - y, z, N - 1 - z);
      const layer = Math.min(d, LAYERS.length - 1);
      const L = LAYERS[layer];
      let kind = KIND.NORMAL;
      const r = rnd();
      if (layer >= 1 && layer <= 6 && r < 0.006) kind = KIND.TNT;
      else if (layer >= 2 && layer <= 6 && r < 0.018) kind = KIND.GOLD;
      else if (layer >= 1 && layer <= 5 && r < 0.027) kind = KIND.CRATE;
      const sp = SPECIAL[kind];
      this.kind[i] = kind;
      this.layer[i] = layer;
      this.maxHp[i] = this.hp[i] = Math.round(L.hp * (sp ? sp.hpMul : 1));
      this.pattern[i] = sp ? sp.pattern : L.pattern;
      tmpColor.set(sp ? sp.color : L.colors[Math.floor(rnd() * L.colors.length)]);
      if (!sp) tmpColor.offsetHSL((rnd() - 0.5) * 0.015, 0, (rnd() - 0.5) * 0.05);
      this.color[i * 3] = tmpColor.r;
      this.color[i * 3 + 1] = tmpColor.g;
      this.color[i * 3 + 2] = tmpColor.b;
      this.frozen[i] = 0;
      this.count++;
    }
    this.total = this.count;
    this.dirty = true;
    this.structureChanged = false;
  }

  isExposed(i) {
    const x = i % N, z = ((i / N) | 0) % N, y = (i / NN) | 0;
    return !this.solidAt(x + 1, y, z) || !this.solidAt(x - 1, y, z) ||
      !this.solidAt(x, y + 1, z) || (y > 0 && !this.solidAt(x, y - 1, z)) ||
      !this.solidAt(x, y, z + 1) || !this.solidAt(x, y, z - 1);
  }

  take(i) {
    const b = {
      gx: i % N, gy: (i / NN) | 0, gz: ((i / N) | 0) % N,
      kind: this.kind[i], layer: this.layer[i], hp: this.hp[i], maxHp: this.maxHp[i],
      pattern: this.pattern[i], frozen: this.frozen[i],
      r: this.color[i * 3], g: this.color[i * 3 + 1], b: this.color[i * 3 + 2],
    };
    this.kind[i] = KIND.EMPTY;
    this.count--;
    this.dirty = true;
    this.structureChanged = true;
    return b;
  }

  sphereContacts(p, r, out, n0) {
    let n = n0;
    const x0 = Math.max(0, Math.floor(p.x - r + HALF)), x1 = Math.min(N - 1, Math.floor(p.x + r + HALF));
    const y0 = Math.max(0, Math.floor(p.y - r)), y1 = Math.min(N - 1, Math.floor(p.y + r));
    const z0 = Math.max(0, Math.floor(p.z - r + HALF)), z1 = Math.min(N - 1, Math.floor(p.z + r + HALF));
    if (x0 > x1 || y0 > y1 || z0 > z1) return n;
    const rr = r * r;
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const i = x + z * N + y * NN;
      if (this.kind[i] === KIND.EMPTY) continue;
      const bx = x - HALF, by = y, bz = z - HALF;
      const cx = Math.min(Math.max(p.x, bx), bx + 1);
      const cy = Math.min(Math.max(p.y, by), by + 1);
      const cz = Math.min(Math.max(p.z, bz), bz + 1);
      const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= rr) continue;
      const c = out[n++];
      c.chunk = null; c.block = null; c.i = i;
      c.px = cx; c.py = cy; c.pz = cz;
      if (d2 > 1e-10) {
        const d = Math.sqrt(d2);
        c.nx = dx / d; c.ny = dy / d; c.nz = dz / d; c.depth = r - d;
      } else {
        const ex = [p.x - bx, bx + 1 - p.x, p.y - by, by + 1 - p.y, p.z - bz, bz + 1 - p.z];
        let k = 0;
        for (let j = 1; j < 6; j++) if (ex[j] < ex[k]) k = j;
        c.nx = k === 0 ? -1 : k === 1 ? 1 : 0;
        c.ny = k === 2 ? -1 : k === 3 ? 1 : 0;
        c.nz = k === 4 ? -1 : k === 5 ? 1 : 0;
        c.depth = r + ex[k];
      }
      if (n >= out.length) return n;
    }
    return n;
  }

  findDetached() {
    const v = this.visited, q = this.queue, k = this.kind;
    v.fill(0);
    let qh = 0, qt = 0;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const i = x + z * N;
      if (k[i] !== KIND.EMPTY) { v[i] = 1; q[qt++] = i; }
    }
    const visit = (j) => { if (k[j] !== KIND.EMPTY && !v[j]) { v[j] = 1; q[qt++] = j; } };
    while (qh < qt) {
      const i = q[qh++];
      const x = i % N, z = ((i / N) | 0) % N, y = (i / NN) | 0;
      if (x > 0) visit(i - 1);
      if (x < N - 1) visit(i + 1);
      if (z > 0) visit(i - N);
      if (z < N - 1) visit(i + N);
      if (y > 0) visit(i - NN);
      if (y < N - 1) visit(i + NN);
    }
    const comps = [];
    for (let s = 0; s < SIZE; s++) {
      if (k[s] === KIND.EMPTY || v[s]) continue;
      const comp = [];
      qh = 0; qt = 0;
      v[s] = 1; q[qt++] = s;
      while (qh < qt) {
        const i = q[qh++];
        comp.push(i);
        const x = i % N, z = ((i / N) | 0) % N, y = (i / NN) | 0;
        if (x > 0) visit(i - 1);
        if (x < N - 1) visit(i + 1);
        if (z > 0) visit(i - N);
        if (z < N - 1) visit(i + N);
        if (y > 0) visit(i - NN);
        if (y < N - 1) visit(i + NN);
      }
      comps.push(comp);
    }
    return comps;
  }
}

export class CubeView {
  constructor(cube, material, scene) {
    this.cube = cube;
    this.mesh = new THREE.InstancedMesh(createBlockGeometry(), material, SIZE);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, tmpColor.set('#ffffff'));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    const a = addBlockAttributes(this.mesh, SIZE);
    this.patternAttr = a.pattern;
    this.fxAttr = a.fx;
    this.slotOf = new Int32Array(SIZE).fill(-1);
    this.flash = new Float32Array(SIZE);
    this.wob = new Float32Array(SIZE).fill(1);
    this.active = new Set();
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  writeMatrix(slot, i, s) {
    const c = this.cube;
    const x = i % N, z = ((i / N) | 0) % N, y = (i / NN) | 0;
    const m = this.mesh.instanceMatrix.array;
    const o = slot * 16;
    m[o] = s; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = 0;
    m[o + 4] = 0; m[o + 5] = s; m[o + 6] = 0; m[o + 7] = 0;
    m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = s; m[o + 11] = 0;
    m[o + 12] = x - HALF + 0.5; m[o + 13] = y + 0.5; m[o + 14] = z - HALF + 0.5; m[o + 15] = 1;
    return c;
  }

  rebuild(time) {
    const c = this.cube;
    const col = this.mesh.instanceColor.array;
    const pat = this.patternAttr.array;
    const fx = this.fxAttr.array;
    this.slotOf.fill(-1);
    c.exposed.length = 0;
    let n = 0;
    for (let i = 0; i < SIZE; i++) {
      if (c.kind[i] === KIND.EMPTY || !c.isExposed(i)) continue;
      c.exposed.push(i);
      const slot = n++;
      this.slotOf[i] = slot;
      this.writeMatrix(slot, i, this.wob[i]);
      col[slot * 3] = c.color[i * 3];
      col[slot * 3 + 1] = c.color[i * 3 + 1];
      col[slot * 3 + 2] = c.color[i * 3 + 2];
      pat[slot] = c.pattern[i];
      fx[slot * 3] = this.flash[i];
      fx[slot * 3 + 1] = c.frozen[i] > time ? Math.min(1, (c.frozen[i] - time) * 2) : 0;
      fx[slot * 3 + 2] = 0;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.patternAttr.needsUpdate = true;
    this.fxAttr.needsUpdate = true;
    c.dirty = false;
  }

  hit(i, strength) {
    this.flash[i] = Math.min(1, this.flash[i] + 0.55 * strength);
    this.wob[i] = Math.min(this.wob[i], 1 - 0.07 * Math.min(1.5, strength));
    this.active.add(i);
  }

  freeze(i) { this.active.add(i); }

  update(dt, time) {
    const c = this.cube;
    if (c.dirty) this.rebuild(time);
    if (this.active.size === 0) return;
    const fx = this.fxAttr.array;
    let mtx = false;
    for (const i of this.active) {
      const f = this.flash[i] * Math.exp(-dt * 11);
      this.flash[i] = f < 0.01 ? 0 : f;
      const w = this.wob[i] + (1 - this.wob[i]) * Math.min(1, dt * 14);
      this.wob[i] = w > 0.998 ? 1 : w;
      const frozen = c.frozen[i] > time;
      const slot = this.slotOf[i];
      if (c.kind[i] === KIND.EMPTY || (this.flash[i] === 0 && this.wob[i] === 1 && !frozen)) {
        this.active.delete(i);
        this.flash[i] = 0; this.wob[i] = 1;
      }
      if (slot < 0) continue;
      fx[slot * 3] = this.flash[i];
      fx[slot * 3 + 1] = frozen ? Math.min(1, (c.frozen[i] - time) * 2) : 0;
      this.writeMatrix(slot, i, this.wob[i]);
      mtx = true;
    }
    this.fxAttr.needsUpdate = true;
    if (mtx) this.mesh.instanceMatrix.needsUpdate = true;
  }
}
