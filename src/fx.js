// Cube Breakers: debris, explosion orbs, soft particles, trails, beams, shockwaves, black holes, orbital markers, damage numbers and camera shake.

import * as THREE from 'three';
import { Numbers } from './numbers.js';

const DEBRIS = 900;
const ORBS = 160;
const SOFT = 700;
const TRAIL = 1600;
const tm = new THREE.Matrix4();
const tq = new THREE.Quaternion();
const te = new THREE.Euler();
const tv = new THREE.Vector3();
const ts = new THREE.Vector3();
const tc = new THREE.Color();
const UPV = new THREE.Vector3(0, 1, 0);

function softPoints(additive, cap = SOFT) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { uScale: { value: 600 }, uMax: { value: 120 } },
    vertexShader: `
      attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
      uniform float uScale; uniform float uMax;
      varying float vA; varying vec3 vC;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = min(aSize * uScale / max(0.1, -mv.z), uMax);
        vA = aAlpha; vC = aColor;
      }`,
    fragmentShader: `
      varying float vA; varying vec3 vC;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.05, d) * vA;
        if (a < 0.003) discard;
        gl_FragColor = vec4(vC, a);
        #include <colorspace_fragment>
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 5;
  return pts;
}

export class FX {
  constructor(scene) {
    this.debris = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.35 }), DEBRIS);
    this.debris.castShadow = false;
    this.debris.frustumCulled = false;
    this.debris.setColorAt(0, tc.set('#fff'));
    this.debris.count = 0;
    scene.add(this.debris);
    this.d = { n: 0, pos: new Float32Array(DEBRIS * 3), vel: new Float32Array(DEBRIS * 3), rot: new Float32Array(DEBRIS * 3), av: new Float32Array(DEBRIS * 3), life: new Float32Array(DEBRIS), max: new Float32Array(DEBRIS), size: new Float32Array(DEBRIS), col: new Float32Array(DEBRIS * 3) };

    this.orbs = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 18, 12), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.25, emissive: '#ff8a00', emissiveIntensity: 0.55 }), ORBS);
    this.orbs.frustumCulled = false;
    this.orbs.setColorAt(0, tc.set('#fff'));
    this.orbs.count = 0;
    scene.add(this.orbs);
    this.o = { n: 0, pos: new Float32Array(ORBS * 3), vel: new Float32Array(ORBS * 3), life: new Float32Array(ORBS), max: new Float32Array(ORBS), size: new Float32Array(ORBS), col: new Float32Array(ORBS * 3) };

    this.dust = softPoints(false);
    this.glow = softPoints(true);
    this.trailPts = softPoints(true, TRAIL);
    scene.add(this.dust, this.glow, this.trailPts);
    this.sd = this.makeSoftState();
    this.sg = this.makeSoftState();
    this.st = this.makeSoftState(TRAIL);

    this.numbers = new Numbers(scene);
    this.trauma = 0;
    this.recoil = 0;
    this.shake = new THREE.Vector3();
    this.time = 0;
    this.scene = scene;

    this.ringGeo = new THREE.PlaneGeometry(1, 1);
    this.waves = [];
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(this.ringGeo, new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uA: { value: 0 }, uC: { value: new THREE.Color() }, uT: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform float uA; uniform vec3 uC; uniform float uT; varying vec2 vUv;
          void main() { float r = length(vUv - 0.5) * 2.0; float w = 0.08 + 0.2 * (1.0 - uT);
            float a = smoothstep(1.0 - w, 1.0 - w * 0.4, r) * (1.0 - smoothstep(1.0 - w * 0.4, 1.0, r)) * uA;
            if (a < 0.003) discard; gl_FragColor = vec4(uC * a, a); }`,
      }));
      m.visible = false;
      m.frustumCulled = false;
      m.renderOrder = 6;
      scene.add(m);
      this.waves.push({ m, t: 1, max: 1, r: 1 });
    }

    this.beamGeo = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
    this.beamGeo.translate(0, 0.5, 0);
    this.beams = [];
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(this.beamGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffffff', fog: false }));
      m.visible = false;
      m.frustumCulled = false;
      m.renderOrder = 6;
      scene.add(m);
      this.beams.push({ m, t: 1, max: 1, w: 0.1 });
    }

    this.holePool = [];
    const coreGeo = new THREE.SphereGeometry(1, 24, 16);
    const diskGeo = new THREE.RingGeometry(1.15, 2.6, 48, 1);
    for (let i = 0; i < 8; i++) {
      const g = new THREE.Group();
      const core = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({ color: '#05020c' }));
      const halo = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({ color: '#8a4dff', transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
      const disk = new THREE.Mesh(diskGeo, new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { uT: { value: 0 }, uA: { value: 1 } },
        vertexShader: 'varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform float uT; uniform float uA; varying vec2 vP;
          void main() { float r = length(vP); float a = atan(vP.y, vP.x);
            float sw = 0.5 + 0.5 * sin(a * 3.0 - uT * 7.0 + r * 4.0);
            float k = smoothstep(1.15, 1.4, r) * (1.0 - smoothstep(1.8, 2.6, r));
            vec3 c = mix(vec3(0.55, 0.25, 1.0), vec3(1.0, 0.85, 1.0), sw * smoothstep(2.0, 1.2, r));
            float al = k * (0.35 + 0.65 * sw) * uA; gl_FragColor = vec4(c * al, al); }`,
      }));
      disk.rotation.x = -Math.PI / 2 + 0.35;
      halo.scale.setScalar(1.35);
      g.add(core, halo, disk);
      g.visible = false;
      g.userData = { core, halo, disk, used: false };
      scene.add(g);
      this.holePool.push(g);
    }

    this.marks = [];
    const markGeo = new THREE.RingGeometry(0.62, 0.8, 4, 1);
    markGeo.rotateX(-Math.PI / 2);
    markGeo.rotateY(Math.PI / 4);
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({ color: '#7fe8ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
      const sight = new THREE.Mesh(this.beamGeo, new THREE.MeshBasicMaterial({ color: '#7fe8ff', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      sight.scale.set(0.06, 220, 0.06);
      g.add(ring, sight);
      g.visible = false;
      g.userData = { ring, sight };
      scene.add(g);
      this.marks.push(g);
    }
    this.markUsed = 0;
  }

  makeSoftState(cap = SOFT) {
    return { cap, n: 0, pos: new Float32Array(cap * 3), vel: new Float32Array(cap * 3), life: new Float32Array(cap), max: new Float32Array(cap), size0: new Float32Array(cap), size1: new Float32Array(cap), col: new Float32Array(cap * 3), a0: new Float32Array(cap), drag: new Float32Array(cap), grav: new Float32Array(cap) };
  }

  setScale(h, cssH, bufH) {
    this.dust.material.uniforms.uScale.value = h * 0.5;
    this.glow.material.uniforms.uScale.value = h * 0.5;
    this.trailPts.material.uniforms.uScale.value = h * 0.5;
    this.dust.material.uniforms.uMax.value = bufH * 0.16;
    this.glow.material.uniforms.uMax.value = bufH * 0.22;
    this.trailPts.material.uniforms.uMax.value = bufH * 0.12;
    this.numbers.setViewport(cssH);
  }

  spawnDebris(p, color, count, speed, size) {
    const d = this.d;
    tc.set(color);
    for (let k = 0; k < count; k++) {
      let i = d.n < DEBRIS ? d.n++ : Math.floor(Math.random() * DEBRIS);
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = Math.sqrt(1 - u * u);
      const sp = speed * (0.4 + Math.random() * 0.8);
      d.pos[i * 3] = p.x + (Math.random() - 0.5) * 0.6;
      d.pos[i * 3 + 1] = p.y + (Math.random() - 0.5) * 0.6;
      d.pos[i * 3 + 2] = p.z + (Math.random() - 0.5) * 0.6;
      d.vel[i * 3] = Math.cos(a) * s * sp;
      d.vel[i * 3 + 1] = Math.abs(u) * sp + 2.5;
      d.vel[i * 3 + 2] = Math.sin(a) * s * sp;
      d.rot[i * 3] = Math.random() * 6; d.rot[i * 3 + 1] = Math.random() * 6; d.rot[i * 3 + 2] = Math.random() * 6;
      d.av[i * 3] = (Math.random() - 0.5) * 14; d.av[i * 3 + 1] = (Math.random() - 0.5) * 14; d.av[i * 3 + 2] = (Math.random() - 0.5) * 14;
      d.max[i] = d.life[i] = 0.8 + Math.random() * 0.9;
      d.size[i] = size * (0.6 + Math.random() * 0.7);
      const l = 0.85 + Math.random() * 0.3;
      d.col[i * 3] = tc.r * l; d.col[i * 3 + 1] = tc.g * l; d.col[i * 3 + 2] = tc.b * l;
    }
  }

  spawnOrbs(p, radius, count, colors) {
    const o = this.o;
    for (let k = 0; k < count; k++) {
      let i = o.n < ORBS ? o.n++ : Math.floor(Math.random() * ORBS);
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = Math.sqrt(1 - u * u);
      const rr = radius * Math.cbrt(Math.random());
      o.pos[i * 3] = p.x + Math.cos(a) * s * rr * 0.4;
      o.pos[i * 3 + 1] = p.y + u * rr * 0.4;
      o.pos[i * 3 + 2] = p.z + Math.sin(a) * s * rr * 0.4;
      const sp = 2 + Math.random() * radius * 2.2;
      o.vel[i * 3] = Math.cos(a) * s * sp;
      o.vel[i * 3 + 1] = u * sp + 1.2;
      o.vel[i * 3 + 2] = Math.sin(a) * s * sp;
      o.max[i] = o.life[i] = 0.35 + Math.random() * 0.4;
      o.size[i] = 0.16 + Math.random() * radius * 0.16;
      tc.set(colors[Math.floor(Math.random() * colors.length)]);
      o.col[i * 3] = tc.r; o.col[i * 3 + 1] = tc.g; o.col[i * 3 + 2] = tc.b;
    }
  }

  soft(state, p, count, o) {
    tc.set(o.color);
    for (let k = 0; k < count; k++) {
      let i = state.n < state.cap ? state.n++ : Math.floor(Math.random() * state.cap);
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = Math.sqrt(1 - u * u);
      const sp = o.speed * (0.3 + Math.random() * 0.9);
      state.pos[i * 3] = p.x + (Math.random() - 0.5) * (o.spread || 0);
      state.pos[i * 3 + 1] = p.y + (Math.random() - 0.5) * (o.spread || 0) * 0.4;
      state.pos[i * 3 + 2] = p.z + (Math.random() - 0.5) * (o.spread || 0);
      state.vel[i * 3] = Math.cos(a) * s * sp;
      state.vel[i * 3 + 1] = (o.up ? Math.abs(u) : u) * sp + (o.lift || 0);
      state.vel[i * 3 + 2] = Math.sin(a) * s * sp;
      state.max[i] = state.life[i] = o.life * (0.6 + Math.random() * 0.8);
      state.size0[i] = o.size0 * (0.7 + Math.random() * 0.6);
      state.size1[i] = o.size1 * (0.7 + Math.random() * 0.6);
      state.a0[i] = o.alpha;
      state.drag[i] = o.drag || 2;
      state.grav[i] = o.grav || 0;
      state.col[i * 3] = tc.r; state.col[i * 3 + 1] = tc.g; state.col[i * 3 + 2] = tc.b;
    }
  }

  dustPuff(p, count, spread, color = '#f4f1ea', size = 1.6) {
    this.soft(this.sd, p, count, { color, speed: 2.4, spread, life: 1.4, size0: size * 0.5, size1: size * 1.6, alpha: 0.5, drag: 2.5, lift: 0.6, up: true });
  }

  sparkle(p, color, count, speed = 4) {
    this.soft(this.sg, p, count, { color, speed, spread: 0.3, life: 0.6, size0: 0.35, size1: 0.05, alpha: 0.9, drag: 3, grav: 4 });
  }

  flashGlow(p, color, size) {
    this.soft(this.sg, p, 1, { color, speed: 0, spread: 0, life: 0.25, size0: size, size1: size * 1.6, alpha: 0.9, drag: 0 });
  }

  trail(p, color, size, life) {
    this.soft(this.st, p, 1, { color, speed: 0.15, spread: 0, life, size0: size, size1: size * 0.15, alpha: 0.75, drag: 1 });
  }

  bubble(p, color) {
    this.soft(this.sg, p, 1, { color, speed: 0.4, spread: 0.7, life: 0.9, size0: 0.28, size1: 0.06, alpha: 0.85, drag: 1, lift: 1.4, up: true });
  }

  implode(p, radius, color, count) {
    const st = this.sg;
    tc.set(color);
    for (let k = 0; k < count; k++) {
      const i = st.n < st.cap ? st.n++ : Math.floor(Math.random() * st.cap);
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = Math.sqrt(1 - u * u);
      const dx = Math.cos(a) * s, dy = u * 0.5, dz = Math.sin(a) * s;
      const life = 0.45 + Math.random() * 0.2;
      st.pos[i * 3] = p.x + dx * radius; st.pos[i * 3 + 1] = p.y + dy * radius; st.pos[i * 3 + 2] = p.z + dz * radius;
      const sp = radius / life;
      st.vel[i * 3] = -dx * sp - dz * sp * 0.6; st.vel[i * 3 + 1] = -dy * sp; st.vel[i * 3 + 2] = -dz * sp + dx * sp * 0.6;
      st.max[i] = st.life[i] = life;
      st.size0[i] = 0.12; st.size1[i] = 0.4;
      st.a0[i] = 0.9; st.drag[i] = 0; st.grav[i] = 0;
      st.col[i * 3] = tc.r; st.col[i * 3 + 1] = tc.g; st.col[i * 3 + 2] = tc.b;
    }
  }

  shockwave(p, radius, color) {
    let w = this.waves.find((x) => x.t >= x.max);
    if (!w) w = this.waves[Math.floor(Math.random() * this.waves.length)];
    w.t = 0; w.max = 0.45; w.r = radius;
    w.m.position.copy(p);
    w.m.material.uniforms.uC.value.set(color);
    w.m.visible = true;
  }

  beam(a, b, color, width, life) {
    let o = this.beams.find((x) => x.t >= x.max);
    if (!o) o = this.beams[0];
    o.t = 0; o.max = life; o.w = width;
    const m = o.m;
    m.position.copy(a);
    tv.subVectors(b, a);
    const L = tv.length();
    m.quaternion.setFromUnitVectors(UPV, tv.divideScalar(Math.max(1e-4, L)));
    m.scale.set(width, L, width);
    m.material.color.set(color);
    m.material.opacity = 1;
    m.visible = true;
  }

  takeHole() {
    const g = this.holePool.find((h) => !h.userData.used);
    if (!g) return null;
    g.userData.used = true;
    g.visible = true;
    return g;
  }

  releaseHole(g) {
    g.userData.used = false;
    g.visible = false;
  }

  drawHole(g, pos, radius, grow, t) {
    const u = g.userData;
    g.position.copy(pos);
    const r = 0.55 * grow * (1 + 0.06 * Math.sin(t * 20));
    u.core.scale.setScalar(Math.max(0.001, r));
    u.halo.scale.setScalar(Math.max(0.001, r * (1.5 + 0.2 * Math.sin(t * 9))));
    u.disk.scale.setScalar(Math.max(0.001, grow * radius * 0.42));
    u.disk.rotation.z = t * 2.4;
    u.disk.material.uniforms.uT.value = t;
    u.disk.material.uniforms.uA.value = grow;
  }

  orbitalMark(cx, cz, left, time) {
    const g = this.marks[this.markUsed++];
    if (!g) return;
    g.visible = true;
    g.position.set(cx, 0.06, cz);
    const pulse = 1 + 0.25 * Math.sin(time * (14 + (1.5 - Math.min(1.5, left)) * 20));
    g.userData.ring.scale.setScalar(pulse * (1 + left * 1.6));
    g.userData.ring.material.opacity = 0.9;
    g.userData.sight.material.opacity = 0.18 + 0.3 * (1 - Math.min(1, left / 1.5));
  }

  number(p, value, style) {
    this.numbers.spawn(p, value, style);
  }

  clear() {
    this.d.n = 0;
    this.o.n = 0;
    this.sd.n = 0;
    this.sg.n = 0;
    this.st.n = 0;
    for (const w of this.waves) w.t = w.max;
    for (const o of this.beams) o.t = o.max;
    for (const n of this.numbers.list) n.on = false;
    this.trauma = 0;
  }

  addShake(t) { this.trauma = Math.min(1, this.trauma + t); }

  update(dt, camera) {
    this.time += dt;
    this.recoil *= Math.exp(-dt * 12);
    for (let i = this.markUsed; i < this.marks.length; i++) this.marks[i].visible = false;
    this.markUsed = 0;
    for (const w of this.waves) {
      if (w.t >= w.max) { w.m.visible = false; continue; }
      w.t += dt;
      const k = Math.min(1, w.t / w.max);
      const e = 1 - Math.pow(1 - k, 3);
      w.m.scale.setScalar(Math.max(0.01, w.r * 2 * e));
      if (camera) w.m.quaternion.copy(camera.quaternion);
      w.m.material.uniforms.uA.value = 1 - k;
      w.m.material.uniforms.uT.value = k;
    }
    for (const o of this.beams) {
      if (o.t >= o.max) { o.m.visible = false; continue; }
      o.t += dt;
      const k = Math.min(1, o.t / o.max);
      const w = o.w * (1 - k * k);
      o.m.scale.x = o.m.scale.z = Math.max(0.001, w);
      o.m.material.opacity = 1 - k;
    }
    const d = this.d;
    for (let i = 0; i < d.n; i++) {
      d.life[i] -= dt;
      if (d.life[i] <= 0) {
        const j = --d.n;
        for (const arr of [d.pos, d.vel, d.rot, d.av, d.col]) { arr[i * 3] = arr[j * 3]; arr[i * 3 + 1] = arr[j * 3 + 1]; arr[i * 3 + 2] = arr[j * 3 + 2]; }
        d.life[i] = d.life[j]; d.max[i] = d.max[j]; d.size[i] = d.size[j];
        i--;
        continue;
      }
      d.vel[i * 3 + 1] -= 18 * dt;
      d.pos[i * 3] += d.vel[i * 3] * dt;
      d.pos[i * 3 + 1] += d.vel[i * 3 + 1] * dt;
      d.pos[i * 3 + 2] += d.vel[i * 3 + 2] * dt;
      const s = d.size[i] * Math.min(1, d.life[i] / (d.max[i] * 0.35));
      if (d.pos[i * 3 + 1] < s * 0.5) {
        d.pos[i * 3 + 1] = s * 0.5;
        d.vel[i * 3 + 1] *= -0.35;
        d.vel[i * 3] *= 0.6; d.vel[i * 3 + 2] *= 0.6;
        d.av[i * 3] *= 0.6; d.av[i * 3 + 2] *= 0.6;
      }
      d.rot[i * 3] += d.av[i * 3] * dt; d.rot[i * 3 + 1] += d.av[i * 3 + 1] * dt; d.rot[i * 3 + 2] += d.av[i * 3 + 2] * dt;
      tq.setFromEuler(te.set(d.rot[i * 3], d.rot[i * 3 + 1], d.rot[i * 3 + 2]));
      tm.compose(tv.set(d.pos[i * 3], d.pos[i * 3 + 1], d.pos[i * 3 + 2]), tq, ts.setScalar(s));
      tm.toArray(this.debris.instanceMatrix.array, i * 16);
      this.debris.instanceColor.array[i * 3] = d.col[i * 3];
      this.debris.instanceColor.array[i * 3 + 1] = d.col[i * 3 + 1];
      this.debris.instanceColor.array[i * 3 + 2] = d.col[i * 3 + 2];
    }
    this.debris.count = d.n;
    this.debris.instanceMatrix.needsUpdate = true;
    this.debris.instanceColor.needsUpdate = true;

    const o = this.o;
    for (let i = 0; i < o.n; i++) {
      o.life[i] -= dt;
      if (o.life[i] <= 0) {
        const j = --o.n;
        for (const arr of [o.pos, o.vel, o.col]) { arr[i * 3] = arr[j * 3]; arr[i * 3 + 1] = arr[j * 3 + 1]; arr[i * 3 + 2] = arr[j * 3 + 2]; }
        o.life[i] = o.life[j]; o.max[i] = o.max[j]; o.size[i] = o.size[j];
        i--;
        continue;
      }
      const k = Math.exp(-dt * 5);
      o.vel[i * 3] *= k; o.vel[i * 3 + 1] *= k; o.vel[i * 3 + 2] *= k;
      o.pos[i * 3] += o.vel[i * 3] * dt; o.pos[i * 3 + 1] += o.vel[i * 3 + 1] * dt; o.pos[i * 3 + 2] += o.vel[i * 3 + 2] * dt;
      const t = 1 - o.life[i] / o.max[i];
      const s = o.size[i] * (t < 0.25 ? t / 0.25 : 1 - (t - 0.25) / 0.75 * 0.9) * 1.6;
      tm.compose(tv.set(o.pos[i * 3], o.pos[i * 3 + 1], o.pos[i * 3 + 2]), tq.identity(), ts.setScalar(Math.max(0.001, s)));
      tm.toArray(this.orbs.instanceMatrix.array, i * 16);
      this.orbs.instanceColor.array[i * 3] = o.col[i * 3];
      this.orbs.instanceColor.array[i * 3 + 1] = o.col[i * 3 + 1];
      this.orbs.instanceColor.array[i * 3 + 2] = o.col[i * 3 + 2];
    }
    this.orbs.count = o.n;
    this.orbs.instanceMatrix.needsUpdate = true;
    this.orbs.instanceColor.needsUpdate = true;

    this.updateSoft(this.sd, this.dust, dt);
    this.updateSoft(this.sg, this.glow, dt);
    this.updateSoft(this.st, this.trailPts, dt);

    this.numbers.update(dt);

    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    const sh = this.trauma * this.trauma;
    const tt = this.time * 30;
    this.shake.set(
      (Math.sin(tt * 1.1) + Math.sin(tt * 2.3 + 1)) * 0.5 * sh * 0.05,
      (Math.sin(tt * 1.3 + 2) + Math.sin(tt * 2.9)) * 0.5 * sh * 0.05,
      Math.sin(tt * 1.7 + 4) * sh * 0.03,
    );
  }

  updateSoft(st, pts, dt) {
    const geo = pts.geometry;
    const P = geo.attributes.position.array, S = geo.attributes.aSize.array, A = geo.attributes.aAlpha.array, Cc = geo.attributes.aColor.array;
    for (let i = 0; i < st.n; i++) {
      st.life[i] -= dt;
      if (st.life[i] <= 0) {
        const j = --st.n;
        for (const arr of [st.pos, st.vel, st.col]) { arr[i * 3] = arr[j * 3]; arr[i * 3 + 1] = arr[j * 3 + 1]; arr[i * 3 + 2] = arr[j * 3 + 2]; }
        for (const arr of [st.life, st.max, st.size0, st.size1, st.a0, st.drag, st.grav]) arr[i] = arr[j];
        i--;
        continue;
      }
      const k = Math.exp(-dt * st.drag[i]);
      st.vel[i * 3] *= k; st.vel[i * 3 + 1] = st.vel[i * 3 + 1] * k - st.grav[i] * dt; st.vel[i * 3 + 2] *= k;
      st.pos[i * 3] += st.vel[i * 3] * dt; st.pos[i * 3 + 1] += st.vel[i * 3 + 1] * dt; st.pos[i * 3 + 2] += st.vel[i * 3 + 2] * dt;
      const t = 1 - st.life[i] / st.max[i];
      P[i * 3] = st.pos[i * 3]; P[i * 3 + 1] = st.pos[i * 3 + 1]; P[i * 3 + 2] = st.pos[i * 3 + 2];
      S[i] = st.size0[i] + (st.size1[i] - st.size0[i]) * t;
      A[i] = st.a0[i] * (1 - t) * Math.min(1, t * 8 + 0.2);
      Cc[i * 3] = st.col[i * 3]; Cc[i * 3 + 1] = st.col[i * 3 + 1]; Cc[i * 3 + 2] = st.col[i * 3 + 2];
    }
    geo.setDrawRange(0, st.n);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
    geo.attributes.aAlpha.needsUpdate = true;
    geo.attributes.aColor.needsUpdate = true;
  }
}
