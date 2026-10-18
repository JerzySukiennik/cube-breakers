// Cube Breakers: the giant gumball machine, its in-world touch tablet (cart with steppers) and the tray where ordered balls roll out to be picked up.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BALL_TYPES, POWERUPS } from './config.js';
import { mulberry32 } from './rng.js';
import { cartTotal, lineCost, itemOf, itemName } from './progress.js';

export const MACHINE_POS = new THREE.Vector3(0, 0, 43);
const TRAY = { x: 0, z: -5.3, hw: 2.75, hd: 1.45, y: 0.15 };
const CHUTE_A = new THREE.Vector3(0, 0.95, -1.95);
const CHUTE_B = new THREE.Vector3(0, 0.42, -3.75);
const W = 1360, H = 880;
const MAX_BALLS = 260;
const MAX_CAPS = 60;
const STEPS = [-100, -10, -1, 1, 10, 100];
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const tv = new THREE.Vector3();
const tm = new THREE.Matrix4();
const tq = new THREE.Quaternion();
const ts = new THREE.Vector3();
const tc = new THREE.Color();

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const GLYPH = { orbital: '◎', goldrush: '★', infinite: '∞', toxicrain: '☂', meteor: '☄', triple: '⁂', freeze: '❄', magnet: '⊃' };

export function drawBallIcon(ctx, kind, i, x, y, r) {
  const it = itemOf(kind, i);
  if (!it) return;
  ctx.save();
  if (kind === 'p') {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath();
    const g = ctx.createLinearGradient(x, y - r, x, y + r);
    g.addColorStop(0, it.color); g.addColorStop(0.5, it.color); g.addColorStop(0.5, '#f4f8fc'); g.addColorStop(1, '#cfdbe6');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = r * 0.12; ctx.strokeStyle = 'rgba(20,40,70,0.25)'; ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.font = `900 ${Math.round(r * 0.9)}px Nunito, 'Apple Symbols', sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = r * 0.14; ctx.strokeStyle = 'rgba(20,40,70,0.55)';
    ctx.strokeText(GLYPH[it.id] || '?', x, y - r * 0.02);
    ctx.fillText(GLYPH[it.id] || '?', x, y - r * 0.02);
  } else {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath();
    let g;
    if (it.firework && ctx.createConicGradient) {
      g = ctx.createConicGradient(0, x, y);
      ['#2f9bff', '#8fe032', '#ffc531', '#ff9a1f', '#ff4fd8', '#b08cff', '#2f9bff'].forEach((c, k) => g.addColorStop(k / 6, c));
    } else {
      g = ctx.createRadialGradient(x - r * 0.1, y + r * 0.1, r * 0.1, x, y, r);
      tc.set(it.color);
      g.addColorStop(0, it.color);
      g.addColorStop(1, '#' + tc.clone().multiplyScalar(0.55).getHexString());
    }
    ctx.fillStyle = g; ctx.fill();
    if (it.ghost) { ctx.globalAlpha = 0.5; ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.globalAlpha = 1; }
    if (it.hole) { ctx.lineWidth = r * 0.16; ctx.strokeStyle = '#b77dff'; ctx.stroke(); }
  }
  const hl = ctx.createRadialGradient(x - r * 0.35, y - r * 0.38, 0, x - r * 0.35, y - r * 0.38, r * 0.55);
  hl.addColorStop(0, 'rgba(255,255,255,0.95)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function wrap(ctx, text, x, y, maxW, lh, maxLines) {
  const words = text.split(' ');
  let line = '', n = 0;
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) {
      ctx.fillText(line, x, y + n * lh);
      n++;
      line = w;
      if (n >= maxLines) return;
    } else line = t;
  }
  if (line && n < maxLines) ctx.fillText(line, x, y + n * lh);
}

export class Machine {
  constructor(scene, physics, R) {
    this.physics = physics;
    this.R = R;
    this.group = new THREE.Group();
    this.group.position.copy(MACHINE_POS);
    scene.add(this.group);
    this.boxes = [];
    this.items = [];
    this.units = [];
    this.orders = new Map();
    this.cart = new Map();
    this.tab = 'b';
    this.sel = { kind: 'b', i: 0 };
    this.hover = null;
    this.pressT = 0;
    this.pressId = null;
    this.flashMsg = null;
    this.flashT = 0;
    this.dirty = true;
    this.gems = 0;
    this.time = 0;
    this.crank = 0;
    this.crankV = 0;
    this.jiggle = 0;
    this.buttons = [];
    this.onPay = null;
    this.onGrant = null;
    this.audio = null;
    this.clackT = 0;

    const blue = new THREE.MeshPhysicalMaterial({ color: '#2f8ff0', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.12 });
    const white = new THREE.MeshPhysicalMaterial({ color: '#f4f8fc', roughness: 0.3, clearcoat: 0.8 });
    const glass = new THREE.MeshPhysicalMaterial({ color: '#e3f6ff', roughness: 0.03, clearcoat: 1, transparent: true, opacity: 0.2, depthWrite: false, envMapIntensity: 1.8 });
    const dark = new THREE.MeshStandardMaterial({ color: '#13243f', roughness: 0.6 });
    this.mats = { blue, white, glass };

    const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.72, 2.0, 2.6, 48), blue);
    ped.position.y = 1.3;
    ped.castShadow = ped.receiveShadow = true;
    this.group.add(ped);
    for (const [y, r] of [[0.16, 2.02], [2.5, 1.76]]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.09, 12, 64), white);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      this.group.add(ring);
    }
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.72, 0.42, 48), white);
    collar.position.y = 2.8;
    collar.castShadow = true;
    this.group.add(collar);
    this.globe = new THREE.Mesh(new THREE.SphereGeometry(2.3, 48, 32), glass);
    this.globe.position.y = 5.0;
    this.globe.renderOrder = 2;
    this.group.add(this.globe);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.25, 0.55, 40), blue);
    cap.position.y = 7.32;
    cap.castShadow = true;
    this.group.add(cap);
    this.knob = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16), white);
    this.knob.position.y = 7.85;
    this.group.add(this.knob);

    const inner = new THREE.InstancedMesh(new THREE.SphereGeometry(0.25, 16, 12), new THREE.MeshPhysicalMaterial({ roughness: 0.12, clearcoat: 1 }), 240);
    const colors = [...BALL_TYPES.map((b) => b.color), ...POWERUPS.map((p) => p.color)];
    const rnd = mulberry32(42);
    const pts = [];
    for (let tries = 0; tries < 9000 && pts.length < 240; tries++) {
      const p = new THREE.Vector3((rnd() - 0.5) * 4, -2 + rnd() * 2.9, (rnd() - 0.5) * 4);
      if (p.length() > 2.02) continue;
      if (pts.some((q) => q.distanceToSquared(p) < 0.24)) continue;
      pts.push(p);
    }
    pts.sort((a, b) => a.y - b.y);
    pts.forEach((p, k) => {
      tm.makeTranslation(p.x, p.y + 5.0, p.z);
      inner.setMatrixAt(k, tm);
      inner.setColorAt(k, tc.set(colors[Math.floor(rnd() * colors.length)]));
    });
    inner.count = pts.length;
    inner.castShadow = true;
    this.inner = inner;
    this.innerPts = pts;
    this.group.add(inner);

    const crankG = new THREE.Group();
    crankG.position.set(0, 1.6, -1.86);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.16, 32), white);
    disc.rotation.x = Math.PI / 2;
    crankG.add(disc);
    this.handle = new THREE.Group();
    const bar = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.16, 0.14, 2, 0.06), blue);
    bar.position.z = -0.12;
    this.handle.add(bar);
    const nub = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), white);
    nub.position.set(0.4, 0, -0.22);
    this.handle.add(nub);
    crankG.add(this.handle);
    this.group.add(crankG);

    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32), dark);
    hole.position.set(0, 0.86, -1.94);
    hole.rotation.y = Math.PI;
    this.group.add(hole);
    const flapGeo = new RoundedBoxGeometry(0.95, 0.5, 0.06, 2, 0.03);
    this.flap = new THREE.Mesh(flapGeo, glass);
    this.flap.geometry.translate(0, -0.25, 0);
    this.flap.position.set(0, 1.12, -2.0);
    this.group.add(this.flap);

    const chute = new THREE.Group();
    const d = new THREE.Vector3().subVectors(CHUTE_B, CHUTE_A);
    const L = d.length();
    chute.position.copy(CHUTE_A).add(CHUTE_B).multiplyScalar(0.5);
    chute.rotation.x = -Math.atan2(d.y, -d.z);
    const floor = new THREE.Mesh(new RoundedBoxGeometry(0.95, 0.08, L + 0.2, 2, 0.03), white);
    floor.position.y = -0.3;
    floor.receiveShadow = true;
    chute.add(floor);
    for (const x of [-0.5, 0.5]) {
      const rail = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.28, L + 0.2, 2, 0.04), blue);
      rail.position.set(x, -0.18, 0);
      chute.add(rail);
    }
    this.group.add(chute);

    const tray = new THREE.Group();
    tray.position.set(TRAY.x, 0, TRAY.z);
    const tf = new THREE.Mesh(new RoundedBoxGeometry(TRAY.hw * 2 + 0.4, 0.14, TRAY.hd * 2 + 0.4, 2, 0.05), white);
    tf.position.y = 0.07;
    tf.receiveShadow = true;
    tray.add(tf);
    for (const [w, dd, x, z] of [[TRAY.hw * 2 + 0.5, 0.18, 0, TRAY.hd + 0.16], [TRAY.hw * 2 + 0.5, 0.18, 0, -TRAY.hd - 0.16], [0.18, TRAY.hd * 2 + 0.5, TRAY.hw + 0.16, 0], [0.18, TRAY.hd * 2 + 0.5, -TRAY.hw - 0.16, 0]]) {
      const rim = new THREE.Mesh(new RoundedBoxGeometry(w, 0.3, dd, 2, 0.06), blue);
      rim.position.set(x, 0.22, z);
      rim.castShadow = true;
      tray.add(rim);
    }
    this.group.add(tray);

    this.signTex = this.canvasTex(1024, 256, (ctx) => {
      ctx.fillStyle = '#ffffff'; rr(ctx, 8, 8, 1008, 240, 110); ctx.fill();
      ctx.fillStyle = '#1f6fd6'; ctx.font = "italic 900 132px Nunito, sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('BALLS', 512, 136);
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), new THREE.MeshBasicMaterial({ map: this.signTex, transparent: true, toneMapped: false }));
    sign.position.set(0, 2.25, -1.84);
    sign.rotation.y = Math.PI;
    this.group.add(sign);

    this.buildTablet(blue, white);

    const geo = new THREE.SphereGeometry(1, 16, 12);
    this.ballMesh = new THREE.InstancedMesh(geo, new THREE.MeshPhysicalMaterial({ roughness: 0.1, clearcoat: 1, envMapIntensity: 1.2 }), MAX_BALLS);
    this.ballMesh.setColorAt(0, tc.set('#fff'));
    this.capMesh = new THREE.InstancedMesh(geo, new THREE.MeshPhysicalMaterial({ roughness: 0.15, clearcoat: 1, emissive: '#ffffff', emissiveIntensity: 0.12 }), MAX_CAPS);
    this.capMesh.setColorAt(0, tc.set('#fff'));
    this.bandMesh = new THREE.InstancedMesh(new THREE.TorusGeometry(1, 0.16, 8, 24), new THREE.MeshPhysicalMaterial({ color: '#f4f8fc', roughness: 0.3, clearcoat: 0.8 }), MAX_CAPS);
    for (const m of [this.ballMesh, this.capMesh, this.bandMesh]) {
      m.count = 0;
      m.castShadow = true;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
    }

    const p = MACHINE_POS;
    this.collider(1.85, 1.4, 1.85, 0, 1.4, 0);
    this.collider(1.6, 1.6, 1.6, 0, 5.0, 0);
    this.ballBox(-1.95, 0, -1.95, 1.95, 2.9, 1.95);
    this.ballBox(-2.2, 2.9, -2.2, 2.2, 7.4, 2.2);
    this.tray = { min: new THREE.Vector3(p.x + TRAY.x - TRAY.hw, 0, p.z + TRAY.z - TRAY.hd), max: new THREE.Vector3(p.x + TRAY.x + TRAY.hw, 0, p.z + TRAY.z + TRAY.hd) };
  }

  canvasTex(w, h, draw) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    draw(ctx, w, h);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    t.userData.ctx = ctx;
    return t;
  }

  collider(hx, hy, hz, x, y, z) {
    const p = MACHINE_POS;
    this.physics.createCollider(this.R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(p.x + x, p.y + y, p.z + z).setFriction(0.8));
  }

  ballBox(x0, y0, z0, x1, y1, z1) {
    const p = MACHINE_POS;
    this.boxes.push({ min: new THREE.Vector3(p.x + x0, p.y + y0, p.z + z0), max: new THREE.Vector3(p.x + x1, p.y + y1, p.z + z1) });
  }

  buildTablet(blue, white) {
    const g = new THREE.Group();
    g.position.set(5.4, 0, -0.4);
    g.rotation.y = Math.PI + 0.32;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.18, 32), white);
    base.position.y = 0.09;
    g.add(base);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.2, 16), white);
    pole.position.y = 0.7;
    g.add(pole);
    const tilt = new THREE.Group();
    tilt.position.y = 2.15;
    tilt.rotation.x = -0.14;
    const frame = new THREE.Mesh(new RoundedBoxGeometry(3.62, 2.42, 0.16, 4, 0.12), blue);
    frame.position.z = -0.1;
    frame.castShadow = true;
    tilt.add(frame);
    this.tabTex = this.canvasTex(W, H, () => {});
    this.screen = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.2), new THREE.MeshBasicMaterial({ map: this.tabTex, toneMapped: false }));
    this.screen.position.z = -0.0;
    tilt.add(this.screen);
    g.add(tilt);
    this.group.add(g);
    this.tablet = g;
    const wp = new THREE.Vector3();
    g.updateMatrixWorld(true);
    this.group.updateMatrixWorld(true);
    this.screen.getWorldPosition(wp);
    this.screenPos = wp;
    this.collider(0.3, 0.7, 0.3, 5.4, 0.7, -0.4);
    this.ray = new THREE.Raycaster();
  }

  key(kind, i) { return kind + i; }

  cartList() {
    const out = [];
    for (const [k, n] of this.cart) if (n > 0) out.push({ kind: k[0], i: +k.slice(1), n });
    return out;
  }

  qty(kind, i) { return this.cart.get(this.key(kind, i)) || 0; }

  setGems(g) {
    if (g !== this.gems) { this.gems = g; this.dirty = true; }
  }

  btn(id, x, y, w, h, fn) {
    this.buttons.push({ id, x, y, w, h, fn });
    return this.hover === id;
  }

  draw() {
    const ctx = this.tabTex.userData.ctx;
    this.buttons = [];
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#f3f9ff';
    rr(ctx, 0, 0, W, H, 48);
    ctx.fill();
    const hg = ctx.createLinearGradient(0, 0, 0, 100);
    hg.addColorStop(0, '#3aa9f5'); hg.addColorStop(1, '#1f6fd6');
    ctx.save();
    rr(ctx, 0, 0, W, H, 48);
    ctx.clip();
    ctx.fillStyle = hg;
    ctx.fillRect(0, 0, W, 100);
    ctx.restore();
    ctx.fillStyle = '#ffffff';
    ctx.font = "italic 900 54px Nunito, sans-serif";
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('BALL MACHINE', 40, 52);
    ctx.font = "900 40px Nunito, sans-serif";
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    rr(ctx, W - 330, 18, 300, 66, 33); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText('◇ ' + fmt(this.gems), W - 56, 53);
    ctx.font = "800 22px Nunito, sans-serif";
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('TEAM', W - 250, 53);

    const tabs = [['b', 'BALLS'], ['p', 'POWERUPS']];
    tabs.forEach(([k, label], n) => {
      const x = 40 + n * 230, y = 116, w = 214, h = 58;
      const hov = this.btn('tab' + k, x, y, w, h, () => { this.tab = k; this.sel = { kind: k, i: 0 }; });
      ctx.fillStyle = this.tab === k ? '#1f6fd6' : hov ? '#dcecff' : '#e8f2fd';
      rr(ctx, x, y, w, h, 29); ctx.fill();
      ctx.fillStyle = this.tab === k ? '#ffffff' : '#1f6fd6';
      ctx.font = "900 28px Nunito, sans-serif"; ctx.textAlign = 'center';
      ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    });

    const list = this.tab === 'b' ? BALL_TYPES : POWERUPS;
    const cols = 4, tw = 196, th = this.tab === 'b' ? 148 : 200, gap = 12, gx = 40, gy = 192;
    list.forEach((it, i) => {
      const x = gx + (i % cols) * (tw + gap), y = gy + Math.floor(i / cols) * (th + gap);
      const sel = this.sel.kind === this.tab && this.sel.i === i;
      const hov = this.btn('it' + i, x, y, tw, th, () => { this.sel = { kind: this.tab, i }; });
      ctx.fillStyle = sel ? '#e3f1ff' : hov ? '#f0f7ff' : '#ffffff';
      rr(ctx, x, y, tw, th, 22); ctx.fill();
      ctx.lineWidth = sel ? 6 : 3;
      ctx.strokeStyle = sel ? '#1f6fd6' : '#d5e6f7';
      ctx.stroke();
      const big = this.tab === 'p';
      drawBallIcon(ctx, this.tab, i, x + tw / 2, y + (big ? 66 : 54), big ? 44 : 36);
      ctx.fillStyle = '#163259';
      ctx.font = "900 24px Nunito, sans-serif"; ctx.textAlign = 'center';
      ctx.fillText(big ? it.short : it.name, x + tw / 2, y + th - (big ? 64 : 48), tw - 16);
      ctx.font = "800 22px Nunito, sans-serif";
      ctx.fillStyle = '#4a6a92';
      const pr = it.price < 1 ? `◇1 / ${Math.round(1 / it.price)}` : '◇ ' + fmt(it.price);
      ctx.fillText(pr, x + tw / 2, y + th - (big ? 30 : 20));
      const q = this.qty(this.tab, i);
      if (q > 0) {
        const t = '×' + fmt(q);
        ctx.font = "900 22px Nunito, sans-serif";
        const bw = ctx.measureText(t).width + 24;
        ctx.fillStyle = '#2fbf4f';
        rr(ctx, x + tw - bw - 8, y + 8, bw, 34, 17); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillText(t, x + tw - bw / 2 - 8, y + 26);
      }
    });

    const px = 900, pw = W - px - 40;
    ctx.fillStyle = '#ffffff';
    rr(ctx, px, 116, pw, H - 116 - 32, 30); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#d5e6f7'; ctx.stroke();
    const sk = this.sel.kind, si = this.sel.i;
    const it = itemOf(sk, si);
    if (it) {
      drawBallIcon(ctx, sk, si, px + 70, 190, 44);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#163259';
      ctx.font = "900 36px Nunito, sans-serif";
      ctx.fillText(it.name, px + 130, 176, pw - 150);
      ctx.font = "800 22px Nunito, sans-serif";
      ctx.fillStyle = '#4a6a92';
      ctx.fillText(it.price < 1 ? `◇1 for ${Math.round(1 / it.price)} balls` : `◇ ${fmt(it.price)} each`, px + 130, 210);
      ctx.font = "700 21px Nunito, sans-serif";
      ctx.fillStyle = '#3b5578';
      wrap(ctx, it.desc, px + 28, 268, pw - 56, 28, 3);
    }
    const q = this.qty(sk, si);
    const bw = (pw - 56 - 20) / 3, bh = 62;
    STEPS.forEach((st, n) => {
      const row = n < 3 ? 0 : 1;
      const x = px + 28 + (n % 3) * (bw + 10), y = row === 0 ? 372 : 520;
      const hov = this.btn('st' + st, x, y, bw, bh, () => {
        const k = this.key(sk, si);
        const v = Math.max(0, Math.min(99999, (this.cart.get(k) || 0) + st));
        if (v > 0) this.cart.set(k, v); else this.cart.delete(k);
      });
      const pressed = this.pressId === 'st' + st && this.pressT > 0;
      ctx.fillStyle = pressed ? '#1f6fd6' : hov ? '#cfe5ff' : '#e8f2fd';
      rr(ctx, x, y + (pressed ? 3 : 0), bw, bh, 20); ctx.fill();
      ctx.fillStyle = pressed ? '#ffffff' : '#1f6fd6';
      ctx.font = "900 32px Nunito, sans-serif"; ctx.textAlign = 'center';
      ctx.fillText((st > 0 ? '+' : '−') + Math.abs(st), x + bw / 2, y + bh / 2 + 2 + (pressed ? 3 : 0));
    });
    ctx.fillStyle = '#f3f9ff';
    rr(ctx, px + 28, 444, pw - 56, 66, 22); ctx.fill();
    ctx.fillStyle = '#163259';
    ctx.font = "900 44px Nunito, sans-serif"; ctx.textAlign = 'center';
    ctx.fillText('×' + fmt(q), px + pw / 2 - 70, 478);
    ctx.font = "800 26px Nunito, sans-serif";
    ctx.fillStyle = '#4a6a92';
    ctx.fillText('◇ ' + fmt(Math.ceil(lineCost(sk, si, q))), px + pw / 2 + 110, 479);

    const cart = this.cartList();
    const total = cartTotal(cart);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#163259';
    ctx.font = "900 26px Nunito, sans-serif";
    ctx.fillText(cart.length ? `Cart · ${cart.length} ${cart.length === 1 ? 'item' : 'items'}` : 'Cart is empty', px + 28, 616);
    let cx = px + 28;
    for (const c of cart.slice(0, 8)) {
      drawBallIcon(ctx, c.kind, c.i, cx + 16, 656, 15);
      cx += 38;
    }
    if (cart.length) {
      const hov = this.btn('clear', px + pw - 150, 596, 122, 44, () => { this.cart.clear(); });
      ctx.fillStyle = hov ? '#ffe2e2' : '#f3f6fa';
      rr(ctx, px + pw - 150, 596, 122, 44, 22); ctx.fill();
      ctx.fillStyle = '#7a8aa3';
      ctx.font = "900 22px Nunito, sans-serif"; ctx.textAlign = 'center';
      ctx.fillText('CLEAR', px + pw - 89, 619);
    }
    const poor = total > this.gems;
    const can = cart.length > 0 && !poor;
    const hovPay = this.btn('pay', px + 28, H - 32 - 28 - 92, pw - 56, 92, () => { if (can && this.onPay) this.onPay(cart); });
    const pg = ctx.createLinearGradient(0, H - 152, 0, H - 60);
    if (can) { pg.addColorStop(0, hovPay ? '#5be36d' : '#46d65a'); pg.addColorStop(1, '#22a93a'); } else { pg.addColorStop(0, '#c4cfdb'); pg.addColorStop(1, '#a9b6c4'); }
    ctx.fillStyle = pg;
    rr(ctx, px + 28, H - 152, pw - 56, 92, 30); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = "italic 900 40px Nunito, sans-serif"; ctx.textAlign = 'center';
    ctx.fillText(!cart.length ? 'PICK SOME BALLS' : poor ? 'NOT ENOUGH GEMS' : `PAY  ◇ ${fmt(total)}`, px + pw / 2, H - 104);

    if (this.flashT > 0 && this.flashMsg) {
      ctx.fillStyle = 'rgba(19, 50, 96, 0.82)';
      rr(ctx, 0, 0, W, H, 48); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = "italic 900 84px Nunito, sans-serif"; ctx.textAlign = 'center';
      ctx.fillText(this.flashMsg[0], W / 2, H / 2 - 30);
      ctx.font = "800 34px Nunito, sans-serif";
      ctx.fillText(this.flashMsg[1], W / 2, H / 2 + 46);
    }
    this.tabTex.needsUpdate = true;
    this.dirty = false;
  }

  flash(a, b) {
    this.flashMsg = [a, b];
    this.flashT = 2.2;
    this.dirty = true;
  }

  aim(camera, dir) {
    this.ray.set(camera.position, dir);
    this.ray.far = 7.5;
    const hit = this.ray.intersectObject(this.screen, false)[0];
    let id = null;
    if (hit && hit.uv && this.flashT <= 0) {
      const x = hit.uv.x * W, y = (1 - hit.uv.y) * H;
      for (const b of this.buttons) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { id = b.id; break; }
    }
    if (id !== this.hover) {
      this.hover = id;
      this.dirty = true;
      if (id && this.audio) this.audio.play('tick', { vol: 0.35, rate: 1.4 });
    }
    return !!hit;
  }

  click() {
    if (!this.hover) return false;
    const b = this.buttons.find((x) => x.id === this.hover);
    if (!b) return false;
    b.fn();
    this.pressId = b.id;
    this.pressT = 0.12;
    this.dirty = true;
    if (this.audio) this.audio.play('tap', { vol: 0.9 });
    return true;
  }

  explode(o) {
    const units = [];
    let k = 0;
    for (const it of o.items || []) {
      if (!it || !(it.n > 0)) continue;
      const v = it.k === 'p' ? Math.min(it.n, 10) : Math.max(1, Math.min(it.n, 24, Math.round(4 * Math.sqrt(it.n))));
      const base = Math.floor(it.n / v), extra = it.n % v;
      for (let j = 0; j < v; j++) units.push({ k: k++, kind: it.k, i: it.i, n: base + (j < extra ? 1 : 0) });
    }
    return units;
  }

  sync(tray, now, myUid) {
    const live = new Set();
    for (const [oid, o] of Object.entries(tray || {})) {
      if (!o || !o.items) continue;
      live.add(oid);
      let ord = this.orders.get(oid);
      if (!ord) {
        const fresh = now - (o.s || 0) < 12000;
        const rnd = mulberry32(oid.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7));
        ord = { oid, units: [] };
        const list = this.explode(o);
        for (const u of list) {
          const unit = {
            oid, k: u.k, kind: u.kind, i: u.i, n: u.n, state: fresh ? 0 : 2, t: fresh ? -(0.8 + u.k * 0.09) : 0,
            pos: new THREE.Vector3(), vel: new THREE.Vector3(), r: u.kind === 'p' ? 0.3 : 0.2 + Math.min(0.08, u.n / 400), claim: 0, by: null, rot: rnd() * 6,
          };
          if (!fresh) {
            unit.pos.set(TRAY.x + (rnd() - 0.5) * TRAY.hw * 1.8, TRAY.y + unit.r, TRAY.z + (rnd() - 0.5) * TRAY.hd * 1.8);
          }
          ord.units.push(unit);
          this.units.push(unit);
        }
        this.orders.set(oid, ord);
        if (fresh) { this.crankV = 9; this.jiggle = 1.6 + list.length * 0.09; if (this.audio) this.audio.play('ratchet', { pos: this.worldPos(tv.set(0, 1.6, -2)), range: 60 }); }
      }
      const c = o.c || {};
      for (const u of ord.units) {
        const by = c[u.k];
        if (by && !u.by) {
          u.by = by;
          if (by !== myUid && u.claim !== 2) u.state = 3;
        }
      }
    }
    for (const [oid, ord] of this.orders) {
      if (live.has(oid)) continue;
      for (const u of ord.units) if (u.state < 3) { u.state = 3; u.by = u.by || '?'; }
      this.orders.delete(oid);
    }
  }

  worldPos(local) { return local.add(MACHINE_POS); }

  pathPos(t, out) {
    if (t < 0.3) {
      const k = t / 0.3;
      return out.set(0, 2.6 - k * 1.6, -1.2 - k * 0.7);
    }
    const k = Math.min(1, (t - 0.3) / 0.45);
    const e = k * k;
    return out.lerpVectors(CHUTE_A, CHUTE_B, e);
  }

  update(dt, feet, net, progress, otherPos) {
    this.time += dt;
    if (this.pressT > 0) { this.pressT -= dt; if (this.pressT <= 0) this.dirty = true; }
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.dirty = true; }
    if (this.dirty) this.draw();
    this.crankV *= Math.exp(-dt * 1.4);
    this.crank += this.crankV * dt;
    this.handle.rotation.z = this.crank;
    this.knob.position.y = 7.85 + Math.sin(this.time * 2) * 0.04;
    const anyOut = this.units.some((u) => u.state === 0 && u.t > 0 && u.t < 0.8);
    this.flap.rotation.x += ((anyOut ? -0.9 : 0) - this.flap.rotation.x) * Math.min(1, dt * 14);
    if (this.jiggle > 0) {
      this.jiggle -= dt;
      const a = Math.min(1, this.jiggle);
      this.innerPts.forEach((p, k) => {
        tm.makeTranslation(p.x + Math.sin(this.time * 31 + k) * 0.05 * a, p.y + 5.0 + Math.abs(Math.sin(this.time * 23 + k * 1.7)) * 0.1 * a, p.z + Math.cos(this.time * 27 + k) * 0.05 * a);
        this.inner.setMatrixAt(k, tm);
      });
      this.inner.instanceMatrix.needsUpdate = true;
    }

    const lx = feet.x - MACHINE_POS.x, lz = feet.z - MACHINE_POS.z;
    const onTray = feet.y < 1.6;
    this.clackT -= dt;
    for (const u of this.units) {
      if (u.state === 0) {
        u.t += dt;
        if (u.t < 0) { u.pos.set(0, -50, 0); continue; }
        this.pathPos(u.t, u.pos);
        u.pos.y += u.r * 0.6;
        if (u.t >= 0.75) {
          u.state = 1;
          u.vel.set((Math.random() - 0.5) * 2.4, 1.4 + Math.random(), -3.2 - Math.random() * 2.2);
          if (this.audio && this.clackT <= 0) { this.clackT = 0.05; this.audio.play('clack', { pos: this.worldPos(tv.copy(u.pos)), range: 40, vol: 0.5, rate: 1.2 + Math.random() * 0.4 }); }
        }
      } else if (u.state === 1) {
        u.vel.y -= 18 * dt;
        u.pos.addScaledVector(u.vel, dt);
        const fy = TRAY.y + u.r;
        if (u.pos.y < fy) {
          u.pos.y = fy;
          if (u.vel.y < -1.2) {
            u.vel.y *= -0.38;
            if (this.audio && this.clackT <= 0) { this.clackT = 0.04; this.audio.play('peg', { pos: this.worldPos(tv.copy(u.pos)), range: 35, vol: 0.4, rate: 0.9 + Math.random() * 0.5 }); }
          } else u.vel.y = 0;
          u.vel.x *= Math.exp(-dt * 2.2);
          u.vel.z *= Math.exp(-dt * 2.2);
        }
        if (u.pos.x < TRAY.x - TRAY.hw + u.r) { u.pos.x = TRAY.x - TRAY.hw + u.r; u.vel.x = Math.abs(u.vel.x) * 0.6; }
        if (u.pos.x > TRAY.x + TRAY.hw - u.r) { u.pos.x = TRAY.x + TRAY.hw - u.r; u.vel.x = -Math.abs(u.vel.x) * 0.6; }
        if (u.pos.z < TRAY.z - TRAY.hd + u.r) { u.pos.z = TRAY.z - TRAY.hd + u.r; u.vel.z = Math.abs(u.vel.z) * 0.6; }
        if (u.pos.z > TRAY.z + TRAY.hd - u.r && u.pos.y < 0.6) { u.pos.z = TRAY.z + TRAY.hd - u.r; u.vel.z = -Math.abs(u.vel.z) * 0.6; }
        u.rot += Math.hypot(u.vel.x, u.vel.z) * dt / u.r;
        if (u.pos.y <= fy + 0.001 && Math.hypot(u.vel.x, u.vel.z) < 0.12) u.state = 2;
      } else if (u.state === 3 || u.state === 4) {
        u.t = (u.t || 0) + dt;
        let target = null;
        if (u.state === 4) target = tv.set(lx, feet.y + 1, lz);
        else if (u.by && otherPos) { const q = otherPos(u.by); if (q) target = tv.set(q.x - MACHINE_POS.x, q.y, q.z - MACHINE_POS.z); }
        if (!target || u.t > 0.9) { u.state = 5; continue; }
        const d = target.sub(u.pos);
        const L = d.length();
        if (L < 0.5) { u.state = 5; continue; }
        u.pos.addScaledVector(d, Math.min(1, dt * (6 + u.t * 14)));
        u.pos.y += Math.sin(u.t * 8) * dt * 2;
      }
      if ((u.state === 1 || u.state === 2) && u.claim === 0 && onTray) {
        const dx = u.pos.x - lx, dz = u.pos.z - lz;
        if (dx * dx + dz * dz < 1.25 * 1.25) {
          u.claim = 1;
          progress.claimTray(u.oid, u.k).then((ok) => {
            if (ok) {
              u.claim = 2;
              u.state = 4;
              u.t = 0;
              u.by = net ? net.uid : 'me';
              progress.grant(u.kind, u.i, u.n);
              if (this.onGrant) this.onGrant(u);
              this.checkDone(u.oid, progress, net);
            } else {
              u.claim = 3;
              if (!u.by) u.claim = 0;
            }
          });
        }
      }
    }
    for (let a = 0; a < this.units.length; a++) {
      const u = this.units[a];
      if (u.state !== 1 && u.state !== 2) continue;
      for (let b = a + 1; b < this.units.length; b++) {
        const v = this.units[b];
        if (v.state !== 1 && v.state !== 2) continue;
        const dx = v.pos.x - u.pos.x, dz = v.pos.z - u.pos.z;
        const min = u.r + v.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-8) continue;
        const d = Math.sqrt(d2), ov = (min - d) * 0.5, nx = dx / d, nz = dz / d;
        u.pos.x -= nx * ov; u.pos.z -= nz * ov;
        v.pos.x += nx * ov; v.pos.z += nz * ov;
        const rv = (v.vel.x - u.vel.x) * nx + (v.vel.z - u.vel.z) * nz;
        if (rv < 0) {
          u.vel.x += nx * rv * 0.8; u.vel.z += nz * rv * 0.8;
          v.vel.x -= nx * rv * 0.8; v.vel.z -= nz * rv * 0.8;
          if (u.state === 2 && Math.abs(rv) > 0.3) u.state = 1;
          if (v.state === 2 && Math.abs(rv) > 0.3) v.state = 1;
        }
      }
    }
    this.units = this.units.filter((u) => u.state !== 5);
    this.render();
  }

  checkDone(oid, progress) {
    const ord = this.orders.get(oid);
    if (!ord) return;
    if (ord.units.every((u) => u.by)) progress.removeOrder(oid);
  }

  render() {
    const bm = this.ballMesh, cm = this.capMesh, nm = this.bandMesh;
    let nb = 0, nc = 0;
    const P = MACHINE_POS;
    for (const u of this.units) {
      if (u.state === 0 && u.t < 0) continue;
      const shrink = u.state >= 3 ? Math.max(0.25, 1 - (u.t || 0) * 1.1) : 1;
      tv.set(u.pos.x + P.x, u.pos.y + P.y, u.pos.z + P.z);
      if (u.kind === 'p') {
        if (nc >= MAX_CAPS) continue;
        tq.setFromAxisAngle(ts.set(Math.cos(u.rot), 0, Math.sin(u.rot)).normalize(), u.rot * 0.3);
        tm.compose(tv, tq, ts.setScalar(u.r * shrink));
        cm.setMatrixAt(nc, tm);
        cm.setColorAt(nc, tc.set(POWERUPS[u.i] ? POWERUPS[u.i].color : '#ffffff'));
        tq.multiply(new THREE.Quaternion().setFromAxisAngle(ts.set(1, 0, 0), Math.PI / 2));
        tm.compose(tv, tq, ts.setScalar(u.r * shrink * 1.02));
        nm.setMatrixAt(nc, tm);
        nc++;
      } else {
        if (nb >= MAX_BALLS) continue;
        const cfg = BALL_TYPES[u.i];
        tm.compose(tv, tq.identity(), ts.setScalar(u.r * shrink));
        bm.setMatrixAt(nb, tm);
        if (cfg && cfg.firework) tc.setHSL((this.time * 0.5 + u.k * 0.13) % 1, 0.9, 0.6);
        else tc.set(cfg ? cfg.color : '#ffffff');
        bm.setColorAt(nb, tc);
        nb++;
      }
    }
    bm.count = nb; cm.count = nc; nm.count = nc;
    bm.instanceMatrix.needsUpdate = true;
    if (bm.instanceColor) bm.instanceColor.needsUpdate = true;
    cm.instanceMatrix.needsUpdate = true;
    if (cm.instanceColor) cm.instanceColor.needsUpdate = true;
    nm.instanceMatrix.needsUpdate = true;
  }

  describeUnit(u) { return itemName(u.kind, u.i, u.n); }
}
