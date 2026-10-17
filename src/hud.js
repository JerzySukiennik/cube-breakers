// Cube Breakers: progress bar, hotbar, ball counter, type label, banner and fps.

import { BALL_TYPES } from './config.js';

const $ = (id) => document.getElementById(id);

function sphereCss(color) {
  return `radial-gradient(circle at 34% 30%, rgba(255,255,255,0.95) 0 9%, rgba(255,255,255,0.35) 18%, transparent 42%), radial-gradient(circle at 50% 55%, ${color} 0 58%, color-mix(in srgb, ${color} 55%, #001030) 100%)`;
}

export class HUD {
  constructor() {
    this.fill = $('progress-fill');
    this.text = $('progress-text');
    this.count = $('ballcount-n');
    this.cap = $('ballcount-cap');
    this.label = $('type-label');
    this.banner = $('banner');
    this.fps = $('fps');
    this.hotbar = $('hotbar');
    this.slots = [];
    BALL_TYPES.forEach((t, i) => {
      const s = document.createElement('div');
      s.className = 'slot';
      s.innerHTML = `<span class="key">${i + 1}</span><span class="ball" style="background:${sphereCss(t.color)}"></span><span class="qty">∞</span>`;
      this.hotbar.appendChild(s);
      this.slots.push(s);
    });
    this.lastRemaining = -1;
    this.labelT = 0;
    this.bannerT = 0;
    this.fpsAcc = 0;
    this.fpsN = 0;
  }

  select(i, show) {
    this.slots.forEach((s, k) => s.classList.toggle('sel', k === i));
    if (show) {
      const t = BALL_TYPES[i];
      this.label.innerHTML = `<b>${t.name}</b><span>${t.desc}</span>`;
      this.label.classList.add('on');
      this.labelT = 1.8;
    }
  }

  progress(remaining, total) {
    if (remaining === this.lastRemaining) return;
    this.lastRemaining = remaining;
    this.fill.style.transform = `scaleX(${total ? 1 - remaining / total : 0})`;
    this.text.textContent = `${remaining.toLocaleString('en-US')} ${remaining === 1 ? 'Block' : 'Blocks'} to Go`;
  }

  balls(n, cap) {
    this.count.textContent = n;
    this.cap.textContent = `/${cap}`;
  }

  showBanner(html, t = 3) {
    this.banner.innerHTML = html;
    this.banner.classList.add('on');
    this.bannerT = t;
  }

  update(dt) {
    if (this.labelT > 0) {
      this.labelT -= dt;
      if (this.labelT <= 0) this.label.classList.remove('on');
    }
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.banner.classList.remove('on');
    }
    if (this.fps) {
      this.fpsAcc += dt;
      this.fpsN++;
      if (this.fpsAcc >= 0.5) {
        this.fps.textContent = `${Math.round(this.fpsN / this.fpsAcc)} fps`;
        this.fpsAcc = 0;
        this.fpsN = 0;
      }
    }
  }
}
