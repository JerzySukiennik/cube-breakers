// Cube Breakers: player progress (gems, ammo, backpack, upgrades, stats) with local save.

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
  { id: 'power', name: 'Power', desc: '+25% ball damage per level.', max: 30, base: 80, growth: 1.55 },
  { id: 'speed', name: 'Ball Speed', desc: '+8% ball speed per level. Faster balls hit more often.', max: 10, base: 120, growth: 1.7 },
  { id: 'cap', name: 'Ball Cap', desc: '+10 of your balls in the air at once.', max: 5, base: 150, growth: 2 },
  { id: 'rate', name: 'Fire Rate', desc: 'The launcher shoots 15% faster per level.', max: 6, base: 100, growth: 1.8 },
  { id: 'magnet', name: 'Magnet', desc: '+1 m pickup range for dropped blocks.', max: 8, base: 60, growth: 1.6 },
  { id: 'run', name: 'Sneakers', desc: '+8% run speed per level.', max: 5, base: 80, growth: 1.7 },
  { id: 'djump', name: 'Double Jump', desc: 'Press Space again in mid-air to jump twice.', max: 1, base: 500, growth: 1 },
  { id: 'jet', name: 'Jetpack', desc: 'Hold Space in the air to fly. Refuels on the ground.', max: 1, base: 1500, growth: 1 },
  { id: 'fuel', name: 'Jet Fuel', desc: '+0.6 s of flight per level.', max: 6, base: 300, growth: 1.6, requires: 'jet' },
  { id: 'recycle', name: 'Recycler', desc: '+15% gems from recycling per level.', max: 10, base: 200, growth: 1.65 },
  { id: 'luck', name: 'Lucky Drops', desc: '+5% chance a broken block drops twice.', max: 8, base: 250, growth: 1.7 },
];

const UP = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

export class Progress {
  constructor() {
    this.gems = 0;
    this.ammo = BALL_TYPES.map((_, i) => (i === 0 ? 20 : 0));
    this.up = {};
    this.bag = { count: 0, value: 0, groups: {} };
    this.stats = { blocks: 0, gems: 0, shots: 0, levels: 0 };
    this.dirty = false;
    this.listeners = [];
    this.load();
  }

  onChange(fn) { this.listeners.push(fn); }

  changed() {
    this.dirty = true;
    for (const fn of this.listeners) fn(this);
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      this.gems = d.gems || 0;
      if (Array.isArray(d.ammo)) this.ammo = BALL_TYPES.map((_, i) => d.ammo[i] || 0);
      this.up = d.up || {};
      this.bag = d.bag && d.bag.groups ? d.bag : this.bag;
      this.stats = Object.assign(this.stats, d.stats || {});
    } catch { }
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ gems: this.gems, ammo: this.ammo, up: this.up, bag: this.bag, stats: this.stats }));
      this.dirty = false;
    } catch { }
  }

  reset() {
    this.gems = 0;
    this.ammo = BALL_TYPES.map((_, i) => (i === 0 ? 20 : 0));
    this.up = {};
    this.bag = { count: 0, value: 0, groups: {} };
    this.stats = { blocks: 0, gems: 0, shots: 0, levels: 0 };
    this.changed();
  }

  lvl(id) { return this.up[id] || 0; }
  upgrade(id) { return UP[id]; }

  price(id) {
    const u = UP[id];
    return Math.round(u.base * Math.pow(u.growth, this.lvl(id)));
  }

  locked(id) {
    const u = UP[id];
    return !!(u.requires && !this.lvl(u.requires));
  }

  maxed(id) { return this.lvl(id) >= UP[id].max; }

  buyUpgrade(id) {
    if (this.locked(id)) return 'locked';
    if (this.maxed(id)) return 'max';
    const p = this.price(id);
    if (this.gems < p) return 'poor';
    this.gems -= p;
    this.up[id] = this.lvl(id) + 1;
    this.changed();
    return 'ok';
  }

  buyPack(i) {
    const pk = PACKS[i];
    if (this.gems < pk.price) return 'poor';
    this.gems -= pk.price;
    this.ammo[pk.type] += pk.count;
    this.changed();
    return 'ok';
  }

  addAmmo(type, n) {
    this.ammo[type] += n;
    this.changed();
  }

  useAmmo(type) {
    if (this.ammo[type] <= 0) return false;
    this.ammo[type]--;
    this.stats.shots++;
    this.dirty = true;
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
    this.stats.blocks++;
    this.changed();
  }

  recycleValue() { return Math.round(this.bag.value * this.recycleMul); }

  recycle() {
    const v = this.recycleValue();
    if (this.bag.count === 0) return 0;
    this.gems += v;
    this.stats.gems += v;
    this.bag = { count: 0, value: 0, groups: {} };
    this.changed();
    return v;
  }

  earn(v) {
    this.gems += v;
    this.stats.gems += v;
    this.changed();
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
