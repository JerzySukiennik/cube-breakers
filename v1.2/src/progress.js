// Cube Breakers: progress (gems, ammo, upgrades, stats) shared by the whole team online, local when solo; the backpack is always personal.

import { BALL_TYPES } from './config.js';

const KEY = 'cb.progress.v2';

export const PACKS = [
  { type: 0, count: 40, price: 10 },
  { type: 1, count: 10, price: 150 },
  { type: 2, count: 5, price: 400 },
  { type: 3, count: 10, price: 250 },
  { type: 4, count: 10, price: 300 },
  { type: 5, count: 4, price: 600 },
  { type: 6, count: 10, price: 350 },
  { type: 7, count: 10, price: 500 },
];

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

export class Progress {
  constructor() {
    this.local = { gems: 0, ammo: BALL_TYPES.map((_, i) => (i === 0 ? 20 : 0)), up: {}, stats: { blocks: 0, gems: 0, levels: 0 } };
    this.bag = { count: 0, value: 0, groups: {} };
    this.net = null;
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

  get team() { return this.net ? this.net.team : null; }
  get gems() { return this.net ? this.net.team.gems : this.local.gems; }
  get up() { return this.net ? this.net.team.up : this.local.up; }
  get stats() { return this.net ? this.net.team.stats : this.local.stats; }
  get ammo() { return this.net ? BALL_TYPES.map((_, i) => Math.max(0, this.net.ammoLeft(i))) : this.local.ammo; }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      this.local.gems = d.gems || 0;
      if (Array.isArray(d.ammo)) this.local.ammo = BALL_TYPES.map((_, i) => d.ammo[i] || 0);
      this.local.up = d.up || {};
      this.local.stats = Object.assign(this.local.stats, d.stats || {});
      this.bag = d.bag && d.bag.groups ? d.bag : this.bag;
    } catch { }
  }

  save() {
    try {
      const L = this.local;
      localStorage.setItem(KEY, JSON.stringify({ gems: L.gems, ammo: L.ammo, up: L.up, stats: L.stats, bag: this.bag }));
    } catch { }
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
    if (!this.net) {
      this.local.gems -= this.price(id);
      this.local.up[id] = this.lvl(id) + 1;
      this.changed();
      return 'ok';
    }
    const ok = await this.net.teamTx((t) => {
      const lv = t.up[id] || 0;
      if (lv >= u.max || (u.requires && !t.up[u.requires])) return undefined;
      const p = priceAt(u, lv);
      if (t.gems < p) return undefined;
      t.gems -= p;
      t.up[id] = lv + 1;
      t.lastWhat = u.max > 1 ? `${u.name} level ${lv + 1}` : u.name;
      return t;
    });
    if (ok) return 'ok';
    return this.maxed(id) ? 'max' : 'poor';
  }

  async buyPack(i) {
    const pk = PACKS[i];
    if (this.gems < pk.price) return 'poor';
    if (!this.net) {
      this.local.gems -= pk.price;
      this.local.ammo[pk.type] += pk.count;
      this.changed();
      return 'ok';
    }
    const ok = await this.net.teamTx((t) => {
      if (t.gems < pk.price) return undefined;
      t.gems -= pk.price;
      t.ammo[pk.type] = (t.ammo[pk.type] || 0) + pk.count;
      t.lastWhat = `${pk.count} ${BALL_TYPES[pk.type].name}s`;
      return t;
    });
    return ok ? 'ok' : 'poor';
  }

  async topUpAero(n) {
    if (this.ammo[0] >= n) return 0;
    if (!this.net) {
      const add = n - this.local.ammo[0];
      this.local.ammo[0] = n;
      this.changed();
      return add;
    }
    let add = 0;
    const ok = await this.net.teamTx((t) => {
      const have = t.ammo[0] || 0;
      if (have >= n) return undefined;
      add = n - have;
      t.ammo[0] = n;
      return t;
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
