// Cube Breakers: floating damage numbers as GPU billboards from a glyph atlas (no DOM).

import * as THREE from 'three';

const GLYPHS = '0123456789k.';
const CELL_W = 84;
const CELL_H = 120;
const MAX_NUMS = 120;
const MAX_GLYPHS = MAX_NUMS * 5;
const TINTS = {
  '': new THREE.Color('#ffffff'),
  ice: new THREE.Color('#c4f1ff'),
  gold: new THREE.Color('#ffd84a'),
  boom: new THREE.Color('#fff0b0'),
  crit: new THREE.Color('#ffb02e'),
  tox: new THREE.Color('#9dff7a'),
  hole: new THREE.Color('#d9b8ff'),
};

function buildAtlas() {
  const cv = document.createElement('canvas');
  cv.width = CELL_W * GLYPHS.length;
  cv.height = CELL_H;
  const ctx = cv.getContext('2d');
  ctx.font = "italic 900 92px Nunito, 'Arial Black', sans-serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const widths = [];
  for (let i = 0; i < GLYPHS.length; i++) {
    const ch = GLYPHS[i];
    const cx = i * CELL_W + CELL_W / 2, cy = CELL_H / 2 + 4;
    ctx.lineWidth = 13;
    ctx.strokeStyle = '#14284a';
    ctx.strokeText(ch, cx, cy);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(ch, cx, cy);
    widths.push((ctx.measureText(ch).width + 6) / CELL_H);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  return { tex, widths };
}

export class Numbers {
  constructor(scene) {
    const atlas = buildAtlas();
    this.widths = atlas.widths;
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX_GLYPHS * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aGlyph = new THREE.InstancedBufferAttribute(new Float32Array(MAX_GLYPHS * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aTint = new THREE.InstancedBufferAttribute(new Float32Array(MAX_GLYPHS * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aPos', this.aPos);
    geo.setAttribute('aGlyph', this.aGlyph);
    geo.setAttribute('aTint', this.aTint);
    geo.instanceCount = 0;
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: { uMap: { value: atlas.tex }, uCell: { value: 1 / GLYPHS.length }, uAspect: { value: CELL_W / CELL_H }, uK: { value: 0.05 } },
      vertexShader: `
        attribute vec3 aPos; attribute vec4 aGlyph; attribute vec3 aTint;
        uniform float uCell; uniform float uAspect; uniform float uK;
        varying vec2 vUv; varying float vA; varying vec3 vTint;
        void main() {
          vec4 mv = viewMatrix * vec4(aPos, 1.0);
          float z = max(0.5, -mv.z);
          float s = aGlyph.z * z * uK * mix(1.0, 0.68, smoothstep(6.0, 30.0, z));
          mv.xy += vec2(position.x * uAspect + aGlyph.y, position.y) * s;
          gl_Position = projectionMatrix * mv;
          vUv = vec2((aGlyph.x + position.x + 0.5) * uCell, position.y + 0.5);
          vA = aGlyph.w;
          vTint = aTint;
        }`,
      fragmentShader: `
        uniform sampler2D uMap;
        varying vec2 vUv; varying float vA; varying vec3 vTint;
        void main() {
          vec4 t = texture2D(uMap, vUv);
          float a = t.a * vA;
          if (a < 0.01) discard;
          gl_FragColor = vec4(t.rgb * vTint, a);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    scene.add(this.mesh);
    this.list = [];
    for (let i = 0; i < MAX_NUMS; i++) this.list.push({ on: false, pos: new THREE.Vector3(), vy: 0, life: 0, max: 1, scale: 1, text: '', tint: TINTS[''] });
    this.next = 0;
  }

  setViewport(h) {
    this.mesh.material.uniforms.uK.value = 0.05 * Math.min(1.25, Math.max(0.75, 800 / Math.max(400, h)));
  }

  spawn(p, value, style) {
    const n = this.list[this.next];
    this.next = (this.next + 1) % MAX_NUMS;
    n.on = true;
    n.pos.set(p.x + (Math.random() - 0.5) * 0.3, p.y + (Math.random() - 0.5) * 0.2, p.z + (Math.random() - 0.5) * 0.3);
    n.vy = 1.3 + Math.random() * 0.5;
    n.max = n.life = 0.85;
    n.scale = (value >= 1000 ? 1.45 : value >= 100 ? 1.2 : 1) * (style === 'crit' ? 1.45 : 1);
    if (style === 'crit') { n.vy += 0.8; n.max = n.life = 1.05; }
    n.text = value >= 10000 ? (value / 1000).toFixed(1) + 'k' : String(Math.round(value));
    n.tint = TINTS[style || ''] || TINTS[''];
  }

  update(dt) {
    const P = this.aPos.array, G = this.aGlyph.array, T = this.aTint.array;
    let k = 0;
    for (const n of this.list) {
      if (!n.on) continue;
      n.life -= dt;
      if (n.life <= 0) { n.on = false; continue; }
      n.pos.y += n.vy * dt;
      n.vy *= Math.exp(-dt * 2);
      const t = 1 - n.life / n.max;
      const pop = t < 0.12 ? 0.6 + (t / 0.12) * 0.55 : 1.15 - Math.min(0.15, (t - 0.12) * 0.6);
      const sc = pop * n.scale;
      const alpha = Math.min(1, n.life / 0.3);
      let width = 0;
      for (let c = 0; c < n.text.length; c++) width += this.widths[GLYPHS.indexOf(n.text[c])];
      let x = -width / 2;
      for (let c = 0; c < n.text.length && k < MAX_GLYPHS; c++) {
        const gi = GLYPHS.indexOf(n.text[c]);
        const w = this.widths[gi];
        P[k * 3] = n.pos.x; P[k * 3 + 1] = n.pos.y; P[k * 3 + 2] = n.pos.z;
        G[k * 4] = gi; G[k * 4 + 1] = x + w / 2; G[k * 4 + 2] = sc; G[k * 4 + 3] = alpha;
        T[k * 3] = n.tint.r; T[k * 3 + 1] = n.tint.g; T[k * 3 + 2] = n.tint.b;
        x += w * 0.92;
        k++;
      }
    }
    this.geo.instanceCount = k;
    if (k) {
      this.aPos.needsUpdate = true;
      this.aGlyph.needsUpdate = true;
      this.aTint.needsUpdate = true;
    }
  }
}
