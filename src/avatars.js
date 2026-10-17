// Cube Breakers: other players as bean figures with a launcher, nick tag and emote bubble.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const PLAYER_COLORS = ['#2f9bff', '#3fcf4e', '#ff9a1f', '#9a6bff', '#ff6fcf', '#ffc531', '#20c7c0', '#f4f7fa'];
export const EMOTES = [
  { key: 'KeyZ', icon: '👋', text: 'Hi!' },
  { key: 'KeyX', icon: '👍', text: 'Nice!' },
  { key: 'KeyC', icon: '😂', text: 'LOL' },
  { key: 'KeyV', icon: '😮', text: 'Whoa' },
  { key: 'KeyB', icon: '🎉', text: 'GG' },
];

const DELAY = 130;
const tv = new THREE.Vector3();

function tagTexture(nick, color) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.font = "900 64px Nunito, sans-serif";
  const w = Math.min(470, ctx.measureText(nick).width + 90);
  const x0 = 256 - w / 2;
  ctx.fillStyle = 'rgba(15, 39, 71, 0.55)';
  ctx.beginPath();
  ctx.roundRect(x0, 20, w, 88, 44);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x0 + 44, 64, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(nick, x0 + 74, 67, w - 90);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const emoteTex = new Map();
function emoteTexture(i) {
  if (emoteTex.has(i)) return emoteTex.get(i);
  const e = EMOTES[i];
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 256;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(16, 16, 224, 188, 60);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(108, 200); ctx.lineTo(128, 240); ctx.lineTo(150, 200);
  ctx.fill();
  ctx.font = '96px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(e.icon, 128, 92);
  ctx.font = "900 40px Nunito, sans-serif";
  ctx.fillStyle = '#1f6fd6';
  ctx.fillText(e.text, 128, 168);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  emoteTex.set(i, t);
  return t;
}

export class Avatars {
  constructor(scene) {
    this.scene = scene;
    this.map = new Map();
    this.bodyGeo = new THREE.CapsuleGeometry(0.36, 1.0, 6, 18);
    this.visorGeo = new RoundedBoxGeometry(0.46, 0.2, 0.2, 3, 0.08);
    this.barrelGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.55, 16);
    this.ringGeo = new THREE.TorusGeometry(0.08, 0.025, 8, 20);
    this.gripGeo = new RoundedBoxGeometry(0.14, 0.18, 0.3, 2, 0.05);
    this.visorMat = new THREE.MeshPhysicalMaterial({ color: '#16233d', roughness: 0.15, clearcoat: 1, envMapIntensity: 1.4 });
    this.whiteMat = new THREE.MeshStandardMaterial({ color: '#f3f6fa', roughness: 0.4 });
    this.greenMat = new THREE.MeshStandardMaterial({ color: '#33d14f', roughness: 0.35 });
    this.capsules = [];
  }

  make(p) {
    const color = PLAYER_COLORS[p.v.c % PLAYER_COLORS.length] || PLAYER_COLORS[0];
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 });
    const body = new THREE.Mesh(this.bodyGeo, bodyMat);
    body.position.y = 0.86;
    body.castShadow = true;
    g.add(body);
    const head = new THREE.Group();
    head.position.y = 1.42;
    g.add(head);
    const visor = new THREE.Mesh(this.visorGeo, this.visorMat);
    visor.position.set(0, 0, -0.3);
    head.add(visor);
    const arm = new THREE.Group();
    arm.position.set(0.32, 1.05, -0.1);
    const grip = new THREE.Mesh(this.gripGeo, this.whiteMat);
    arm.add(grip);
    const barrel = new THREE.Mesh(this.barrelGeo, new THREE.MeshPhysicalMaterial({ color: '#7fd3ff', roughness: 0.1, transparent: true, opacity: 0.7 }));
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.06, -0.3);
    arm.add(barrel);
    const ring = new THREE.Mesh(this.ringGeo, this.greenMat);
    ring.position.set(0, 0.06, -0.52);
    arm.add(ring);
    g.add(arm);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTexture(p.v.n || 'Player', color), depthWrite: false, transparent: true }));
    tag.scale.set(1.6, 0.4, 1);
    tag.position.y = 2.2;
    tag.renderOrder = 8;
    g.add(tag);
    const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ depthWrite: false, transparent: true }));
    bubble.scale.set(0.9, 0.9, 1);
    bubble.position.y = 2.95;
    bubble.visible = false;
    bubble.renderOrder = 9;
    g.add(bubble);
    this.scene.add(g);
    return { g, head, arm, tag, bubble, bodyMat, nick: p.v.n, color: p.v.c, emote: -1, walk: 0, last: new THREE.Vector3(), cap: { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.36 } };
  }

  remove(uid) {
    const a = this.map.get(uid);
    if (!a) return;
    this.scene.remove(a.g);
    a.tag.material.map.dispose();
    a.tag.material.dispose();
    a.bodyMat.dispose();
    this.map.delete(uid);
  }

  sync(players) {
    const live = new Set(players.map((p) => p.uid));
    for (const uid of [...this.map.keys()]) if (!live.has(uid)) this.remove(uid);
    for (const p of players) {
      let a = this.map.get(p.uid);
      if (a && (a.nick !== p.v.n || a.color !== p.v.c)) { this.remove(p.uid); a = null; }
      if (!a) { a = this.make(p); this.map.set(p.uid, a); }
      a.p = p;
    }
  }

  update(dt, camera, serverNow) {
    const now = performance.now() - DELAY;
    this.capsules.length = 0;
    for (const a of this.map.values()) {
      const buf = a.p.buf;
      if (!buf.length) continue;
      let s0 = buf[0], s1 = buf[buf.length - 1], k = 1;
      for (let i = 0; i < buf.length - 1; i++) {
        if (buf[i].t <= now && buf[i + 1].t >= now) { s0 = buf[i]; s1 = buf[i + 1]; k = (now - s0.t) / Math.max(1, s1.t - s0.t); break; }
      }
      if (now < buf[0].t) { s0 = s1 = buf[0]; k = 0; }
      const x = s0.x + (s1.x - s0.x) * k, y = s0.y + (s1.y - s0.y) * k, z = s0.z + (s1.z - s0.z) * k;
      let dy = s1.yaw - s0.yaw;
      if (dy > Math.PI) dy -= Math.PI * 2;
      if (dy < -Math.PI) dy += Math.PI * 2;
      const yaw = s0.yaw + dy * k;
      const pitch = s0.pitch + (s1.pitch - s0.pitch) * k;
      const speed = a.last.distanceTo(tv.set(x, y, z)) / Math.max(1e-3, dt);
      a.last.set(x, y, z);
      a.walk += dt * Math.min(12, speed * 1.6);
      const bounce = Math.abs(Math.sin(a.walk)) * Math.min(1, speed / 5) * 0.08;
      a.g.position.set(x, y + bounce, z);
      a.g.rotation.y = yaw;
      a.g.rotation.z = Math.sin(a.walk) * Math.min(1, speed / 5) * 0.06;
      a.head.rotation.x = pitch * 0.6;
      a.arm.rotation.x = pitch;
      const d = camera.position.distanceTo(a.g.position);
      const sc = Math.max(1, d / 14);
      a.tag.scale.set(1.6 * sc, 0.4 * sc, 1);
      const v = a.p.v;
      const show = typeof v.e === 'number' && v.e >= 0 && serverNow - (v.et || 0) < 2600;
      if (show && a.emote !== v.e) { a.bubble.material.map = emoteTexture(v.e); a.bubble.material.needsUpdate = true; a.emote = v.e; }
      a.bubble.visible = show;
      if (show) a.bubble.scale.setScalar(0.9 * sc);
      if (!show) a.emote = -1;
      a.cap.a.set(x, y + 0.36, z);
      a.cap.b.set(x, y + 1.36, z);
      this.capsules.push(a.cap);
    }
  }
}
