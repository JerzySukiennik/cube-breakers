// Cube Breakers: progress bar, wallet, backpack, hotbar ammo, powerup slot, active effects, combo, prompts, tooltip, toasts, jet fuel and fps.

import { BALL_TYPES, BALL_KEY_LABELS, POWERUPS } from './config.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('en-US');

export function sphereCss(color) {
  return `radial-gradient(circle at 34% 30%, rgba(255,255,255,0.95) 0 9%, rgba(255,255,255,0.35) 18%, transparent 42%), radial-gradient(circle at 50% 55%, ${color} 0 58%, color-mix(in srgb, ${color} 55%, #001030) 100%)`;
}

function ballCss(t) {
  if (t.firework) return 'radial-gradient(circle at 34% 30%, rgba(255,255,255,0.95) 0 9%, rgba(255,255,255,0.35) 18%, transparent 42%), conic-gradient(#2f9bff, #8fe032, #ffc531, #ff9a1f, #ff4fd8, #b08cff, #2f9bff)';
  if (t.ghost) return 'radial-gradient(circle at 34% 30%, rgba(255,255,255,0.95) 0 12%, rgba(255,255,255,0.4) 30%, rgba(220,240,255,0.35) 70%)';
  return sphereCss(t.color);
}

const GLYPH = { orbital: '◎', goldrush: '★', infinite: '∞', toxicrain: '☂', meteor: '☄', triple: '⁂', freeze: '❄', magnet: '⊃' };
export function capsuleCss(color) {
  return `radial-gradient(circle at 34% 28%, rgba(255,255,255,0.9) 0 8%, transparent 30%), linear-gradient(180deg, ${color} 0 50%, #eef4fa 50% 100%)`;
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
      s.className = 'slot' + (t.ghost ? ' ghost' : '') + (t.hole ? ' hole' : '');
      const k = BALL_KEY_LABELS[i];
      s.innerHTML = `${k ? `<span class="key">${k}</span>` : ''}<span class="ball" style="background:${ballCss(t)}"></span><span class="qty">0</span>`;
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
    this.pwEl = $('pwslot');
    this.pwKey = '';
    this.fxEl = $('effects');
    this.fxKey = '';
    this.fxBars = [];
    this.comboEl = $('combo');
    this.comboT = 0;
    this.vigEl = $('vignette');
    this.vigKey = '';
    this.promptEl = $('prompt');
    this.promptText = '';
  }

  powerups(pw, sel) {
    const owned = POWERUPS.map((p, i) => ({ p, i, n: pw[p.id] || 0 })).filter((x) => x.n > 0);
    const cur = owned.find((x) => x.p.id === sel) || owned[0];
    const key = cur ? `${cur.p.id}:${cur.n}:${owned.length}` : '';
    if (key === this.pwKey) return cur ? cur.p.id : null;
    this.pwKey = key;
    this.pwEl.classList.toggle('on', !!cur);
    if (cur) {
      this.pwEl.innerHTML = `<span class="cap" style="background:${capsuleCss(cur.p.color)}"><i>${GLYPH[cur.p.id] || ''}</i></span><span class="txt"><b>${cur.p.short}</b><span>×${cur.n}${owned.length > 1 ? ` · ${owned.length} kinds` : ''}</span></span><span class="keys"><kbd>F</kbd>${owned.length > 1 ? '<kbd>Q</kbd>' : ''}</span>`;
      this.pwEl.classList.remove('pop');
      void this.pwEl.offsetWidth;
      this.pwEl.classList.add('pop');
    }
    return cur ? cur.p.id : null;
  }

  effects(list) {
    const key = list.map((e) => e.id).join(',');
    if (key !== this.fxKey) {
      this.fxKey = key;
      this.fxEl.innerHTML = list.map((e) => `<div class="fx-chip" style="--c:${e.color}"><span class="cap" style="background:${capsuleCss(e.color)}"><i>${GLYPH[e.id] || ''}</i></span><b>${e.name}</b><em></em><span class="bar"><i></i></span></div>`).join('');
      this.fxBars = [...this.fxEl.querySelectorAll('.fx-chip')].map((el) => ({ bar: el.querySelector('.bar i'), sec: el.querySelector('em'), last: -1 }));
    }
    list.forEach((e, k) => {
      const b = this.fxBars[k];
      if (!b) return;
      b.bar.style.transform = `scaleX(${Math.max(0, Math.min(1, e.frac))})`;
      const sec = Math.ceil(e.left);
      if (sec !== b.last) { b.last = sec; b.sec.textContent = e.label || sec + 's'; }
    });
  }

  combo(n) {
    if (n < 5) return;
    this.comboEl.innerHTML = `<b>×${n}</b><span>COMBO</span>`;
    this.comboEl.style.setProperty('--s', String(1 + Math.min(0.6, n / 120)));
    this.comboEl.classList.remove('hit');
    void this.comboEl.offsetWidth;
    this.comboEl.classList.add('on', 'hit');
    this.comboEl.classList.toggle('hot', n >= 25);
    this.comboT = 1.6;
  }

  vignette(color, k) {
    const key = color ? color + ':' + k.toFixed(2) : '';
    if (key === this.vigKey) return;
    this.vigKey = key;
    this.vigEl.style.opacity = color ? String(k) : '0';
    if (color) this.vigEl.style.background = `radial-gradient(ellipse at center, transparent 55%, ${color} 130%)`;
  }

  prompt(text) {
    if (text === this.promptText) return;
    this.promptText = text;
    this.promptEl.innerHTML = text || '';
    this.promptEl.classList.toggle('on', !!text);
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
      s.qty.textContent = a > 9999 ? Math.floor(a / 1000) + 'k' : a;
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
    this.toastEl.classList.remove('big');
    this.toastEl.classList.remove('on');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('on');
    this.toastT = 1.8;
  }

  bigToast(text, color) {
    this.toast(text, color);
    this.toastEl.classList.add('big');
    this.toastT = 2.6;
  }

  fuel(frac, show) {
    this.fuelEl.classList.toggle('on', show);
    if (show) this.fuelFill.style.transform = `scaleX(${Math.max(0, Math.min(1, frac))})`;
  }

  online(n, connected, offline) {
    this.onlineEl.classList.toggle('on', !offline && connected);
    this.onlineN.textContent = offline ? 'Offline · local save' : connected ? `${n} online` : 'Reconnecting…';
  }

  teamMode(on) {
    $('wallet').classList.toggle('team', on);
  }

  tab(show, data) {
    this.tabEl.classList.toggle('on', show);
    if (!show || !data) return;
    const key = JSON.stringify(data);
    if (key === this.tabKey) return;
    this.tabKey = key;
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const online = data.online.map((p) => `<div class="row-p ${p.me ? 'me' : ''}"><span class="dot" style="background:${p.color}"></span><span class="nm">${esc(p.nick)}${p.me ? ' (you)' : ''}</span></div>`).join('');
    const t = data.team;
    const team = [['Gems in the pool', t.wallet], ['Blocks broken', t.blocks], ['Levels cleared', t.levels], ['Gems earned', t.gems]]
      .map(([k, v]) => `<div class="row-p"><span class="nm">${k}</span><span class="v">${fmt(v)}</span></div>`).join('');
    this.tabEl.innerHTML = `<h2>${esc(data.title)}</h2><div class="cols"><div><h3>${data.offline ? 'Playing solo' : `Online now · ${data.online.length}`}</h3>${online}</div><div><h3>${data.offline ? 'Your record' : 'Team record'}</h3>${team}</div></div>`;
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
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.comboEl.classList.remove('on');
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
