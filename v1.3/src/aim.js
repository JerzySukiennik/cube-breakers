// Cube Breakers: right-mouse trajectory preview with the first two bounces.

import * as THREE from 'three';

const MAX_DOTS = 560;
const MAX_MARKS = 4;
const tm = new THREE.Matrix4();
const tq = new THREE.Quaternion();
const ts = new THREE.Vector3();
const tz = new THREE.Vector3(0, 0, 1);
const tl = new THREE.Vector3();

export class Aim {
  constructor(scene) {
    this.dots = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 8, 6),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false, fog: false }),
      MAX_DOTS,
    );
    this.marks = new THREE.InstancedMesh(
      new THREE.TorusGeometry(1, 0.12, 8, 28),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false, fog: false }),
      MAX_MARKS,
    );
    for (const m of [this.dots, this.marks]) {
      m.frustumCulled = false;
      m.count = 0;
      m.renderOrder = 6;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
    }
    this.points = [];
    this.bounces = [];
    this.fade = 0;
  }

  update(dt, active, game, camera, launcher, cfg, time) {
    this.fade += ((active ? 1 : 0) - this.fade) * Math.min(1, dt * 14);
    if (this.fade < 0.02) {
      this.dots.count = 0;
      this.marks.count = 0;
      return;
    }
    if (active) {
      const start = new THREE.Vector3();
      const dir = game.shotStart(camera, launcher, start);
      game.balls.trace(cfg, start, dir, 2, 220, this.points, this.bounces);
    }
    this.dots.material.opacity = 0.85 * this.fade;
    this.marks.material.opacity = 0.95 * this.fade;
    const n = Math.min(MAX_DOTS, this.points.length);
    for (let i = 0; i < n; i++) {
      const p = this.points[i];
      const d = p.distanceTo(camera.position);
      const pulse = 1 + 0.25 * Math.sin(time * 8 - i * 0.35);
      tm.compose(p, tq.identity(), ts.setScalar(Math.max(0.035, d * 0.0042) * pulse));
      this.dots.setMatrixAt(i, tm);
    }
    this.dots.count = n;
    this.dots.instanceMatrix.needsUpdate = true;
    const m = Math.min(MAX_MARKS, this.bounces.length);
    for (let i = 0; i < m; i++) {
      const p = this.bounces[i];
      tq.setFromUnitVectors(tz, tl.copy(camera.position).sub(p).normalize());
      const d = p.distanceTo(camera.position);
      tm.compose(p, tq, ts.setScalar(Math.max(0.12, d * 0.012) * (1 + 0.15 * Math.sin(time * 6))));
      this.marks.setMatrixAt(i, tm);
    }
    this.marks.count = m;
    this.marks.instanceMatrix.needsUpdate = true;
  }
}
