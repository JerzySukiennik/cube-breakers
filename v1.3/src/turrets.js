// Cube Breakers: team Auto-Shooters (placement preview, loading 50 balls per E, auto-aim at the best block, rapid fire until empty).

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BALL_TYPES, TURRET, PLAY_R } from './config.js';

const tv = new THREE.Vector3();
const tw = new THREE.Vector3();
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const NO_GO = [[-8, 35, 8, 50], [-14, 50, 14, 70], [12, 49, 24.5, 62], [-23.5, 49, -12.5, 62]];

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

let shared = null;
function parts() {
  if (shared) return shared;
  shared = {
    leg: new THREE.CylinderGeometry(0.07, 0.09, 1.25, 10),
    hub: new THREE.CylinderGeometry(0.42, 0.5, 0.3, 24),
    body: new RoundedBoxGeometry(0.7, 0.55, 0.85, 3, 0.16),
    barrel: new THREE.CylinderGeometry(0.15, 0.15, 1.2, 20, 1, true),
    ring: new THREE.TorusGeometry(0.16, 0.045, 10, 24),
    hopper: new THREE.SphereGeometry(0.38, 24, 16),
    fill: new THREE.SphereGeometry(0.33, 20, 14),
    white: new THREE.MeshPhysicalMaterial({ color: '#f4f8fc', roughness: 0.3, clearcoat: 0.8 }),
    blue: new THREE.MeshPhysicalMaterial({ color: '#2f8ff0', roughness: 0.25, clearcoat: 1 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#bfe9ff', roughness: 0.04, clearcoat: 1, transparent: true, opacity: 0.32, depthWrite: false }),
  };
  return shared;
}

export function turretModel(ghost) {
  const P = parts();
  const g = new THREE.Group();
  const mat = (m) => (ghost ? ghost : m);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(P.leg, mat(P.white));
    leg.position.set(Math.cos(a) * 0.42, 0.55, Math.sin(a) * 0.42);
    leg.rotation.set(Math.sin(a) * 0.38, 0, -Math.cos(a) * 0.38);
    leg.castShadow = !ghost;
    g.add(leg);
  }
  const hub = new THREE.Mesh(P.hub, mat(P.blue));
  hub.position.y = 1.15;
  g.add(hub);
  const yaw = new THREE.Group();
  yaw.position.y = 1.45;
  g.add(yaw);
  const pitch = new THREE.Group();
  yaw.add(pitch);
  const body = new THREE.Mesh(P.body, mat(P.white));
  body.castShadow = !ghost;
  pitch.add(body);
  const barrel = new THREE.Mesh(P.barrel, mat(P.glass));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = -0.75;
  barrel.renderOrder = 2;
  pitch.add(barrel);
  for (const z of [-0.55, -0.95, -1.3]) {
    const ring = new THREE.Mesh(P.ring, mat(P.blue));
    ring.position.z = z;
    pitch.add(ring);
  }
  const hopper = new THREE.Mesh(P.hopper, mat(P.glass));
  hopper.position.set(0, 0.48, 0.15);
  hopper.renderOrder = 2;
  pitch.add(hopper);
  const fillMat = new THREE.MeshPhysicalMaterial({ color: '#2f9bff', roughness: 0.15, clearcoat: 1 });
  const fill = new THREE.Mesh(P.fill, ghost ? ghost : fillMat);
  fill.position.copy(hopper.position);
  pitch.add(fill);
  const muzzle = new THREE.Object3D();
  muzzle.position.z = -1.45;
  pitch.add(muzzle);
  return { g, yaw, pitch, fill, fillMat, muzzle };
}

export class Turrets {
  constructor(scene) {
    this.scene = scene;
    this.map = new Map();
    this.items = [];
    this.ghostMat = new THREE.MeshBasicMaterial({ color: '#46d65a', transparent: true, opacity: 0.45, depthWrite: false });
    this.preview = turretModel(this.ghostMat);
    this.preview.g.visible = false;
    scene.add(this.preview.g);
    this.audio = null;
    this.fx = null;
    this.soundT = 0;
  }

  labelTex(t) {
    const cv = t.label.material.map.image;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, 512, 128);
    ctx.fillStyle = 'rgba(15, 39, 71, 0.62)';
    rr(ctx, 16, 14, 480, 100, 50);
    ctx.fill();
    const cfg = BALL_TYPES[t.type] || BALL_TYPES[0];
    ctx.textBaseline = 'middle';
    if (t.n > 0) {
      ctx.fillStyle = cfg.color;
      ctx.beginPath(); ctx.arc(70, 64, 26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = "900 46px Nunito, sans-serif";
      ctx.fillText(`${fmt(t.n)} ${cfg.name}${t.n === 1 ? '' : 's'}`, 112, 66, 370);
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.font = "900 44px Nunito, sans-serif";
      ctx.textAlign = 'center';
      ctx.fillText('EMPTY · E to load', 256, 66, 450);
      ctx.textAlign = 'left';
    }
    t.label.material.map.needsUpdate = true;
  }

  make(id, rec) {
    const m = turretModel(null);
    m.g.position.set(rec.x, 0, rec.z);
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 128;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
    label.scale.set(2.2, 0.55, 1);
    label.position.y = 2.55;
    label.renderOrder = 8;
    m.g.add(label);
    this.scene.add(m.g);
    const t = { id, ...m, label, x: rec.x, z: rec.z, type: rec.t || 0, n: rec.n || 0, acc: 0, aimT: 0, target: new THREE.Vector3(0, 6, 0), has: false, yawA: 0, pitchA: 0, labelKey: '' };
    t.item = { kind: 'turret', id, node: m.g, pos: new THREE.Vector3(rec.x, 1.45, rec.z), r: 1.1, noScale: true };
    this.items.push(t.item);
    return t;
  }

  sync(recs) {
    for (const [id, rec] of Object.entries(recs || {})) {
      if (!rec) continue;
      let t = this.map.get(id);
      if (!t) { t = this.make(id, rec); this.map.set(id, t); }
      t.type = rec.t || 0;
      t.n = Math.max(0, rec.n || 0);
    }
    for (const [id, t] of this.map) {
      if (recs && recs[id]) continue;
      this.scene.remove(t.g);
      this.items.splice(this.items.indexOf(t.item), 1);
      this.map.delete(id);
    }
  }

  valid(p, game) {
    const r = Math.hypot(p.x, p.z);
    if (r < 14 || r > PLAY_R - 4) return false;
    for (const [x0, z0, x1, z1] of NO_GO) if (p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1) return false;
    for (const t of this.map.values()) if (Math.hypot(t.x - p.x, t.z - p.z) < 3) return false;
    return true;
  }

  showPreview(p, ok, time) {
    const g = this.preview.g;
    g.visible = !!p;
    if (!p) return;
    g.position.copy(p);
    this.ghostMat.color.set(ok ? '#46d65a' : '#9aa6b5');
    this.ghostMat.opacity = 0.35 + 0.15 * Math.sin(time * 6);
    this.preview.yaw.rotation.y = Math.atan2(p.x, p.z);
  }

  left(t, net) {
    return Math.max(0, t.n - (net ? net.turretPend.get(t.id) || 0 : 0));
  }

  update(dt, game, progress, net, real) {
    this.soundT -= dt;
    for (const t of this.map.values()) {
      const n = this.left(t, net);
      const key = t.type + ':' + n;
      if (key !== t.labelKey) { t.labelKey = key; t.n = n === t.n ? t.n : t.n; this.labelTex({ label: t.label, type: t.type, n }); }
      const cfg = BALL_TYPES[t.type] || BALL_TYPES[0];
      t.fillMat.color.set(cfg.color);
      const f = Math.min(1, n / 120);
      t.fill.scale.setScalar(Math.max(0.001, 0.25 + 0.75 * Math.cbrt(f)) * (n > 0 ? 1 : 0.001));
      t.muzzle.getWorldPosition(tv);
      if (n > 0) {
        t.aimT -= dt;
        if (t.aimT <= 0) {
          t.aimT = 0.3;
          t.has = game.pickTarget(tv, t.target);
        }
      }
      tw.copy(t.has ? t.target : tv.set(0, 6, 0)).sub(t.g.position);
      const yawT = Math.atan2(-tw.x, -tw.z);
      const pitchT = Math.atan2(tw.y - 1.45, Math.hypot(tw.x, tw.z));
      let dy = yawT - t.yawA;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      t.yawA += dy * Math.min(1, dt * 14);
      t.pitchA += (pitchT - t.pitchA) * Math.min(1, dt * 14);
      t.yaw.rotation.y = t.yawA;
      t.pitch.rotation.x = t.pitchA;
      if (n <= 0 || !t.has || game.growT < 1) { t.acc = 0; continue; }
      t.acc += dt * TURRET.rate;
      let shots = 0;
      while (t.acc >= 1 && shots < 4 && this.left(t, net) > (real ? 0 : -1)) {
        t.acc -= 1;
        shots++;
        t.muzzle.getWorldPosition(tv);
        tw.copy(t.target).sub(tv).normalize();
        tw.x += (Math.random() - 0.5) * 0.03; tw.y += (Math.random() - 0.5) * 0.03; tw.z += (Math.random() - 0.5) * 0.03;
        game.turretFire({ id: t.id, type: t.type }, tv, tw.normalize(), real);
        if (real) {
          progress.turretUse(t.id, 1);
          if (!net) t.n = Math.max(0, t.n - 1);
        }
        t.pitch.position.z = 0.12;
      }
      t.pitch.position.z *= Math.exp(-dt * 20);
      if (shots && this.audio && this.soundT <= 0) {
        this.soundT = 0.07;
        this.audio.play('tshot', { pos: t.g.position, range: 70, vol: 0.55, rate: 1 + Math.random() * 0.2 });
      }
      if (shots && this.fx) this.fx.flashGlow(tv, cfg.color, 0.45);
    }
  }
}
