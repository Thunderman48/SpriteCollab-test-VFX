// More shapes for ranged and area skills, so similar skills feel different.
// movefx.json picks a style: { "behavior": "projectile", "style": "boomerang", ... }
//
// Projectile styles: boomerang (Bonemerang: out and back) · volley (Icicle Spear / Pin Missile: 2-5 shots)
//   converge (Tri Attack: 3 orbs curve in) · lob (Salt Cure / Armor Cannon: arcs over, splashes where it lands)
//   ricochet (Electro Ball: bounces off the walls) · orbitals (Astral Barrage: circles the user, then flies out)
//   Any projectile can also `wobble` (Sleep Powder, Clear Smog drift side to side).
// Beam styles: sweep (Dynamax Cannon swings across) · pulse (Steam Eruption fires in bursts)
// Burst styles: shockwave (Seed Flare / Diamond Storm: a ring travels outwards) · cone (Glaciate: ice rows in front)
// Area extras: pillar (Photon Geyser: a column rises from the ground) · zone (Thunder Cage / Fire Spin: stays and
//   traps) · pull (Hyperspace Hole: drags foes into the portal)
// Hazards (behaviour "hazard"): Spikes, Toxic Spikes, Stealth Rock stay on the field until stepped on.
import { MOVEFX, spawnFx, frontOf, aimOf, distToSegment, Projectile } from './moves.js';
import { Beam, Telegraph, Effect, FloatText } from './vfx.js';
import { effectiveness } from './combat.js';
import * as FXE from './effects.js';
import { t } from './i18n.js';
import { angleToDir } from './sprite.js';

const norm = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const log = (game, key, vars) => game.ui?.log(t(key, vars));

// ---------------------------------------------------------------- projectiles
export const PROJ = {
  /** Bonemerang: flies out, turns around and comes back to the thrower, hitting on both ways. */
  boomerang(game, c, t, cast, a, p) {
    const pd = cast.def.projectile;
    const proj = new Projectile(game, c, t, cast, a, p.x, p.y);
    proj.multi = true;
    let back = false;
    let travelled = 0;
    const reach = Math.max(120, Math.min(pd.range || 260, (t.alive ? c.distTo(t) : 160) + 50));
    proj.mover = (o, dt) => {
      if (!back) {
        travelled += o.speed * dt;
        if (travelled >= reach || o.t > (pd.outTime || 0.8)) {
          back = true;
          o.hitSet = new Set(); // can hit again on the way back
        }
      } else {
        if (!c.alive) return void (o.dead = true);
        o.angle = Math.atan2(c.y - 4 - o.y, c.x - o.x);
        if (Math.hypot(c.x - o.x, c.y - 4 - o.y) < c.radius) {
          o.dead = true; // caught
          spawnFx(game, MOVEFX.common.dodge, c.x, c.y, { scale: 0.6 });
        }
      }
      o.x += Math.cos(o.angle) * o.speed * dt;
      o.y += Math.sin(o.angle) * o.speed * dt;
    };
    proj.noWall = true;
    game.addObject(proj);
  },

  /** Icicle Spear / Pin Missile: 2-5 shots in a row (Skill Link: always 5). */
  volley(game, c, t, cast, a) {
    const pd = cast.def.projectile;
    const n = FXE.ab(c, 'skilllink') ? 5 : [2, 2, 2, 3, 3, 3, 4, 5][Math.floor(Math.random() * 8)];
    const hits = { n: 0 };
    for (let k = 0; k < n; k++) {
      game.after(k * (pd.gap || 0.1), () => {
        if (c.ko) return;
        const aim = t.alive ? c.angleTo(t) : a;
        const q = frontOf(c, aim);
        const proj = new Projectile(game, c, t, cast, aim + (Math.random() - 0.5) * (pd.spread || 0.12), q.x, q.y);
        proj.onLand = () => hits.n++;
        game.addObject(proj);
        game.sfx?.('shoot');
      }, null);
    }
    game.after((n - 1) * (pd.gap || 0.1) + 0.6, () => {
      if (hits.n > 1) log(game, 'hitTimes', { n: hits.n });
    }, null);
  },

  /** Tri Attack: fire, ice and electric orbs spread out, then curve in on the target. */
  converge(game, c, t, cast, a, p) {
    const pd = cast.def.projectile;
    (pd.orbs || []).forEach((orb, i, all) => {
      const off = (i - (all.length - 1) / 2) * (pd.spread || 0.9);
      const proj = new Projectile(game, c, t, cast, a + off, p.x, p.y, { ...pd, ...orb });
      proj.factor = 1 / all.length;
      proj.status = orb.status;
      game.addObject(proj);
    });
  },

  /** Salt Cure / Armor Cannon: lobbed in an arc onto where the target stands; splashes on landing. */
  lob(game, c, t, cast, a, p) {
    game.addObject(new LobShot(game, c, t, cast, p));
  },

  /** Electro Ball: bounces off the walls a few times before it fizzles. */
  ricochet(game, c, t, cast, a, p) {
    game.addObject(new Projectile(game, c, t, cast, a, p.x, p.y));
  },

  /** Astral Barrage: ghosts circle the user, then fly out at every foe. */
  orbitals(game, c, t, cast, a) {
    const pd = cast.def.projectile;
    const n = pd.count || 6;
    const wait = pd.orbitTime || 0.55;
    for (let i = 0; i < n; i++) {
      const proj = new Projectile(game, c, t, cast, a, c.x, c.y);
      proj.idle = true;
      proj.factor = 2 / n;
      let tt = 0;
      const a0 = (i / n) * Math.PI * 2;
      const launchAt = wait + i * (pd.launchGap || 0.07);
      proj.mover = (o, dt) => {
        tt += dt;
        if (tt < launchAt) {
          if (!c.alive) return void (o.dead = true);
          const ang = a0 + tt * 7;
          o.x = c.x + Math.cos(ang) * (c.radius + 14);
          o.y = c.y - 6 + Math.sin(ang) * (c.radius + 14) * 0.6;
          o.angle = ang + Math.PI / 2;
          return;
        }
        if (o.idle) {
          o.idle = false;
          o.t = 0;
          const foes = game.enemiesOf(c);
          o.target = foes.length ? foes[i % foes.length] : t;
          o.angle = Math.atan2(o.target.y - o.y, o.target.x - o.x);
          game.sfx?.('shoot');
        }
        if (o.target.alive) {
          const want = Math.atan2(o.target.y - o.y, o.target.x - o.x);
          o.angle += Math.max(-pd.homing * dt, Math.min(pd.homing * dt, norm(want - o.angle)));
        }
        o.x += Math.cos(o.angle) * o.speed * dt;
        o.y += Math.sin(o.angle) * o.speed * dt;
      };
      game.addObject(proj);
    }
  },
};

/** A shot thrown in a high arc: drawn with a shadow, lands on a marked spot. */
class LobShot {
  constructor(game, owner, target, cast, p) {
    const pd = cast.def.projectile;
    const lead = pd.lead ?? 0.25;
    const b = game.bounds;
    const gx = Math.max(b.x0, Math.min(b.x1, target.x));
    const gy = Math.max(b.y0, Math.min(b.y1, target.y));
    const dist = Math.hypot(gx - p.x, gy - p.y);
    Object.assign(this, { game, owner, cast, pd, def: cast.def, x0: p.x, y0: p.y + 8, gx, gy, t: 0, layer: 'over', dead: false });
    this.time = Math.max(0.45, Math.min(1.0, dist / (pd.speed || 300) + lead));
    this.effect = new Effect(pd, p.x, p.y, { loop: true });
    this.mark = game.addEffect(new Telegraph(gx, gy + 4, pd.blast || 34, this.time));
    this.trailT = 0;
  }

  update(dt) {
    this.t += dt;
    const k = Math.min(1, this.t / this.time);
    this.x = this.x0 + (this.gx - this.x0) * k;
    this.y = this.y0 + (this.gy - this.y0) * k;
    this.lift = Math.sin(k * Math.PI) * (this.pd.height || 90);
    this.effect.x = this.x;
    this.effect.y = this.y - this.lift;
    this.effect.update(dt);
    if (this.pd.trail && (this.trailT -= dt) <= 0) {
      this.trailT = this.pd.trail.every || 0.05;
      spawnFx(this.game, this.pd.trail, this.x, this.y - this.lift, { layer: 'over' });
    }
    if (k >= 1) this.land();
  }

  land() {
    this.dead = true;
    const g = this.game;
    const d = this.def;
    spawnFx(g, d.hit, this.gx, this.gy - 6);
    spawnFx(g, d.hit2, this.gx, this.gy, { layer: 'under' });
    g.shake(d.shake || 4, 0.25);
    g.sfx?.('boom');
    const r = (this.pd.blast || 34) * (this.owner.mods?.hitbox ?? 1);
    for (const e of g.enemiesOf(this.owner)) {
      if (Math.hypot(e.x - this.gx, (e.y - this.gy) / 0.7) > r + e.radius) continue;
      if (g.dodges(this.owner, e)) g.dodgedText(e);
      else g.applyHit(this.owner, e, this.cast, { angle: Math.atan2(e.y - this.gy, e.x - this.gx), noFx: true });
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    const s = 8 * (1 - this.lift / 200);
    ctx.ellipse(Math.round(this.x), Math.round(this.y + 6), s, s * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    this.effect.draw(ctx);
  }
}

// ---------------------------------------------------------------- beams
/** Fire one beam; `turn(beam, dt)` can move it. Returns the Beam. */
function fireBeam(game, c, cast, a, bd, { factor = 1, turn = null, hitShare = null } = {}) {
  const d = cast.def;
  const p = frontOf(c, a, 6);
  const beam = new Beam(bd, p.x, p.y, a);
  game.addEffect(beam);
  game.shake(d.shake || 0, bd.time);
  game.sfx?.('beam');
  const hit = hitShare || new Set();
  const mine = new Set();
  game.addUpdater((dt) => {
    if (beam.dead) return true;
    if (turn) turn(beam, dt);
    if (beam.t < beam.time * 0.8) {
      const w = Math.max(6, beam.halfWidth);
      for (const e of game.enemiesOf(c)) {
        if (mine.has(e) || hit.has(e) || distToSegment(e.x, e.y, beam.x, beam.y, beam.angle, beam.length) >= w + e.radius) continue;
        mine.add(e);
        if (game.dodges(c, e)) game.dodgedText(e);
        else {
          if (!hitShare) hit.add(e);
          game.applyHit(c, e, cast, { angle: beam.angle, factor });
        }
      }
    }
    return false;
  });
  return beam;
}

export const BEAMS = {
  /** Dynamax Cannon: a huge beam that swings across the arena. */
  sweep(game, c, t, cast, a) {
    const d = cast.def;
    const arc = d.sweep || 1.1;
    const side = Math.random() < 0.5 ? 1 : -1;
    const from = a - (arc / 2) * side;
    fireBeam(game, c, cast, from, d.beam, {
      turn: (beam) => {
        const k = Math.min(1, beam.t / (beam.time * 0.85));
        beam.angle = from + arc * side * k;
        const p = frontOf(c, beam.angle, 6);
        beam.x = p.x;
        beam.y = p.y;
        c.dir = angleToDir(beam.angle); // keeps facing the beam
      },
    });
    cast.lockDir = true;
    game.after(d.beam.time, cast.finish, null);
  },

  /** Steam Eruption: short blasts one after another (each one can hit). */
  pulse(game, c, t, cast, a) {
    const d = cast.def;
    const n = d.pulses || 3;
    const gap = d.pulseGap || 0.2;
    const shared = new Set();
    for (let k = 0; k < n; k++) {
      game.after(k * gap, () => {
        if (c.ko) return;
        shared.clear(); // every burst hits again
        const aim = t.alive ? c.angleTo(t) : a;
        cast.faceAngle = aim;
        fireBeam(game, c, cast, aim, { ...d.beam, time: d.beam.time / n + 0.08 }, { factor: 1 / n, hitShare: shared });
      }, null);
    }
    game.after((n - 1) * gap + d.beam.time / n + 0.1, cast.finish, null);
  },
};

// ---------------------------------------------------------------- bursts
export const BURSTS = {
  /** Seed Flare / Diamond Storm: a ring travels outwards; it hits when it reaches you (dodge through it!). */
  shockwave(game, c, t, cast) {
    const d = cast.def;
    const hit = new Set();
    const time = d.waveTime || 0.5;
    let tt = 0;
    let fxT = 0;
    const cx = c.x;
    const cy = c.y;
    game.after(d.delay, () => {
      if (c.ko) return;
      if (d.tint) game.tint(d.tint, time + 0.2);
      spawnFx(game, d.over, cx, cy - 6, { layer: 'over' });
      game.shake(d.shake || 3, time);
      game.sfx?.('boom');
      game.addUpdater((dt) => {
        tt += dt;
        const r = 12 + (d.radius - 12) * Math.min(1, tt / time);
        if ((fxT -= dt) <= 0 && d.ring) {
          fxT = d.ring.every || 0.06;
          const n = d.ring.n || 10;
          for (let k = 0; k < n; k++) {
            const ang = (k / n) * Math.PI * 2 + tt * 2;
            spawnFx(game, d.ring, cx + Math.cos(ang) * r, cy + Math.sin(ang) * r * 0.6, { layer: k % 2 ? 'over' : 'under' });
          }
        }
        for (const e of game.enemiesOf(c)) {
          if (hit.has(e)) continue;
          const dist = Math.hypot(e.x - cx, (e.y - cy) / 0.6);
          if (Math.abs(dist - r) > 14 + e.radius * 0.5) continue;
          hit.add(e);
          if (game.dodges(c, e)) game.dodgedText(e);
          else game.applyHit(c, e, cast, { angle: Math.atan2(e.y - cy, e.x - cx) });
        }
        return tt >= time;
      });
    }, null);
  },

  /** Glaciate: rows of ice erupt one after another in a wide cone in front. */
  cone(game, c, t, cast) {
    const d = cast.def;
    const a = aimOf(c, t, cast);
    cast.faceAngle = a;
    cast.track = false;
    const rows = d.rows || 5;
    const spread = d.spread || 0.6;
    const hit = new Set();
    for (let k = 0; k < rows; k++) {
      game.after(d.delay + k * (d.rowGap || 0.08), () => {
        if (c.ko) return;
        const dist = 30 + (k + 0.5) * ((d.radius - 30) / rows);
        const n = 2 + k;
        for (let i = 0; i < n; i++) {
          const ang = a + (n === 1 ? 0 : (i / (n - 1) - 0.5) * 2 * spread);
          spawnFx(game, d.spike, c.x + Math.cos(ang) * dist + (Math.random() - 0.5) * 8, c.y + Math.sin(ang) * dist * 0.7);
        }
        game.shake(2, 0.1);
        for (const e of game.enemiesOf(c)) {
          if (hit.has(e)) continue;
          const de = c.distTo(e);
          const band = (d.radius - 30) / rows;
          if (de < dist - band - e.radius || de > dist + band * 0.5 + e.radius || Math.abs(norm(c.angleTo(e) - a)) > spread + 0.15) continue;
          hit.add(e);
          if (game.dodges(c, e)) game.dodgedText(e);
          else game.applyHit(c, e, cast, { angle: c.angleTo(e) });
        }
      }, null);
    }
  },
};

// ---------------------------------------------------------------- area extras
/** Thunder Cage / Fire Spin: the spot keeps hurting and slowing foes inside for a while. */
export function zone(game, c, cast, p, radius) {
  const z = cast.def.zone;
  let life = 0;
  let tick = z.every || 0.5;
  let fxT = 0;
  const at = { x: p.x, y: p.y };
  if (z.loopFx) game.addEffect(new Effect(z.loopFx, at.x, at.y - 4, { loop: true, life: z.time, layer: 'under', fadeOut: 0.3 }));
  if (z.loopOver) game.addEffect(new Effect(z.loopOver, at.x, at.y - 4, { loop: true, life: z.time, layer: 'over', fadeOut: 0.3, alpha: z.loopOver.alpha }));
  game.addUpdater((dt) => {
    life += dt;
    tick -= dt;
    fxT -= dt;
    if (fxT <= 0 && z.edge) {
      fxT = z.edgeEvery || 0.12;
      const ang = Math.random() * Math.PI * 2;
      spawnFx(game, z.edge, at.x + Math.cos(ang) * radius, at.y + Math.sin(ang) * radius * 0.6, { layer: Math.random() < 0.5 ? 'under' : 'over' });
    }
    for (const e of game.enemiesOf(c)) {
      if (Math.hypot(e.x - at.x, (e.y - at.y) / 0.7) > radius + e.radius) continue;
      e.chillT = Math.max(e.chillT, 0.3); // trapped: slowed while inside
      if (tick <= 0 && e.invuln <= 0 && !e.hidden) game.applyHit(c, e, cast, { angle: Math.atan2(e.y - at.y, e.x - at.x), factor: z.factor || 0.15, noFx: true, kbMul: 0.1 });
    }
    if (tick <= 0) tick = z.every || 0.5;
    return life >= z.time || c.ko;
  });
}

/** Hyperspace Hole: foes near the portal are dragged in while it opens. */
export function pull(game, c, p, radius, time, strength) {
  let tt = 0;
  game.addUpdater((dt) => {
    tt += dt;
    for (const e of game.enemiesOf(c)) {
      const dist = Math.hypot(e.x - p.x, e.y - p.y);
      if (dist > radius * 2.4 || dist < 4 || e.invuln > 0) continue;
      const ang = Math.atan2(p.y - e.y, p.x - e.x);
      e.x += Math.cos(ang) * strength * dt;
      e.y += Math.sin(ang) * strength * dt;
      e.clamp();
    }
    return tt >= time;
  });
}

// ---------------------------------------------------------------- hazards
/** One spike / rock lying on the field. Foes that step on it set it off. */
class Hazard {
  constructor(game, owner, kind, x, y, def) {
    Object.assign(this, { game, owner, kind, x, y, def, life: 0, layer: 'under', dead: false, hazard: true });
    this.effect = new Effect(def.piece, x, y, { loop: true });
    this.reach = def.reach || 10;
  }

  update(dt) {
    this.life += dt;
    this.effect.x = this.x;
    this.effect.y = this.y + (this.def.float ? Math.sin(this.life * 3 + this.x) * 2 - 8 : 0);
    this.effect.update(dt);
    if (this.life > (this.def.lasts || 30) || !this.game.fighters.length) return void (this.dead = true);
    for (const e of this.game.enemiesOf(this.owner)) {
      if (Math.hypot(e.x - this.x, (e.y - this.y) / 0.7) > this.reach + e.radius * 0.6) continue;
      if (e.invuln > 0 || e.hidden || e.lift > 6) continue;
      if (this.def.grounded && !FXE.isGrounded(e)) continue;
      this.trigger(e);
      return;
    }
  }

  trigger(e) {
    const g = this.game;
    this.dead = true;
    spawnFx(g, this.def.burst, this.x, this.y - 4);
    const k = this.kind;
    if (k === 'toxicspikes') {
      // Poison types soak the spikes up.
      if (e.types.includes('Poison')) return log(g, 'absorbedSpikes', { who: g.who(e) });
      FXE.inflict(g, e, 'psn', this.owner);
      return;
    }
    if (FXE.ab(e, 'magicguard')) return;
    const eff = k === 'stealthrock' ? effectiveness('Rock', e.types) : 1;
    const dmg = Math.max(1, Math.round(e.maxHp * (this.def.dmg || 0.05) * eff));
    e.hp = Math.max(0, e.hp - dmg);
    e.flash = 0.6;
    g.addEffect(new FloatText(String(dmg), e.x + 6, e.y - 18, eff > 1 ? '#f8f800' : '#f89858', eff > 1));
    log(g, k === 'stealthrock' ? 'rockHurt' : 'spikesHurt', { who: g.who(e) });
    g.sfx?.('hit');
    if (e.hp <= 0) e.faint();
  }

  draw(ctx) {
    this.effect.draw(ctx);
  }
}

/** Spikes / Toxic Spikes / Stealth Rock: scatter pieces around the foe's side of the field. */
export function hazardMove(game, c, t, cast) {
  const d = cast.def;
  cast.release();
  cast.track = false;
  c.sprite.play(d.anim, { loop: false, restart: true });
  game.sfx?.('shoot');
  const kind = cast.id;
  const n = d.count || 3;
  const b = game.bounds;
  const base = t.alive ? { x: t.x, y: t.y } : { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + Math.random() * 0.8;
    const r = (d.scatter || 50) * (0.5 + Math.random() * 0.6);
    const to = {
      x: Math.max(b.x0 + 10, Math.min(b.x1 - 10, base.x + Math.cos(ang) * r)),
      y: Math.max(b.y0 + 10, Math.min(b.y1 - 10, base.y + Math.sin(ang) * r * 0.7)),
    };
    const from = frontOf(c, c.angleTo(to));
    const time = 0.4 + i * 0.06;
    const piece = new Effect(d.piece, from.x, from.y, { loop: true });
    let tt = 0;
    const flying = {
      layer: 'over',
      dead: false,
      update(dt) {
        tt += dt;
        const k = Math.min(1, tt / time);
        piece.x = from.x + (to.x - from.x) * k;
        piece.y = from.y + (to.y - from.y) * k - Math.sin(k * Math.PI) * 50;
        piece.update(dt);
        if (k >= 1) {
          this.dead = true;
          spawnFx(game, d.land, to.x, to.y, { layer: 'under' });
          placeHazard(game, c, kind, to.x, to.y, d);
        }
      },
      draw(ctx) {
        piece.draw(ctx);
      },
    };
    game.addObject(flying);
  }
  log(game, 'hazardSet_' + kind, { who: game.who(c) });
  game.after(Math.max(0.5, c.sprite.duration(d.anim)), cast.finish, null);
}

/** Put one hazard piece down (Stone Axe leaves rocks this way too). Old pieces go when there are too many. */
export function placeHazard(game, c, kind, x, y, d = MOVEFX.moves[kind]) {
  const b = game.bounds;
  x = Math.max(b.x0 + 8, Math.min(b.x1 - 8, x));
  y = Math.max(b.y0 + 8, Math.min(b.y1 - 8, y));
  const mine = game.objects.filter((o) => o.hazard && !o.dead && o.kind === kind && o.owner.team === c.team);
  const max = d.max || 6;
  for (let i = 0; i <= mine.length - max; i++) mine[i].dead = true;
  game.addObject(new Hazard(game, c, kind, x, y, d));
}

export const hazardCount = (game, c, kind) => game.objects.filter((o) => o.hazard && !o.dead && o.kind === kind && o.owner.team === c.team).length;

/** Rapid Spin: blows away the hazards the foes left on the field. */
export function clearHazards(game, c) {
  let any = false;
  for (const o of game.objects) {
    if (!o.hazard || o.dead || o.owner.team === c.team) continue;
    o.dead = true;
    any = true;
    spawnFx(game, MOVEFX.common.dodge, o.x, o.y, { scale: 0.7 });
  }
  if (any) log(game, 'hazardsGone', { who: game.who(c) });
}
