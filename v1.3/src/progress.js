// Cube Breakers: progress (gems, ammo, upgrades, powerups, tray orders, turrets, drill, stats) shared by the whole team online, local when solo; the backpack is always personal.

import { BALL_TYPES, POWERUPS, DRILL, TURRET, VEND_PRICE } from './config.js';

const KEY = 'cb.progress.v3';
const OLD_KEY = 'cb.progress.v2';
const PW = Object.fromEntries(POWERUPS.map((p) => [p.id, p]));

export const UPGRADES = [
  { id: 'power', name: 'Power', desc: '+25% ball damage per level, for the whole team.', max: 30, base: 80, growth: 1.55 },
  { id: 'speed', name: 'Ball Speed', desc: '+8% ball speed per level. Faster balls hit more often.', max: 10, base: 120, growth: 1.7 },
  { id: 'cap', name: 'Ball Cap', desc: '+10 balls each player can keep in the air at once.', max: 5, base: 150, growth: 2 },
  { id: 'rate', name: 'Fire Rate', desc: 'Every launcher shoots 15% faster per level.', max: 6, base: 100, growth: 1.8 },
  { id: 'magnet', name: 'Magnet', desc: '+1 m pickup range for dropped blocks.', max: 8, base: 60, growth: 1.6 },
  { id: 'run', name: 'Sneakers', desc: '+8% run speed per level for everyone.', max: 5, base: 80, growth: 1.7 },
  { id: 'djump', name: 'Double Jump', desc: 'Press Space again in mid-air to jump twice.', max: 1, base: 500, growth: 1 },
  { id: 'jet', name: 'Jetpack', desc: 'Hold Space in the air to fly. Refuels on the ground.', max: 1, base: 1500, growth: 1 },
  { id: 'fuel', name: 'Jet Fuel', desc: '+0.6 s of flight per level.', max: 6, base: 300, growth: 1.6, requires: 'jet' },
  { id: 'recycle', name: 'Recycler', desc: '+15% gems from recycling per level.', max: 10, base: 200, growth: 1.65 },
  { id: 'luck', name: 'Lucky Drops', desc: '+5% chance a broken block drops twice.', max: 8, base: 250, growth: 1.7 },
];

const UP = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));
const priceAt = (u, lv) => Math.round(u.base * Math.pow(u.growth, lv));
const plural = (n, name) => `${n.toLocaleString('en-US')} ${name}${n === 1 ? '' : 's'}`;

export function itemOf(kind, i) {
  return kind === 'p' ? POWERUPS[i] : BALL_TYPES[i];
}

export function itemName(kind, i, n) {
  const it = itemOf(kind, i);
  if (!it) return '';
  return kind === 'p' ? `${n}× ${it.name}` : plural(n, it.name);
}

export function lineCost(kind, i, n) {
  const it = itemOf(kind, i);
  return it ? n * it.price : 0;
}

export function cartTotal(cart) {
  return Math.ceil(cart.reduce((s, c) => s + lineCost(c.kind, c.i, c.n), 0));
}

function emptyLocal() {
  return { gems: 0, ammo: BALL_TYPES.map((_, i) => (i === 0 ? 20 : 0)), up: {}, stats: { blocks: 0, gems: 0, levels: 0 }, pw: {}, fx: {}, ev: {}, tray: {}, turrets: {} };
}

export class Progress {
  constructor() {
    this.local = emptyLocal();
    this.bag = { count: 0, value: 0, groups: {} };
    this.net = null;
    this.nick = 'Player';
    this.listeners = [];
    this.load();
  }

  onChange(fn) { this.listeners.push(fn); }

  changed() {
    for (const fn of this.listeners) fn(this);
  }

  attachTeam(net) {
    this.net = net;
    this.changed();
  }

  now() { return this.net ? this.net.now() : Date.now(); }
  get team() { return this.net ? this.net.team : this.local; }
  get gems() { return this.team.gems; }
  get up() { return this.team.up; }
  get stats() { return this.team.stats; }
  get pw() { return this.team.pw || {}; }
  get fx() { return this.team.fx || {}; }
  get ev() { return this.team.ev || {}; }
  get tray() { return this.team.tray || {}; }
  get turrets() { return this.team.turrets || {}; }
  get drillOwned() { return (this.up.drill || 0) > 0; }
  get ammo() { return this.net ? BALL_TYPES.map((_, i) => Math.max(0, this.net.ammoLeft(i))) : this.local.ammo; }

  load() {
    try {
      const raw = localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      const L = this.local;
      L.gems = d.gems || 0;
      if (Array.isArray(d.ammo)) L.ammo = BALL_TYPES.map((_, i) => d.ammo[i] || 0);
      L.up = d.up || {};
      L.stats = Object.assign(L.stats, d.stats || {});
      for (const k of ['pw', 'fx', 'ev', 'tray', 'turrets']) L[k] = d[k] || {};
      this.bag = d.bag && d.bag.groups ? d.bag : this.bag;
    } catch { }
  }

  save() {
    try {
      const L = this.local;
      localStorage.setItem(KEY, JSON.stringify({ gems: L.gems, ammo: L.ammo, up: L.up, stats: L.stats, pw: L.pw, fx: L.fx, ev: L.ev, tray: L.tray, turrets: L.turrets, bag: this.bag }));
    } catch { }
  }

  async tx(fn) {
    if (!this.net) {
      const ok = fn(this.local);
      delete this.local.lastWhat;
      if (ok) { this.changed(); this.save(); }
      return !!ok;
    }
    return this.net.teamTx((t) => (fn(t) ? t : undefined));
  }

  lvl(id) { return this.up[id] || 0; }
  upgrade(id) { return UP[id]; }
  price(id) { return priceAt(UP[id], this.lvl(id)); }

  locked(id) {
    const u = UP[id];
    return !!(u.requires && !this.lvl(u.requires));
  }

  maxed(id) { return this.lvl(id) >= UP[id].max; }

  async buyUpgrade(id) {
    if (this.locked(id)) return 'locked';
    if (this.maxed(id)) return 'max';
    if (this.gems < this.price(id)) return 'poor';
    const u = UP[id];
    const ok = await this.tx((t) => {
      const lv = t.up[id] || 0;
      if (lv >= u.max || (u.requires && !t.up[u.requires])) return false;
      const p = priceAt(u, lv);
      if (t.gems < p) return false;
      t.gems -= p;
      t.up[id] = lv + 1;
      t.lastWhat = u.max > 1 ? `upgraded ${u.name} to level ${lv + 1}` : `unlocked ${u.name}`;
      return true;
    });
    if (ok) return 'ok';
    return this.maxed(id) ? 'max' : 'poor';
  }

  async order(cart) {
    const total = cartTotal(cart);
    if (!cart.length || total <= 0) return 'empty';
    if (this.gems < total) return 'poor';
    const oid = 'o' + this.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
    const items = cart.map((c) => ({ k: c.kind, i: c.i, n: c.n }));
    const big = cart.slice().sort((a, b) => lineCost(b.kind, b.i, b.n) - lineCost(a.kind, a.i, a.n))[0];
    const s = this.now();
    const ok = await this.tx((t) => {
      if (t.gems < total) return false;
      t.gems -= total;
      t.tray = t.tray || {};
      t.tray[oid] = { s, by: this.nick, items };
      t.lastWhat = `ordered ${itemName(big.kind, big.i, big.n)}${cart.length > 1 ? ' and more' : ''}`;
      return true;
    });
    return ok ? 'ok' : 'poor';
  }

  async claimTray(oid, k) {
    if (!this.net) {
      const o = this.local.tray[oid];
      if (!o) return false;
      o.c = o.c || {};
      if (o.c[k]) return false;
      o.c[k] = 'me';
      this.save();
      return true;
    }
    return this.net.claimTray(oid, k);
  }

  removeOrder(oid) {
    if (!this.net) { delete this.local.tray[oid]; this.save(); this.changed(); return; }
    this.net.removeOrder(oid);
  }

  grant(kind, i, n) {
    if (kind === 'p') this.addPw(POWERUPS[i].id, n);
    else this.addAmmo(i, n);
  }

  addPw(id, n) {
    if (this.net) this.net.addPw(id, n);
    else { this.local.pw[id] = (this.local.pw[id] || 0) + n; this.changed(); this.save(); }
  }

  async activate(id, extra = {}) {
    const p = PW[id];
    if (!p || (this.pw[id] || 0) < 1) return false;
    const now = this.now();
    const key = 'e' + now.toString(36) + Math.floor(Math.random() * 1296).toString(36);
    const uid = this.net ? this.net.uid : 'me';
    const seed = 1 + Math.floor(Math.random() * 1e6);
    return this.tx((t) => {
      t.pw = t.pw || {};
      t.fx = t.fx || {};
      t.ev = t.ev || {};
      if ((t.pw[id] || 0) < 1) return false;
      t.pw[id] -= 1;
      for (const [k, v] of Object.entries(t.fx)) if (!v || v.u < now) delete t.fx[k];
      for (const [k, v] of Object.entries(t.ev)) if (!v || (v.e || v.s + 6000) < now - 20000) delete t.ev[k];
      if (p.aim) t.ev[key] = { k: id, s: now, x: +extra.x.toFixed(2), z: +extra.z.toFixed(2), u: uid, by: this.nick };
      else if (p.sky) {
        const cur = Object.values(t.ev).find((v) => v.k === id && v.e > now);
        if (cur) cur.e += p.dur * 1000;
        else t.ev[key] = { k: id, s: now, e: now + p.dur * 1000, seed, u: uid, by: this.nick };
      } else {
        const cur = t.fx[id];
        t.fx[id] = { u: Math.max(cur ? cur.u : 0, now) + p.dur * 1000, by: this.nick };
      }
      t.lastWhat = `activated ${p.name}!`;
      return true;
    });
  }

  async vendPay() {
    if (this.gems < VEND_PRICE) return false;
    return this.tx((t) => {
      if (t.gems < VEND_PRICE) return false;
      t.gems -= VEND_PRICE;
      return true;
    });
  }

  async vendPrize(prize) {
    return this.tx((t) => {
      if (prize.kind === 'u') {
        const u = UP[prize.id];
        const lv = t.up[prize.id] || 0;
        if (lv >= u.max || (u.requires && !t.up[u.requires])) return false;
        t.up[prize.id] = lv + 1;
      } else if (prize.kind === 'p') {
        t.pw = t.pw || {};
        t.pw[POWERUPS[prize.i].id] = (t.pw[POWERUPS[prize.i].id] || 0) + prize.n;
      } else {
        t.ammo[prize.i] = (t.ammo[prize.i] || 0) + prize.n;
      }
      t.lastWhat = `won ${prize.label} in Plinko`;
      return true;
    });
  }

  async buyDrill() {
    if (this.drillOwned) return 'owned';
    if (this.gems < DRILL.price) return 'poor';
    const ok = await this.tx((t) => {
      if ((t.up.drill || 0) > 0 || t.gems < DRILL.price) return false;
      t.gems -= DRILL.price;
      t.up.drill = 1;
      t.lastWhat = 'bought the Drill!';
      return true;
    });
    return ok ? 'ok' : this.drillOwned ? 'owned' : 'poor';
  }

  async placeTurret(x, z) {
    if (Object.keys(this.turrets).length >= TURRET.max) return 'max';
    if (this.gems < TURRET.price) return 'poor';
    const id = 't' + this.now().toString(36);
    const ok = await this.tx((t) => {
      t.turrets = t.turrets || {};
      if (Object.keys(t.turrets).length >= TURRET.max || t.gems < TURRET.price) return false;
      t.gems -= TURRET.price;
      t.turrets[id] = { x: +x.toFixed(2), z: +z.toFixed(2), t: 0, n: 0, by: this.nick };
      t.lastWhat = 'placed an Auto-Shooter';
      return true;
    });
    return ok ? 'ok' : 'poor';
  }

  async loadTurret(id, type, amount) {
    let took = 0;
    const ok = await this.tx((t) => {
      const tur = t.turrets && t.turrets[id];
      if (!tur) return false;
      const have = Math.floor(t.ammo[type] || 0);
      const take = Math.min(amount, have);
      if (take <= 0) return false;
      if (tur.n > 0 && tur.t !== type) {
        t.ammo[tur.t] = (t.ammo[tur.t] || 0) + tur.n;
        tur.n = 0;
      }
      tur.t = type;
      tur.n = (tur.n || 0) + take;
      t.ammo[type] = have - take;
      took = take;
      return true;
    });
    return ok ? took : 0;
  }

  turretUse(id, n) {
    if (this.net) { this.net.turretUse(id, n); return; }
    const t = this.local.turrets[id];
    if (t) t.n = Math.max(0, t.n - n);
  }

  async topUpAero(n) {
    if (this.ammo[0] >= n) return 0;
    let add = 0;
    const ok = await this.tx((t) => {
      const have = t.ammo[0] || 0;
      if (have >= n) return false;
      add = n - have;
      t.ammo[0] = n;
      return true;
    });
    return ok ? add : 0;
  }

  addAmmo(type, n) {
    if (this.net) this.net.addAmmo(type, n);
    else { this.local.ammo[type] += n; this.changed(); }
  }

  useAmmo(type) {
    if (this.net) return this.net.useAmmo(type);
    if (this.local.ammo[type] <= 0) return false;
    this.local.ammo[type]--;
    return true;
  }

  stash(key, value, color, pattern) {
    const g = this.bag.groups[key] || (this.bag.groups[key] = { count: 0, value: 0, color, pattern });
    g.count++;
    g.value += value;
    g.color = color;
    g.pattern = pattern;
    this.bag.count++;
    this.bag.value += value;
    if (!this.net) this.local.stats.blocks++;
    this.changed();
  }

  recycleValue() { return Math.round(this.bag.value * this.recycleMul); }

  recycle() {
    if (this.bag.count === 0) return 0;
    const v = this.recycleValue();
    this.bag = { count: 0, value: 0, groups: {} };
    this.earn(v);
    return v;
  }

  earn(v) {
    if (this.net) this.net.addGems(v);
    else {
      this.local.gems += v;
      this.local.stats.gems += v;
    }
    this.changed();
  }

  levelCleared() {
    if (this.net) this.net.countLevel();
    else this.local.stats.levels++;
  }

  debugAmmo(n) {
    for (let i = 0; i < BALL_TYPES.length; i++) this.addAmmo(i, n);
    for (const p of POWERUPS) this.addPw(p.id, 2);
  }

  get damageMul() { return Math.pow(1.25, this.lvl('power')); }
  get speedMul() { return 1 + 0.08 * this.lvl('speed'); }
  get cap() { return 30 + 10 * this.lvl('cap'); }
  get fireCd() { return 0.3 * Math.pow(0.85, this.lvl('rate')); }
  get magnet() { return 2.5 + this.lvl('magnet'); }
  get runMul() { return 1 + 0.08 * this.lvl('run'); }
  get jumps() { return this.lvl('djump') ? 2 : 1; }
  get jet() { return this.lvl('jet') > 0; }
  get fuel() { return 1.5 + 0.6 * this.lvl('fuel'); }
  get recycleMul() { return 1 + 0.15 * this.lvl('recycle'); }
  get luck() { return 0.05 * this.lvl('luck'); }
}
