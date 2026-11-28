// Move behaviours. Each move in data/movefx.json picks one behaviour and the
// sprite anim / RawAsset VFX it uses. Damage numbers come from data/moves.json.
import { DB } from './combat.js';
import { Effect, Beam, Telegraph } from './vfx.js';
import { selfMove, burnGround, weatherNow, hasPriority } from './effects.js';
import { DASH, MELEE } from './motion.js';
import { PROJ, BEAMS, BURSTS, zone, pull, hazardMove } from './patterns.js';
import { inflict } from './effects.js';

export const MOVEFX = { common: {}, moves: {} };
/** Pause after every attack before the next one can start. */
export const CAST_GAP = 0.5;

const MOUTH_Y = -4;

export function frontOf(c, angle, extra = 4) {
  return { x: c.x + Math.cos(angle) * (c.radius + extra), y: c.y + MOUTH_Y + Math.sin(angle) * (c.radius * 0.6 + extra) };
}

export function spawnFx(game, def, x, y, opts = {}) {
  if (!def) return null;
  const e = new Effect(def, x, y, opts);
  game.addEffect(e);
  return e;
}

export function startCast(game, c, t, id) {
  const def = MOVEFX.moves[id];
  const move = DB.moves[id];
  const cast = {
    id,
    def,
    move,
    released: false,
    cancelable: false,
    done: false,
    track: true,
    drive: null,
    faceAngle: c.angleTo(t),
    // Priority moves (Quick Attack, Bullet Punch...) wind up faster and skip most of the gap.
    speed: hasPriority(c, move) ? 1.6 : 1,
  };
  cast.release = () => {
    if (cast.released) return;
    cast.released = true;
    c.cd[id] = move.cooldown * (c.mods?.cooldownMul ?? 1) * (def.extra?.cdMul ?? 1);
    game.onMoveUsed?.(c, id);
  };
  cast.finish = () => {
    if (cast.done) return;
    cast.done = true;
    if (c.cast === cast) {
      c.cast = null;
      c.castGap = cast.speed > 1 ? 0.15 : CAST_GAP;
    }
  };
  c.cast = cast;
  game.announce(c, move);
  BEHAVIORS[def.behavior](game, c, t, cast);
  game.after(5, cast.finish, cast); // safety net
  return cast;
}

/** Every move auto-targets the opponent (falls back to the last direction if it fainted). */
export function aimOf(c, t, cast) {
  return t.alive ? c.angleTo(t) : cast.faceAngle;
}

export function cancelCast(game, c) {
  const cast = c.cast;
  if (!cast) return;
  game.cancelOwner(cast);
  c.hidden = false;
  c.sneaking = false;
  c.lift = 0;
  cast.done = true;
  c.cast = null;
  c.castGap = 0.1;
}

/** Optional charge phase (charge anim + charge VFX at the caster's front), then `then()`. */
export function withCharge(game, c, t, cast, then) {
  const d = cast.def;
  let time = (d.charge?.time || 0) / cast.speed;
  if (d.extra?.noChargeSun && weatherNow(game) === 'sunnyday') time = 0.12;
  if (!time) return then();
  c.sprite.play(d.chargeAnim || 'Charge', { loop: true, restart: true });
  const a = cast.faceAngle;
  const p = frontOf(c, a, 8);
  spawnFx(game, d.charge, p.x, p.y, {
    follow: c,
    ox: p.x - c.x,
    oy: p.y - c.y,
    loop: true,
    life: time,
  }).owner = cast;
  game.after(time, then, cast);
}

/**
 * A flying shot. Styles in js/patterns.js can take over its motion (`mover`), keep it from hitting
 * for a while (`idle`), let it hit several foes / the same foe again (`multi` + `hitSet`).
 */
export class Projectile {
  constructor(game, owner, target, cast, angle, x, y, pd = cast.def.projectile) {
    Object.assign(this, { game, owner, target, cast, angle, x, y, pd, t: 0, trailT: 0, dead: false, layer: 'over' });
    this.bx = x;
    this.by = y;
    this.bounces = 0;
    this.def = cast.def;
    this.move = cast.move;
    this.speed = pd.speed;
    this.dodged = false;
    this.effect = new Effect(pd, x, y, { loop: true, angle });
  }

  update(dt) {
    const pd = this.pd;
    this.t += dt;
    if (this.mover) this.mover(this, dt);
    else {
      if (pd.homing && this.target.alive) {
        const want = Math.atan2(this.target.y - this.y, this.target.x - this.x);
        let diff = want - this.angle;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.angle += Math.max(-pd.homing * dt, Math.min(pd.homing * dt, diff));
      }
      this.bx += Math.cos(this.angle) * this.speed * dt;
      this.by += Math.sin(this.angle) * this.speed * dt;
      // Wobble: drifts side to side along its path (Sleep Powder, Clear Smog).
      const w = pd.wobble ? Math.sin(this.t * (pd.wobbleFreq || 7)) * pd.wobble : 0;
      this.x = this.bx - Math.sin(this.angle) * w;
      this.y = this.by + Math.cos(this.angle) * w;
    }
    this.effect.x = this.x;
    this.effect.y = this.y;
    this.effect.angle = this.angle;
    this.effect.update(dt);

    if (pd.trail) {
      this.trailT -= dt;
      if (this.trailT <= 0) {
        this.trailT = pd.trail.every || 0.05;
        const j = pd.trail.jitter || 0;
        spawnFx(this.game, pd.trail, this.x + (Math.random() - 0.5) * j, this.y + (Math.random() - 0.5) * j, {
          layer: 'under',
          angle: this.angle,
        });
      }
    }

    // Hits the first enemy it touches (not only the one it was aimed at).
    // Piercing shots (Flamethrower, Psycho Cut) keep going and hit each enemy once.
    const pierce = this.def.extra?.pierce || this.multi;
    for (const tg of this.idle ? [] : this.game.enemiesOf(this.owner)) {
      if (pierce && (this.pierced?.has(tg) || this.hitSet?.has(tg))) continue;
      if (Math.hypot(tg.x - this.x, tg.y - this.y) >= pd.radius * (this.owner.mods?.hitbox ?? 1) + tg.radius) continue;
      if (this.game.dodges(this.owner, tg)) {
        if (!this.dodged) {
          this.dodged = true;
          this.game.dodgedText(tg);
        }
      } else if (pierce) {
        (this.pierced ||= new Set()).add(tg);
        if (this.multi) (this.hitSet ||= new Set()).add(tg);
        this.game.applyHit(this.owner, tg, this.cast, { angle: this.angle, at: { x: this.x, y: this.y }, factor: this.factor ?? 1 });
      } else {
        this.explode(tg);
        return;
      }
    }
    const b = this.game.bounds;
    // Electro Ball: bounces off the walls.
    if (pd.bounces && this.bounces < pd.bounces && !this.mover) {
      let bounced = false;
      if (this.x < b.x0 || this.x > b.x1) {
        this.angle = Math.PI - this.angle;
        bounced = true;
      }
      if (this.y < b.y0 - 10 || this.y > b.y1) {
        this.angle = -this.angle;
        bounced = true;
      }
      if (bounced) {
        this.bounces++;
        this.bx = this.x = Math.max(b.x0, Math.min(b.x1, this.x));
        this.by = this.y = Math.max(b.y0 - 10, Math.min(b.y1, this.y));
        this.t = Math.min(this.t, (pd.life || 2) * 0.5);
        spawnFx(this.game, this.def.hit2 || MOVEFX.common.dodge, this.x, this.y, { scale: 0.7 });
        this.game.sfx?.('tick');
      }
    }
    const out = !this.noWall && (this.x < b.x0 - 20 || this.x > b.x1 + 20 || this.y < b.y0 - 40 || this.y > b.y1 + 20);
    if (out || this.t > (pd.life || 2) * (this.mover ? 3 : 1)) {
      if (this.pierced?.size) this.dead = true;
      else this.explode(false);
    }
  }

  /** victim = the enemy hit directly, or false when it ran out / hit a wall. */
  explode(victim) {
    this.dead = true;
    const g = this.game;
    if (victim) {
      const dmg = g.applyHit(this.owner, victim, this.cast, { angle: this.angle, at: { x: this.x, y: this.y }, factor: this.factor ?? 1 });
      this.onLand?.(dmg);
      // Tri Attack: each orb can burn / freeze / paralyse.
      if (this.status && dmg > 0 && Math.random() < 0.067 * (this.owner.ability === 'serenegrace' ? 2 : 1)) inflict(g, victim, this.status, this.owner);
      // Seed Bomb: the blast also catches foes standing nearby.
      if (this.pd.blast) {
        for (const tg of g.enemiesOf(this.owner)) {
          if (tg === victim || g.dodges(this.owner, tg) || Math.hypot(tg.x - this.x, tg.y - this.y) > this.pd.blast + tg.radius) continue;
          g.applyHit(this.owner, tg, this.cast, { angle: Math.atan2(tg.y - this.y, tg.x - this.x), factor: 0.5 });
        }
      }
    } else if (this.pd.splash) {
      spawnFx(g, this.def.hit, this.x, this.y);
      spawnFx(g, this.def.hit2, this.x, this.y, { layer: 'under' });
      for (const tg of g.enemiesOf(this.owner)) {
        if (!g.dodges(this.owner, tg) && Math.hypot(tg.x - this.x, tg.y - this.y) < this.pd.splash + tg.radius) {
          g.applyHit(this.owner, tg, this.cast, { angle: this.angle, factor: 0.6, noFx: true });
        }
      }
    } else {
      spawnFx(g, MOVEFX.common.dodge, this.x, this.y, { scale: 0.6 });
    }
  }

  draw(ctx) {
    this.effect.draw(ctx);
  }
}

export function distToSegment(px, py, x0, y0, angle, len) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const t = Math.max(0, Math.min(len, (px - x0) * dx + (py - y0) * dy));
  return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t));
}

/** How long a melee skill keeps the user busy after its anim ends (holds, flurries, throws). */
function meleeTail(d) {
  if (d.style === 'clamp') return d.hold || 0.45;
  if (d.style === 'rage') return 6 * (d.hitGap || 0.09);
  if (d.style === 'throw') return 0.55;
  if (d.style === 'triple') return 3 * (d.hitGap || 0.16);
  return (d.hits || 1) * (d.hitGap || 0);
}

const BEHAVIORS = {
  projectile(game, c, t, cast) {
    const d = cast.def;
    withCharge(game, c, t, cast, () => {
      const fire = () => {
        cast.release();
        const a = aimOf(c, t, cast);
        cast.faceAngle = a;
        cast.track = false;
        const p = frontOf(c, a);
        spawnFx(game, d.muzzle, p.x, p.y, { angle: a });
        const pd = d.projectile;
        if (d.style && PROJ[d.style]) PROJ[d.style](game, c, t, cast, a, p);
        else if (pd.stream) {
          // A rapid stream of small shots (Flamethrower); each carries a share of the damage.
          for (let k = 0; k < pd.stream; k++) {
            game.after(k * (pd.streamGap || 0.07), () => {
              if (c.ko) return;
              const q = frontOf(c, a);
              const proj = new Projectile(game, c, t, cast, a + (Math.random() - 0.5) * (pd.spread || 0), q.x, q.y);
              proj.factor = 1.6 / pd.stream;
              game.addObject(proj);
            }, null);
          }
        } else {
          const n = pd.count || 1;
          for (let i = 0; i < n; i++) {
            const ang = a + (i - (n - 1) / 2) * (pd.spread || 0);
            game.addObject(new Projectile(game, c, t, cast, ang, p.x, p.y));
          }
        }
        game.sfx?.('shoot');
      };
      c.sprite.play(d.anim, { loop: false, restart: true, speed: cast.speed, onHit: fire, onEnd: cast.finish });
    });
  },

  beam(game, c, t, cast) {
    const d = cast.def;
    withCharge(game, c, t, cast, () => {
      let fired = false;
      const fire = () => {
        if (fired) return;
        fired = true;
        cast.release();
        cast.track = false;
        const a = aimOf(c, t, cast);
        cast.faceAngle = a;
        const p = frontOf(c, a, 6);
        spawnFx(game, d.muzzle, p.x, p.y, { angle: a });
        if (d.style && BEAMS[d.style]) return BEAMS[d.style](game, c, t, cast, a);
        const beam = new Beam(d.beam, p.x, p.y, a);
        game.addEffect(beam);
        game.shake(d.shake || 0, d.beam.time);
        game.sfx?.('beam');
        const hit = new Set();
        game.addUpdater(() => {
          if (beam.dead) return true;
          if (beam.t < beam.time * 0.75) {
            const w = Math.max(6, beam.halfWidth);
            for (const e of game.enemiesOf(c)) {
              if (hit.has(e) || distToSegment(e.x, e.y, beam.x, beam.y, a, beam.length) >= w + e.radius) continue;
              if (game.dodges(c, e)) game.dodgedText(e);
              else {
                hit.add(e);
                game.applyHit(c, e, cast, { angle: a });
              }
            }
          }
          return false;
        });
        game.after(d.beam.time, cast.finish, null);
      };
      c.sprite.play(d.anim, { loop: false, restart: true, speed: cast.speed, onHit: fire, onEnd: () => {} });
      // Hold the last frame while the beam is out.
    });
  },

  melee(game, c, t, cast) {
    const d = cast.def;
    // Focus Punch / Wicked Blow: tightens its focus first (Focus Punch is lost if it's hit meanwhile).
    if (d.focus && !cast.focused) {
      const time = d.focus / cast.speed;
      cast.focusing = !!d.extra?.loseFocus;
      c.sprite.play(d.chargeAnim || 'Charge', { loop: true, restart: true });
      const fx = spawnFx(game, d.charge, c.x, c.y - 4, { follow: c, oy: -4, loop: true, life: time, layer: 'over' });
      if (fx) fx.owner = cast;
      game.sfx?.('charge');
      game.after(time, () => {
        cast.focused = true;
        cast.focusing = false;
        BEHAVIORS.melee(game, c, t, cast);
      }, cast);
      return;
    }
    const anim = c.sprite.art.animData.anims[c.sprite.resolve(d.anim)];
    const hitFrame = anim.hit ?? anim.durations.length - 1;
    // Some sprites mark the hit on frame 0; give the lunge a moment to close in first.
    const hitTime = Math.max(d.lunge ? 0.12 : 0.06, anim.durations.slice(0, hitFrame).reduce((s, x) => s + x, 0) / 60 / cast.speed);
    let travelled = 0;
    let elapsed = 0;
    const lungeSpeed = (d.lunge || 0) / hitTime;
    cast.drive = (dt) => {
      elapsed += dt;
      if (d.style === 'slam' || d.style === 'axe') c.lift = Math.sin(Math.min(1, elapsed / hitTime) * Math.PI) * (d.hop || 22); // hop onto the target
      if (travelled >= (d.lunge || 0) || !t.alive) return;
      if (c.distTo(t) <= c.radius + t.radius + 4) return;
      const a = c.angleTo(t);
      const step = Math.min(lungeSpeed * dt, d.lunge - travelled);
      c.x += Math.cos(a) * step;
      c.y += Math.sin(a) * step;
      travelled += step;
      c.clamp();
    };
    let struck = false;
    let deferred = false;
    const strike = () => {
      if (struck) return;
      if (!deferred && elapsed < hitTime - 1e-3) {
        deferred = true;
        return void game.after(hitTime - elapsed, strike, null);
      }
      struck = true;
      cast.release();
      cast.drive = null;
      cast.track = false;
      c.lift = 0;
      (MELEE[d.style] || MELEE.basic)(game, c, t, cast, d);
      game.sfx?.('melee');
    };
    c.sprite.play(d.anim, { loop: false, restart: true, speed: cast.speed, onHit: strike, onEnd: () => game.after(meleeTail(d), cast.finish, null) });
  },

  /** Dashes: each skill picks a style of movement (js/motion.js). */
  dash(game, c, t, cast) {
    (DASH[cast.def.style] || DASH.straight)(game, c, t, cast);
  },

  targetArea(game, c, t, cast) {
    const d = cast.def;
    const radius = d.radius * (c.mods?.hitbox ?? 1); // Wide Lens
    // Thunder in rain: no warning time.
    const w = weatherNow(game);
    const instant = (d.extra?.instantRain && w === 'raindance') || (d.extra?.instantWeather && w === d.extra.instantWeather);
    const warnTime = instant ? 0.12 : d.warn;
    const go = () => {
      if (cast.released) return;
      cast.release();
      cast.track = false;
      const b = game.bounds;
      const pts = [{ x: t.x, y: t.y }];
      for (let i = 1; i < (d.count || 1); i++) {
        const ang = Math.random() * Math.PI * 2;
        const r = (0.4 + Math.random() * 0.6) * (d.scatter || 50);
        pts.push({
          x: Math.max(b.x0 + 10, Math.min(b.x1 - 10, t.x + Math.cos(ang) * r)),
          y: Math.max(b.y0 + 10, Math.min(b.y1 - 10, t.y + Math.sin(ang) * r * 0.7)),
        });
      }
      if (d.sky) spawnFx(game, d.sky, t.x, t.y - 40, { layer: 'over', alpha: d.sky.alpha });
      if (d.tint) game.tint(d.tint, warnTime + 0.4);
      game.sfx?.('charge');
      pts.forEach((p, i) => {
        const delay = i * 0.12;
        const warn = warnTime + delay;
        game.after(delay, () => {
          game.addEffect(new Telegraph(p.x, p.y + 4, radius, warnTime));
          spawnFx(game, d.under, p.x, p.y, { layer: 'under' });
        }, null);
        if (d.ring) {
          // Shards erupt around the circle just before the centre one.
          for (let k = 0; k < d.ring.n; k++) {
            const ang = (k / d.ring.n) * Math.PI * 2 + Math.random() * 0.4;
            game.after(Math.max(0, warn - 0.25 + k * 0.04), () => {
              spawnFx(game, d.ring, p.x + Math.cos(ang) * d.ring.r, p.y + Math.sin(ang) * d.ring.r * 0.6);
            }, null);
          }
        }
        if (d.meteor) {
          const m = d.meteor;
          game.after(Math.max(0, warn - m.fall), () => {
            const sx = p.x + m.fromX;
            const sy = p.y + m.fromY;
            const e = spawnFx(game, m, sx, sy, { vx: -m.fromX / m.fall, vy: -m.fromY / m.fall, loop: true, life: m.fall });
            let tt = 0;
            game.addUpdater((dt) => {
              tt -= dt;
              if (tt <= 0 && !e.dead) {
                tt = m.trail.every;
                spawnFx(game, m.trail, e.x + (Math.random() - 0.5) * m.trail.jitter, e.y + (Math.random() - 0.5) * m.trail.jitter, { layer: 'over' });
              }
              return e.dead;
            });
          }, null);
        }
        if (d.pull) pull(game, c, p, radius, warn, d.pull);
        if (d.pillar) {
          // A column rising from the ground (Photon Geyser, Judgment).
          game.after(Math.max(0, warn - 0.05), () => {
            game.addEffect(new Beam({ ...d.pillar, length: d.pillar.length || 220 }, p.x, p.y + 6, -Math.PI / 2));
          }, null);
        }
        if (d.bolt) {
          // A bolt from the top of the screen down onto the point.
          game.after(Math.max(0, warn - 0.05), () => {
            game.addEffect(new Beam({ ...d.bolt, length: p.y + 10 }, p.x, -10, Math.PI / 2));
          }, null);
        }
        game.after(warn, () => {
          spawnFx(game, d.hit, p.x, d.hit?.anchor === 'bottom' ? p.y + 4 : p.y - 6);
          spawnFx(game, d.hit2, p.x, p.y - 4, { layer: 'under' });
          game.shake(d.shake || 0, 0.25);
          game.sfx?.('boom');
          for (const e of game.enemiesOf(c)) {
            if (Math.hypot(e.x - p.x, (e.y - p.y) / 0.7) > radius + e.radius) continue;
            if (game.dodges(c, e)) game.dodgedText(e);
            else game.applyHit(c, e, cast, { angle: Math.atan2(e.y - p.y, e.x - p.x), factor: d.damageFactor ?? 1, noFx: true });
          }
          if (d.extra?.burnGround) burnGround(game, c, p.x, p.y, radius, d.extra.burnGround);
          if (d.zone) zone(game, c, cast, p, radius);
        }, null);
      });
    };
    c.sprite.play(d.anim, { loop: false, restart: true, onHit: go, onEnd: () => { go(); cast.finish(); } });
  },

  burst(game, c, t, cast) {
    const d = cast.def;
    cast.release();
    spawnFx(game, d.under, c.x, c.y, { follow: c, layer: 'under' });
    spawnFx(game, d.over, c.x, c.y, { follow: c, layer: 'over' });
    if (d.chargeAnim) {
      c.sprite.play(d.chargeAnim, { loop: true, restart: true });
      game.after(Math.max(0, d.delay - 0.2), () => c.sprite.play(d.anim, { loop: false, restart: true }), cast);
    } else {
      c.sprite.play(d.anim, { loop: false, restart: true });
    }
    game.sfx?.('charge');
    if (d.ring) {
      for (let k = 0; k < d.ring.n; k++) {
        const ang = (k / d.ring.n) * Math.PI * 2;
        game.after(d.delay * 0.4 + k * 0.03, () => {
          spawnFx(game, d.ring, c.x + Math.cos(ang) * d.ring.r, c.y + Math.sin(ang) * d.ring.r * 0.6);
        }, null);
      }
    }
    if (d.style && BURSTS[d.style]) {
      BURSTS[d.style](game, c, t, cast);
      game.after(Math.max(d.delay + (d.waveTime || 0.3) + 0.2, c.sprite.duration(d.anim)), cast.finish, null);
      return;
    }
    game.after(d.delay, () => {
      if (c.ko) return;
      if (d.tint) game.tint(d.tint, 0.5);
      game.shake(d.shake || 2, 0.3);
      game.sfx?.('boom');
      for (const e of game.enemiesOf(c)) {
        if (c.distTo(e) > d.radius + e.radius) continue;
        if (game.dodges(c, e)) game.dodgedText(e);
        else game.applyHit(c, e, cast, { angle: c.angleTo(e) });
      }
    }, null);
    game.after(Math.max(d.delay + 0.25, c.sprite.duration(d.anim)), cast.finish, null);
  },

  /** Buffs, heals, Protect, weather, Rest: an animation + effect on the user. Dodging cancels it. */
  self(game, c, t, cast) {
    const d = cast.def;
    cast.track = false;
    c.sprite.play(d.anim, { loop: true, restart: true });
    const time = d.time / cast.speed;
    const opts = (fx) => ({ follow: c, ox: 0, oy: fx?.oy ?? 0, loop: true, life: Math.max(time, 0.5) + 0.2 });
    if (d.under) spawnFx(game, d.under, c.x, c.y + (d.under.oy ?? 0), { ...opts(d.under), layer: 'under' });
    if (d.over) spawnFx(game, d.over, c.x, c.y - 4 + (d.over.oy ?? 0), { ...opts(d.over), oy: -4 + (d.over.oy ?? 0), layer: 'over' });
    game.sfx?.('charge');
    game.after(time, () => {
      if (c.ko) return;
      cast.release();
      selfMove(game, c, cast);
      game.after(0.15, cast.finish, null);
    }, cast);
  },

  /** Spikes / Toxic Spikes / Stealth Rock (js/patterns.js). */
  hazard(game, c, t, cast) {
    hazardMove(game, c, t, cast);
  },

  /** Shadow Force: vanish (invulnerable), then strike from behind the target. Dodge the warning! */
  vanish(game, c, t, cast) {
    const d = cast.def;
    cast.release();
    cast.track = false;
    spawnFx(game, d.under, c.x, c.y, { layer: 'under' });
    if (d.tint) game.tint(d.tint, d.vanishTime + 0.5);
    c.hidden = true;
    c.invuln = Math.max(c.invuln, d.vanishTime + 0.05);
    game.sfx?.('charge');
    game.after(Math.max(0, d.vanishTime - 0.4), () => {
      if (t.alive && c.hidden) game.addEffect(new Telegraph(t.x, t.y + 4, t.radius + 16, 0.4, '150,60,220'));
    }, cast);
    game.after(d.vanishTime, () => {
      c.hidden = false;
      if (!t.alive) return cast.finish();
      // Reappear behind the target (opposite the way it last moved).
      const back = t.facing + Math.PI;
      c.x = t.x + Math.cos(back) * (t.radius + c.radius + 4);
      c.y = t.y + Math.sin(back) * (t.radius + c.radius + 4) * 0.7;
      c.clamp();
      cast.faceAngle = c.angleTo(t);
      spawnFx(game, d.over, c.x, c.y, { layer: 'over' });
      c.sprite.play(d.anim, {
        loop: false,
        restart: true,
        onHit: () => {
          if (!t.alive || c.ko) return;
          if (game.dodges(c, t)) game.dodgedText(t);
          else if (c.distTo(t) <= c.radius + t.radius + 40) game.applyHit(c, t, cast, { angle: c.angleTo(t) });
          game.shake(d.shake || 0, 0.3);
        },
        onEnd: cast.finish,
      });
    }, cast);
  },
};
