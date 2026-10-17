// Cube Breakers: invisible arena dome with hex-shield ripples where balls bounce, plus its ground ring.

import * as THREE from 'three';
import { DOME_R } from './config.js';

const POOL = 28;

export class Dome {
  constructor(scene) {
    this.pool = [];
    const geo = new THREE.PlaneGeometry(7, 7, 1, 1);
    for (let i = 0; i < POOL; i++) {
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uAge: { value: 1 }, uColor: { value: new THREE.Color('#8fe6ff') }, uSeed: { value: Math.random() * 10 } },
        vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
          uniform float uAge; uniform vec3 uColor; uniform float uSeed;
          varying vec2 vUv;
          void main() {
            vec2 p = vUv * 2.0 - 1.0;
            float r = length(p);
            if (r > 1.0) discard;
            vec2 h = p * 5.5 + uSeed;
            vec2 s = vec2(1.0, 1.7320508);
            vec4 hc = floor(vec4(h, h - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
            vec4 hh = vec4(h - hc.xy * s, h - (hc.zw + 0.5) * s);
            vec2 g = dot(hh.xy, hh.xy) < dot(hh.zw, hh.zw) ? hh.xy : hh.zw;
            vec2 ag = abs(g);
            float hd = max(dot(ag, s * 0.5), ag.x);
            float edge = smoothstep(0.4, 0.49, hd);
            float wave = uAge * 1.25;
            float ring = smoothstep(wave - 0.22, wave, r) * (1.0 - smoothstep(wave, wave + 0.06, r));
            float fade = (1.0 - uAge) * (1.0 - smoothstep(0.55, 1.0, r));
            float core = (1.0 - smoothstep(0.0, 0.35, r)) * (1.0 - smoothstep(0.0, 0.4, uAge));
            float a = (edge * 0.55 * (1.0 - smoothstep(wave - 0.1, wave + 0.1, r) * 0.6) + ring * 0.9 + core * 0.6) * fade;
            gl_FragColor = vec4(uColor * a, a);
          }`,
      });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.frustumCulled = false;
      m.renderOrder = 4;
      scene.add(m);
      this.pool.push({ m, age: 1, life: 0.6 });
    }
    this.next = 0;

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(DOME_R - 0.12, DOME_R + 0.12, 256, 1),
      new THREE.MeshBasicMaterial({ color: '#d9f6ff', transparent: true, opacity: 0.55, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    scene.add(ring);
    const glow = new THREE.Mesh(
      new THREE.RingGeometry(DOME_R - 1.2, DOME_R + 1.2, 256, 1),
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uR: { value: DOME_R } },
        vertexShader: `varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform float uR; varying vec3 vP; void main() { float d = abs(length(vP.xy) - uR); float a = (1.0 - smoothstep(0.0, 1.2, d)) * 0.16; gl_FragColor = vec4(vec3(0.7, 0.93, 1.0) * a, a); }`,
      }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.05;
    scene.add(glow);
  }

  hit(p, strength = 1) {
    const f = this.pool[this.next];
    this.next = (this.next + 1) % POOL;
    f.m.position.copy(p).multiplyScalar(0.997);
    f.m.lookAt(0, 0, 0);
    f.m.scale.setScalar(0.6 + 0.5 * Math.min(2, strength));
    f.m.material.uniforms.uSeed.value = Math.random() * 10;
    f.age = 0;
    f.m.visible = true;
  }

  update(dt) {
    for (const f of this.pool) {
      if (!f.m.visible) continue;
      f.age += dt / f.life;
      if (f.age >= 1) { f.m.visible = false; continue; }
      f.m.material.uniforms.uAge.value = f.age;
    }
  }
}
