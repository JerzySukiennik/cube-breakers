// Cube Breakers: the block grid (state, contacts, detachment, voxel raycast) and its instanced view.

import * as THREE from 'three';
import { N, HALF, SIZE, KIND, LAYERS, SPECIAL } from './config.js';
import { mulberry32 } from './rng.js';
import { shapeFor, levelHpMul } from './shapes.js';
import { createBlockGeometry, addBlockAttributes } from './blockMaterial.js';

const NN = N * N;

function upload(attr, start, count) {
  if (count <= 0) return;
  attr.addUpdateRange(start, count);
  attr.needsUpdate = true;
}
const tmpColor = new THREE.Color();

export class Cube {
  constructor() {
    this.kind = new Uint8Array(SIZE);
    this.layer = new Uint8Array(SIZE);
    this.hp = new Float32Array(SIZE);
    this.maxHp = new Float32Array(SIZE);
    this.color = new Float32Array(SIZE * 3);
    this.frozen = new Float32Array(SIZE);
    this.poison = new Float32Array(SIZE);
    this.pattern = new Uint8Array(SIZE);
    this.count = 0;
    this.total = 0;
    this.dirty = true;
    this.structureChanged = false;
    this.exposed = [];
    this.visited = new Uint8Array(SIZE);
    this.queue = new Int32Array(SIZE);
    this.dist = new Int16Array(SIZE);
    this.genKind = new Uint8Array(SIZE);
    this.level = 1;
    this.shape = null;
    this.locked = false;
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

  generate(level, seed) {
    this.level = level;
    const shape = shapeFor(level);
    const hpMul = levelHpMul(level);
    const rnd = mulberry32((seed * 7919 + level * 104729) >>> 0);
    const k = this.kind, dist = this.dist, q = this.queue;
    this.count = 0;
    for (let y = 0; y < N; y++) for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      k[x + z * N + y * NN] = shape.solid(x, y, z) ? KIND.NORMAL : KIND.EMPTY;
    }
    dist.fill(0);
    let qh = 0, qt = 0;
    const solid = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < N && y < N && z < N && k[x + z * N + y * NN] !== KIND.EMPTY;
    for (let i = 0; i < SIZE; i++) {
      if (k[i] === KIND.EMPTY) continue;
      const x = i % N, z = ((i / N) | 0) % N, y = (i / NN) | 0;
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) for (let dz = -1; dz <= 1 && !edge; dz++) for (let dx = -1; dx <= 1; dx++) {
        if ((dx || dy || dz) && !solid(x + dx, y + dy, z + dz)) { edge = true; break; }
      }
      if (edge) { dist[i] = 1; q[qt++] = i; }
    }
    let maxD = 1;
    while (qh < qt) {
      const i = q[qh++];
      const x = i % N, z = ((i / N) | 0) % N, y = (i / NN) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!(dx || dy || dz) || !solid(x + dx, y + dy, z + dz)) continue;
        const j = x + dx + (z + dz) * N + (y + dy) * NN;
        if (dist[j]) continue;
        dist[j] = dist[i] + 1;
        if (dist[j] > maxD) maxD = dist[j];
        q[qt++] = j;
      }
    }
    const top = LAYERS.length - 1;
    for (let y = 0; y < N; y++) for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const i = this.idx(x, y, z);
      if (k[i] === KIND.EMPTY) continue;
      const layer = Math.min(top, Math.round(((dist[i] - 1) * top) / Math.max(1, maxD - 1)));
      const L = LAYERS[layer];
      let kind = KIND.NORMAL;
      const r = rnd();
      if (layer >= 1 && layer <= 6 && r < 0.006) kind = KIND.TNT;
      else if (layer >= 2 && layer <= 6 && r < 0.018) kind = KIND.GOLD;
      else if (layer >= 1 && layer <= 5 && r < 0.027) kind = KIND.CRATE;
      const sp = SPECIAL[kind];
      k[i] = kind;
      this.genKind[i] = kind;
      this.layer[i] = layer;
      this.maxHp[i] = this.hp[i] = Math.round(L.hp * hpMul * (sp ? sp.hpMul : 1));
      this.pattern[i] = sp ? sp.pattern : L.pattern;
      let hex = sp ? sp.color : (layer === 0 ? shape.shell : L.colors)[Math.floor(rnd() * (layer === 0 ? shape.shell.length : L.colors.length))];
      if (!sp && layer <= 1 && shape.accent) {
        const a = shape.accent(x, y, z, rnd);
        if (a) hex = a;
      }
      tmpColor.set(hex);
      if (!sp) tmpColor.offsetHSL((rnd() - 0.5) * 0.015, 0, (rnd() - 0.5) * 0.05);
      this.color[i * 3] = tmpColor.r;
      this.color[i * 3 + 1] = tmpColor.g;
      this.color[i * 3 + 2] = tmpColor.b;
      this.frozen[i] = 0;
      this.poison[i] = 0;
      this.count++;
    }
    this.total = this.count;
    this.shape = shape;
    let peak = 0;
    for (let i = 0; i < SIZE; i++) if (k[i] !== KIND.EMPTY) peak = Math.max(peak, ((i / NN) | 0) + 1);
    this.height = peak;
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
      pattern: this.pattern[i], frozen: this.frozen[i], poison: this.poison[i],
      r: this.color[i * 3], g: this.color[i * 3 + 1], b: this.color[i * 3 + 2],
    };
    this.kind[i] = KIND.EMPTY;
    this.count--;
    this.dirty = true;
    this.structureChanged = true;
    return b;
  }

  sphereContacts(p, r, out, n0) {
    if (this.locked) return n0;
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

  raycastCell(o, d, maxT) {
    let x = Math.floor(o.x + HALF), y = Math.floor(o.y), z = Math.floor(o.z + HALF);
    const sx = d.x > 0 ? 1 : -1, sy = d.y > 0 ? 1 : -1, sz = d.z > 0 ? 1 : -1;
    const inv = (v) => (Math.abs(v) < 1e-9 ? 1e9 : 1 / Math.abs(v));
    const dx = inv(d.x), dy = inv(d.y), dz = inv(d.z);
    const fx = o.x + HALF - x, fy = o.y - y, fz = o.z + HALF - z;
    let tx = (d.x > 0 ? 1 - fx : fx) * dx, ty = (d.y > 0 ? 1 - fy : fy) * dy, tz = (d.z > 0 ? 1 - fz : fz) * dz;
    let t = 0;
    for (let k = 0; k < 400 && t <= maxT; k++) {
      if (x >= 0 && y >= 0 && z >= 0 && x < N && y < N && z < N) {
        const i = x + z * N + y * NN;
        if (this.kind[i] !== KIND.EMPTY) return i;
      } else if ((sx > 0 && x >= N) || (sx < 0 && x < 0) || (sy > 0 && y >= N) || (sz > 0 && z >= N) || (sz < 0 && z < 0)) {
        if (t > 0) return -1;
      }
      if (tx < ty && tx < tz) { x += sx; t = tx; tx += dx; }
      else if (ty < tz) { y += sy; t = ty; ty += dy; }
      else { z += sz; t = tz; tz += dz; }
      if (y < 0) return -1;
    }
    return -1;
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
    this.back = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#4a4a4a' }), SIZE);
    this.back.setColorAt(0, tmpColor.set('#ffffff'));
    this.back.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.back.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.back.frustumCulled = false;
    this.back.count = 0;
    this.backStamp = new Uint32Array(SIZE);
    this.stamp = 0;
    scene.add(this.back);
  }

  writeMatrix(slot, i, s) {
    const x = i % N, z = ((i / N) | 0) % N, y = (i / NN) | 0;
    const m = this.mesh.instanceMatrix.array;
    const o = slot * 16;
    m[o] = s; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = 0;
    m[o + 4] = 0; m[o + 5] = s; m[o + 6] = 0; m[o + 7] = 0;
    m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = s; m[o + 11] = 0;
    m[o + 12] = x - HALF + 0.5; m[o + 13] = y + 0.5; m[o + 14] = z - HALF + 0.5; m[o + 15] = 1;
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
      this.writeFx(fx, slot, i, time);
      if (c.poison[i] > time) this.active.add(i);
    }
    this.mesh.count = n;
    upload(this.mesh.instanceMatrix, 0, n * 16);
    upload(this.mesh.instanceColor, 0, n * 3);
    upload(this.patternAttr, 0, n);
    upload(this.fxAttr, 0, n * 4);
    this.rebuildBacking();
    c.dirty = false;
  }

  setOffset(y) {
    this.mesh.position.y = y;
    this.back.position.y = y;
  }

  rebuildBacking() {
    const c = this.cube;
    const st = this.backStamp;
    const stamp = ++this.stamp;
    const bm = this.back.instanceMatrix.array;
    const bc = this.back.instanceColor.array;
    let k = 0;
    for (const i of c.exposed) {
      const x = i % N, z = ((i / N) | 0) % N, y = (i / NN) | 0;
      for (let d = 0; d < 6; d++) {
        const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0);
        const ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
        const nz = z + (d === 4 ? 1 : d === 5 ? -1 : 0);
        if (!c.solidAt(nx, ny, nz)) continue;
        const j = nx + nz * N + ny * NN;
        if (st[j] === stamp || this.slotOf[j] >= 0) continue;
        st[j] = stamp;
        const o = k * 16;
        bm[o] = 1; bm[o + 1] = 0; bm[o + 2] = 0; bm[o + 3] = 0;
        bm[o + 4] = 0; bm[o + 5] = 1; bm[o + 6] = 0; bm[o + 7] = 0;
        bm[o + 8] = 0; bm[o + 9] = 0; bm[o + 10] = 1; bm[o + 11] = 0;
        bm[o + 12] = nx - HALF + 0.5; bm[o + 13] = ny + 0.5; bm[o + 14] = nz - HALF + 0.5; bm[o + 15] = 1;
        bc[k * 3] = c.color[j * 3]; bc[k * 3 + 1] = c.color[j * 3 + 1]; bc[k * 3 + 2] = c.color[j * 3 + 2];
        k++;
      }
    }
    this.back.count = k;
    upload(this.back.instanceMatrix, 0, k * 16);
    upload(this.back.instanceColor, 0, k * 3);
  }

  writeFx(fx, slot, i, time) {
    const c = this.cube;
    const o = slot * 4;
    fx[o] = this.flash[i];
    fx[o + 1] = c.frozen[i] > time ? Math.min(1, (c.frozen[i] - time) * 2) : 0;
    fx[o + 2] = c.maxHp[i] > 0 ? Math.max(0, 1 - c.hp[i] / c.maxHp[i]) : 0;
    fx[o + 3] = c.poison[i] > time ? Math.min(1, (c.poison[i] - time) * 2) : 0;
  }

  touch(i) { this.active.add(i); }

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
    let lo = Infinity, hi = -1;
    for (const i of this.active) {
      const f = this.flash[i] * Math.exp(-dt * 11);
      this.flash[i] = f < 0.01 ? 0 : f;
      const w = this.wob[i] + (1 - this.wob[i]) * Math.min(1, dt * 14);
      this.wob[i] = w > 0.998 ? 1 : w;
      const lasting = c.frozen[i] > time || c.poison[i] > time;
      const slot = this.slotOf[i];
      if (c.kind[i] === KIND.EMPTY || (this.flash[i] === 0 && this.wob[i] === 1 && !lasting)) {
        this.active.delete(i);
        this.flash[i] = 0; this.wob[i] = 1;
      }
      if (slot < 0) continue;
      this.writeFx(fx, slot, i, time);
      this.writeMatrix(slot, i, this.wob[i]);
      if (slot < lo) lo = slot;
      if (slot > hi) hi = slot;
    }
    if (hi >= 0) {
      upload(this.fxAttr, lo * 4, (hi - lo + 1) * 4);
      upload(this.mesh.instanceMatrix, lo * 16, (hi - lo + 1) * 16);
    }
  }
}
