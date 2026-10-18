// Cube Breakers: first-person character on a Rapier kinematic character controller.

import * as THREE from 'three';
import { GRAVITY, PLAY_R } from './config.js';

const HALF_H = 0.55;
const RAD = 0.35;
const EYE = 1.62;

export class Player {
  constructor(physics, R, camera) {
    this.physics = physics;
    this.camera = camera;
    this.feet = new THREE.Vector3(0, 0, 30);
    this.prevFeet = this.feet.clone();
    this.renderFeet = this.feet.clone();
    this.yaw = 0;
    this.pitch = 0.08;
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.ext = new THREE.Vector3();
    this.grounded = false;
    this.jumpBuffer = 0;
    this.coyote = 0;
    this.stepDist = 0;
    this.bobT = 0;
    this.bobAmp = 0;
    this.speedNow = 0;
    this.onStep = null;
    this.onLand = null;
    this.onDoubleJump = null;
    this.onJump = null;
    this.sens = 1;
    this.runMul = 1;
    this.maxJumps = 1;
    this.jumpsUsed = 0;
    this.jetEnabled = false;
    this.maxFuel = 1.5;
    this.fuel = 1.5;
    this.jetting = false;
    this.airTime = 0;
    const bd = R.RigidBodyDesc.kinematicPositionBased().setTranslation(this.feet.x, this.feet.y + HALF_H + RAD + 0.03, this.feet.z);
    this.body = physics.createRigidBody(bd);
    this.collider = physics.createCollider(R.ColliderDesc.capsule(HALF_H, RAD).setFriction(0), this.body);
    this.kcc = physics.createCharacterController(0.02);
    this.kcc.enableAutostep(0.3, 0.2, false);
    this.kcc.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    this.kcc.setMinSlopeSlideAngle((60 * Math.PI) / 180);
    this.kcc.setApplyImpulsesToDynamicBodies(true);
    this.kcc.setCharacterMass(80);
    this.capsule = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: RAD };
    this.updateCapsule();
  }

  get eyeHeight() { return EYE; }

  look(dx, dy) {
    const k = 0.0022 * this.sens;
    this.yaw -= dx * k;
    this.pitch -= dy * k;
    this.pitch = Math.max(-1.53, Math.min(1.53, this.pitch));
  }

  forward(out) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  queueJump() { this.jumpBuffer = 0.14; }

  push(v) {
    this.ext.add(v);
    if (this.ext.lengthSq() > 625) this.ext.setLength(25);
  }

  teleport(x, y, z) {
    this.feet.set(x, y, z);
    this.prevFeet.copy(this.feet);
    this.renderFeet.copy(this.feet);
    this.body.setTranslation({ x, y: y + HALF_H + RAD + 0.03, z }, true);
    this.body.setNextKinematicTranslation({ x, y: y + HALF_H + RAD + 0.03, z });
    this.physics.propagateModifiedBodyPositionsToColliders();
    this.vel.set(0, 0, 0);
    this.ext.set(0, 0, 0);
    this.vy = 0;
  }

  fixedUpdate(dt, keys) {
    this.prevFeet.copy(this.feet);
    const f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const s = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let wx = -sy * f + cy * s, wz = -cy * f - sy * s;
    const wl = Math.hypot(wx, wz);
    const spd = (sprint ? 8.2 : 5.2) * this.runMul;
    if (wl > 0) { wx = (wx / wl) * spd; wz = (wz / wl) * spd; }
    const acc = this.grounded ? 14 : 3.5;
    const k = Math.min(1, dt * acc);
    this.vel.x += (wx - this.vel.x) * k;
    this.vel.z += (wz - this.vel.z) * k;

    this.jumpBuffer -= dt;
    this.coyote = this.grounded ? 0.1 : this.coyote - dt;
    if (this.grounded) { this.jumpsUsed = 0; this.airTime = 0; } else this.airTime += dt;
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.vy = 7.9;
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.jumpsUsed = 1;
      if (this.onJump) this.onJump();
    } else if (this.jumpBuffer > 0 && !this.grounded && this.coyote <= 0 && this.jumpsUsed < this.maxJumps) {
      this.vy = Math.max(this.vy, 0) * 0.3 + 7.4;
      this.jumpBuffer = 0;
      this.jumpsUsed = Math.max(this.jumpsUsed, 1) + 1;
      if (this.onDoubleJump) this.onDoubleJump();
    }
    const holding = keys.has('Space');
    this.jetting = this.jetEnabled && holding && !this.grounded && this.fuel > 0 && this.airTime > 0.22;
    if (this.jetting) {
      this.fuel = Math.max(0, this.fuel - dt);
      this.vy = Math.min(this.vy + 46 * dt, 7);
    } else if (this.grounded) {
      this.fuel = Math.min(this.maxFuel, this.fuel + dt * (this.maxFuel / 1.3));
    }
    this.vy -= GRAVITY * dt;
    if (this.vy < -40) this.vy = -40;
    const decay = Math.exp(-dt * (this.grounded ? 5.5 : 1.1));
    this.ext.x *= decay;
    this.ext.z *= decay;
    this.ext.y *= Math.exp(-dt * 4);

    const desired = {
      x: (this.vel.x + this.ext.x) * dt,
      y: (this.vy + this.ext.y) * dt,
      z: (this.vel.z + this.ext.z) * dt,
    };
    this.kcc.computeColliderMovement(this.collider, desired);
    const mv = this.kcc.computedMovement();
    const wasGrounded = this.grounded;
    this.grounded = this.kcc.computedGrounded();
    if (this.grounded && this.vy < 0) {
      if (!wasGrounded && this.vy < -7 && this.onLand) this.onLand(Math.min(1, -this.vy / 20));
      this.vy = -0.5;
      if (this.ext.y < 0) this.ext.y = 0;
    }
    if (desired.y > 0.0001 && mv.y < desired.y * 0.4) { this.vy = Math.min(this.vy, 0); this.ext.y = 0; }

    const base = this.collider.translation();
    let nx = base.x + mv.x, ny = base.y - HALF_H - RAD + mv.y, nz = base.z + mv.z;
    const r = Math.hypot(nx, ny + 0.9, nz);
    if (r > PLAY_R) {
      const k2 = PLAY_R / r;
      nx *= k2; nz *= k2;
      if (ny > 1) { ny = (ny + 0.9) * k2 - 0.9; this.vy = Math.min(this.vy, 0); }
      this.ext.multiplyScalar(0.5);
    }
    if (ny < -5) { ny = 2; this.vy = 0; }
    this.feet.set(nx, ny, nz);
    this.body.setNextKinematicTranslation({ x: nx, y: ny + HALF_H + RAD, z: nz });

    const hs = Math.hypot(mv.x, mv.z) / dt;
    this.speedNow = hs;
    if (this.grounded && hs > 1) {
      this.stepDist += hs * dt;
      if (this.stepDist > (sprint ? 2.2 : 1.7)) {
        this.stepDist = 0;
        if (this.onStep) this.onStep(this.feet.y > 0.2);
      }
    }
    this.updateCapsule();
  }

  updateCapsule() {
    this.capsule.a.set(this.feet.x, this.feet.y + RAD, this.feet.z);
    this.capsule.b.set(this.feet.x, this.feet.y + RAD + HALF_H * 2, this.feet.z);
  }

  ride(x, y, z) {
    this.prevFeet.copy(this.feet);
    this.feet.set(x, y, z);
    this.renderFeet.copy(this.feet);
    this.body.setNextKinematicTranslation({ x, y: y + HALF_H + RAD, z });
    this.vel.set(0, 0, 0);
    this.ext.set(0, 0, 0);
    this.vy = 0;
    this.speedNow = 0;
    this.updateCapsule();
  }

  applyCamera(alpha, dt, shake, recoil = 0) {
    this.renderFeet.lerpVectors(this.prevFeet, this.feet, alpha);
    const moving = this.grounded && this.speedNow > 1;
    this.bobAmp += ((moving ? Math.min(1, this.speedNow / 8) : 0) - this.bobAmp) * Math.min(1, dt * 8);
    this.bobT += dt * (5 + this.speedNow * 1.1);
    const bob = Math.sin(this.bobT * 2) * 0.035 * this.bobAmp;
    const sway = Math.cos(this.bobT) * 0.02 * this.bobAmp;
    const cam = this.camera;
    cam.position.set(this.renderFeet.x, this.renderFeet.y + EYE + bob, this.renderFeet.z);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(this.pitch + shake.y * 0.6 + recoil * 0.035, this.yaw + shake.x * 0.6, sway * 0.4 + shake.z);
    cam.position.x += shake.x * 0.3;
    cam.position.y += shake.y * 0.3;
  }
}
