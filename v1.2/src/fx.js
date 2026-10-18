// Cube Breakers: debris, explosion orbs, soft particles, floating damage numbers and camera shake.

import * as THREE from 'three';
import { Numbers } from './numbers.js';

const DEBRIS = 900;
const ORBS = 160;
const SOFT = 700;
const tm = new THREE.Matrix4();
const tq = new THREE.Quaternion();
const te = new THREE.Euler();
const tv = new THREE.Vector3();
const ts = new THREE.Vector3();
const tc = new THREE.Color();

function softPoints(additive) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SOFT * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(SOFT), 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(SOFT), 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(SOFT * 3), 3).setUsage(THREE.DynamicDrawUsage));
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
    scene.add(this.dust, this.glow);
    this.sd = this.makeSoftState();
    this.sg = this.makeSoftState();

    this.numbers = new Numbers(scene);
    this.trauma = 0;
    this.shake = new THREE.Vector3();
    this.time = 0;
  }

  makeSoftState() {
    return { n: 0, pos: new Float32Array(SOFT * 3), vel: new Float32Array(SOFT * 3), life: new Float32Array(SOFT), max: new Float32Array(SOFT), size0: new Float32Array(SOFT), size1: new Float32Array(SOFT), col: new Float32Array(SOFT * 3), a0: new Float32Array(SOFT), drag: new Float32Array(SOFT), grav: new Float32Array(SOFT) };
  }

  setScale(h, cssH, bufH) {
    this.dust.material.uniforms.uScale.value = h * 0.5;
    this.glow.material.uniforms.uScale.value = h * 0.5;
    this.dust.material.uniforms.uMax.value = bufH * 0.16;
    this.glow.material.uniforms.uMax.value = bufH * 0.22;
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
      let i = state.n < SOFT ? state.n++ : Math.floor(Math.random() * SOFT);
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

  number(p, value, style) {
    this.numbers.spawn(p, value, style);
  }

  clear() {
    this.d.n = 0;
    this.o.n = 0;
    this.sd.n = 0;
    this.sg.n = 0;
    for (const n of this.numbers.list) n.on = false;
    this.trauma = 0;
  }

  addShake(t) { this.trauma = Math.min(1, this.trauma + t); }

  update(dt) {
    this.time += dt;
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
