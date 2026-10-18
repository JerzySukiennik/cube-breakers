// Cube Breakers: Firebase RTDB sync (anonymous auth, players, shared block damage, kill claims, chunk authority, shots, records).

import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.5';
const ROOT = 'cubeBreakers';
const FLUSH = 0.1;
const SEND = 0.1;
const STALE_MS = 12000;

export class Net {
  constructor() {
    this.online = false;
    this.connected = false;
    this.uid = null;
    this.fb = null;
    this.db = null;
    this.meta = null;
    this.epoch = 0;
    this.initial = null;
    this.dmg = new Map();
    this.pend = new Map();
    this.hits = new Map();
    this.ice = new Map();
    this.kills = new Map();
    this.chunks = new Map();
    this.players = new Map();
    this.records = [];
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
    this.recordT = 2;
    this.recordAdd = 0;
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
    const data = (await get(this.r(this.base()))).val() || {};
    this.ingest(data);
  }

  ingest(data) {
    this.dmg.clear();
    this.kills.clear();
    this.ice.clear();
    this.chunks.clear();
    for (const [k, v] of Object.entries(data.dmg || {})) this.dmg.set(+k, v);
    for (const [k, v] of Object.entries(data.kill || {})) if (v && v.u) this.kills.set(+k, v.u);
    for (const [k, v] of Object.entries(data.ice || {})) this.ice.set(+k, v);
    for (const [k, v] of Object.entries(data.chunks || {})) this.chunks.set(k, v);
  }

  attach() {
    const { onValue, onChildAdded, onChildChanged, onChildRemoved, query, orderByChild, limitToLast } = this.fb;
    this.unsubs.push(onValue(this.r(`${ROOT}/world/meta`), (s) => {
      const m = s.val();
      if (m && m.epoch !== this.epoch) this.switchEpoch(m);
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
    this.unsubs.push(onValue(query(this.r(`${ROOT}/records`), orderByChild('b'), limitToLast(10)), (s) => {
      const list = [];
      s.forEach((c) => { list.push({ uid: c.key, ...c.val() }); });
      list.sort((a, b) => b.b - a.b);
      this.records = list;
      if (this.cb.records) this.cb.records(list);
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
    on('kill', (s) => {
      const i = +s.key;
      const v = s.val();
      if (!v || !v.u || this.kills.get(i) === v.u) return;
      this.kills.set(i, v.u);
      if (this.cb.kill) this.cb.kill(i, v.u);
    });
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

  damage(i, d, credit, gold) {
    this.pend.set(i, (this.pend.get(i) || 0) + d);
    this.hits.set(i, { t: performance.now(), credit: credit || this.uid, gold });
  }

  total(i) { return (this.dmg.get(i) || 0) + (this.pend.get(i) || 0); }

  flush() {
    if (!this.pend.size || !this.fb) return;
    const { update, increment } = this.fb;
    const u = {};
    const base = this.base();
    for (const [i, d] of this.pend) u[`${base}/dmg/${i}`] = increment(Math.round(d * 100) / 100);
    this.pend.clear();
    update(this.r(''), u).catch((e) => console.warn('dmg', e));
  }

  claim(i) {
    const h = this.hits.get(i);
    if (!h || performance.now() - h.t > 4000 || this.kills.has(i)) return;
    this.fb.runTransaction(this.r(`${this.base()}/kill/${i}`), (cur) => (cur ? undefined : { u: h.credit, t: Date.now() })).catch(() => {});
  }

  creditOf(i) { return this.kills.get(i); }

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
      y: +st.yaw.toFixed(3), a: +st.pitch.toFixed(3), b: st.ball, d: Math.round(st.dmg), e: st.emote, et: st.emoteT,
    }).catch(() => {});
  }

  shot(rec) {
    const { push, set, serverTimestamp } = this.fb;
    const ref = push(this.r(`${ROOT}/shots`));
    set(ref, { o: this.uid, t: rec.t, p: rec.p, d: rec.d, s: rec.s, m: rec.m, ts: serverTimestamp() }).catch(() => {});
    this.shotKeys.push({ k: ref.key, at: performance.now() });
  }

  addKill() { this.recordAdd++; }

  async advance(fromEpoch) {
    const { runTransaction, remove } = this.fb;
    try {
      const res = await runTransaction(this.r(`${ROOT}/world/meta`), (cur) => (cur && cur.epoch === fromEpoch
        ? { level: cur.level + 1, seed: 1 + Math.floor(Math.random() * 1e6), epoch: cur.epoch + 1 }
        : undefined));
      if (res.committed) setTimeout(() => remove(this.r(`${ROOT}/world/e${fromEpoch}`)).catch(() => {}), 4000);
    } catch (e) { console.warn('advance', e); }
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
    this.recordT -= dt;
    if (this.recordT <= 0) {
      this.recordT = 2;
      if (this.recordAdd && this.me) {
        const { update, increment } = this.fb;
        update(this.r(''), { [`${ROOT}/records/${this.uid}/b`]: increment(this.recordAdd), [`${ROOT}/records/${this.uid}/n`]: this.me.n }).catch(() => {});
        this.recordAdd = 0;
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
