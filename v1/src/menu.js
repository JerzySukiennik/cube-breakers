// Cube Breakers: main/pause menu (tabs, settings controls, world card, bean preview).

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { beanModel, PLAYER_COLORS } from './avatars.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Menu {
  constructor({ settings, onSetting, onClick }) {
    this.el = $('menu');
    this.settings = settings;
    this.onSetting = onSetting;
    this.onClick = onClick || (() => {});
    this.tab = 'play';
    this.worldKey = '';
    this.tabs = [...document.querySelectorAll('#tabs button')];
    this.panes = [...document.querySelectorAll('.pane')];
    for (const b of this.tabs) b.addEventListener('click', () => { this.show(b.dataset.tab); this.onClick(); });

    const range = (id, key, fmtv) => {
      const el = $(id);
      const out = $('o-' + id.slice(4));
      el.value = settings[key];
      const paint = () => {
        out.textContent = fmtv(parseFloat(el.value));
        el.style.background = `linear-gradient(90deg, #fff ${((el.value - el.min) / (el.max - el.min)) * 100}%, rgba(255,255,255,0.3) 0)`;
      };
      paint();
      el.addEventListener('input', () => { paint(); onSetting(key, parseFloat(el.value)); });
    };
    range('set-music', 'music', (v) => Math.round(v * 100) + '%');
    range('set-sfx', 'sfx', (v) => Math.round(v * 100) + '%');
    range('set-sens', 'sens', (v) => v.toFixed(2) + '×');

    const seg = (id, key, parse) => {
      const root = $(id);
      const btns = [...root.querySelectorAll('button')];
      const paint = () => btns.forEach((b) => b.classList.toggle('on', String(parse(b.dataset.v)) === String(settings[key])));
      paint();
      for (const b of btns) b.addEventListener('click', () => { onSetting(key, parse(b.dataset.v)); paint(); this.onClick(); });
    };
    seg('seg-grass', 'grass', (v) => v);
    seg('seg-res', 'res', (v) => parseFloat(v));

    const sw = $('set-fps');
    const paintSw = () => sw.setAttribute('aria-checked', settings.fps ? 'true' : 'false');
    paintSw();
    sw.addEventListener('click', () => { onSetting('fps', !settings.fps); paintSw(); this.onClick(); });

    this.canvas = $('bean');
    this.preview = null;
    this.color = 0;
    this.spin = 0;
  }

  show(tab) {
    this.tab = tab;
    this.tabs.forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    this.panes.forEach((p) => p.classList.toggle('on', p.dataset.pane === tab));
  }

  setPaused(paused) {
    this.el.classList.toggle('paused', paused);
    $('play-label').textContent = paused ? 'RESUME' : 'PLAY';
  }

  setStatus(text, ok) {
    const s = $('net-status');
    s.textContent = text;
    s.classList.toggle('ok', !!ok);
  }

  stats({ gems, blocks, levels }) {
    $('ms-gems').textContent = fmt(gems);
    $('ms-blocks').textContent = fmt(blocks);
    $('ms-levels').textContent = fmt(levels);
  }

  world(d) {
    const key = JSON.stringify(d);
    if (key === this.worldKey) return;
    this.worldKey = key;
    $('w-level').textContent = `Level ${d.level}`;
    $('w-shape').textContent = d.shape;
    $('w-fill').style.transform = `scaleX(${d.total ? 1 - d.remaining / d.total : 0})`;
    $('w-left').textContent = `${fmt(d.remaining)} ${d.remaining === 1 ? 'block' : 'blocks'} to go`;
    $('w-live').classList.toggle('on', !d.offline);
    $('w-online').textContent = d.offline ? 'Offline · solo' : `${d.online.length} online`;
    $('w-players').innerHTML = d.online.slice(0, 7).map((p) => `<li class="${p.me ? 'me' : ''}"><span class="dot" style="background:${p.color}"></span><span class="nm">${esc(p.nick)}${p.me ? ' (you)' : ''}</span></li>`).join('')
      + (d.online.length > 7 ? `<li class="empty">+${d.online.length - 7} more</li>` : '');
    $('w-top').innerHTML = d.top.length
      ? d.top.slice(0, 5).map((r, i) => `<li class="${r.me ? 'me' : ''}"><span class="rk">${i + 1}.</span><span class="nm">${esc(r.n || 'Player')}</span><span class="v">${fmt(r.b || 0)}</span></li>`).join('')
      : `<li class="empty">${d.offline ? 'Records need the shared world.' : 'No records yet. Be the first!'}</li>`;
  }

  setColor(i) {
    this.color = i;
    if (this.preview) this.preview.bean.bodyMat.color.set(PLAYER_COLORS[i]);
  }

  initPreview() {
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.toneMapping = THREE.NeutralToneMapping;
    const scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.7;
    scene.add(new THREE.HemisphereLight('#e6f4ff', '#6aa24a', 1.3));
    const key = new THREE.DirectionalLight('#fff4e4', 2.2);
    key.position.set(-1.5, 3, 2.5);
    scene.add(key);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    cam.position.set(0, 1.25, 4.4);
    cam.lookAt(0, 0.95, 0);
    const bean = beanModel(PLAYER_COLORS[this.color]);
    scene.add(bean.g);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 32), new THREE.MeshBasicMaterial({ color: '#001a40', transparent: true, opacity: 0.25 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    scene.add(shadow);
    this.preview = { r, scene, cam, bean, w: 0, h: 0 };
  }

  render(dt, visible) {
    if (!visible || this.tab !== 'play') return;
    if (!this.preview) this.initPreview();
    const p = this.preview;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    if (w !== p.w || h !== p.h) {
      p.w = w; p.h = h;
      p.r.setSize(w, h, false);
      p.cam.aspect = w / h;
      p.cam.updateProjectionMatrix();
    }
    this.spin += dt;
    const g = p.bean.g;
    g.rotation.y = Math.PI + Math.sin(this.spin * 0.7) * 0.6;
    g.position.y = Math.abs(Math.sin(this.spin * 2.2)) * 0.08;
    p.bean.head.rotation.x = Math.sin(this.spin * 1.3) * 0.08;
    p.bean.arm.rotation.x = 0.15 + Math.sin(this.spin * 1.1) * 0.12;
    p.r.render(p.scene, p.cam);
  }
}
