// Cube Breakers: Firebase RTDB sync (anonymous auth, players, shared block damage, shared loot, team pool, chunk authority, shots).

import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.5';
const ROOT = new URLSearchParams(location.search).get('realm') === 'test' ? 'cubeBreakersTest' : 'cubeBreakers';
const FLUSH = 0.1;
const SEND = 0.1;
const STALE_MS = 12000;

export function defaultTeam() {
  return { gems: 0, up: {}, ammo: { 0: 40 }, stats: { blocks: 0, levels: 0, gems: 0 } };
}

export class Net {
  constructor() {
    this.online = false;
    this.connected = false;
    this.uid = null;
    this.fb = null;
    this.db = null;
    this.meta = null;
    this.epoch = 0;
    this.dmg = new Map();
    this.pend = new Map();
    this.hits = new Map();
    this.ice = new Map();
    this.loot = new Map();
    this.gold = new Set();
    this.chunks = new Map();
    this.players = new Map();
    this.team = defaultTeam();
    this.ammoPend = new Map();
    this.statsPend = { blocks: 0, levels: 0 };
    this.offset = 0;
    this.joinedAt = 0;
    this.isLeader = true;
    this.cb = {};
    this.unsubs = [];
    this.epochUnsubs = [];
    this.flushT = 0;
    this.sendT = 0;
    this.cleanT = 2;
    this.oldShotsT = 6;
    this.statsT = 2;
    this.shotKeys = [];
    this.me = null;
    this.sentChunks = new Set();
  }

  now() { return Date.now() + this.offset; }
  base() { return `${ROOT}/world/e${this.epoch}`; }
  r(p) { return p ? this.fb.ref(this.db, p) : this.fb.ref(this.db); }

  async connect(timeout = 9000) {
    const limit = (p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeout))]);
    const [appM, authM, dbM] = await limit(Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-auth.js`),
      import(`${SDK}/firebase-database.js`),
    ]));
    this.fb = dbM;
    const app = appM.getApps().length ? appM.getApp() : appM.initializeApp(firebaseConfig);
    const auth = authM.getAuth(app);
    await limit(auth.authStateReady ? auth.authStateReady() : Promise.resolve());
    const user = auth.currentUser || (await limit(authM.signInAnonymously(auth))).user;
    this.uid = user.uid;
    this.db = dbM.getDatabase(app);
    this.unsubs.push(dbM.onValue(this.r('.info/serverTimeOffset'), (s) => { this.offset = s.val() || 0; }));
    this.unsubs.push(dbM.onValue(this.r('.info/connected'), (s) => {
      this.connected = !!s.val();
      if (this.connected && this.me) this.registerDisconnect();
      if (this.cb.status) this.cb.status(this.connected);
    }));
    await limit(this.loadWorld());
    this.online = true;
    return true;
  }

  async loadWorld() {
    const { get, runTransaction } = this.fb;
    const mref = this.r(`${ROOT}/world/meta`);
    let meta = (await get(mref)).val();
    if (!meta) {
      const res = await runTransaction(mref, (cur) => cur || { level: 1, seed: 1 + Math.floor(Math.random() * 1e6), epoch: 1 });
      meta = res.snapshot.val();
    }
    this.meta = meta;
    this.epoch = meta.epoch;
    const tref = this.r(`${ROOT}/team`);
    let team = (await get(tref)).val();
    if (!team) {
      const res = await runTransaction(tref, (cur) => cur || defaultTeam());
      team = res.snapshot.val();
    }
    this.team = this.normTeam(team);
    const data = (await get(this.r(this.base()))).val() || {};
    this.ingest(data);
  }

  normTeam(t) {
    const d = defaultTeam();
    if (!t) return d;
    return { gems: t.gems || 0, up: t.up || {}, ammo: t.ammo || {}, stats: Object.assign(d.stats, t.stats || {}), last: t.last || null };
  }

  ingest(data) {
    this.dmg.clear();
    this.ice.clear();
    this.loot.clear();
    this.gold.clear();
    this.chunks.clear();
    for (const [k, v] of Object.entries(data.dmg || {})) this.dmg.set(+k, v);
    for (const [k, v] of Object.entries(data.ice || {})) this.ice.set(+k, v);
    for (const [k, v] of Object.entries(data.loot || {})) if (v && v.u) this.loot.set(k, v.u);
    for (const k of Object.keys(data.gold || {})) this.gold.add(+k);
    for (const [k, v] of Object.entries(data.chunks || {})) this.chunks.set(k, v);
  }

  attach() {
    const { onValue, onChildAdded, onChildChanged, onChildRemoved } = this.fb;
    this.unsubs.push(onValue(this.r(`${ROOT}/world/meta`), (s) => {
      const m = s.val();
      if (m && m.epoch !== this.epoch) this.switchEpoch(m);
    }));
    this.unsubs.push(onValue(this.r(`${ROOT}/team`), (s) => {
      const prev = this.team;
      this.team = this.normTeam(s.val());
      if (this.cb.team) this.cb.team(this.team, prev);
    }));
    this.attachEpoch();
    const pr = this.r(`${ROOT}/players`);
    this.unsubs.push(onChildAdded(pr, (s) => this.playerSnap(s)));
    this.unsubs.push(onChildChanged(pr, (s) => this.playerSnap(s)));
    this.unsubs.push(onChildRemoved(pr, (s) => {
      this.players.delete(s.key);
      this.electLeader();
      if (this.cb.players) this.cb.players();
    }));
    this.unsubs.push(onChildAdded(this.r(`${ROOT}/shots`), (s) => {
      const v = s.val();
      if (!v || v.o === this.uid || typeof v.ts !== 'number') return;
      const age = (this.now() - v.ts) / 1000;
      if (age > 1.5) return;
      if (this.cb.shot) this.cb.shot(v, Math.max(0, age));
    }));
  }

  attachEpoch() {
    const { onChildAdded, onChildChanged } = this.fb;
    const base = this.base();
    const on = (p, fn) => {
      const ref = this.r(`${base}/${p}`);
      this.epochUnsubs.push(onChildAdded(ref, fn), onChildChanged(ref, fn));
    };
    on('dmg', (s) => {
      const i = +s.key;
      const v = s.val();
      if (typeof v !== 'number' || (this.dmg.get(i) || 0) === v) return;
      this.dmg.set(i, v);
      if (this.cb.damage) this.cb.damage(i, v);
    });
    on('loot', (s) => {
      const v = s.val();
      if (!v || !v.u || this.loot.get(s.key) === v.u) return;
      this.loot.set(s.key, v.u);
      if (this.cb.loot) this.cb.loot(s.key, v.u);
    });
    on('gold', (s) => { this.gold.add(+s.key); });
    on('ice', (s) => {
      this.ice.set(+s.key, s.val());
      if (this.cb.ice) this.cb.ice(+s.key, s.val());
    });
    on('chunks', (s) => {
      const v = s.val();
      if (!v || v.by === this.uid) return;
      this.chunks.set(s.key, v);
      if (this.cb.chunk) this.cb.chunk(s.key, v);
    });
  }

  switchEpoch(m) {
    for (const u of this.epochUnsubs) u();
    this.epochUnsubs = [];
    this.flush();
    this.pend.clear();
    this.hits.clear();
    this.ingest({});
    this.sentChunks.clear();
    this.meta = m;
    this.epoch = m.epoch;
    this.attachEpoch();
    if (this.cb.meta) this.cb.meta(m);
  }

  join(nick, color) {
    this.me = { n: nick, c: color };
    this.joinedAt = this.now();
    this.registerDisconnect();
    this.electLeader();
  }

  setProfile(nick, color) {
    if (!this.me) return;
    this.me.n = nick;
    this.me.c = color;
  }

  registerDisconnect() {
    if (!this.fb || !this.uid) return;
    this.fb.onDisconnect(this.r(`${ROOT}/players/${this.uid}`)).remove().catch(() => {});
  }

  playerSnap(s) {
    if (s.key === this.uid) return;
    const v = s.val();
    if (!v || !v.p) return;
    let p = this.players.get(s.key);
    if (!p) {
      p = { uid: s.key, buf: [], v };
      this.players.set(s.key, p);
    }
    p.v = v;
    p.seen = performance.now();
    p.buf.push({ t: performance.now(), x: v.p[0], y: v.p[1], z: v.p[2], yaw: v.y || 0, pitch: v.a || 0 });
    if (p.buf.length > 5) p.buf.shift();
    this.electLeader();
    if (this.cb.players) this.cb.players();
  }

  livePlayers() {
    const t = performance.now();
    return [...this.players.values()].filter((p) => t - p.seen < STALE_MS);
  }

  playerPos(uid) {
    const p = this.players.get(uid);
    if (!p || !p.buf.length) return null;
    const b = p.buf[p.buf.length - 1];
    return { x: b.x, y: b.y + 1, z: b.z };
  }

  nickOf(uid) {
    if (uid === this.uid) return this.me ? this.me.n : 'You';
    const p = this.players.get(uid);
    return p ? p.v.n : 'Someone';
  }

  electLeader() {
    let best = { j: this.joinedAt, uid: this.uid };
    for (const p of this.livePlayers()) {
      const j = p.v.j || 0;
      if (j < best.j || (j === best.j && p.uid < best.uid)) best = { j, uid: p.uid };
    }
    const was = this.isLeader;
    this.isLeader = best.uid === this.uid;
    if (was !== this.isLeader && this.cb.leader) this.cb.leader(this.isLeader);
  }

  damage(i, d, gold) {
    this.pend.set(i, (this.pend.get(i) || 0) + d);
    this.hits.set(i, performance.now());
    if (gold && !this.gold.has(i)) {
      this.gold.add(i);
      this.fb.set(this.r(`${this.base()}/gold/${i}`), 1).catch(() => {});
    }
  }

  total(i) { return (this.dmg.get(i) || 0) + (this.pend.get(i) || 0); }

  ammoLeft(t) { return (this.team.ammo[t] || 0) - (this.ammoPend.get(t) || 0); }

  useAmmo(t) {
    if (this.ammoLeft(t) <= 0) return false;
    this.ammoPend.set(t, (this.ammoPend.get(t) || 0) + 1);
    return true;
  }

  flush() {
    if (!this.fb) return;
    if (!this.pend.size && !this.ammoPend.size) return;
    const { update, increment } = this.fb;
    const u = {};
    const base = this.base();
    for (const [i, d] of this.pend) u[`${base}/dmg/${i}`] = increment(Math.round(d * 100) / 100);
    for (const [t, n] of this.ammoPend) u[`${ROOT}/team/ammo/${t}`] = increment(-n);
    this.pend.clear();
    this.ammoPend.clear();
    update(this.r(''), u).catch((e) => console.warn('flush', e));
  }

  async claimLoot(id) {
    if (this.loot.has(id)) return this.loot.get(id) === this.uid;
    try {
      const res = await this.fb.runTransaction(this.r(`${this.base()}/loot/${id}`), (cur) => (cur ? undefined : { u: this.uid, t: Date.now() }));
      const v = res.snapshot.val();
      return !!(res.committed && v && v.u === this.uid);
    } catch { return false; }
  }

  async teamTx(fn) {
    try {
      const res = await this.fb.runTransaction(this.r(`${ROOT}/team`), (cur) => {
        const t = this.normTeam(cur);
        const out = fn(t);
        if (!out) return undefined;
        out.last = { by: this.me ? this.me.n : 'Someone', u: this.uid, what: out.lastWhat || '', t: Date.now() };
        delete out.lastWhat;
        return out;
      });
      return !!res.committed;
    } catch (e) {
      console.warn('team', e);
      return false;
    }
  }

  addGems(v) {
    const { update, increment } = this.fb;
    update(this.r(''), { [`${ROOT}/team/gems`]: increment(v), [`${ROOT}/team/stats/gems`]: increment(v) }).catch(() => {});
  }

  addAmmo(t, n) {
    this.fb.update(this.r(''), { [`${ROOT}/team/ammo/${t}`]: this.fb.increment(n) }).catch(() => {});
  }

  countBlocks(n) { this.statsPend.blocks += n; }
  countLevel() { this.statsPend.levels += 1; }

  freeze(i, ms) {
    const until = this.now() + ms;
    this.ice.set(i, until);
    this.fb.set(this.r(`${this.base()}/ice/${i}`), until).catch(() => {});
  }

  frozen(i) { return (this.ice.get(i) || 0) > this.now(); }

  sendChunks(states, liveIds) {
    const u = {};
    const base = this.base();
    for (const c of states) {
      u[`${base}/chunks/${c.id}`] = { t: c.t, q: c.q, v: c.v, a: c.a, s: c.s ? 1 : 0, by: this.uid };
      this.sentChunks.add(String(c.id));
    }
    for (const id of this.sentChunks) {
      if (!liveIds.has(id)) { u[`${base}/chunks/${id}`] = null; this.sentChunks.delete(id); }
    }
    if (Object.keys(u).length) this.fb.update(this.r(''), u).catch(() => {});
  }

  sendPlayer(st) {
    if (!this.me) return;
    this.fb.set(this.r(`${ROOT}/players/${this.uid}`), {
      n: this.me.n, c: this.me.c, j: this.joinedAt,
      p: [+st.x.toFixed(2), +st.y.toFixed(2), +st.z.toFixed(2)],
      y: +st.yaw.toFixed(3), a: +st.pitch.toFixed(3), b: st.ball, e: st.emote, et: st.emoteT,
    }).catch(() => {});
  }

  shot(rec) {
    const { push, set, serverTimestamp } = this.fb;
    const ref = push(this.r(`${ROOT}/shots`));
    set(ref, { o: this.uid, t: rec.t, p: rec.p, d: rec.d, s: rec.s, m: rec.m, ts: serverTimestamp() }).catch(() => {});
    this.shotKeys.push({ k: ref.key, at: performance.now() });
  }

  async advance(fromEpoch) {
    const { runTransaction, remove } = this.fb;
    try {
      const res = await runTransaction(this.r(`${ROOT}/world/meta`), (cur) => (cur && cur.epoch === fromEpoch
        ? { level: cur.level + 1, seed: 1 + Math.floor(Math.random() * 1e6), epoch: cur.epoch + 1 }
        : undefined));
      if (res.committed) setTimeout(() => remove(this.r(`${ROOT}/world/e${fromEpoch}`)).catch(() => {}), 4000);
      return res.committed;
    } catch (e) {
      console.warn('advance', e);
      return false;
    }
  }

  async resetWorld() {
    const { set } = this.fb;
    const epoch = this.epoch + 1;
    await set(this.r(`${ROOT}/world/meta`), { level: 1, seed: 1 + Math.floor(Math.random() * 1e6), epoch }).catch(() => {});
  }

  update(dt, playerState) {
    if (!this.online) return;
    this.flushT -= dt;
    if (this.flushT <= 0) { this.flushT = FLUSH; this.flush(); }
    this.sendT -= dt;
    if (this.sendT <= 0 && playerState && this.connected) { this.sendT = SEND; this.sendPlayer(playerState()); }
    this.statsT -= dt;
    if (this.statsT <= 0) {
      this.statsT = 2;
      const sp = this.statsPend;
      if (sp.blocks || sp.levels) {
        const { update, increment } = this.fb;
        const u = {};
        if (sp.blocks) u[`${ROOT}/team/stats/blocks`] = increment(sp.blocks);
        if (sp.levels) u[`${ROOT}/team/stats/levels`] = increment(sp.levels);
        sp.blocks = 0;
        sp.levels = 0;
        update(this.r(''), u).catch(() => {});
      }
    }
    this.cleanT -= dt;
    if (this.cleanT <= 0) {
      this.cleanT = 2;
      const t = performance.now();
      const old = this.shotKeys.filter((s) => t - s.at > 4000);
      if (old.length) {
        this.shotKeys = this.shotKeys.filter((s) => t - s.at <= 4000);
        const u = {};
        for (const s of old) u[`${ROOT}/shots/${s.k}`] = null;
        this.fb.update(this.r(''), u).catch(() => {});
      }
      this.electLeader();
    }
    this.oldShotsT -= dt;
    if (this.oldShotsT <= 0 && this.isLeader) {
      this.oldShotsT = 10;
      const { query, orderByChild, endAt, get, update } = this.fb;
      get(query(this.r(`${ROOT}/shots`), orderByChild('ts'), endAt(this.now() - 15000))).then((s) => {
        const u = {};
        s.forEach((c) => { u[`${ROOT}/shots/${c.key}`] = null; });
        if (Object.keys(u).length) return update(this.r(''), u);
        return null;
      }).catch(() => {});
    }
  }
}
