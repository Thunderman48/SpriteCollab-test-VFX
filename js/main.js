// SpriteCollab VFX Arena — boot, game loop, arena rendering, hits, screens.
import { loadJSON, loadImage, loadFighterArt, loadParticle, loadBeam } from './assets.js';
import { DB, computeDamage } from './combat.js';
import { Fighter } from './fighter.js';
import { MOVEFX } from './moves.js';
import { FX, Effect, FloatText, BannerFont } from './vfx.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Bot } from './bot.js';
import { Sfx } from './sfx.js';

const W = 512;
const H = 288;
const RES = 2; // backing-store pixels per arena pixel
const STEP = 1 / 60;

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    canvas.width = W * RES;
    canvas.height = H * RES;
    this.ctx = canvas.getContext('2d');
    this.bounds = { x0: 18, x1: W - 18, y0: 74, y1: H - 14 };
    this.objects = [];
    this.timers = [];
    this.updaters = [];
    this.fighters = [];
    this.state = 'loading';
    this.time = 0;
    this.shakeAmt = 0;
    this.shakeT = 0;
    this.tints = [];
    this.slowmo = 1;
    this.bots = [null, null];
    this.dodgeTextT = [0, 0];
    this.arena = this.renderArena();
    this.sfx = (name) => Sfx.play(name);
  }

  // ---------- object/timer plumbing used by moves.js ----------
  addEffect(e) {
    this.objects.push(e);
    return e;
  }
  addObject(o) {
    this.objects.push(o);
    return o;
  }
  after(delay, fn, owner = null) {
    this.timers.push({ t: delay, fn, owner });
  }
  addUpdater(fn, owner = null) {
    this.updaters.push({ fn, owner });
  }
  cancelOwner(owner) {
    this.timers = this.timers.filter((t) => t.owner !== owner);
    this.updaters = this.updaters.filter((u) => u.owner !== owner);
    for (const o of this.objects) if (o.owner === owner) o.dead = true;
  }
  shake(amount, time = 0.2) {
    if (amount > this.shakeAmt || this.shakeT <= 0) {
      this.shakeAmt = amount;
      this.shakeT = time;
    }
  }
  tint(color, time) {
    this.tints.push({ color, time, t: 0 });
  }

  who(f) {
    return `<span class="c-p${f.slot + 1}">${f.data.name}</span>`;
  }

  announce(c, move) {
    this.stats[c.slot].casts++;
    this.ui.log(`${this.who(c)} used <span class="green">${move.name}</span>!`);
  }

  dodgedText(f) {
    if (this.dodgeTextT[f.slot] > 0) return;
    this.dodgeTextT[f.slot] = 0.4;
    this.stats[f.slot].dodges++;
    this.addEffect(new FloatText('Dodged!', f.x, f.y - 26, '#00f8f8'));
  }

  applyHit(att, def, cast, { angle = 0, factor = 1, at = null, noFx = false } = {}) {
    if (!def.alive || this.state === 'result') return;
    const move = cast.move;
    const { dmg, eff, crit } = computeDamage(att, def, move, factor);
    const fxd = cast.def;
    const hx = at ? (at.x + def.x) / 2 : def.x;
    const hy = at ? (at.y + def.y) / 2 : def.y - 4;
    if (!noFx) {
      if (fxd.hit) this.addEffect(new Effect(fxd.hit, hx, hy, { angle }));
      if (fxd.hit2) this.addEffect(new Effect(fxd.hit2, hx, hy, { angle, layer: 'under' }));
    }
    if (eff > 1) this.addEffect(new Effect(MOVEFX.common.hitSuper, def.x, def.y - 6, { scale: 1.2 }));
    else if (noFx && eff > 0) this.addEffect(new Effect(MOVEFX.common.hitNeutral, def.x, def.y - 6));
    const s = this.stats[att.slot];
    s.damage += dmg;
    s.hits++;
    if (eff > 1) s.supers++;
    this.moveLog[move.id] = (this.moveLog[move.id] || 0) + 1;
    def.takeHit(dmg, angle);
    const color = eff === 0 ? '#a0a0a0' : eff > 1 ? '#f8f800' : eff < 1 ? '#c8c8c8' : '#f8f8f8';
    this.addEffect(new FloatText(String(dmg), def.x + (Math.random() - 0.5) * 10, def.y - 20, color, eff > 1 || crit));
    if (eff === 0) this.ui.log(`It doesn't affect ${this.who(def)}...`);
    else if (eff > 1) this.ui.log(`It's <span class="yellow">super effective</span>!`);
    else if (eff < 1) this.ui.log(`It's not very effective...`);
    if (crit) this.ui.log(`A critical hit!`);
    this.shake(Math.min(5, 1 + dmg / 40), 0.15);
    this.sfx(eff > 1 ? 'hitBig' : 'hit');
    return dmg;
  }

  onMoveUsed() {}

  onKO(f) {
    if (this.state !== 'fight') return;
    this.state = 'ko';
    this.slowmo = 0.3;
    this.banner('K.O.!', 1.5);
    this.ui.log(`${this.who(f)} fainted!`);
    this.sfx('ko');
    const winner = this.fighters.find((x) => x !== f);
    this.after(1.6, () => {
      this.slowmo = 1;
      this.state = 'result';
      winner.sprite.play('Pose', { loop: true, restart: true });
      this.ui.showResult(winner, this.fighters, this.stats);
    });
  }

  /** Big centred title drawn on the canvas with the PMD banner font. */
  banner(text, time = 0.55) {
    this.bannerState = { text, t: 0, time };
  }

  // ---------- screens ----------
  startFight(keys, cpu) {
    this.lastSetup = { keys, cpu };
    this.objects = [];
    this.timers = [];
    this.updaters = [];
    this.tints = [];
    this.stats = [0, 1].map(() => ({ damage: 0, casts: 0, hits: 0, dodges: 0, supers: 0 }));
    this.moveLog = {};
    const midY = (this.bounds.y0 + this.bounds.y1) / 2 + 6;
    this.fighters = keys.map((k, i) => new Fighter(this, i, DB.pokedex[k], this.arts[k], i === 0 ? 120 : W - 120, midY));
    this.bots = cpu.map((on, i) => (on ? new Bot(this, i) : null));
    this.fighters.forEach((f) => this.addEffect(new Effect(MOVEFX.common.spawn, f.x, f.y, { layer: 'under' })));
    this.ui.buildHUD(this.fighters);
    this.ui.hideResult();
    document.body.dataset.screen = 'fight';
    this.state = 'countdown';
    this.input.clearPresses();
    const steps = ['3', '2', '1', 'FIGHT!'];
    steps.forEach((s, i) => this.after(i * 0.6, () => {
      this.banner(s, i === 3 ? 0.8 : 0.55);
      this.sfx(i === 3 ? 'go' : 'tick');
    }));
    this.after(steps.length * 0.6 - 0.6, () => (this.state = 'fight'));
  }

  rematch() {
    if (this.lastSetup) this.startFight(this.lastSetup.keys, this.lastSetup.cpu);
  }

  toSelect() {
    this.state = 'select';
    this.fighters = [];
    this.objects = [];
    this.timers = [];
    document.getElementById('pause').classList.remove('show');
    this.ui.hideResult();
    this.ui.ready = [false, this.ui.cpu[1]];
    this.ui.renderSelect();
    document.body.dataset.screen = 'select';
  }

  togglePause() {
    if (this.state === 'paused') {
      this.state = this.pausedFrom;
      document.getElementById('pause').classList.remove('show');
    } else if (['fight', 'countdown'].includes(this.state)) {
      this.pausedFrom = this.state;
      this.state = 'paused';
      document.getElementById('pause').classList.add('show');
      this.ui.pauseMenu.set(0);
    }
  }

  onKey(code) {
    if (code === 'KeyM') Sfx.toggle();
    if (this.ui.menuKey(code)) return;
    if (this.state === 'select') return this.ui.selectKey(code);
    if (code === 'Escape' || code === 'KeyP') return this.togglePause();
  }

  // ---------- loop ----------
  update(dt) {
    this.time += dt;
    if (this.state === 'select') {
      this.ui.tickPreviews(dt);
      return;
    }
    if (this.state === 'paused' || this.state === 'loading') return;
    if (this.bannerState) {
      this.bannerState.t += dt;
      if (this.bannerState.t >= this.bannerState.time) this.bannerState = null;
    }
    dt *= this.slowmo;
    this.dodgeTextT = this.dodgeTextT.map((t) => Math.max(0, t - dt));

    for (const t of this.timers) t.t -= dt;
    const due = this.timers.filter((t) => t.t <= 0);
    this.timers = this.timers.filter((t) => t.t > 0);
    for (const t of due) t.fn();

    const [a, b] = this.fighters;
    this.fighters.forEach((f, i) => {
      const inp = this.bots[i] ? this.bots[i].think(dt) : this.input.read(i);
      if (this.bots[i]) this.input.read(i); // drain human presses
      f.update(dt, inp, i === 0 ? b : a);
    });
    // Push fighters apart so they can't stand inside each other.
    if (a && b && a.alive && b.alive) {
      const d = a.distTo(b);
      const min = (a.radius + b.radius) * 0.75;
      if (d < min && d > 0.01) {
        const push = (min - d) / 2;
        const ang = a.angleTo(b);
        a.x -= Math.cos(ang) * push;
        a.y -= Math.sin(ang) * push;
        b.x += Math.cos(ang) * push;
        b.y += Math.sin(ang) * push;
        a.clamp();
        b.clamp();
      }
    }

    this.updaters = this.updaters.filter((u) => !u.fn(dt));
    for (const o of this.objects) o.update(dt);
    this.objects = this.objects.filter((o) => !o.dead);
    this.shakeT -= dt;
    for (const t of this.tints) t.t += dt;
    this.tints = this.tints.filter((t) => t.t < t.time);
    this.ui.updateHUD(this.fighters);
  }

  render() {
    const ctx = this.ctx;
    ctx.setTransform(RES, 0, 0, RES, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.arena, 0, 0);
    if (this.shakeT > 0) {
      ctx.translate(Math.round((Math.random() - 0.5) * this.shakeAmt), Math.round((Math.random() - 0.5) * this.shakeAmt));
    }
    const layer = (name) => {
      for (const o of this.objects) if ((o.layer || 'over') === name) o.draw(ctx);
    };
    layer('ground');
    layer('under');
    [...this.fighters].sort((p, q) => p.y - q.y).forEach((f) => f.draw(ctx));
    layer('over');
    for (const t of this.tints) {
      ctx.save();
      ctx.globalAlpha = Math.sin((t.t / t.time) * Math.PI);
      ctx.fillStyle = t.color;
      ctx.fillRect(-10, -10, W + 20, H + 20);
      ctx.restore();
    }
    layer('text');
    if (this.bannerState && this.bannerFont) {
      const b = this.bannerState;
      const pop = Math.min(1, b.t / 0.08);
      const fade = Math.min(1, (b.time - b.t) / 0.15);
      this.bannerFont.draw(ctx, b.text, W / 2, H / 2 + 8, pop < 1 ? 3 : 2, fade);
    }
  }

  // ---------- arena art (procedural pixel tiles) ----------
  renderArena() {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // Sky / backdrop
    const sky = g.createLinearGradient(0, 0, 0, 70);
    sky.addColorStop(0, '#1e1b4b');
    sky.addColorStop(1, '#3b2f6b');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.6})`;
      g.fillRect(Math.floor(rnd() * W), Math.floor(rnd() * 40), 1, 1);
    }
    // Back wall (stone bricks)
    const wallY = 44;
    g.fillStyle = '#6b6378';
    g.fillRect(0, wallY, W, 26);
    for (let y = wallY; y < wallY + 26; y += 8) {
      const off = ((y - wallY) / 8) % 2 ? 8 : 0;
      for (let x = -off; x < W; x += 16) {
        g.fillStyle = ['#7a7287', '#736b80', '#827a90'][Math.floor(rnd() * 3)];
        g.fillRect(x + 1, y + 1, 14, 6);
      }
    }
    g.fillStyle = '#4a4356';
    g.fillRect(0, wallY + 24, W, 3);
    // Banners
    const banner = (x, col) => {
      g.fillStyle = col;
      g.fillRect(x, wallY - 2, 14, 22);
      g.beginPath();
      g.moveTo(x, wallY + 20);
      g.lineTo(x + 7, wallY + 26);
      g.lineTo(x + 14, wallY + 20);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(x + 5, wallY + 6, 4, 4);
    };
    banner(60, '#2563eb');
    banner(150, '#7c3aed');
    banner(W - 164, '#7c3aed');
    banner(W - 74, '#dc2626');
    // Floor
    const fy = wallY + 27;
    for (let y = fy; y < H; y += 16) {
      for (let x = 0; x < W; x += 16) {
        const even = ((x + y) / 16) % 2 === 0;
        g.fillStyle = even ? '#5b8f3a' : '#558836';
        g.fillRect(x, y, 16, 16);
        for (let k = 0; k < 6; k++) {
          g.fillStyle = rnd() < 0.5 ? '#6aa043' : '#4b7a2e';
          g.fillRect(x + Math.floor(rnd() * 15), y + Math.floor(rnd() * 15), 1, 2);
        }
      }
    }
    // Stone ring + center line
    const cx = W / 2;
    const cy = (fy + H) / 2 + 4;
    g.strokeStyle = 'rgba(235,230,210,0.55)';
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(cx, cy, 46, 28, 0, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(cx, fy + 6);
    g.lineTo(cx, H - 8);
    g.stroke();
    g.strokeRect(10, fy + 4, W - 20, H - fy - 10);
    // Start marks
    for (const x of [120, W - 120]) {
      g.fillStyle = 'rgba(235,230,210,0.3)';
      g.fillRect(x - 10, cy + 10, 20, 2);
    }
    // Edge shading
    const shade = g.createLinearGradient(0, fy, 0, fy + 14);
    shade.addColorStop(0, 'rgba(0,0,0,0.35)');
    shade.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = shade;
    g.fillRect(0, fy, W, 14);
    return c;
  }
}

async function boot() {
  const status = document.getElementById('loading-status');
  const canvas = document.getElementById('arena');
  const game = new Game(canvas);
  window.__arena = game; // handy for debugging / automated tests

  try {
    const [pokedex, moves, typechart, movefx, roster, manifest] = await Promise.all([
      loadJSON('data/pokedex.json'),
      loadJSON('data/moves.json'),
      loadJSON('data/typechart.json'),
      loadJSON('data/movefx.json'),
      loadJSON('data/roster.json'),
      loadJSON('assets/manifest.json'),
    ]);
    Object.assign(DB, { pokedex, moves, typechart });
    Object.assign(MOVEFX, movefx);

    const particles = new Set();
    const beams = new Set();
    (function walk(o) {
      if (!o || typeof o !== 'object') return;
      for (const [k, v] of Object.entries(o)) {
        if (k === 'fx' && typeof v === 'string') particles.add(v);
        else if (k === 'set' && typeof v === 'string') beams.add(v);
        else walk(v);
      }
    })(movefx);

    const keys = roster.map((r) => r.key);
    let done = 0;
    const total = particles.size + beams.size + keys.length;
    const tick = (label) => {
      done++;
      status.textContent = `Now loading... ${Math.round((done / total) * 100)}%`;
    };
    game.arts = {};
    const [bannerImg, bannerMeta] = await Promise.all([loadImage('assets/ui/banner.png'), loadJSON('assets/ui/banner.json'), document.fonts.load('12px PMD')]);
    game.bannerFont = new BannerFont(bannerImg, bannerMeta);
    await Promise.all([
      ...keys.map(async (k) => {
        game.arts[k] = await loadFighterArt(pokedex[k], manifest);
        tick(pokedex[k].name);
      }),
      ...[...particles].map(async (p) => {
        FX.particles[p] = await loadParticle(p);
        tick(p);
      }),
      ...[...beams].map(async (b) => {
        FX.beams[b] = await loadBeam(b);
        tick(b);
      }),
    ]);

    game.input = new Input(document.getElementById('app'));
    if (game.input.touchMode) document.body.classList.add('touch');
    game.input.onKey((code) => game.onKey(code));
    game.ui = new UI(game, keys, game.arts);
    document.getElementById('loading').classList.add('done');
    game.state = 'select';
    document.body.dataset.screen = 'select';
    const params = new URLSearchParams(location.search);
    if (params.has('cpu')) {
      game.ui.cpu = [params.get('cpu') === 'both', true];
    }
    if (params.has('p1') || params.has('autostart')) {
      const p1 = params.get('p1') || 'rayquaza';
      const p2 = params.get('p2') || 'garchomp';
      game.startFight([p1, p2], game.ui.cpu.slice());
    }
  } catch (e) {
    console.error(e);
    status.textContent = `Failed to load: ${e.message}`;
    return;
  }


  let last = performance.now();
  let acc = 0;
  const frame = (now) => {
    acc += Math.min(0.1, (now - last) / 1000);
    last = now;
    while (acc >= STEP) {
      game.update(STEP);
      acc -= STEP;
    }
    if (game.state !== 'loading') game.render();
    requestAnimationFrame(frame);
  };
  game.render();
  requestAnimationFrame(frame);
}

boot();
