// Move behaviours. Each move in data/movefx.json picks one behaviour and the
// sprite anim / RawAsset VFX it uses. Damage numbers come from data/moves.json.
import { DB } from './combat.js';
import { Effect, Beam, Telegraph } from './vfx.js';

export const MOVEFX = { common: {}, moves: {} };
/** Pause after every attack before the next one can start. */
export const CAST_GAP = 0.5;
/** Facing moves only fire when the opponent is within this angle of where you're aiming. */
export const FACING_CONE = (70 * Math.PI) / 180;

const MOUTH_Y = -4;

function frontOf(c, angle, extra = 4) {
  return { x: c.x + Math.cos(angle) * (c.radius + extra), y: c.y + MOUTH_Y + Math.sin(angle) * (c.radius * 0.6 + extra) };
}

function spawnFx(game, def, x, y, opts = {}) {
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
    track: def.aim !== 'facing',
    aimFacing: def.aim === 'facing',
    drive: null,
    faceAngle: def.aim === 'facing' ? c.aimAngle : c.angleTo(t),
  };
  cast.release = () => {
    if (cast.released) return;
    cast.released = true;
    c.cd[id] = move.cooldown * (c.mods?.cooldownMul ?? 1);
    game.onMoveUsed?.(c, id);
  };
  cast.finish = () => {
    if (cast.done) return;
    cast.done = true;
    if (c.cast === cast) {
      c.cast = null;
      c.castGap = CAST_GAP;
    }
  };
  c.cast = cast;
  game.announce(c, move);
  BEHAVIORS[def.behavior](game, c, t, cast);
  game.after(5, cast.finish, cast); // safety net
  return cast;
}

/** Facing moves go where the caster is aiming; the rest at the opponent. */
function aimOf(c, t, cast) {
  if (cast.aimFacing) return c.aimAngle;
  return t.alive ? c.angleTo(t) : cast.faceAngle;
}

export function cancelCast(game, c) {
  const cast = c.cast;
  if (!cast) return;
  game.cancelOwner(cast);
  c.hidden = false;
  cast.done = true;
  c.cast = null;
  c.castGap = 0.1;
}

/** Optional charge phase (charge anim + charge VFX at the caster's front), then `then()`. */
function withCharge(game, c, t, cast, then) {
  const d = cast.def;
  const time = d.charge?.time || 0;
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

class Projectile {
  constructor(game, owner, target, cast, angle, x, y) {
    const pd = cast.def.projectile;
    Object.assign(this, { game, owner, target, cast, angle, x, y, pd, t: 0, trailT: 0, dead: false, layer: 'over' });
    this.def = cast.def;
    this.move = cast.move;
    this.speed = pd.speed;
    this.dodged = false;
    this.effect = new Effect(pd, x, y, { loop: true, angle });
  }

  update(dt) {
    const pd = this.pd;
    this.t += dt;
    if (pd.homing && this.target.alive) {
      const want = Math.atan2(this.target.y - this.y, this.target.x - this.x);
      let diff = want - this.angle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.angle += Math.max(-pd.homing * dt, Math.min(pd.homing * dt, diff));
    }
    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;
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

    const tg = this.target;
    if (tg.alive && Math.hypot(tg.x - this.x, tg.y - this.y) < pd.radius * (this.owner.mods?.hitbox ?? 1) + tg.radius) {
      if (tg.invuln > 0) {
        if (!this.dodged) {
          this.dodged = true;
          this.game.dodgedText(tg);
        }
      } else {
        this.explode(true);
        return;
      }
    }
    const b = this.game.bounds;
    const out = this.x < b.x0 - 20 || this.x > b.x1 + 20 || this.y < b.y0 - 40 || this.y > b.y1 + 20;
    if (out || this.t > (pd.life || 2)) this.explode(false);
  }

  explode(direct) {
    this.dead = true;
    const g = this.game;
    const tg = this.target;
    if (direct) {
      g.applyHit(this.owner, tg, this.cast, { angle: this.angle, at: { x: this.x, y: this.y }, factor: this.factor ?? 1 });
    } else if (this.pd.splash) {
      spawnFx(g, this.def.hit, this.x, this.y);
      spawnFx(g, this.def.hit2, this.x, this.y, { layer: 'under' });
      if (tg.alive && tg.invuln <= 0 && Math.hypot(tg.x - this.x, tg.y - this.y) < this.pd.splash + tg.radius) {
        g.applyHit(this.owner, tg, this.cast, { angle: this.angle, factor: 0.6, noFx: true });
      }
    } else {
      spawnFx(g, MOVEFX.common.dodge, this.x, this.y, { scale: 0.6 });
    }
  }

  draw(ctx) {
    this.effect.draw(ctx);
  }
}

function distToSegment(px, py, x0, y0, angle, len) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const t = Math.max(0, Math.min(len, (px - x0) * dx + (py - y0) * dy));
  return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t));
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
        if (pd.stream) {
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
      c.sprite.play(d.anim, { loop: false, restart: true, onHit: fire, onEnd: cast.finish });
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
        const beam = new Beam(d.beam, p.x, p.y, a);
        game.addEffect(beam);
        game.shake(d.shake || 0, d.beam.time);
        game.sfx?.('beam');
        let hit = false;
        game.addUpdater(() => {
          if (beam.dead) return true;
          if (!hit && beam.t < beam.time * 0.75 && t.alive) {
            const w = Math.max(6, beam.halfWidth);
            if (distToSegment(t.x, t.y, beam.x, beam.y, a, beam.length) < w + t.radius) {
              if (t.invuln > 0) {
                if (!cast.dodgeShown) game.dodgedText(t);
                cast.dodgeShown = true;
              } else {
                hit = true;
                game.applyHit(c, t, cast, { angle: a });
              }
            }
          }
          return false;
        });
        game.after(d.beam.time, cast.finish, null);
      };
      c.sprite.play(d.anim, { loop: false, restart: true, onHit: fire, onEnd: () => {} });
      // Hold the last frame while the beam is out.
    });
  },

  melee(game, c, t, cast) {
    const d = cast.def;
    const anim = c.sprite.art.animData.anims[c.sprite.resolve(d.anim)];
    const hitFrame = anim.hit ?? anim.durations.length - 1;
    const hitTime = Math.max(0.06, anim.durations.slice(0, hitFrame).reduce((s, x) => s + x, 0) / 60);
    let travelled = 0;
    const lungeSpeed = (d.lunge || 0) / hitTime;
    cast.drive = (dt) => {
      if (travelled >= (d.lunge || 0) || !t.alive) return;
      if (c.distTo(t) <= c.radius + t.radius + 4) return;
      const a = c.angleTo(t);
      const step = Math.min(lungeSpeed * dt, d.lunge - travelled);
      c.x += Math.cos(a) * step;
      c.y += Math.sin(a) * step;
      travelled += step;
      c.clamp();
    };
    const strike = () => {
      cast.release();
      cast.drive = null;
      cast.track = false;
      const hits = d.hits || 1;
      for (let k = 0; k < hits; k++) {
        game.after(k * (d.hitGap || 0.12), () => {
          if (!t.alive || c.ko) return;
          const a = c.angleTo(t);
          if (c.distTo(t) <= c.radius + t.radius + 34) {
            if (t.invuln > 0) return game.dodgedText(t);
            game.applyHit(c, t, cast, { angle: a, factor: 1 / hits });
          } else {
            spawnFx(game, MOVEFX.common.dodge, c.x + Math.cos(a) * 26, c.y + Math.sin(a) * 26, { scale: 0.7 });
          }
        }, null);
      }
      game.sfx?.('melee');
    };
    c.sprite.play(d.anim, { loop: false, restart: true, onHit: strike, onEnd: () => game.after((d.hits || 1) * (d.hitGap || 0), cast.finish, null) });
  },

  dash(game, c, t, cast) {
    const d = cast.def;
    cast.release();
    cast.track = false;
    const a = aimOf(c, t, cast);
    cast.faceAngle = a;
    c.sprite.play(d.anim, { loop: true, restart: true, speed: 1.5 });
    const flip = Math.cos(a) < 0;
    spawnFx(game, d.under, c.x, c.y, { follow: c, layer: 'under', flipX: flip, life: d.dashTime + 0.3 });
    spawnFx(game, d.over, c.x, c.y, { follow: c, layer: 'over', flipX: flip, life: d.dashTime + 0.3 });
    let time = 0;
    let hit = false;
    cast.drive = (dt) => {
      time += dt;
      if (time >= d.dashTime || hit) {
        cast.drive = null;
        game.after(0.12, cast.finish, null);
        return;
      }
      c.x += Math.cos(a) * d.dashSpeed * dt;
      c.y += Math.sin(a) * d.dashSpeed * dt;
      c.clamp();
      if (t.alive && c.distTo(t) <= c.radius + t.radius + 6) {
        if (t.invuln > 0) {
          if (!cast.dodgeShown) game.dodgedText(t);
          cast.dodgeShown = true;
        } else {
          hit = true;
          const dmg = game.applyHit(c, t, cast, { angle: a });
          game.shake(d.shake || 0, 0.25);
          if (d.recoil && dmg) game.recoil(c, Math.floor(dmg * d.recoil));
        }
      }
    };
    game.sfx?.('dash');
  },

  targetArea(game, c, t, cast) {
    const d = cast.def;
    const radius = d.radius * (c.mods?.hitbox ?? 1); // Wide Lens
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
      if (d.tint) game.tint(d.tint, d.warn + 0.4);
      game.sfx?.('charge');
      pts.forEach((p, i) => {
        const delay = i * 0.12;
        const warn = d.warn + delay;
        game.after(delay, () => {
          game.addEffect(new Telegraph(p.x, p.y + 4, radius, d.warn));
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
          if (t.alive && Math.hypot(t.x - p.x, (t.y - p.y) / 0.7) <= radius + t.radius) {
            if (t.invuln > 0) game.dodgedText(t);
            else game.applyHit(c, t, cast, { angle: Math.atan2(t.y - p.y, t.x - p.x), factor: d.damageFactor ?? 1, noFx: true });
          }
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
    game.after(d.delay, () => {
      if (c.ko) return;
      if (d.tint) game.tint(d.tint, 0.5);
      game.shake(d.shake || 2, 0.3);
      game.sfx?.('boom');
      if (t.alive && c.distTo(t) <= d.radius + t.radius) {
        if (t.invuln > 0) game.dodgedText(t);
        else game.applyHit(c, t, cast, { angle: c.angleTo(t) });
      }
    }, null);
    game.after(Math.max(d.delay + 0.25, c.sprite.duration(d.anim)), cast.finish, null);
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
      // Reappear behind the target (opposite the way it's aiming).
      const back = t.aimAngle + Math.PI;
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
          if (t.invuln > 0) game.dodgedText(t);
          else if (c.distTo(t) <= c.radius + t.radius + 40) game.applyHit(c, t, cast, { angle: c.angleTo(t) });
          game.shake(d.shake || 0, 0.3);
        },
        onEnd: cast.finish,
      });
    }, cast);
  },
};
