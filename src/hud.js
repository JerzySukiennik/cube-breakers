// Cube Breakers: progress bar, wallet, backpack, hotbar ammo, shop tooltip, toasts, jet fuel and fps.

import { BALL_TYPES } from './config.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('en-US');

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
    this.walletEl = $('wallet-n');
    this.bagEl = $('bag');
    this.bagChips = $('bag-chips');
    this.bagN = $('bag-n');
    this.bagV = $('bag-v');
    this.tip = $('tip');
    this.toastEl = $('toast');
    this.fuelEl = $('fuel');
    this.fuelFill = $('fuel-fill');
    this.onlineEl = $('online');
    this.onlineN = $('online-n');
    this.tabEl = $('tab');
    this.tabKey = '';
    this.slots = [];
    BALL_TYPES.forEach((t, i) => {
      const s = document.createElement('div');
      s.className = 'slot';
      s.innerHTML = `<span class="key">${i + 1}</span><span class="ball" style="background:${sphereCss(t.color)}"></span><span class="qty">0</span>`;
      this.hotbar.appendChild(s);
      this.slots.push({ el: s, qty: s.querySelector('.qty'), last: -1 });
    });
    this.lastRemaining = -1;
    this.levelText = '';
    this.labelT = 0;
    this.bannerT = 0;
    this.toastT = 0;
    this.fpsAcc = 0;
    this.fpsN = 0;
    this.lastWallet = -1;
    this.shownWallet = 0;
    this.tipKey = '';
    this.lastBag = '';
  }

  select(i, show) {
    this.slots.forEach((s, k) => s.el.classList.toggle('sel', k === i));
    if (show) {
      const t = BALL_TYPES[i];
      this.label.innerHTML = `<b>${t.name}</b><span>${t.desc}</span>`;
      this.label.classList.add('on');
      this.labelT = 1.8;
    }
  }

  setLevel(level, name) {
    this.levelText = `Level ${level} · ${name} · `;
    this.lastRemaining = -1;
  }

  progress(remaining, total) {
    if (remaining === this.lastRemaining) return;
    this.lastRemaining = remaining;
    this.fill.style.transform = `scaleX(${total ? 1 - remaining / total : 0})`;
    this.text.textContent = `${this.levelText}${fmt(remaining)} ${remaining === 1 ? 'Block' : 'Blocks'} to Go`;
  }

  balls(n, cap) {
    this.count.textContent = n;
    this.cap.textContent = `/${cap}`;
  }

  ammo(arr) {
    arr.forEach((a, i) => {
      const s = this.slots[i];
      if (s.last === a) return;
      s.last = a;
      s.qty.textContent = a > 999 ? '999+' : a;
      s.el.classList.toggle('empty', a <= 0);
    });
  }

  wallet(n) { this.lastWallet = n; }

  bag(bag, value) {
    const key = bag.count + ':' + value;
    if (key === this.lastBag) return;
    this.lastBag = key;
    this.bagEl.classList.toggle('on', bag.count > 0);
    this.bagN.textContent = '×' + fmt(bag.count);
    this.bagV.textContent = fmt(value);
    const groups = Object.values(bag.groups).sort((a, b) => b.value - a.value).slice(0, 4);
    this.bagChips.innerHTML = groups.map((g) => `<span class="chip p${g.pattern}" style="--c:${g.color}"></span>`).join('');
  }

  tooltip(t) {
    const key = t ? JSON.stringify(t) : '';
    if (key === this.tipKey) return;
    this.tipKey = key;
    if (!t) { this.tip.classList.remove('on'); return; }
    const price = t.price != null ? `<span class="price ${t.poor ? 'poor' : ''}"><i class="gem"></i>${fmt(t.price)}</span>` : '';
    this.tip.innerHTML = `<div class="tip-head"><b>${t.title}</b>${price}</div><p>${t.desc}</p>${t.note ? `<p class="note ${t.poor ? 'poor' : ''}">${t.note}</p>` : ''}<span class="act"><kbd>E</kbd>${t.action}</span>`;
    this.tip.classList.add('on');
  }

  toast(text, color) {
    this.toastEl.innerHTML = color ? `<span class="dot" style="background:${sphereCss(color)}"></span>${text}` : text;
    this.toastEl.classList.remove('on');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('on');
    this.toastT = 1.8;
  }

  fuel(frac, show) {
    this.fuelEl.classList.toggle('on', show);
    if (show) this.fuelFill.style.transform = `scaleX(${Math.max(0, Math.min(1, frac))})`;
  }

  online(n, connected, offline) {
    this.onlineEl.classList.toggle('on', !offline && connected);
    this.onlineN.textContent = offline ? 'Offline · local save' : connected ? `${n} online` : 'Reconnecting…';
  }

  tab(show, data) {
    this.tabEl.classList.toggle('on', show);
    if (!show || !data) return;
    const key = JSON.stringify(data);
    if (key === this.tabKey) return;
    this.tabKey = key;
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const online = data.online.map((p) => `<div class="row-p ${p.me ? 'me' : ''}"><span class="dot" style="background:${p.color}"></span><span class="nm">${esc(p.nick)}</span><span class="v">${fmt(p.dmg)} dmg</span></div>`).join('');
    const recs = data.records.length
      ? data.records.map((r, i) => `<div class="row-p ${r.me ? 'me' : ''}"><span class="rk">${i + 1}.</span><span class="nm">${esc(r.n || 'Player')}</span><span class="v">${fmt(r.b || 0)}</span></div>`).join('')
      : `<div class="empty">${data.offline ? 'Records need the shared world.' : 'No records yet. Break something!'}</div>`;
    this.tabEl.innerHTML = `<h2>${esc(data.title)}</h2><div class="cols"><div><h3>Online now · damage this level</h3>${online}</div><div><h3>All-time · blocks broken</h3>${recs}</div></div>`;
  }

  showBanner(html, t = 3) {
    this.banner.innerHTML = html;
    this.banner.classList.add('on');
    this.bannerT = t;
  }

  update(dt) {
    if (this.lastWallet >= 0 && this.shownWallet !== this.lastWallet) {
      const d = this.lastWallet - this.shownWallet;
      this.shownWallet = Math.abs(d) < 1 ? this.lastWallet : this.shownWallet + d * Math.min(1, dt * 8);
      this.walletEl.textContent = fmt(this.shownWallet);
    }
    if (this.labelT > 0) {
      this.labelT -= dt;
      if (this.labelT <= 0) this.label.classList.remove('on');
    }
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.toastEl.classList.remove('on');
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
