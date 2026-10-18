// Cube Breakers: keyboard, mouse buttons, wheel and pointer lock.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.dx = 0;
    this.dy = 0;
    this.left = false;
    this.right = false;
    this.wheel = 0;
    this.locked = false;
    this.pressed = [];
    this.onLockChange = null;
    addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (!this.locked) return;
      if (!e.repeat) this.pressed.push(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.left = false; this.right = false; });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) { this.left = true; this.pressed.push('Mouse0'); }
      if (e.button === 2) this.right = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.left = false;
      if (e.button === 2) this.right = false;
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('wheel', (e) => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) { this.keys.clear(); this.left = false; this.right = false; }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  lock() {
    const r = this.canvas.requestPointerLock({ unadjustedMovement: true });
    if (r && r.catch) r.catch(() => this.canvas.requestPointerLock());
  }

  consume() {
    const out = { dx: this.dx, dy: this.dy, wheel: this.wheel, pressed: this.pressed };
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
    this.pressed = [];
    return out;
  }
}
