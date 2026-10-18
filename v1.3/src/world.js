// Cube Breakers: sky, clouds, rolling hills, grass, wind turbines, trees and sun.

import * as THREE from 'three';
import { mulberry32 } from './rng.js';
import { DOME_R } from './config.js';

const GRASS_TILE = 72;
const GRASS_R = DOME_R + 10;

export const SUN_DIR = new THREE.Vector3(-0.42, 0.78, 0.46).normalize();

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function terrainHeight(x, z) {
  const r = Math.hypot(x, z);
  const t = smooth(DOME_R + 16, DOME_R + 100, r);
  if (t <= 0) return 0;
  const a = Math.sin(x * 0.012 + 1.3) * Math.cos(z * 0.0105 - 0.4);
  const b = Math.sin(x * 0.023 - z * 0.017 + 2.1);
  const c = Math.cos(x * 0.041 + z * 0.035);
  const hills = 16 * (a * 0.5 + 0.5) + 9 * (b * 0.5 + 0.5) + 3 * c;
  return t * Math.max(0, hills) * (0.7 + Math.min(r - DOME_R, 700) / 240);
}

function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color('#1c66d6') },
      uMid: { value: new THREE.Color('#4aa3f2') },
      uHorizon: { value: new THREE.Color('#bfe6ff') },
      uSun: { value: SUN_DIR.clone() },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHorizon; uniform vec3 uSun;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.22, h));
        col = mix(col, uTop, smoothstep(0.2, 0.85, h));
        col = mix(col, uHorizon * 0.95, smoothstep(0.0, -0.25, h));
        float s = max(dot(d, uSun), 0.0);
        col += vec3(1.0, 0.96, 0.86) * (pow(s, 900.0) * 3.0 + pow(s, 60.0) * 0.35 + pow(s, 6.0) * 0.08);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), mat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  return sky;
}

function makeClouds() {
  const W = 2048, H = 512;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const rnd = mulberry32(77);
  const puff = (x, y, r, a) => {
    for (const ox of [-W, 0, W]) {
      const g = ctx.createRadialGradient(x + ox, y, 0, x + ox, y, r);
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(0.55, `rgba(255,255,255,${a * 0.85})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x + ox, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  ctx.save();
  ctx.scale(1, 1.55);
  for (let c = 0; c < 26; c++) {
    const cx = rnd() * W;
    const v = Math.pow(rnd(), 0.6);
    const cy = (H / 1.55) * (0.25 + 0.7 * v);
    const size = 30 + 70 * v * (0.5 + rnd());
    const blobs = 10 + Math.floor(rnd() * 16);
    for (let b = 0; b < blobs; b++) {
      const bx = cx + (rnd() - 0.5) * size * 3.2;
      const by = cy - Math.abs(rnd() - 0.5) * size * 0.9;
      puff(bx, by, size * (0.45 + rnd() * 0.6), 0.55 + rnd() * 0.3);
    }
  }
  ctx.restore();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  const geo = new THREE.SphereGeometry(1300, 64, 12, 0, Math.PI * 2, THREE.MathUtils.degToRad(52), THREE.MathUtils.degToRad(37));
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, side: THREE.BackSide, opacity: 0.95 });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = -9;
  m.frustumCulled = false;
  return m;
}

function makeTerrain() {
  const size = 2600, seg = 340;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c0 = new THREE.Color('#3f9a24');
  const c1 = new THREE.Color('#79c935');
  const c2 = new THREE.Color('#2f7f1d');
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    const n = Math.sin(x * 0.11 + z * 0.07) * 0.5 + Math.sin(x * 0.031 - z * 0.05) * 0.5;
    const r = Math.hypot(x, z);
    tmp.copy(c0).lerp(c1, Math.min(1, h / 38) * 0.8 + n * 0.08 + 0.08);
    if (r < GRASS_R) tmp.lerp(c2, 0.35 * Math.min(1, (GRASS_R - r) / 8));
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

function makeGrassMaterial() {
  const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  const uniforms = { uTime: { value: 0 }, uPlayer: { value: new THREE.Vector3(0, -99, 0) }, uTile: { value: GRASS_TILE }, uMaxR: { value: GRASS_R }, uHoles: { value: [new THREE.Vector4(-12, 51.8, 12, 68.2), new THREE.Vector4(-3.4, 35.5, 3.4, 45.4), new THREE.Vector4(-21.4, 50.6, -14.6, 59.4)] } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform vec3 uPlayer; uniform float uTile; uniform float uMaxR; uniform vec4 uHoles[3];
        attribute vec4 aOff; attribute float aTint;
        varying float vH; varying float vTint;`)
      .replace('#include <beginnormal_vertex>', `vec3 objectNormal = vec3(0.0, 1.0, 0.0);
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3(1.0, 0.0, 0.0);
        #endif`)
      .replace('#include <begin_vertex>', `
        vec3 transformed = position;
        float bh = aOff.z;
        vec2 wp = aOff.xy + uTile * floor((cameraPosition.xz - aOff.xy) / uTile + 0.5);
        float camD = distance(wp, cameraPosition.xz);
        float keep = clamp(1.3 - camD / 18.0, 0.2, 1.0);
        float hsh = fract(sin(dot(aOff.xy, vec2(12.9898, 78.233))) * 43758.5453);
        float alive = step(hsh, keep);
        float fade = (1.0 - smoothstep(uTile * 0.5 - 9.0, uTile * 0.5 - 1.0, camD)) * (1.0 - smoothstep(uMaxR - 4.0, uMaxR, length(wp)));
        alive *= step(0.02, fade);
        for (int h = 0; h < 3; h++) {
          vec4 hb = uHoles[h];
          alive *= 1.0 - step(hb.x, wp.x) * step(wp.x, hb.z) * step(hb.y, wp.y) * step(wp.y, hb.w);
        }
        transformed.x *= alive * (1.0 + (1.0 - keep) * 1.5);
        transformed.y *= bh * alive * fade;
        float ca = cos(aOff.w), sa = sin(aOff.w);
        transformed.xz = vec2(ca * transformed.x - sa * transformed.z, sa * transformed.x + ca * transformed.z);
        float k = position.y * position.y;
        float w = sin(uTime * 1.5 + wp.x * 0.19 + wp.y * 0.13) * 0.55 + sin(uTime * 2.9 + wp.x * 0.6 - wp.y * 0.4) * 0.18;
        vec2 wind = vec2(0.75, 0.38) * (w + 0.55) * 0.22 * bh;
        vec2 dd = wp - uPlayer.xz;
        float dl = length(dd);
        float near = (1.0 - smoothstep(0.0, 1.25, dl)) * (1.0 - smoothstep(0.6, 2.0, abs(uPlayer.y)));
        vec2 push = normalize(dd + vec2(1e-4)) * near * 0.7;
        transformed.xz += (wind + push) * k * alive;
        transformed.y -= near * k * 0.3 * bh * alive;
        transformed.x += wp.x;
        transformed.z += wp.y;
        vH = position.y;
        vTint = aTint;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vH; varying float vTint;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 gBase = vec3(0.055, 0.2, 0.03);
        vec3 gTip = mix(vec3(0.36, 0.72, 0.12), vec3(0.55, 0.82, 0.16), vTint);
        diffuseColor.rgb = mix(gBase, gTip, smoothstep(0.0, 1.0, vH)) * (0.88 + 0.24 * vTint);`);
  };
  mat.userData.uniforms = uniforms;
  return mat;
}

function makeGrass(count, tile, mat) {
  const verts = new Float32Array([
    -0.045, 0, 0, 0.045, 0, 0,
    -0.034, 0.34, 0, 0.034, 0.34, 0,
    -0.02, 0.68, 0, 0.02, 0.68, 0,
    0, 1, 0,
  ]);
  const idx = [0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4, 4, 5, 6];
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(21).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setIndex(idx);
  const off = new Float32Array(count * 4);
  const tint = new Float32Array(count);
  const rnd = mulberry32(1234);
  for (let i = 0; i < count; i++) {
    off[i * 4] = (rnd() - 0.5) * tile;
    off[i * 4 + 1] = (rnd() - 0.5) * tile;
    off[i * 4 + 2] = 0.32 + rnd() * 0.42;
    off[i * 4 + 3] = rnd() * Math.PI * 2;
    tint[i] = rnd();
  }
  geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
  geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 1));
  geo.instanceCount = count;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

function makeTurbine(mat) {
  const g = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 1.05, 40, 14), mat);
  tower.position.y = 20;
  g.add(tower);
  const nac = new THREE.Mesh(new THREE.CapsuleGeometry(0.9, 2.6, 4, 10), mat);
  nac.rotation.x = Math.PI / 2;
  nac.position.set(0, 40.6, 0.4);
  g.add(nac);
  const rotor = new THREE.Group();
  rotor.position.set(0, 40.6, 2.4);
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 8), mat);
  rotor.add(hub);
  const bladeGeo = new THREE.BoxGeometry(1, 17, 0.22);
  bladeGeo.translate(0, 9, 0);
  const bp = bladeGeo.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const y = bp.getY(i);
    bp.setX(i, bp.getX(i) * (1.15 - y / 22));
  }
  bladeGeo.computeVertexNormals();
  for (let b = 0; b < 3; b++) {
    const bl = new THREE.Mesh(bladeGeo, mat);
    bl.rotation.z = (b / 3) * Math.PI * 2;
    rotor.add(bl);
  }
  g.add(rotor);
  g.userData.rotor = rotor;
  return g;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    scene.fog = new THREE.Fog('#b4ddff', 260, 1250);
    this.sky = makeSky();
    scene.add(this.sky);
    this.clouds = makeClouds();
    scene.add(this.clouds);
    this.terrain = makeTerrain();
    scene.add(this.terrain);

    this.hemi = new THREE.HemisphereLight('#cfe9ff', '#4f8a2c', 0.95);
    scene.add(this.hemi);
    const sun = new THREE.DirectionalLight('#fff5e6', 2.45);
    sun.position.copy(SUN_DIR).multiplyScalar(130).add(new THREE.Vector3(0, 0, 26));
    sun.target.position.set(0, 0, 26);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = sun.shadow.camera;
    s.left = -54; s.right = 54; s.top = 54; s.bottom = -54; s.near = 20; s.far = 260;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.035;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;

    this.grassMat = makeGrassMaterial();
    this.grass = null;
    this.setGrass('medium');

    const white = new THREE.MeshStandardMaterial({ color: '#f4f8fb', roughness: 0.55 });
    this.turbines = [];
    const spots = [[-0.55, 330], [-0.25, 410], [0.12, 450], [0.42, 360], [0.75, 430], [1.2, 350], [2.3, 400], [2.75, 340], [3.6, 380], [4.4, 440], [5.1, 360], [1.75, 470]];
    const rnd = mulberry32(9);
    for (const [ang, r] of spots) {
      const t = makeTurbine(white);
      const x = Math.sin(ang + Math.PI) * r, z = Math.cos(ang + Math.PI) * r;
      t.position.set(x, terrainHeight(x, z) - 1, z);
      t.rotation.y = 0.5 + rnd() * 0.4;
      t.userData.speed = 0.5 + rnd() * 0.45;
      t.userData.rotor.rotation.z = rnd() * 6;
      scene.add(t);
      this.turbines.push(t);
    }

    const canopyGeo = new THREE.IcosahedronGeometry(1, 2);
    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 1, 6);
    const canopy = new THREE.InstancedMesh(canopyGeo, new THREE.MeshLambertMaterial({ color: '#3d9a2c' }), 70);
    const trunk = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: '#7a5a3a' }), 70);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const tc = new THREE.Color();
    for (let i = 0; i < 70; i++) {
      const ang = rnd() * Math.PI * 2, r = DOME_R + 30 + rnd() * 260;
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
      const y = terrainHeight(x, z);
      const k = 2.6 + rnd() * 3.2;
      m.compose(v.set(x, y + k * 0.6, z), q, sc.set(0.9 * k, k * 1.2, 0.9 * k));
      trunk.setMatrixAt(i, m);
      m.compose(v.set(x, y + k * 1.75, z), q, sc.set(k, k * 0.95, k));
      canopy.setMatrixAt(i, m);
      canopy.setColorAt(i, tc.set('#3d9a2c').offsetHSL((rnd() - 0.5) * 0.04, 0, (rnd() - 0.5) * 0.08));
    }
    scene.add(canopy, trunk);
  }

  setGrass(level) {
    const counts = { off: 0, low: 45000, medium: 85000, high: 150000 };
    if (this.grass) {
      this.scene.remove(this.grass);
      this.grass.geometry.dispose();
      this.grass = null;
    }
    const c = counts[level] ?? counts.medium;
    if (c > 0) {
      this.grass = makeGrass(c, GRASS_TILE, this.grassMat);
      this.scene.add(this.grass);
    }
  }

  update(dt, time, playerFeet, camPos) {
    this.sky.position.copy(camPos);
    this.clouds.position.copy(camPos);
    this.grassMat.userData.uniforms.uTime.value = time;
    this.grassMat.userData.uniforms.uPlayer.value.copy(playerFeet);
    this.clouds.rotation.y += dt * 0.0035;
    for (const t of this.turbines) t.userData.rotor.rotation.z += dt * t.userData.speed;
  }
}
