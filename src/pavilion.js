// Cube Breakers: the white ball-shop pavilion with pack jars, upgrade screens, a free dispenser and a recycle bin.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BALL_TYPES } from './config.js';
import { PACKS, UPGRADES } from './progress.js';

export const SHOP_POS = new THREE.Vector3(0, 0, 60);
const FLOOR = 0.26;

function canvasTex(w, h, draw) {
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

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawIcon(ctx, id, cx, cy, s) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s / 100, s / 100);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const circle = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
  switch (id) {
    case 'power':
      ctx.beginPath(); ctx.moveTo(10, -48); ctx.lineTo(-26, 6); ctx.lineTo(-2, 6); ctx.lineTo(-12, 48); ctx.lineTo(26, -8); ctx.lineTo(2, -8); ctx.closePath(); ctx.fill();
      break;
    case 'speed':
      for (const o of [-22, 12]) { ctx.beginPath(); ctx.moveTo(o - 14, -30); ctx.lineTo(o + 16, 0); ctx.lineTo(o - 14, 30); ctx.stroke(); }
      break;
    case 'cap':
      circle(-22, 18, 17); circle(22, 18, 17); circle(0, -18, 17);
      break;
    case 'rate':
      for (const y of [-24, 0, 24]) { ctx.beginPath(); ctx.moveTo(-40, y); ctx.lineTo(8 - Math.abs(y) * 0.6, y); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(14, -26); ctx.lineTo(40, 0); ctx.lineTo(14, 26); ctx.stroke();
      break;
    case 'magnet':
      ctx.lineWidth = 22; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(-26, -34); ctx.moveTo(26, 0); ctx.lineTo(26, -34); ctx.stroke();
      ctx.fillStyle = '#bfe6ff'; ctx.fillRect(-37, -46, 22, 14); ctx.fillRect(15, -46, 22, 14);
      break;
    case 'run':
      ctx.beginPath(); ctx.moveTo(-34, 22); ctx.lineTo(30, 22); ctx.quadraticCurveTo(44, 22, 40, 8); ctx.lineTo(4, -2); ctx.lineTo(-8, -26); ctx.lineTo(-30, -26); ctx.closePath(); ctx.fill();
      ctx.lineWidth = 6; for (const y of [-12, 2]) { ctx.beginPath(); ctx.moveTo(-50, y); ctx.lineTo(-38, y); ctx.stroke(); }
      break;
    case 'djump':
      for (const o of [-14, 18]) { ctx.beginPath(); ctx.moveTo(-28, o + 14); ctx.lineTo(0, o - 14); ctx.lineTo(28, o + 14); ctx.stroke(); }
      break;
    case 'jet':
      ctx.beginPath(); ctx.moveTo(0, -46); ctx.quadraticCurveTo(20, -24, 16, 18); ctx.lineTo(-16, 18); ctx.quadraticCurveTo(-20, -24, 0, -46); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-16, 4); ctx.lineTo(-30, 26); ctx.lineTo(-16, 22); ctx.moveTo(16, 4); ctx.lineTo(30, 26); ctx.lineTo(16, 22); ctx.fill();
      ctx.fillStyle = '#ffd34a'; ctx.beginPath(); ctx.moveTo(-9, 22); ctx.lineTo(0, 46); ctx.lineTo(9, 22); ctx.fill();
      break;
    case 'fuel':
      ctx.beginPath(); ctx.moveTo(0, -44); ctx.quadraticCurveTo(34, 0, 26, 18); ctx.arc(0, 18, 26, 0, Math.PI); ctx.quadraticCurveTo(-34, 0, 0, -44); ctx.fill();
      break;
    case 'recycle':
      for (let k = 0; k < 3; k++) {
        ctx.save(); ctx.rotate((k * Math.PI * 2) / 3);
        ctx.beginPath(); ctx.arc(0, 0, 32, -1.35, -0.45); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(24, -26); ctx.lineTo(40, -14); ctx.lineTo(20, -6); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      break;
    case 'luck':
      for (const [x, y] of [[-16, -16], [16, -16], [-16, 16], [16, 16]]) circle(x, y, 17);
      ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(4, 8); ctx.quadraticCurveTo(20, 34, 10, 48); ctx.stroke();
      break;
    default:
      circle(0, 0, 30);
  }
  ctx.restore();
}

export class Pavilion {
  constructor(scene, physics, R) {
    this.physics = physics;
    this.R = R;
    this.group = new THREE.Group();
    this.group.position.copy(SHOP_POS);
    scene.add(this.group);
    this.boxes = [];
    this.items = [];
    this.stations = [];

    const white = new THREE.MeshStandardMaterial({ color: '#f3f7fb', roughness: 0.42 });
    const blue = new THREE.MeshPhysicalMaterial({ color: '#36a3ee', roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.15 });
    const glass = new THREE.MeshPhysicalMaterial({ color: '#d9f3ff', roughness: 0.04, clearcoat: 1, transparent: true, opacity: 0.26, depthWrite: false, envMapIntensity: 1.6 });
    this.mats = { white, blue, glass };

    this.box(23, 0.2, 15, 0, 0.1, 0, white, 0.08, true);
    this.box(22, 0.08, 14, 0, FLOOR - 0.04, 0, blue, 0.03, false);
    this.collider(11.5, FLOOR / 2, 7.5, 0, FLOOR / 2, 0);
    this.ballBox(-11.5, 0, -7.5, 11.5, FLOOR, 7.5);

    this.box(24, 0.5, 16, 0, 5.4, 0, white, 0.24, true);
    this.collider(12, 0.25, 8, 0, 5.4, 0);
    this.ballBox(-12, 5.15, -8, 12, 5.65, 8);

    const pillarGeo = new THREE.CylinderGeometry(0.32, 0.32, 5.0, 20);
    for (const [x, z] of [[-11, -7], [11, -7], [-11, 7], [11, 7], [-4, 7], [4, 7]]) {
      const p = new THREE.Mesh(pillarGeo, white);
      p.position.set(x, FLOOR + 2.5, z);
      p.castShadow = true;
      p.receiveShadow = true;
      this.group.add(p);
      this.collider(0.32, 2.5, 0.32, x, FLOOR + 2.5, z);
      this.ballBox(x - 0.32, 0, z - 0.32, x + 0.32, 5.2, z + 0.32);
    }

    this.box(17, 1.0, 1.3, 0, FLOOR + 0.5, 1.5, white, 0.08, true);
    this.box(17.4, 0.1, 1.6, 0, FLOOR + 1.05, 1.5, blue, 0.04, false);
    this.collider(8.7, 0.55, 0.8, 0, FLOOR + 0.55, 1.5);
    this.ballBox(-8.7, 0, 0.7, 8.7, FLOOR + 1.1, 2.3);

    this.box(21, 0.9, 1.1, 0, FLOOR + 0.45, 5.6, white, 0.08, true);
    this.box(21.4, 0.1, 1.4, 0, FLOOR + 0.95, 5.6, blue, 0.04, false);
    this.collider(10.7, 0.5, 0.7, 0, FLOOR + 0.5, 5.6);
    this.ballBox(-10.7, 0, 4.9, 10.7, FLOOR + 1.0, 6.3);

    this.buildJars();
    this.buildStations();
    this.buildDispenser();
    this.buildBin();
    this.buildSign();
    this.hover = null;
    this.time = 0;
  }

  box(w, h, d, x, y, z, mat, r, shadow) {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    this.group.add(m);
    return m;
  }

  collider(hx, hy, hz, x, y, z) {
    const p = SHOP_POS;
    this.physics.createCollider(this.R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(p.x + x, p.y + y, p.z + z).setFriction(0.8));
  }

  ballBox(x0, y0, z0, x1, y1, z1) {
    const p = SHOP_POS;
    this.boxes.push({ min: new THREE.Vector3(p.x + x0, p.y + y0, p.z + z0), max: new THREE.Vector3(p.x + x1, p.y + y1, p.z + z1) });
  }

  world(x, y, z) { return new THREE.Vector3(x, y, z).add(SHOP_POS); }

  buildJars() {
    const glassGeo = new RoundedBoxGeometry(0.8, 0.86, 0.8, 3, 0.12);
    const capGeo = new RoundedBoxGeometry(0.86, 0.13, 0.86, 3, 0.06);
    const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 18, 12), new THREE.MeshPhysicalMaterial({ color: '#fff', roughness: 0.1, clearcoat: 1, envMapIntensity: 1.2 }), PACKS.length * 6);
    balls.castShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const v = new THREE.Vector3();
    const c = new THREE.Color();
    let k = 0;
    PACKS.forEach((pk, i) => {
      const t = BALL_TYPES[pk.type];
      const x = -7.35 + i * 2.1;
      const g = new THREE.Group();
      g.position.set(x, FLOOR + 1.1, 1.5);
      const capMat = new THREE.MeshPhysicalMaterial({ color: t.color, roughness: 0.25, clearcoat: 1, metalness: t.gold ? 0.8 : 0 });
      const base = new THREE.Mesh(capGeo, capMat); base.position.y = 0.07; g.add(base);
      const lid = new THREE.Mesh(capGeo, capMat); lid.position.y = 0.98; g.add(lid);
      const jar = new THREE.Mesh(glassGeo, this.mats.glass); jar.position.y = 0.53; jar.renderOrder = 2; g.add(jar);
      this.group.add(g);
      const r = t.mega ? 0.2 : 0.15;
      const spots = t.mega ? [[0, 0.36, 0], [0, 0.72, 0]] : [[-0.16, 0.3, -0.16], [0.16, 0.3, -0.12], [-0.12, 0.3, 0.16], [0.16, 0.3, 0.16], [0, 0.6, 0], [0.12, 0.72, -0.08]];
      for (const sp of spots) {
        m.compose(v.set(x + sp[0], FLOOR + 1.1 + sp[1], 1.5 + sp[2]), q, s.setScalar(r));
        balls.setMatrixAt(k, m);
        balls.setColorAt(k, c.set(t.color));
        k++;
      }
      this.items.push({ kind: 'pack', idx: i, node: g, pos: this.world(x, FLOOR + 1.6, 1.5), r: 0.75 });
    });
    balls.count = k;
    this.group.add(balls);
  }

  stationTexture(st, progress) {
    const ctx = st.tex.userData.ctx;
    const W = 384, H = 256;
    const u = st.u;
    const lv = progress ? progress.lvl(u.id) : 0;
    const locked = progress ? progress.locked(u.id) : false;
    const maxed = progress ? progress.maxed(u.id) : false;
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, locked ? '#7d8ca3' : '#3aa9f5');
    g.addColorStop(1, locked ? '#5b6880' : '#1f6fd6');
    ctx.fillStyle = g;
    roundRect(ctx, 6, 6, W - 12, H - 12, 26);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.stroke();
    drawIcon(ctx, u.id, 96, 112, 120);
    ctx.fillStyle = '#ffffff';
    ctx.font = "900 40px Nunito, sans-serif";
    ctx.textAlign = 'left';
    ctx.fillText(u.name, 176, 92, 190);
    ctx.font = "800 30px Nunito, sans-serif";
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    const lvText = locked ? 'Needs Jetpack' : maxed ? 'MAX' : u.max === 1 ? 'Unlock' : `Lv ${lv} / ${u.max}`;
    ctx.fillText(lvText, 176, 138, 190);
    if (!maxed && !locked && progress) {
      ctx.font = "900 34px Nunito, sans-serif";
      ctx.fillStyle = '#ffffff';
      ctx.fillText('◇ ' + progress.price(u.id).toLocaleString('en-US'), 176, 196, 190);
    }
    const pips = Math.min(u.max, 10);
    if (u.max > 1) {
      for (let i = 0; i < pips; i++) {
        ctx.fillStyle = i < Math.round((lv / u.max) * pips) ? '#ffd34a' : 'rgba(255,255,255,0.3)';
        roundRect(ctx, 40 + i * 31, 214, 24, 12, 6);
        ctx.fill();
      }
    }
    st.tex.needsUpdate = true;
  }

  buildStations() {
    const panelGeo = new RoundedBoxGeometry(1.62, 1.1, 0.08, 3, 0.04);
    const standGeo = new RoundedBoxGeometry(0.3, 0.5, 0.2, 2, 0.05);
    UPGRADES.forEach((u, i) => {
      const x = -9.5 + i * 1.9;
      const g = new THREE.Group();
      g.position.set(x, FLOOR + 1.0, 5.6);
      const stand = new THREE.Mesh(standGeo, this.mats.white);
      stand.position.set(0, 0.25, 0.1);
      g.add(stand);
      const tilt = new THREE.Group();
      tilt.position.set(0, 0.95, 0);
      tilt.rotation.x = 0.32;
      const panel = new THREE.Mesh(panelGeo, this.mats.white);
      panel.castShadow = true;
      tilt.add(panel);
      const tex = canvasTex(384, 256, () => {});
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
      screen.position.z = -0.045;
      screen.rotation.y = Math.PI;
      tilt.add(screen);
      g.add(tilt);
      this.group.add(g);
      const st = { u, tex, node: g };
      this.stations.push(st);
      this.stationTexture(st, null);
      this.items.push({ kind: 'upgrade', id: u.id, node: g, pos: this.world(x, FLOOR + 1.9, 5.5), r: 0.85 });
    });
  }

  refresh(progress) {
    for (const st of this.stations) this.stationTexture(st, progress);
  }

  buildDispenser() {
    const g = new THREE.Group();
    g.position.set(-8.6, FLOOR, -4.6);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.8, 0.6, 32), this.mats.white);
    base.position.y = 0.3;
    base.castShadow = true;
    g.add(base);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.8, 32, 1, true), this.mats.glass);
    tube.position.y = 1.5;
    tube.renderOrder = 2;
    g.add(tube);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.66, 0.2, 32), new THREE.MeshPhysicalMaterial({ color: '#2f9bff', roughness: 0.2, clearcoat: 1 }));
    cap.position.y = 2.5;
    g.add(cap);
    const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(0.15, 14, 10), new THREE.MeshPhysicalMaterial({ color: '#2f9bff', roughness: 0.1, clearcoat: 1 }), 46);
    const m = new THREE.Matrix4();
    let k = 0;
    for (let ly = 0; ly < 6; ly++) for (let a = 0; a < 8 && k < 46; a++) {
      const ang = (a / 8) * Math.PI * 2 + ly * 0.4;
      const rr = a % 2 ? 0.38 : 0.2;
      m.makeTranslation(Math.cos(ang) * rr, 0.78 + ly * 0.24, Math.sin(ang) * rr);
      balls.setMatrixAt(k++, m);
    }
    balls.count = k;
    g.add(balls);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.5), new THREE.MeshBasicMaterial({
      transparent: true, toneMapped: false,
      map: canvasTex(300, 100, (ctx) => {
        ctx.fillStyle = '#ffffff'; roundRect(ctx, 4, 4, 292, 92, 40); ctx.fill();
        ctx.fillStyle = '#1f6fd6'; ctx.font = "900 52px Nunito, sans-serif"; ctx.textAlign = 'center'; ctx.fillText('FREE', 150, 68);
      }),
    }));
    sign.position.set(0, 2.95, 0);
    sign.rotation.y = Math.PI;
    g.add(sign);
    this.group.add(g);
    this.collider(0.75, 1.3, 0.75, -8.6, FLOOR + 1.3, -4.6);
    this.ballBox(-9.35, 0, -5.35, -7.85, FLOOR + 2.6, -3.85);
    this.items.push({ kind: 'dispenser', node: g, pos: this.world(-8.6, FLOOR + 1.5, -4.6), r: 1.05 });
  }

  buildBin() {
    const g = new THREE.Group();
    g.position.set(8.6, FLOOR, -4.6);
    const body = new THREE.Mesh(new RoundedBoxGeometry(1.1, 1.2, 1.1, 3, 0.12), this.mats.glass);
    body.position.y = 0.6;
    body.renderOrder = 2;
    g.add(body);
    const green = new THREE.MeshPhysicalMaterial({ color: '#33d14f', roughness: 0.25, clearcoat: 1 });
    for (const [w, d, x, z] of [[1.24, 0.16, 0, 0.54], [1.24, 0.16, 0, -0.54], [0.16, 1.24, 0.54, 0], [0.16, 1.24, -0.54, 0]]) {
      const rim = new THREE.Mesh(new RoundedBoxGeometry(w, 0.16, d, 2, 0.06), green);
      rim.position.set(x, 1.22, z);
      g.add(rim);
    }
    const base = new THREE.Mesh(new RoundedBoxGeometry(1.14, 0.1, 1.14, 2, 0.04), green);
    base.position.y = 0.05;
    g.add(base);
    const sym = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshBasicMaterial({
      transparent: true, toneMapped: false, depthWrite: false,
      map: canvasTex(200, 200, (ctx) => { ctx.globalAlpha = 0.9; ctx.translate(100, 100); ctx.fillStyle = '#33d14f'; ctx.strokeStyle = '#33d14f'; drawIcon(ctx, 'recycle', 0, 0, 150); }),
    }));
    sym.position.set(0, 0.6, -0.56);
    sym.rotation.y = Math.PI;
    g.add(sym);
    this.group.add(g);
    this.collider(0.6, 0.65, 0.6, 8.6, FLOOR + 0.65, -4.6);
    this.ballBox(8.0, 0, -5.2, 9.2, FLOOR + 1.3, -4.0);
    this.items.push({ kind: 'bin', node: g, pos: this.world(8.6, FLOOR + 0.9, -4.6), r: 1.0 });
  }

  buildSign() {
    const tex = canvasTex(1024, 160, (ctx) => {
      ctx.fillStyle = '#1f6fd6';
      roundRect(ctx, 8, 8, 1008, 144, 60);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = "italic 900 104px Nunito, sans-serif";
      ctx.textAlign = 'center';
      ctx.fillText('BALL SHOP', 512, 118);
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.4), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
    sign.position.set(0, 6.45, -6.5);
    sign.rotation.y = Math.PI;
    this.group.add(sign);
  }

  pick(origin, dir, maxDist = 4.6) {
    let best = null, bestT = Infinity;
    const tv = new THREE.Vector3();
    for (const it of this.items) {
      tv.subVectors(it.pos, origin);
      const t = tv.dot(dir);
      if (t < 0 || t > maxDist) continue;
      const d2 = tv.lengthSq() - t * t;
      if (d2 > it.r * it.r) continue;
      if (t < bestT) { bestT = t; best = it; }
    }
    return best;
  }

  update(dt, hover) {
    this.time += dt;
    for (const it of this.items) {
      const target = it === hover ? 1.07 : 1;
      const s = it.node.scale.x + (target - it.node.scale.x) * Math.min(1, dt * 12);
      it.node.scale.setScalar(s);
    }
  }
}
