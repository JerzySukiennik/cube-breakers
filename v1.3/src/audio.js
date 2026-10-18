// Cube Breakers: Web Audio sound bank with distance falloff, stereo pan, voice limits, and a music playlist.

const GROUPS = {
  bounce: { files: ['bounce0', 'bounce1', 'bounce2', 'bounce3', 'bounce4'], vol: 0.42, max: 14, gap: 0.018 },
  plop: { files: ['plop'], vol: 0.5, max: 6, gap: 0.03 },
  break: { files: ['break0', 'break1', 'break2', 'break3', 'break4'], vol: 0.55, max: 8, gap: 0.025 },
  pop: { files: ['pop'], vol: 0.45, max: 6, gap: 0.03 },
  dome: { files: ['dome0', 'dome1', 'dome2', 'dome3', 'dome4'], vol: 0.16, max: 4, gap: 0.12 },
  land: { files: ['land0', 'land1', 'land2', 'land3', 'land4'], vol: 0.8, max: 5, gap: 0.06 },
  step: { files: ['step0', 'step1', 'step2', 'step3', 'step4'], vol: 0.32, max: 2, gap: 0.08 },
  soft: { files: ['soft0', 'soft1', 'soft2', 'soft3', 'soft4'], vol: 0.4, max: 6, gap: 0.03 },
  ice: { files: ['ice0', 'ice1', 'ice2', 'ice3', 'ice4'], vol: 0.4, max: 8, gap: 0.025 },
  metal: { files: ['metal0', 'metal1', 'metal2', 'metal3', 'metal4'], vol: 0.3, max: 6, gap: 0.03 },
  boom: { files: ['boom0', 'boom1', 'boom2', 'boom3', 'boom4'], vol: 0.85, max: 6, gap: 0.04 },
  bigboom: { files: ['bigboom0', 'bigboom1'], vol: 1, max: 3, gap: 0.08 },
  shot: { files: ['shot'], vol: 0.55, max: 4, gap: 0.03 },
  select: { files: ['select'], vol: 0.4, max: 2, gap: 0.03 },
  crate: { files: ['crate'], vol: 0.6, max: 3, gap: 0.05 },
  split: { files: ['split'], vol: 0.35, max: 4, gap: 0.04 },
  powerup: { files: ['powerup'], vol: 0.45, max: 3, gap: 0.05 },
  click: { files: ['click'], vol: 0.5, max: 2, gap: 0.03 },
  pickup: { files: ['pickup0', 'pickup1', 'pickup2', 'pickup3', 'pickup4'], vol: 0.45, max: 6, gap: 0.035 },
  error: { files: ['error'], vol: 0.6, max: 2, gap: 0.08 },
  cash: { files: ['cash'], vol: 0.7, max: 2, gap: 0.1 },
  djump: { files: ['djump'], vol: 0.45, max: 2, gap: 0.05 },
  levelup: { files: ['levelup'], vol: 0.6, max: 2, gap: 0.05 },
  take: { files: ['take'], vol: 0.6, max: 2, gap: 0.05 },
  jet: { files: ['jet'], vol: 0.5, max: 1, gap: 0 },
  drill: { files: ['drill'], vol: 0.55, max: 1, gap: 0 },
  dig: { files: ['dig0', 'dig1', 'dig2', 'dig3', 'dig4'], vol: 0.55, max: 4, gap: 0.06 },
  beam: { files: ['beam0', 'beam1'], vol: 0.9, max: 3, gap: 0.05 },
  charge: { files: ['charge'], vol: 0.6, max: 3, gap: 0.1 },
  rumble: { files: ['rumble0', 'rumble1'], vol: 0.9, max: 2, gap: 0.1 },
  slime: { files: ['slime0'], vol: 0.45, max: 5, gap: 0.04 },
  hole: { files: ['hole'], vol: 0.55, max: 3, gap: 0.2 },
  crack: { files: ['crack0', 'crack1', 'crack2'], vol: 0.7, max: 4, gap: 0.05 },
  snipe: { files: ['snipe0', 'snipe1'], vol: 0.6, max: 4, gap: 0.03 },
  ghost: { files: ['ghost'], vol: 0.5, max: 3, gap: 0.05 },
  pw: { files: ['pw0', 'pw1'], vol: 0.6, max: 2, gap: 0.1 },
  tick: { files: ['tick0', 'tick1'], vol: 0.5, max: 4, gap: 0.03 },
  tap: { files: ['tap'], vol: 0.6, max: 3, gap: 0.02 },
  peg: { files: ['peg0', 'peg1', 'peg2', 'peg3', 'peg4'], vol: 0.45, max: 6, gap: 0.02 },
  clack: { files: ['clack0', 'clack1', 'clack2', 'clack3'], vol: 0.4, max: 6, gap: 0.03 },
  ratchet: { files: ['ratchet'], vol: 0.6, max: 2, gap: 0.2 },
  win: { files: ['win'], vol: 0.7, max: 2, gap: 0.1 },
  jackpot: { files: ['jackpot'], vol: 0.8, max: 2, gap: 0.1 },
  tshot: { files: ['tshot'], vol: 0.35, max: 6, gap: 0.03 },
  crit: { files: ['crit0', 'crit1', 'crit2'], vol: 0.5, max: 4, gap: 0.04 },
  pep: { files: ['pep0', 'pep1', 'pep2'], vol: 0.4, max: 3, gap: 0.05 },
  hatch: { files: ['hatch'], vol: 0.5, max: 2, gap: 0.1 },
  thrust: { files: ['thrust'], vol: 0.45, max: 3, gap: 0.1 },
};

const MUSIC = ['assets/music/local-forecast.mp3', 'assets/music/carefree.mp3'];

export class AudioBank {
  constructor() {
    this.ctx = null;
    this.buffers = new Map();
    this.state = {};
    this.listener = { x: 0, y: 0, z: 0, rx: 1, ry: 0, rz: 0 };
    this.sfxVol = 0.8;
    this.musicVol = 0.35;
    this.music = null;
    this.track = 0;
    this.ready = false;
  }

  async load(onProgress) {
    const names = new Set();
    for (const g of Object.values(GROUPS)) for (const f of g.files) names.add(f);
    const raw = new Map();
    let done = 0;
    await Promise.all([...names].map(async (n) => {
      try {
        const r = await fetch(`assets/audio/${n}.mp3`);
        raw.set(n, await r.arrayBuffer());
      } catch (e) { console.warn('audio', n, e); }
      done++;
      if (onProgress) onProgress(done / names.size);
    }));
    this.raw = raw;
  }

  async unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') await this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.sfxVol;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    await Promise.all([...(this.raw || new Map())].map(async ([n, ab]) => {
      try { this.buffers.set(n, await this.ctx.decodeAudioData(ab)); } catch (e) { console.warn('decode', n, e); }
    }));
    this.raw = null;
    for (const k of Object.keys(GROUPS)) this.state[k] = { last: -1, voices: 0 };
    this.ready = true;
    this.startMusic();
  }

  startMusic() {
    if (this.music) return;
    this.music = new Audio(MUSIC[this.track]);
    this.music.volume = this.musicVol;
    this.music.addEventListener('ended', () => {
      this.track = (this.track + 1) % MUSIC.length;
      this.music.src = MUSIC[this.track];
      this.music.play().catch(() => {});
    });
    this.music.play().catch(() => {});
  }

  setSfx(v) {
    this.sfxVol = v;
    if (this.master) this.master.gain.value = v;
  }

  setMusic(v) {
    this.musicVol = v;
    if (this.music) this.music.volume = v;
  }

  pause(p) {
    if (!this.music) return;
    if (p) this.music.pause(); else this.music.play().catch(() => {});
  }

  setListener(pos, right) {
    const l = this.listener;
    l.x = pos.x; l.y = pos.y; l.z = pos.z;
    l.rx = right.x; l.ry = right.y; l.rz = right.z;
  }

  loop(group) {
    if (!this.ready) return null;
    this.loops = this.loops || {};
    if (this.loops[group]) return this.loops[group];
    const g = GROUPS[group];
    const buf = this.buffers.get(g.files[0]);
    if (!buf) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain).connect(this.master);
    src.start();
    const ctx = this.ctx;
    const h = { level: 0, set(v) { if (Math.abs(v - this.level) < 0.005) return; this.level = v; gain.gain.setTargetAtTime(v * g.vol, ctx.currentTime, 0.06); } };
    this.loops[group] = h;
    return h;
  }

  play(group, opts = {}) {
    if (!this.ready) return;
    const g = GROUPS[group];
    const st = this.state[group];
    const now = this.ctx.currentTime;
    if (now - st.last < g.gap || st.voices >= g.max) return;
    let vol = g.vol * (opts.vol ?? 1);
    let pan = 0;
    if (opts.pos) {
      const l = this.listener;
      const dx = opts.pos.x - l.x, dy = opts.pos.y - l.y, dz = opts.pos.z - l.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const range = opts.range ?? 55;
      if (d > range) return;
      const k = 1 - d / range;
      vol *= k * k * (1 / (1 + d * 0.04));
      if (d > 0.01) pan = Math.max(-1, Math.min(1, (dx * l.rx + dy * l.ry + dz * l.rz) / d)) * 0.75;
    }
    if (vol < 0.01) return;
    const buf = this.buffers.get(g.files[Math.floor(Math.random() * g.files.length)]);
    if (!buf) return;
    st.last = now;
    st.voices++;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = (opts.rate ?? 1) * (1 + (Math.random() - 0.5) * (opts.jitter ?? 0.12));
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(gain).connect(p).connect(this.master);
    src.onended = () => { st.voices--; };
    src.start();
  }
}
