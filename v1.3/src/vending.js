// Cube Breakers: the Plinko vending machine (pay, aim the drop point and the power, win a random ball, powerup or upgrade worth the slot).

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BALL_TYPES, POWERUPS, VEND_PRICE } from './config.js';
import { UPGRADES, itemName } from './progress.js';

export const VEND_POS = new THREE.Vector3(18, 0, 55);
const HW = 1.7, R = 0.12, PR = 0.06, G = 6.5, REST = 0.45, XR = 1.35, BASE_Y = 1.25, DROP_Y = 4.15;
const BOUNDS = [-1.7, -1.38, -0.98, -0.58, -0.2, 0.2, 0.58, 0.98, 1.38, 1.7];
export const SLOT_VALUES = [2000, 280, 800, 250, 600, 250, 800, 280, 2000];
const SLOT_COLORS = ['#ffc531', '#7fd3ff', '#ff6fcf', '#8fe032', '#b08cff', '#8fe032', '#ff6fcf', '#7fd3ff', '#ffc531'];
const tv = new THREE.Vector3();
const tm = new THREE.Matrix4();
const tc = new THREE.Color();
const fmt = (n) => Math.round(n).toLocaleString('en-US');

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function tri(t, period) {
  const k = (t / period) % 1;
  return k < 0.5 ? k * 4 - 1 : 3 - k * 4;
}

export function rollPrize(value, progress) {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const r = Math.random();
  if (r < 0.22) {
    const ups = UPGRADES.filter((u) => !progress.maxed(u.id) && !progress.locked(u.id) && progress.price(u.id) <= value * 1.25);
    if (ups.length) {
      const u = pick(ups);
      return { kind: 'u', id: u.id, label: u.max > 1 ? `${u.name} level ${progress.lvl(u.id) + 1}` : u.name, color: '#ffd34a' };
    }
  }
  if (r < 0.55) {
    const pws = POWERUPS.map((p, i) => ({ p, i })).filter(({ p }) => p.price <= value * 1.3);
    if (pws.length) {
      const { p, i } = pick(pws);
      const n = Math.max(1, Math.round(value / p.price));
      return { kind: 'p', i, n, label: itemName('p', i, n), color: p.color };
    }
  }
  const types = BALL_TYPES.map((b, i) => ({ b, i })).filter(({ b, i }) => i > 0 && b.price <= value);
  const { b, i } = pick(types);
  const n = Math.max(1, Math.round(value / b.price));
  return { kind: 'b', i, n, label: itemName('b', i, n), color: b.color };
}

export class Vending {
  constructor(scene, physics, R3) {
    this.group = new THREE.Group();
    this.group.position.copy(VEND_POS);
    this.group.rotation.y = 0.32;
    scene.add(this.group);
    this.boxes = [];
    this.items = [];
    this.state = 'idle';
    this.t = 0;
    this.time = 0;
    this.x0 = 0;
    this.pow = 0;
    this.ball = { x: 0, y: DROP_Y, vx: 0, vy: 0 };
    this.result = null;
    this.audio = null;
    this.fx = null;
    this.onResult = null;
    this.prompt = '';
    this.pegHit = new Float32Array(64);

    const purple = new THREE.MeshPhysicalMaterial({ color: '#7b4de6', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.12 });
    const white = new THREE.MeshPhysicalMaterial({ color: '#f4f8fc', roughness: 0.3, clearcoat: 0.8 });
    const navy = new THREE.MeshStandardMaterial({ color: '#16224a', roughness: 0.7 });
    const glass = new THREE.MeshPhysicalMaterial({ color: '#e3f6ff', roughness: 0.03, clearcoat: 1, transparent: true, opacity: 0.12, depthWrite: false });

    const body = new THREE.Mesh(new RoundedBoxGeometry(4.3, 6.3, 1.3, 4, 0.22), purple);
    body.position.set(0, 3.15, 0.1);
    body.castShadow = body.receiveShadow = true;
    this.group.add(body);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 4.75), navy);
    back.position.set(0, BASE_Y + 2.3, -0.56);
    back.rotation.y = Math.PI;
    this.group.add(back);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 4.75), glass);
    front.position.set(0, BASE_Y + 2.3, -0.7);
    front.rotation.y = Math.PI;
    front.renderOrder = 3;
    this.group.add(front);
    for (const [w, h, x, y] of [[3.7, 0.16, 0, BASE_Y - 0.08], [3.7, 0.16, 0, BASE_Y + 4.7], [0.16, 4.9, -1.83, BASE_Y + 2.3], [0.16, 4.9, 1.83, BASE_Y + 2.3]]) {
      const f = new THREE.Mesh(new RoundedBoxGeometry(w, h, 0.22, 2, 0.06), white);
      f.position.set(x, y, -0.66);
      this.group.add(f);
    }

    this.pegs = [];
    for (let r = 0; r < 5; r++) {
      const y = 3.5 - r * 0.52;
      const off = r % 2 ? 0.275 : 0;
      for (let x = -HW + 0.35 + off; x < HW - 0.3; x += 0.55) this.pegs.push([x, y]);
    }
    for (let k = 1; k < BOUNDS.length - 1; k++) this.pegs.push([BOUNDS[k], 0.55, true]);
    this.pegMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(PR, PR, 0.16, 12), new THREE.MeshPhysicalMaterial({ roughness: 0.2, clearcoat: 1, emissive: '#ffffff', emissiveIntensity: 0.15 }), this.pegs.length);
    this.pegs.forEach(([x, y], k) => {
      tm.makeRotationX(Math.PI / 2).setPosition(x, BASE_Y + y, -0.64);
      this.pegMesh.setMatrixAt(k, tm);
      this.pegMesh.setColorAt(k, tc.set('#ffffff'));
    });
    this.group.add(this.pegMesh);
    for (let k = 1; k < BOUNDS.length - 1; k++) {
      const d = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.55, 0.3, 2, 0.02), white);
      d.position.set(BOUNDS[k], BASE_Y + 0.275, -0.71);
      this.group.add(d);
    }
    this.slotTex = this.canvasTex(1024, 128, (ctx) => {
      ctx.clearRect(0, 0, 1024, 128);
      for (let k = 0; k < 9; k++) {
        const x0 = ((BOUNDS[k] + HW) / (2 * HW)) * 1024, x1 = ((BOUNDS[k + 1] + HW) / (2 * HW)) * 1024;
        ctx.fillStyle = SLOT_COLORS[k];
        rr(ctx, x0 + 3, 6, x1 - x0 - 6, 116, 14);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = `900 ${k === 0 || k === 8 ? 34 : 40}px Nunito, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.save();
        ctx.translate((x0 + x1) / 2, 64);
        if (k === 0 || k === 8) ctx.rotate(-Math.PI / 2);
        ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(20,30,60,0.45)';
        const t = SLOT_VALUES[k] >= 1000 ? (SLOT_VALUES[k] / 1000) + 'k' : String(SLOT_VALUES[k]);
        ctx.strokeText(t, 0, 0);
        ctx.fillText(t, 0, 0);
        ctx.restore();
      }
    });
    const slots = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.5), new THREE.MeshBasicMaterial({ map: this.slotTex, transparent: true, toneMapped: false }));
    slots.position.set(0, BASE_Y + 0.27, -0.58);
    slots.rotation.y = Math.PI;
    this.group.add(slots);

    this.marqTex = this.canvasTex(1024, 300, () => {});
    const marq = new THREE.Mesh(new THREE.PlaneGeometry(3.9, 1.14), new THREE.MeshBasicMaterial({ map: this.marqTex, transparent: true, toneMapped: false }));
    marq.position.set(0, 6.95, -0.2);
    marq.rotation.y = Math.PI;
    this.group.add(marq);
    const marqBack = new THREE.Mesh(new RoundedBoxGeometry(4.3, 1.4, 0.5, 3, 0.2), purple);
    marqBack.position.set(0, 6.95, 0.06);
    this.group.add(marqBack);
    this.bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 10, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), 34);
    let b = 0;
    for (let k = 0; k < 17; k++) {
      for (const y of [6.3, 7.6]) {
        tm.makeTranslation(-1.95 + k * (3.9 / 16), y, -0.24);
        this.bulbs.setMatrixAt(b, tm);
        this.bulbs.setColorAt(b, tc.set('#ffffff'));
        b++;
      }
    }
    this.group.add(this.bulbs);

    const coin = new THREE.Mesh(new RoundedBoxGeometry(1.6, 0.55, 0.2, 2, 0.08), white);
    coin.position.set(0, 0.62, -0.58);
    this.group.add(coin);
    const coinLabel = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.45), new THREE.MeshBasicMaterial({
      transparent: true, toneMapped: false,
      map: this.canvasTex(400, 120, (ctx) => {
        ctx.fillStyle = '#7b4de6'; ctx.font = "900 50px Nunito, sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('◇ ' + fmt(VEND_PRICE), 200, 64);
      }),
    }));
    coinLabel.position.set(0, 0.62, -0.69);
    coinLabel.rotation.y = Math.PI;
    this.group.add(coinLabel);

    const shiny = new THREE.MeshPhysicalMaterial({ color: '#ffd34a', metalness: 1, roughness: 0.15 });
    this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(R, 20, 14), shiny);
    this.ballMesh.visible = false;
    this.group.add(this.ballMesh);
    this.dropper = new THREE.Group();
    const car = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.22, 0.3, 2, 0.06), white);
    this.dropper.add(car);
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 12), new THREE.MeshBasicMaterial({ color: '#ffd34a', toneMapped: false }));
    this.arrow.rotation.z = -Math.PI / 2;
    this.dropper.add(this.arrow);
    this.guide = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 3.9), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.25, depthWrite: false }));
    this.guide.position.y = -2.05;
    this.guide.rotation.y = Math.PI;
    this.dropper.add(this.guide);
    this.dropper.position.set(0, BASE_Y + DROP_Y + 0.25, -0.71);
    this.group.add(this.dropper);

    const c = Math.cos(0.32), s = Math.sin(0.32);
    const place = (lx, lz) => new THREE.Vector3(VEND_POS.x + lx * c + lz * s, 0, VEND_POS.z - lx * s + lz * c);
    const ctr = place(0, 0.1);
    physics.createCollider(R3.ColliderDesc.cuboid(2.15, 3.15, 0.65).setTranslation(ctr.x, 3.15, ctr.z).setRotation({ x: 0, y: Math.sin(0.16), z: 0, w: Math.cos(0.16) }).setFriction(0.8));
    this.boxes.push({ min: new THREE.Vector3(ctr.x - 2.3, 0, ctr.z - 1.2), max: new THREE.Vector3(ctr.x + 2.3, 7.7, ctr.z + 1.2) });
    const fp = place(0, -0.9);
    this.items.push({ kind: 'vending', node: this.group, pos: new THREE.Vector3(fp.x, 2.6, fp.z), r: 1.9, noScale: true });
    this.drawMarquee('PLINKO', '◇1,000 a drop · aim well, win big');
  }

  canvasTex(w, h, draw) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    draw(ctx, w, h);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.userData.ctx = ctx;
    return t;
  }

  drawMarquee(a, b, color) {
    const ctx = this.marqTex.userData.ctx;
    ctx.clearRect(0, 0, 1024, 300);
    ctx.fillStyle = '#ffffff';
    rr(ctx, 8, 8, 1008, 284, 60);
    ctx.fill();
    ctx.fillStyle = color || '#7b4de6';
    ctx.font = "italic 900 118px Nunito, sans-serif";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(a, 512, 120, 960);
    ctx.fillStyle = '#4a3a8a';
    ctx.font = "800 46px Nunito, sans-serif";
    ctx.fillText(b, 512, 228, 960);
    this.marqTex.needsUpdate = true;
  }

  get busy() { return this.state !== 'idle' && this.state !== 'result'; }
  get wantsClick() { return this.state === 'aimX' || this.state === 'aimP'; }

  start() {
    this.state = 'aimX';
    this.t = 0;
    this.prompt = 'Click to set the drop point';
    this.drawMarquee('AIM!', 'Click to lock the drop point');
    if (this.audio) this.audio.play('cash', { pos: this.world(0, 1, -1) });
  }

  click() {
    if (this.state === 'aimX') {
      this.state = 'aimP';
      this.t = 0;
      this.prompt = 'Click to set the power';
      this.drawMarquee('POWER!', 'Click to launch');
      if (this.audio) this.audio.play('tap', { vol: 1 });
    } else if (this.state === 'aimP') this.launch();
  }

  launch() {
    this.state = 'fall';
    this.t = 0;
    this.prompt = '';
    this.ball.x = this.x0;
    this.ball.y = DROP_Y;
    this.ball.vx = this.pow * 3.2;
    this.ball.vy = 0;
    this.ballMesh.visible = true;
    this.drawMarquee('GO GO GO!', 'Come on…');
    if (this.audio) this.audio.play('hatch', { pos: this.world(0, 5, -1), rate: 1.3 });
  }

  world(x, y, z) {
    tv.set(x, y, z).applyEuler(this.group.rotation).add(VEND_POS);
    return tv;
  }

  step(h) {
    const b = this.ball;
    b.vy -= G * h;
    b.x += b.vx * h; b.y += b.vy * h;
    if (b.x < -HW + R) { b.x = -HW + R; b.vx = Math.abs(b.vx) * 0.6; }
    if (b.x > HW - R) { b.x = HW - R; b.vx = -Math.abs(b.vx) * 0.6; }
    for (let k = 0; k < this.pegs.length; k++) {
      const [px, py] = this.pegs[k];
      const dx = b.x - px, dy = b.y - py, d2 = dx * dx + dy * dy, m = R + PR;
      if (d2 < m * m && d2 > 1e-9) {
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
        b.x = px + nx * m; b.y = py + ny * m;
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) {
          b.vx -= (1 + REST) * vn * nx; b.vy -= (1 + REST) * vn * ny;
          if (vn < -0.4) {
            this.pegHit[k] = 1;
            if (this.audio) this.audio.play('peg', { pos: this.world(px, BASE_Y + py, -0.7), range: 40, vol: Math.min(1, -vn / 3), rate: 0.9 + (3.5 - py) * 0.12 });
          }
        }
      }
    }
    if (b.y < 0.55) for (let k = 1; k < BOUNDS.length - 1; k++) { const dx = b.x - BOUNDS[k]; if (Math.abs(dx) < R + 0.02) { b.x = BOUNDS[k] + Math.sign(dx || 1) * (R + 0.02); b.vx = -b.vx * 0.4; } }
    if (b.y < R) {
      let slot = b.x < 0 ? 0 : 8;
      for (let k = 0; k < BOUNDS.length - 1; k++) if (b.x >= BOUNDS[k] && b.x < BOUNDS[k + 1]) slot = k;
      return slot;
    }
    return -1;
  }

  update(dt, playerPos, progress) {
    this.time += dt;
    this.t += dt;
    for (let k = 0; k < 34; k++) {
      const on = this.state === 'fall' ? (Math.floor(this.time * 12) + k) % 3 === 0 : this.state === 'result' ? Math.floor(this.time * 8) % 2 === k % 2 : (Math.floor(this.time * 3) + k) % 6 === 0;
      this.bulbs.setColorAt(k, tc.set(on ? '#fff3a8' : '#8a6ad8'));
    }
    this.bulbs.instanceColor.needsUpdate = true;
    let pegDirty = false;
    for (let k = 0; k < this.pegs.length; k++) {
      if (this.pegHit[k] <= 0) continue;
      this.pegHit[k] = Math.max(0, this.pegHit[k] - dt * 4);
      this.pegMesh.setColorAt(k, tc.set('#ffffff').lerp(tv.set(1, 0.8, 0.2), this.pegHit[k]));
      pegDirty = true;
    }
    if (pegDirty) this.pegMesh.instanceColor.needsUpdate = true;
    if (this.state === 'aimX' || this.state === 'aimP') {
      if (this.state === 'aimX') this.x0 = tri(this.t, 2.2) * XR;
      else this.pow = tri(this.t, 1.25);
      if (this.t > 14 || (playerPos && playerPos.distanceTo(VEND_POS) > 12)) this.launch();
    }
    const showPow = this.state === 'aimP' || this.state === 'fall';
    this.dropper.position.x = this.x0;
    this.arrow.visible = showPow;
    this.arrow.scale.set(1, 0.4 + Math.abs(this.pow) * 1.8, 1);
    this.arrow.rotation.z = this.pow >= 0 ? -Math.PI / 2 : Math.PI / 2;
    this.arrow.position.x = (this.pow >= 0 ? 1 : -1) * (0.25 + Math.abs(this.pow) * 0.3);
    this.guide.visible = this.state === 'aimX';
    if (this.state === 'fall') {
      const n = Math.max(1, Math.round(dt * 240));
      for (let i = 0; i < n; i++) {
        const slot = this.step(1 / 240);
        if (slot >= 0) { this.finish(slot, progress); break; }
      }
      this.ballMesh.position.set(this.ball.x, BASE_Y + this.ball.y, -0.71);
      if (this.t > 15) this.finish(4, progress);
    }
    if (this.state === 'result' && this.t > 3.2) {
      this.state = 'idle';
      this.ballMesh.visible = false;
      this.drawMarquee('PLINKO', '◇1,000 a drop · aim well, win big');
    }
  }

  finish(slot, progress) {
    this.state = 'result';
    this.t = 0;
    const value = SLOT_VALUES[slot];
    const prize = rollPrize(value, progress);
    this.result = { slot, value, prize };
    const jackpot = value >= 2000;
    this.drawMarquee(jackpot ? 'JACKPOT!' : value >= 800 ? 'NICE!' : 'YOU WIN', prize.label, jackpot ? '#e0a400' : '#7b4de6');
    if (this.onResult) this.onResult(this.result, this.world(this.ball.x, BASE_Y + this.ball.y, -1).clone());
  }
}
