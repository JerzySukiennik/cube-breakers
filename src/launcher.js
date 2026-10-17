// Cube Breakers: first-person ball launcher viewmodel (own scene, drawn on top).

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

function starShape(r1, r2) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 ? r2 : r1;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

export class Launcher {
  constructor(env) {
    this.scene = new THREE.Scene();
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.8;
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight('#e6f4ff', '#6aa24a', 1.4));
    const key = new THREE.DirectionalLight('#fff4e4', 2.2);
    key.position.set(-1, 2, 1.2);
    this.scene.add(key);

    const white = new THREE.MeshPhysicalMaterial({ color: '#f3f6fa', roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.2 });
    const glass = new THREE.MeshPhysicalMaterial({
      color: '#7fd3ff', roughness: 0.06, clearcoat: 1, transparent: true, opacity: 0.42,
      side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.5,
    });
    const green = new THREE.MeshPhysicalMaterial({ color: '#33d14f', roughness: 0.25, clearcoat: 1 });
    const blue = new THREE.MeshPhysicalMaterial({ color: '#2a8de8', roughness: 0.25, clearcoat: 1 });
    const purple = new THREE.MeshStandardMaterial({ color: '#7b4de6', roughness: 0.4, side: THREE.DoubleSide });

    this.root = new THREE.Group();
    this.base = new THREE.Vector3(0.31, -0.3, -0.74);
    this.root.position.copy(this.base);
    this.root.rotation.set(0.02, 0.06, 0);
    this.root.scale.setScalar(0.74);
    this.scene.add(this.root);

    const body = new THREE.Mesh(new RoundedBoxGeometry(0.17, 0.2, 0.34, 4, 0.07), white);
    body.position.set(0, -0.035, 0.07);
    this.root.add(body);
    const grip = new THREE.Mesh(new RoundedBoxGeometry(0.085, 0.2, 0.12, 3, 0.04), white);
    grip.position.set(0, -0.17, 0.15);
    grip.rotation.x = -0.25;
    this.root.add(grip);
    const star = new THREE.Mesh(new THREE.ShapeGeometry(starShape(0.04, 0.017)), purple);
    star.position.set(-0.0865, -0.03, 0.08);
    star.rotation.y = -Math.PI / 2;
    this.root.add(star);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.064, 0.5, 32, 1, true), glass);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.035, -0.17);
    barrel.renderOrder = 2;
    this.root.add(barrel);
    const ringGeo = new THREE.TorusGeometry(0.068, 0.02, 12, 40);
    for (const [z, m] of [[-0.25, blue], [-0.33, green], [-0.395, green]]) {
      const ring = new THREE.Mesh(ringGeo, m);
      ring.position.set(0, 0.035, z);
      this.root.add(ring);
    }
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.066, 0.012, 10, 40), white);
    lip.position.set(0, 0.035, -0.42);
    this.root.add(lip);

    this.ballMat = new THREE.MeshPhysicalMaterial({ color: '#2f9bff', roughness: 0.1, clearcoat: 1, emissive: '#ffffff', emissiveIntensity: 0.05 });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.05, 20, 14), this.ballMat);
    this.ball.position.set(0, 0.035, -0.32);
    this.root.add(this.ball);

    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0.035, -0.45);
    this.root.add(this.muzzle);

    this.kick = 0;
    this.switchT = 1;
    this.swayX = 0;
    this.swayY = 0;
    this.aim = 0;
    this.ballPop = 1;
    this.ballScale = 1;
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  setType(cfg, animate) {
    this.ballMat.color.set(cfg.color);
    this.ballMat.metalness = cfg.gold ? 1 : 0;
    this.ballMat.roughness = cfg.gold ? 0.18 : 0.1;
    this.ballScale = cfg.mega ? 1.25 : cfg.id === 'mini' ? 0.8 : 1;
    if (animate) this.switchT = 0;
  }

  fire() {
    this.kick = 1;
    this.ballPop = 0;
  }

  update(dt, time, lookDx, lookDy, moveSpeed, aiming) {
    this.kick *= Math.exp(-dt * 10);
    this.switchT = Math.min(1, this.switchT + dt * 4);
    this.ballPop = Math.min(1, this.ballPop + dt * 5);
    this.aim += ((aiming ? 1 : 0) - this.aim) * Math.min(1, dt * 10);
    this.swayX += (-lookDx * 0.00035 - this.swayX) * Math.min(1, dt * 9);
    this.swayY += (lookDy * 0.00035 - this.swayY) * Math.min(1, dt * 9);
    this.swayX = Math.max(-0.05, Math.min(0.05, this.swayX));
    this.swayY = Math.max(-0.05, Math.min(0.05, this.swayY));
    const b = Math.min(1, moveSpeed / 8);
    const bobX = Math.cos(time * 7) * 0.008 * b;
    const bobY = Math.abs(Math.sin(time * 7)) * 0.012 * b;
    const dip = Math.sin(this.switchT * Math.PI) * 0.16;
    this.root.position.set(
      this.base.x - this.aim * 0.1 + this.swayX + bobX,
      this.base.y + this.aim * 0.03 + this.swayY - bobY - dip + Math.sin(time * 1.6) * 0.004,
      this.base.z + this.kick * 0.07,
    );
    this.root.rotation.set(0.02 + this.kick * 0.16 + this.swayY * 2, 0.1 - this.aim * 0.06 + this.swayX * 2, -this.swayX * 1.5);
    this.ball.scale.setScalar(this.ballScale * (0.3 + 0.7 * this.ballPop));
  }

  muzzleWorld(mainCamera, out) {
    this.root.updateMatrixWorld(true);
    this.muzzle.getWorldPosition(out);
    return out.applyMatrix4(mainCamera.matrixWorld);
  }
}
