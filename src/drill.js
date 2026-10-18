// Cube Breakers: the team's hover drill (parking pad, buying, one driver at a time, flying, colliding with and tunnelling through blocks, network sync).

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DRILL, PLAY_R } from './config.js';

export const PARK_POS = new THREE.Vector3(-18, 0, 55);
const REST_Y = 0.8;
const C = Array.from({ length: 64 }, () => ({}));
const tv = new THREE.Vector3();
const tw = new THREE.Vector3();
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

function drillGeometry() {
  const g = new THREE.ConeGeometry(0.55, 1.35, 28, 14, true);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + 0.12 * Math.sin(a * 3 + y * 9) * (0.6 - y / 1.35);
    p.setXYZ(i, x * k, y, z * k);
  }
  g.computeVertexNormals();
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, -0.675);
  return g;
}

export class Drill {
  constructor(scene, physics, R) {
    this.scene = scene;
    this.pos = new THREE.Vector3(PARK_POS.x, REST_Y, PARK_POS.z);
    this.target = this.pos.clone();
    this.yaw = 0;
    this.pitch = 0;
    this.targetYaw = 0;
    this.targetPitch = 0;
    this.vel = new THREE.Vector3();
    this.driving = false;
    this.remoteDriver = null;
    this.digging = false;
    this.spin = 0;
    this.digT = 0;
    this.soundT = 0;
    this.sendT = 0;
    this.owned = false;
    this.items = [];
    this.boxes = [];
    this.hits = 0;

    const pad = new THREE.Group();
    pad.position.copy(PARK_POS);
    const asphalt = new THREE.Mesh(new RoundedBoxGeometry(6.4, 0.08, 8.4, 2, 0.04), new THREE.MeshStandardMaterial({ color: '#4b5568', roughness: 0.9 }));
    asphalt.position.y = 0.04;
    asphalt.receiveShadow = true;
    pad.add(asphalt);
    const lineMat = new THREE.MeshBasicMaterial({ color: '#f4f8fc' });
    for (const x of [-2.9, 2.9]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 7.6), lineMat);
      l.position.set(x, 0.09, 0);
      pad.add(l);
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.02, 0.14), lineMat);
    back.position.set(0, 0.09, 3.8);
    pad.add(back);
    const signPost = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 12), new THREE.MeshStandardMaterial({ color: '#f4f8fc' }));
    signPost.position.set(0, 1.6, 4.3);
    pad.add(signPost);
    this.signTex = this.canvasTex(640, 320, () => {});
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshBasicMaterial({ map: this.signTex, transparent: true, toneMapped: false, side: THREE.DoubleSide }));
    sign.position.set(0, 3.4, 4.3);
    sign.rotation.y = Math.PI;
    pad.add(sign);
    scene.add(pad);
    this.pad = pad;

    const orange = new THREE.MeshPhysicalMaterial({ color: '#ff9a1f', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15 });
    const white = new THREE.MeshPhysicalMaterial({ color: '#f4f8fc', roughness: 0.3, clearcoat: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: '#1d2a44', roughness: 0.5 });
    const glass = new THREE.MeshPhysicalMaterial({ color: '#bfe9ff', roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.35, depthWrite: false });
    const metal = new THREE.MeshStandardMaterial({ color: '#d7dee8', metalness: 0.95, roughness: 0.22 });
    this.glowMat = new THREE.MeshBasicMaterial({ color: '#7fe8ff', toneMapped: false });

    const car = new THREE.Group();
    const body = new THREE.Mesh(new RoundedBoxGeometry(1.55, 0.72, 2.3, 4, 0.22), orange);
    body.castShadow = true;
    car.add(body);
    const stripe = new THREE.Mesh(new RoundedBoxGeometry(1.58, 0.14, 2.0, 2, 0.05), white);
    stripe.position.set(0, 0.06, 0.05);
    car.add(stripe);
    const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.6, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), glass);
    bubble.position.set(0, 0.34, 0.28);
    bubble.scale.set(1, 0.8, 1.15);
    bubble.renderOrder = 2;
    car.add(bubble);
    const seat = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.2, 0.5, 2, 0.06), dark);
    seat.position.set(0, 0.42, 0.45);
    car.add(seat);
    for (const [x, z] of [[-0.6, -0.8], [0.6, -0.8], [-0.6, 0.85], [0.6, 0.85]]) {
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.16, 20), dark);
      pod.position.set(x, -0.42, z);
      car.add(pod);
      const glow = new THREE.Mesh(new THREE.CircleGeometry(0.24, 20), this.glowMat);
      glow.rotation.x = Math.PI / 2;
      glow.position.set(x, -0.505, z);
      car.add(glow);
    }
    for (const x of [-0.45, 0.45]) {
      const light = new THREE.Mesh(new THREE.CircleGeometry(0.1, 14), new THREE.MeshBasicMaterial({ color: '#fff6c8', toneMapped: false }));
      light.position.set(x, 0.12, -1.16);
      light.rotation.y = Math.PI;
      car.add(light);
    }
    this.head = new THREE.Group();
    this.head.position.set(0, 0, -1.05);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.22, 28), dark);
    collar.rotation.x = Math.PI / 2;
    this.head.add(collar);
    this.bit = new THREE.Mesh(drillGeometry(), metal);
    this.bit.position.z = -0.1;
    this.bit.castShadow = true;
    this.head.add(this.bit);
    car.add(this.head);
    this.car = car;
    this.car.position.copy(this.pos);
    scene.add(car);

    physics.createCollider(R.ColliderDesc.cuboid(0.1, 1.6, 0.1).setTranslation(PARK_POS.x, 1.6, PARK_POS.z + 4.3));
    this.items.push({ kind: 'drill', node: this.car, pos: this.pos.clone(), r: 1.5, noScale: true });
    this.drawSign(false);
  }

  canvasTex(w, h, draw) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    draw(ctx, w, h);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.userData.ctx = ctx;
    return t;
  }

  drawSign(owned) {
    const ctx = this.signTex.userData.ctx;
    ctx.clearRect(0, 0, 640, 320);
    ctx.fillStyle = '#ff9a1f';
    rr(ctx, 8, 8, 624, 304, 50);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = "italic 900 120px Nunito, sans-serif";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('DRILL', 320, 120);
    ctx.font = "900 54px Nunito, sans-serif";
    ctx.fillText(owned ? 'TEAM OWNED' : '◇ ' + fmt(DRILL.price), 320, 236);
    this.signTex.needsUpdate = true;
  }

  setOwned(owned) {
    if (owned === this.owned) return;
    this.owned = owned;
    this.drawSign(owned);
  }

  get seat() { return tv.copy(this.pos); }

  aimDir(out) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  netState(v) {
    if (!v) return;
    if (v.p) this.target.set(v.p[0], v.p[1], v.p[2]);
    if (typeof v.y === 'number') this.targetYaw = v.y;
    if (typeof v.a === 'number') this.targetPitch = v.a;
    this.remoteDigging = !!v.h;
  }

  collide(game) {
    const p = this.pos;
    for (let pass = 0; pass < 2; pass++) {
      for (const off of [0, 0.75]) {
        tw.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(off).add(p);
        let n = game.cube.sphereContacts(tw, DRILL.body, C, 0);
        n = game.chunks.sphereContacts(tw, DRILL.body, C, n);
        let mx = 0, my = 0, mz = 0;
        for (let k = 0; k < n; k++) {
          const c = C[k];
          const px = c.depth * c.nx, py = c.depth * c.ny, pz = c.depth * c.nz;
          if (Math.abs(px) > Math.abs(mx)) mx = px;
          if (Math.abs(py) > Math.abs(my)) my = py;
          if (Math.abs(pz) > Math.abs(mz)) mz = pz;
        }
        p.x += mx; p.y += my; p.z += mz;
        if (mx * this.vel.x < 0) this.vel.x = 0;
        if (my * this.vel.y < 0) this.vel.y = 0;
        if (mz * this.vel.z < 0) this.vel.z = 0;
      }
      for (const o of game.obstacles) {
        const cx = Math.min(Math.max(p.x, o.min.x), o.max.x);
        const cy = Math.min(Math.max(p.y, o.min.y), o.max.y);
        const cz = Math.min(Math.max(p.z, o.min.z), o.max.z);
        const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
        const d2 = dx * dx + dy * dy + dz * dz;
        const r = 1.0;
        if (d2 >= r * r || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        p.x += (dx / d) * (r - d); p.y += (dy / d) * (r - d); p.z += (dz / d) * (r - d);
      }
    }
  }

  drive(dt, keys, yaw, pitch, game, progress) {
    this.yaw = yaw;
    this.pitch = Math.max(-0.7, Math.min(0.7, pitch));
    const f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const s = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const u = (keys.has('Space') ? 1 : 0) - (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1 : 0);
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    let wx = -sy * f + cy * s, wz = -cy * f - sy * s;
    const wl = Math.hypot(wx, wz);
    const speed = DRILL.speed * (this.digging ? 0.55 : 1);
    if (wl > 0) { wx = (wx / wl) * speed; wz = (wz / wl) * speed; }
    const k = Math.min(1, dt * 4);
    this.vel.x += (wx - this.vel.x) * k;
    this.vel.z += (wz - this.vel.z) * k;
    this.vel.y += (u * DRILL.climb - this.vel.y) * Math.min(1, dt * 6);
    this.pos.addScaledVector(this.vel, dt);
    const top = Math.max(6, (game.cube.height || 12) + 3);
    if (this.pos.y < REST_Y) { this.pos.y = REST_Y; this.vel.y = Math.max(0, this.vel.y); }
    if (this.pos.y > top) { this.pos.y = top; this.vel.y = Math.min(0, this.vel.y); }
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > PLAY_R - 3) { this.pos.x *= (PLAY_R - 3) / r; this.pos.z *= (PLAY_R - 3) / r; }
    this.collide(game);
    this.digT -= dt;
    if (this.digT <= 0) {
      this.digT = 0.1;
      this.aimDir(tw);
      let hits = 0, color = null;
      for (const d of [1.0, 1.75]) {
        tv.copy(this.pos).addScaledVector(tw, d);
        const res = game.drillDig(tv, DRILL.tip, DRILL.dps * progress.damageMul * 0.1, true);
        hits += res.hits;
        color = color || res.color;
      }
      this.digging = hits > 0;
      if (this.digging) this.digFx(game, tv, color);
    }
  }

  digFx(game, tip, color) {
    const fx = game.fx;
    fx.spawnDebris(tip, color || '#cccccc', 3, 5, 0.16);
    fx.sparkle(tip, '#ffe6a0', 4, 5);
    if (Math.random() < 0.4) fx.dustPuff(tip, 1, 0.5, '#f4efe6', 1.1);
    this.soundT -= 0.1;
    if (this.soundT <= 0) {
      this.soundT = 0.18;
      game.audio.play('dig', { pos: tip, range: 50, vol: 0.8, rate: 0.9 + Math.random() * 0.3 });
    }
    if (this.driving) fx.addShake(0.06);
  }

  update(dt, game, net) {
    if (!this.driving) {
      const k = 1 - Math.exp(-dt * 10);
      this.pos.lerp(this.target, k);
      let dy = this.targetYaw - this.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.yaw += dy * k;
      this.pitch += (this.targetPitch - this.pitch) * k;
      this.digging = !!(this.remoteDriver && this.remoteDigging);
      if (this.digging) {
        this.digT -= dt;
        if (this.digT <= 0) {
          this.digT = 0.12;
          this.aimDir(tw);
          tv.copy(this.pos).addScaledVector(tw, 1.6);
          const res = game.drillDig(tv, DRILL.tip, 0, false);
          if (res.hits) this.digFx(game, tv, res.color);
        }
      }
    }
    const active = this.driving || !!this.remoteDriver;
    this.spin += dt * (this.digging ? 34 : active ? 12 : 0);
    this.bit.rotation.z = this.spin;
    this.car.position.copy(this.pos);
    if (active) this.car.position.y += Math.sin(performance.now() / 260) * 0.03;
    this.car.rotation.set(0, this.yaw, 0);
    this.head.rotation.x = this.pitch;
    this.glowMat.color.setHSL(0.52, 0.9, active ? 0.65 + 0.15 * Math.sin(performance.now() / 90) : 0.45);
    this.items[0].pos.copy(this.pos);
    this.car.visible = this.owned || true;
    if (this.driving && net) {
      this.sendT -= dt;
      if (this.sendT <= 0) {
        this.sendT = 0.1;
        net.sendDrill(this.state());
      }
    }
  }

  state() {
    const r = (v, q) => Math.round(v * q) / q;
    return { p: [r(this.pos.x, 100), r(this.pos.y, 100), r(this.pos.z, 100)], y: r(this.yaw, 1000), a: r(this.pitch, 1000), h: this.digging ? 1 : 0 };
  }

  cameraPose(cam, yaw, pitch) {
    tv.set(0, 0.95, 0.75).applyAxisAngle(tw.set(0, 1, 0), this.yaw).add(this.car.position);
    cam.position.copy(tv);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(pitch, yaw, 0);
  }

  exitSpot(game) {
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const tries = [[cy * 2.2, -sy * 2.2], [-cy * 2.2, sy * 2.2], [sy * 2.6, cy * 2.6], [0, 0]];
    for (const [dx, dz] of tries) {
      const x = this.pos.x + dx, z = this.pos.z + dz;
      const y = Math.max(0, this.pos.y - 0.8);
      const free = [0.3, 1.0, 1.7].every((h) => !game.cube.solidAt(Math.floor(x + 12), Math.floor(y + h), Math.floor(z + 12)));
      if (free) return new THREE.Vector3(x, y, z);
    }
    return new THREE.Vector3(this.pos.x, this.pos.y + 0.8, this.pos.z);
  }
}
