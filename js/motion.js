// How dash and melee skills move, so similar skills feel different.
// movefx.json picks a style per skill: { "behavior": "dash", "style": "zigzag", ... }
//
// Dash styles:  straight · zigzag (Quick Attack) · through (Extreme Speed, Aerial Ace)
//   dive (Brave Bird, High Jump Kick) · shadow (Shadow Sneak) · bounce (U-turn) · blink (Sucker Punch)
//   charge (Flare Blitz, Wild Charge, Head Smash) · ram (Dragon Rush, Bolt Strike)
//   spin (Drill Peck, Darkest Lariat) · rise (Waterfall) · leap (Wood Hammer, Giga Impact)
//   orbit (Aqua Step) · arc (Acrobatics) · hops (Heavy Slam); straight + accel (Aqua Jet, Jet Punch)
//   burrow (Dig: tunnels over, bursts up under the target) · roll (Rollout: rolls again and again, harder each time)
//   vee (V-create: a V of fire) · pounce (First Impression: crouch, then pin the target) · surf (Wave Crash: a wide wave)
// Melee styles: basic · sweep (slashes and tails hit everything in an arc) · uppercut (launches)
//   slam (hop onto the target, small shockwave) · combo (rapid flurry) · clamp (bites hold the target)
//   whirl (Sacred Sword: spins, hits all around) · trip (Low Sweep: knocks down) · rage (Rage Fist: more punches the more it was hit)
//   triple (Triple Kick: 3 kicks, each stronger, a miss ends it) · throw (Seismic Toss: lifts the target over and slams it)
//   flurry (Plasma Fists: blinks around the target, hitting from every side) · axe (Ivy Cudgel: leaps up, smashes down)
//   twin (Double Iron Bash: two heavy blows, left then right) · hurl (Dragon Tail: flings the target away; in Trio it's dragged out)
//   + `focus` on any melee skill: tightens focus first (Focus Punch fails if hit meanwhile)
import { MOVEFX, spawnFx, frontOf, aimOf } from './moves.js';
import { Telegraph } from './vfx.js';
import { angleToDir } from './sprite.js';
import { ab } from './effects.js';

const norm = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Try to land a hit on e. Returns true if it connected. */
function contact(game, c, e, cast, opts = {}) {
  if (!e.alive) return false;
  if (game.dodges(c, e) && !cast.def.extra?.unblockable) {
    if (!cast.dodged?.has(e)) {
      (cast.dodged ||= new Set()).add(e);
      game.dodgedText(e);
    }
    return false;
  }
  game.applyHit(c, e, cast, opts);
  return true;
}

/** Visual "launch": the target pops up into the air and lands (and is stunned meanwhile). */
export function launch(game, f, height = 34, time = 0.45) {
  if (!f.alive) return;
  f.stunT = Math.max(f.stunT || 0, time);
  if (f.cast && !f.cast.released) game.cancelCast(f);
  let tt = 0;
  game.addUpdater((dt) => {
    tt += dt;
    f.lift = f.ko ? 0 : Math.max(0, Math.sin(Math.min(1, tt / time) * Math.PI) * height);
    if (tt >= time) {
      f.lift = 0;
      return true;
    }
    return false;
  });
}

/** Common dash setup: cooldown, facing, anim, follow effects. */
function begin(game, c, t, cast, d, { anim = d.anim, speed = 1.5 } = {}) {
  cast.release();
  cast.track = false;
  const a = aimOf(c, t, cast);
  cast.faceAngle = a;
  c.sprite.play(anim, { loop: true, restart: true, speed });
  return a;
}

function followFx(game, c, d, time) {
  const flip = Math.cos(c.cast?.faceAngle ?? 0) < 0;
  spawnFx(game, d.under, c.x, c.y, { follow: c, layer: 'under', flipX: flip, life: time + 0.3, loop: true });
  spawnFx(game, d.over, c.x, c.y, { follow: c, layer: 'over', flipX: flip, life: time + 0.3, loop: true });
}

/** Leaves the dash's trail sprites (and afterimages) behind while moving. */
function trail(game, c, d, cast, dt) {
  cast.trailT = (cast.trailT || 0) - dt;
  if (cast.trailT > 0) return;
  cast.trailT = d.trailEvery || 0.035;
  if (d.afterimage !== false) c.ghost(d.ghostTint);
  if (d.trail) {
    const p = { x: c.x + (Math.random() - 0.5) * 8, y: c.y + 2 + (Math.random() - 0.5) * 6 };
    spawnFx(game, d.trail, p.x, p.y, { layer: 'under' });
    // Hazard trails (Flare Blitz's fire, Wild Charge's sparks) hurt foes who walk through them.
    if (d.trailHazard) hazard(game, c, p, d.trailHazard);
  }
}

function hazard(game, c, p, h) {
  let life = 0;
  let tick = 0;
  game.addUpdater((dt) => {
    life += dt;
    tick -= dt;
    if (tick <= 0) {
      tick = 0.25;
      for (const e of game.enemiesOf(c)) {
        if (Math.hypot(e.x - p.x, e.y - p.y) > 12 + e.radius || e.invuln > 0) continue;
        game.hazardHit(c, e, h);
      }
    }
    return life >= (h.time || 1.5);
  });
}

function end(game, c, cast, delay = 0.12) {
  cast.drive = null;
  c.lift = 0;
  game.after(delay, cast.finish, null);
}

// ---------------------------------------------------------------- dash styles
export const DASH = {
  /** Straight line; stops at the first foe it touches. */
  straight(game, c, t, cast) {
    const d = cast.def;
    const a = begin(game, c, t, cast, d);
    followFx(game, c, d, d.dashTime);
    let time = 0;
    cast.drive = (dt) => {
      time += dt;
      if (time >= d.dashTime) return end(game, c, cast);
      // Aqua Jet: starts slow and keeps speeding up.
      const v = d.dashSpeed * (d.accel ? 0.35 + 1.3 * (time / d.dashTime) : 1);
      c.x += Math.cos(a) * v * dt;
      c.y += Math.sin(a) * v * dt;
      c.clamp();
      trail(game, c, d, cast, dt);
      const e = game.enemiesOf(c).find((o) => c.distTo(o) <= c.radius + o.radius + 6);
      if (e && contact(game, c, e, cast, { angle: a, kbMul: d.accel ? 1 + time / d.dashTime : 1 })) {
        game.shake(d.shake || 0, 0.25);
        end(game, c, cast);
      }
    };
    game.sfx?.('dash');
  },

  /** Quick Attack: darts left and right in short blinks before striking. */
  zigzag(game, c, t, cast) {
    const d = cast.def;
    begin(game, c, t, cast, d);
    const legs = d.legs || 3;
    const sx = c.x;
    const sy = c.y;
    const pts = [];
    for (let i = 1; i < legs; i++) {
      const k = i / legs;
      const a = Math.atan2(t.y - sy, t.x - sx);
      const side = (i % 2 ? 1 : -1) * (d.zig || 34);
      pts.push({ x: sx + (t.x - sx) * k - Math.sin(a) * side, y: sy + (t.y - sy) * k + Math.cos(a) * side * 0.7 });
    }
    let leg = 0;
    let time = 0;
    cast.drive = (dt) => {
      time += dt;
      if (time > d.dashTime + 0.4) return end(game, c, cast);
      const goal = leg < pts.length ? pts[leg] : t.alive ? { x: t.x, y: t.y } : pts[pts.length - 1];
      const a = Math.atan2(goal.y - c.y, goal.x - c.x);
      cast.faceAngle = a;
      const step = d.dashSpeed * dt;
      if (Math.hypot(goal.x - c.x, goal.y - c.y) <= step) {
        c.x = goal.x;
        c.y = goal.y;
        if (leg < pts.length) {
          spawnFx(game, MOVEFX.common.dodge, c.x, c.y + 4, { layer: 'under', scale: 0.7 });
          leg++;
        }
      } else {
        c.x += Math.cos(a) * step;
        c.y += Math.sin(a) * step;
      }
      c.clamp();
      trail(game, c, d, cast, dt);
      if (leg >= pts.length) {
        const e = game.enemiesOf(c).find((o) => c.distTo(o) <= c.radius + o.radius + 8);
        if (e) {
          contact(game, c, e, cast, { angle: a });
          game.shake(d.shake || 2, 0.2);
          return end(game, c, cast);
        }
        if (!t.alive) return end(game, c, cast);
      }
    };
    game.sfx?.('dash');
  },

  /** Extreme Speed / Aerial Ace: rushes straight through the target to the far side (and back). */
  through(game, c, t, cast) {
    const d = cast.def;
    let a = begin(game, c, t, cast, d);
    const passes = d.passes || 1;
    let pass = 0;
    let hit = new Set();
    const dist = () => (t.alive ? c.distTo(t) : 80) + (d.overshoot || 60);
    let left = dist();
    c.invuln = Math.max(c.invuln, 0.1);
    cast.drive = (dt) => {
      const step = d.dashSpeed * dt;
      c.x += Math.cos(a) * step;
      c.y += Math.sin(a) * step;
      c.clamp();
      left -= step;
      trail(game, c, d, cast, dt);
      for (const e of game.enemiesOf(c)) {
        if (hit.has(e) || c.distTo(e) > c.radius + e.radius + 8) continue;
        hit.add(e);
        if (contact(game, c, e, cast, { angle: a, factor: 1 / passes })) {
          spawnFx(game, d.slash, e.x, e.y - 6, { angle: a });
          game.shake(d.shake || 2, 0.15);
        }
      }
      if (left <= 0) {
        pass++;
        if (pass >= passes || !t.alive) return end(game, c, cast);
        // Turn around for the next pass.
        a = Math.atan2(t.y - c.y, t.x - c.x);
        cast.faceAngle = a;
        hit = new Set();
        left = dist();
        spawnFx(game, MOVEFX.common.dodge, c.x, c.y + 4, { layer: 'under' });
      }
    };
    game.sfx?.('dash');
  },

  /** Brave Bird / High Jump Kick: leaps off the screen, then dives onto a marked spot. */
  dive(game, c, t, cast) {
    const d = cast.def;
    begin(game, c, t, cast, d, { anim: d.riseAnim || 'Hop', speed: 1 });
    cast.lockDir = true;
    const up = d.upTime || 0.3;
    const hang = d.hang || 0.35;
    const down = d.downTime || 0.16;
    const spot = { x: t.x, y: t.y };
    let phase = 0;
    let tt = 0;
    let mark = null;
    c.invuln = Math.max(c.invuln, up + hang + down * 0.6); // up in the sky
    spawnFx(game, MOVEFX.common.dodge, c.x, c.y + 4, { layer: 'under', scale: 1.2 });
    cast.drive = (dt) => {
      tt += dt;
      if (phase === 0) {
        c.lift = (tt / up) * 220;
        if (tt >= up) {
          phase = 1;
          tt = 0;
          mark = game.addEffect(new Telegraph(spot.x, spot.y + 4, d.radius || 34, hang + down));
        }
      } else if (phase === 1) {
        // Hovering out of sight: the mark follows the target for a moment.
        if (t.alive && tt < hang * 0.6) {
          spot.x += (t.x - spot.x) * Math.min(1, dt * 8);
          spot.y += (t.y - spot.y) * Math.min(1, dt * 8);
          if (mark) Object.assign(mark, { x: spot.x, y: spot.y + 4 });
        }
        if (tt >= hang) {
          phase = 2;
          tt = 0;
          c.x = spot.x;
          c.y = spot.y;
          c.clamp();
          c.sprite.play(d.anim, { loop: true, restart: true });
          c.dir = angleToDir(Math.PI / 2);
          spawnFx(game, d.over, c.x, c.y, { follow: c, life: down + 0.2, loop: true });
        }
      } else {
        c.lift = Math.max(0, 220 * (1 - tt / down));
        if (tt % 0.03 < dt) c.ghost(d.ghostTint);
        if (tt >= down) {
          c.lift = 0;
          let any = false;
          for (const e of game.enemiesOf(c)) {
            if (Math.hypot(e.x - c.x, (e.y - c.y) / 0.7) > (d.radius || 34) + e.radius) continue;
            if (contact(game, c, e, cast, { angle: c.angleTo(e) })) any = true;
          }
          spawnFx(game, d.land, c.x, c.y - 4);
          game.shake(d.shake || 6, 0.3);
          game.sfx?.('boom');
          if (!any && d.crash) game.crash(c, d.crash); // High Jump Kick: kept going and crashed
          return end(game, c, cast, 0.2);
        }
      }
    };
    game.sfx?.('charge');
  },

  /** Shadow Sneak: sinks into its shadow, glides along the ground, pops up under the target. */
  shadow(game, c, t, cast) {
    const d = cast.def;
    begin(game, c, t, cast, d);
    c.sneaking = true;
    c.invuln = Math.max(c.invuln, d.dashTime + 0.1);
    spawnFx(game, d.under, c.x, c.y, { layer: 'under' });
    let time = 0;
    cast.drive = (dt) => {
      time += dt;
      const goal = t.alive ? t : null;
      if (time >= d.dashTime || !goal) {
        c.sneaking = false;
        return end(game, c, cast);
      }
      const a = c.angleTo(goal);
      cast.faceAngle = a;
      c.x += Math.cos(a) * d.dashSpeed * dt;
      c.y += Math.sin(a) * d.dashSpeed * dt;
      c.clamp();
      if (time % 0.05 < dt) spawnFx(game, d.trail, c.x, c.y + 4, { layer: 'under' });
      if (c.distTo(goal) <= c.radius + goal.radius) {
        c.sneaking = false;
        spawnFx(game, d.under, c.x, c.y, { layer: 'under' });
        if (contact(game, c, goal, cast, { angle: a })) launch(game, goal, 22, 0.3);
        game.shake(d.shake || 3, 0.2);
        end(game, c, cast);
      }
    };
    game.sfx?.('dash');
  },

  /** U-turn: hits, then flies back to where it started. */
  bounce(game, c, t, cast) {
    const d = cast.def;
    let a = begin(game, c, t, cast, d);
    followFx(game, c, d, d.dashTime * 2);
    const home = { x: c.x, y: c.y };
    let back = false;
    let time = 0;
    cast.drive = (dt) => {
      time += dt;
      if (time > d.dashTime * 2.5) return end(game, c, cast);
      if (back) {
        a = Math.atan2(home.y - c.y, home.x - c.x);
        if (Math.hypot(home.x - c.x, home.y - c.y) < d.dashSpeed * dt) return end(game, c, cast);
      }
      c.x += Math.cos(a) * d.dashSpeed * dt;
      c.y += Math.sin(a) * d.dashSpeed * dt;
      c.clamp();
      trail(game, c, d, cast, dt);
      if (!back) {
        if (time >= d.dashTime) back = true;
        const e = game.enemiesOf(c).find((o) => c.distTo(o) <= c.radius + o.radius + 6);
        if (e) {
          contact(game, c, e, cast, { angle: a });
          game.shake(d.shake || 3, 0.2);
          back = true;
        }
      }
    };
    game.sfx?.('dash');
  },

  /** Sucker Punch: vanishes in a puff and strikes from right behind the target. */
  blink(game, c, t, cast) {
    const d = cast.def;
    begin(game, c, t, cast, d, { anim: d.anim, speed: 1 });
    spawnFx(game, MOVEFX.common.dodge, c.x, c.y, { scale: 1.2 });
    c.hidden = true;
    game.after(d.blinkTime || 0.14, () => {
      c.hidden = false;
      if (!t.alive) return cast.finish();
      const back = t.angleTo(c) + Math.PI;
      c.x = t.x + Math.cos(back) * (t.radius + c.radius + 2);
      c.y = t.y + Math.sin(back) * (t.radius + c.radius + 2) * 0.7;
      c.clamp();
      cast.faceAngle = c.angleTo(t);
      spawnFx(game, d.under, c.x, c.y, { layer: 'under' });
      c.sprite.play('Attack', { loop: false, restart: true });
      contact(game, c, t, cast, { angle: cast.faceAngle });
      game.shake(d.shake || 3, 0.2);
      game.after(0.25, cast.finish, null);
    }, cast);
    game.sfx?.('dodge');
  },

  /** Flare Blitz / Wild Charge / Head Smash: winds up, then a long unstoppable charge leaving a trail. */
  charge(game, c, t, cast) {
    const d = cast.def;
    const wind = (d.windup || 0.45) / cast.speed;
    c.sprite.play(d.chargeAnim || 'Charge', { loop: true, restart: true });
    spawnFx(game, d.charge, c.x, c.y, { follow: c, life: wind + 0.1, loop: true, layer: 'over' });
    game.sfx?.('charge');
    game.after(wind, () => {
      const a = begin(game, c, t, cast, d, { speed: 2 });
      followFx(game, c, d, d.dashTime);
      let time = 0;
      cast.drive = (dt) => {
        time += dt;
        if (time >= d.dashTime) return end(game, c, cast);
        c.x += Math.cos(a) * d.dashSpeed * dt;
        c.y += Math.sin(a) * d.dashSpeed * dt;
        c.clamp();
        trail(game, c, d, cast, dt);
        const e = game.enemiesOf(c).find((o) => c.distTo(o) <= c.radius + o.radius + 6);
        if (e && contact(game, c, e, cast, { angle: a })) {
          spawnFx(game, d.impact, e.x, e.y - 4);
          game.shake(d.shake || 7, 0.3);
          end(game, c, cast, 0.2);
        }
      };
      game.sfx?.('dash');
    }, cast);
  },

  /** Dragon Rush / Bolt Strike: catches the target and carries it along, then slams it away. */
  ram(game, c, t, cast) {
    const d = cast.def;
    const a = begin(game, c, t, cast, d);
    followFx(game, c, d, d.dashTime);
    let time = 0;
    let caught = null;
    cast.drive = (dt) => {
      time += dt;
      const done = time >= d.dashTime || (caught && time >= (cast.caughtAt || 0) + (d.carry || 0.25));
      if (done) {
        if (caught && caught.alive) {
          game.applyHit(c, caught, cast, { angle: a, kbMul: d.extra?.kbMul ?? 2.2 });
          spawnFx(game, d.impact, caught.x, caught.y - 4);
          game.shake(d.shake || 7, 0.3);
        }
        return end(game, c, cast);
      }
      c.x += Math.cos(a) * d.dashSpeed * dt;
      c.y += Math.sin(a) * d.dashSpeed * dt;
      c.clamp();
      trail(game, c, d, cast, dt);
      if (!caught) {
        const e = game.enemiesOf(c).find((o) => c.distTo(o) <= c.radius + o.radius + 6);
        if (e) {
          if (game.dodges(c, e)) {
            if (!cast.dodged) game.dodgedText(e);
            cast.dodged = true;
          } else {
            caught = e;
            cast.caughtAt = time;
            if (e.cast && !e.cast.released) game.cancelCast(e);
          }
        }
      } else if (caught.alive) {
        // Carried in front of the rushing Pokémon.
        caught.x = c.x + Math.cos(a) * (c.radius + caught.radius);
        caught.y = c.y + Math.sin(a) * (c.radius + caught.radius) * 0.8;
        caught.clamp();
        caught.stunT = Math.max(caught.stunT, 0.1);
      }
    };
    game.sfx?.('dash');
  },

  /** Drill Peck / Darkest Lariat: spins while dashing, hitting everything it touches several times. */
  spin(game, c, t, cast) {
    const d = cast.def;
    const a = begin(game, c, t, cast, d, { speed: 2 });
    cast.lockDir = true;
    followFx(game, c, d, d.dashTime);
    const ticks = d.ticks || 3;
    const hits = new Map();
    let time = 0;
    let spinT = 0;
    let tickT = 0;
    cast.drive = (dt) => {
      time += dt;
      spinT += dt;
      tickT -= dt;
      if (spinT >= 0.045) {
        spinT = 0;
        c.dir = (c.dir + 1) % 8;
      }
      if (time >= d.dashTime) return end(game, c, cast);
      const slow = [...hits.keys()].some((e) => c.distTo(e) <= c.radius + e.radius + 10) ? 0.35 : 1; // grinds against a foe
      c.x += Math.cos(a) * d.dashSpeed * dt * slow;
      c.y += Math.sin(a) * d.dashSpeed * dt * slow;
      c.clamp();
      trail(game, c, d, cast, dt);
      if (tickT > 0) return;
      for (const e of game.enemiesOf(c)) {
        if (c.distTo(e) > c.radius + e.radius + 10 || (hits.get(e) || 0) >= ticks) continue;
        if (contact(game, c, e, cast, { angle: a, factor: 1 / ticks, kbMul: 0.25 })) {
          hits.set(e, (hits.get(e) || 0) + 1);
          tickT = d.tickGap || 0.12;
          game.shake(2, 0.1);
        }
      }
    };
    game.sfx?.('dash');
  },

  /** Waterfall: surges forward on a rising column of water that launches the target. */
  rise(game, c, t, cast) {
    const d = cast.def;
    const a = begin(game, c, t, cast, d);
    followFx(game, c, d, d.dashTime);
    let time = 0;
    cast.drive = (dt) => {
      time += dt;
      c.lift = Math.sin(Math.min(1, time / d.dashTime) * Math.PI) * 14;
      if (time >= d.dashTime) return end(game, c, cast);
      c.x += Math.cos(a) * d.dashSpeed * dt;
      c.y += Math.sin(a) * d.dashSpeed * dt;
      c.clamp();
      trail(game, c, d, cast, dt);
      const e = game.enemiesOf(c).find((o) => c.distTo(o) <= c.radius + o.radius + 6);
      if (e && contact(game, c, e, cast, { angle: a, kbMul: 0.3 })) {
        launch(game, e, 40, 0.5);
        spawnFx(game, d.impact, e.x, e.y + 4);
        game.shake(d.shake || 4, 0.25);
        end(game, c, cast);
      }
    };
    game.sfx?.('dash');
  },

  /** Wood Hammer / Giga Impact: a big jump that lands on the target with a shockwave. */
  leap(game, c, t, cast) {
    const d = cast.def;
    begin(game, c, t, cast, d, { anim: d.riseAnim || 'Hop', speed: 1 });
    const from = { x: c.x, y: c.y };
    const to = t.alive ? { x: t.x - Math.cos(c.angleTo(t)) * (t.radius * 0.6), y: t.y } : { x: c.x, y: c.y };
    const time = d.dashTime;
    const mark = game.addEffect(new Telegraph(to.x, to.y + 4, d.radius || 40, time));
    let tt = 0;
    cast.drive = (dt) => {
      tt += dt;
      const k = Math.min(1, tt / time);
      c.x = from.x + (to.x - from.x) * k;
      c.y = from.y + (to.y - from.y) * k;
      c.lift = Math.sin(k * Math.PI) * (d.height || 60);
      if (tt % 0.04 < dt) c.ghost(d.ghostTint);
      if (k >= 1) {
        mark.dead = true;
        c.lift = 0;
        c.sprite.play(d.anim, { loop: false, restart: true });
        for (const e of game.enemiesOf(c)) {
          if (Math.hypot(e.x - c.x, (e.y - c.y) / 0.7) > (d.radius || 40) + e.radius) continue;
          contact(game, c, e, cast, { angle: c.angleTo(e) });
        }
        spawnFx(game, d.land, c.x, c.y - 2, { layer: 'under' });
        spawnFx(game, d.impact, c.x, c.y - 6);
        game.shake(d.shake || 8, 0.3);
        game.sfx?.('boom');
        end(game, c, cast, 0.25);
      }
    };
    game.sfx?.('charge');
  },

  /** Aqua Step: dances half a circle around the target, then strikes from the side. */
  orbit(game, c, t, cast) {
    const d = cast.def;
    begin(game, c, t, cast, d, { speed: 2 });
    followFx(game, c, d, d.dashTime);
    const a0 = Math.atan2((c.y - t.y) / 0.7, c.x - t.x);
    const r0 = Math.max(50, Math.min(110, c.distTo(t)));
    const turn = (Math.random() < 0.5 ? 1 : -1) * Math.PI * 0.9;
    let time = 0;
    let spinT = 0;
    cast.lockDir = true;
    cast.drive = (dt) => {
      time += dt;
      if (!t.alive) return end(game, c, cast);
      const k = Math.min(1, time / d.dashTime);
      const ang = a0 + turn * k;
      const rad = r0 * (1 - k) + (c.radius + t.radius + 2) * k;
      c.x = t.x + Math.cos(ang) * rad;
      c.y = t.y + Math.sin(ang) * rad * 0.7;
      c.clamp();
      if ((spinT += dt) >= 0.06) {
        spinT = 0;
        c.dir = (c.dir + (turn > 0 ? 1 : 7)) % 8; // twirls while dancing
      }
      trail(game, c, d, cast, dt);
      if (k >= 1) {
        const a = c.angleTo(t);
        cast.faceAngle = a;
        c.dir = angleToDir(a);
        contact(game, c, t, cast, { angle: a });
        game.shake(d.shake || 3, 0.2);
        end(game, c, cast);
      }
    };
    game.sfx?.('dash');
  },

  /** Acrobatics: flips along a curved path into the target, then springs back off it. */
  arc(game, c, t, cast) {
    const d = cast.def;
    begin(game, c, t, cast, d, { anim: d.riseAnim || 'Hop', speed: 1.5 });
    const from = { x: c.x, y: c.y };
    const side = Math.random() < 0.5 ? 1 : -1;
    let time = 0;
    let hit = false;
    let spinT = 0;
    cast.lockDir = true;
    cast.drive = (dt) => {
      time += dt;
      const k = Math.min(1, time / d.dashTime);
      if (!hit) {
        const to = t.alive ? { x: t.x, y: t.y } : from;
        const mx = (from.x + to.x) / 2;
        const my = (from.y + to.y) / 2;
        const a = Math.atan2(to.y - from.y, to.x - from.x);
        const bend = Math.hypot(to.x - from.x, to.y - from.y) * 0.55 * side;
        const cx = mx - Math.sin(a) * bend;
        const cy = my + Math.cos(a) * bend * 0.7;
        // Quadratic curve from -> (cx, cy) -> target.
        const u = 1 - k;
        c.x = u * u * from.x + 2 * u * k * cx + k * k * to.x;
        c.y = u * u * from.y + 2 * u * k * cy + k * k * to.y;
        c.lift = Math.sin(k * Math.PI) * (d.height || 30);
        if ((spinT += dt) >= 0.05) {
          spinT = 0;
          c.dir = (c.dir + 1) % 8; // flipping
        }
        trail(game, c, d, cast, dt);
        if (t.alive && (k >= 1 || c.distTo(t) <= c.radius + t.radius + 4)) {
          hit = true;
          time = 0;
          c.lift = 0;
          cast.faceAngle = c.angleTo(t);
          c.dir = angleToDir(cast.faceAngle);
          contact(game, c, t, cast, { angle: cast.faceAngle });
          game.shake(d.shake || 3, 0.2);
        } else if (k >= 1) return end(game, c, cast);
      } else {
        // Spring back off the target.
        const back = cast.faceAngle + Math.PI;
        c.x += Math.cos(back) * 260 * dt;
        c.y += Math.sin(back) * 260 * dt;
        c.clamp();
        c.lift = Math.sin(Math.min(1, time / 0.2) * Math.PI) * 16;
        if (time >= 0.2) return end(game, c, cast);
      }
    };
    game.sfx?.('dash');
  },

  /** Heavy Slam: bounds over in heavy hops (each one shakes the ground), the last lands on the target. */
  hops(game, c, t, cast) {
    const d = cast.def;
    begin(game, c, t, cast, d, { anim: d.riseAnim || 'Hop', speed: 1 });
    const n = d.hops || 3;
    const hopTime = d.hopTime || 0.22;
    let hop = 0;
    let tt = 0;
    let from = { x: c.x, y: c.y };
    let to = null;
    let mark = null;
    const next = () => {
      const goal = t.alive ? { x: t.x, y: t.y } : from;
      const left = n - hop;
      to = { x: from.x + (goal.x - from.x) / left, y: from.y + (goal.y - from.y) / left };
      if (hop === n - 1) mark = game.addEffect(new Telegraph(to.x, to.y + 4, d.radius || 40, hopTime));
    };
    next();
    cast.drive = (dt) => {
      tt += dt;
      const k = Math.min(1, tt / hopTime);
      c.x = from.x + (to.x - from.x) * k;
      c.y = from.y + (to.y - from.y) * k;
      const last = hop === n - 1;
      c.lift = Math.sin(k * Math.PI) * (d.height || 24) * (last ? 1.8 : 1);
      if (k < 1) return;
      c.lift = 0;
      if (!last) {
        spawnFx(game, d.step, c.x, c.y, { layer: 'under' });
        game.shake(2 + hop, 0.12);
        game.sfx?.('tick');
        hop++;
        tt = 0;
        from = { x: c.x, y: c.y };
        return next();
      }
      if (mark) mark.dead = true;
      c.sprite.play(d.anim, { loop: false, restart: true });
      for (const e of game.enemiesOf(c)) {
        if (Math.hypot(e.x - c.x, (e.y - c.y) / 0.7) > (d.radius || 40) + e.radius) continue;
        contact(game, c, e, cast, { angle: c.angleTo(e), kbMul: 1.5 });
      }
      spawnFx(game, d.land, c.x, c.y - 2, { layer: 'under' });
      spawnFx(game, d.impact, c.x, c.y - 6);
      game.shake(d.shake || 9, 0.35);
      game.sfx?.('boom');
      end(game, c, cast, 0.25);
    };
    game.sfx?.('charge');
  },

  /** Dig: tunnels underground (can't be hit), then bursts up under the target. */
  burrow(game, c, t, cast) {
    const d = cast.def;
    begin(game, c, t, cast, d, { speed: 1 });
    spawnFx(game, d.under, c.x, c.y, { layer: 'under' });
    spawnFx(game, MOVEFX.common.dodge, c.x, c.y, { scale: 1.2 });
    c.burrowing = true;
    c.invuln = Math.max(c.invuln, d.dashTime + 0.15);
    let time = 0;
    let dustT = 0;
    let mark = null;
    const surface = () => {
      c.burrowing = false;
      c.invuln = Math.min(c.invuln, 0.05);
      if (mark) mark.dead = true;
      spawnFx(game, d.under, c.x, c.y, { layer: 'under' });
      spawnFx(game, d.impact, c.x, c.y - 6);
      c.sprite.play(d.anim, { loop: false, restart: true });
      for (const e of game.enemiesOf(c)) {
        if (Math.hypot(e.x - c.x, (e.y - c.y) / 0.7) > (d.radius || 30) + e.radius) continue;
        if (contact(game, c, e, cast, { angle: c.angleTo(e), kbMul: 0.4 })) launch(game, e, 34, 0.45);
      }
      game.shake(d.shake || 5, 0.25);
      game.sfx?.('boom');
      end(game, c, cast, 0.25);
    };
    cast.drive = (dt) => {
      time += dt;
      const goal = t.alive ? t : null;
      if (!goal || time >= d.dashTime) return surface();
      const a = c.angleTo(goal);
      cast.faceAngle = a;
      const step = Math.min(d.dashSpeed * dt, Math.max(0, c.distTo(goal) - 2));
      c.x += Math.cos(a) * step;
      c.y += Math.sin(a) * step;
      c.clamp();
      if ((dustT -= dt) <= 0) {
        dustT = 0.06;
        spawnFx(game, d.trail, c.x + (Math.random() - 0.5) * 10, c.y + 4, { layer: 'under' });
      }
      // The ground cracks under the target just before it bursts out.
      if (!mark && c.distTo(goal) < 40) mark = game.addEffect(new Telegraph(goal.x, goal.y + 4, d.radius || 30, 0.2));
      if (c.distTo(goal) <= 6 || (mark && mark.t >= 0.18)) surface();
    };
    game.sfx?.('dash');
  },

  /** Rollout: rolls into the target, bounces off and rolls again (up to 4 times), harder every time. A miss ends it. */
  roll(game, c, t, cast) {
    const d = cast.def;
    let a = begin(game, c, t, cast, d, { speed: 2 });
    cast.lockDir = true;
    const rolls = d.rolls || 4;
    let n = 0;
    let time = 0;
    let back = 0;
    let spinT = 0;
    let speed = d.dashSpeed;
    cast.drive = (dt) => {
      time += dt;
      if ((spinT += dt) >= 0.04) {
        spinT = 0;
        c.dir = (c.dir + 1) % 8;
      }
      if (back > 0) {
        // Bouncing back off the target before the next roll.
        back -= dt;
        c.x -= Math.cos(a) * 220 * dt;
        c.y -= Math.sin(a) * 220 * dt;
        c.lift = Math.sin((1 - back / 0.18) * Math.PI) * 12;
        c.clamp();
        if (back <= 0) {
          c.lift = 0;
          if (!t.alive || n >= rolls) return end(game, c, cast);
          a = c.angleTo(t);
          time = 0;
          speed *= 1.15;
        }
        return;
      }
      if (time >= d.dashTime) return end(game, c, cast); // rolled past: it's over
      c.x += Math.cos(a) * speed * dt;
      c.y += Math.sin(a) * speed * dt;
      c.clamp();
      trail(game, c, d, cast, dt);
      const e = game.enemiesOf(c).find((o) => c.distTo(o) <= c.radius + o.radius + 6);
      if (!e) return;
      if (!contact(game, c, e, cast, { angle: a, factor: 2 ** n, kbMul: 0.5 })) return end(game, c, cast);
      n++;
      spawnFx(game, d.impact, e.x, e.y - 4);
      game.shake(2 + n * 2, 0.2);
      back = 0.18;
    };
    game.sfx?.('dash');
  },

  /** V-create: dashes out to one side, then cuts back through the target, drawing a V of fire. */
  vee(game, c, t, cast) {
    const d = cast.def;
    let a = begin(game, c, t, cast, d, { speed: 2 });
    followFx(game, c, d, d.dashTime * 2);
    const side = Math.random() < 0.5 ? 1 : -1;
    const dist = t.alive ? c.distTo(t) : 120;
    const apex = { x: c.x + Math.cos(a + 0.75 * side) * dist * 0.55, y: c.y + Math.sin(a + 0.75 * side) * dist * 0.55 * 0.8 };
    let leg = 0;
    let time = 0;
    let left = 0;
    const hit = new Set();
    a = Math.atan2(apex.y - c.y, apex.x - c.x);
    cast.drive = (dt) => {
      time += dt;
      if (time > d.dashTime * 3) return end(game, c, cast);
      const step = d.dashSpeed * dt;
      if (leg === 0) {
        if (Math.hypot(apex.x - c.x, apex.y - c.y) <= step) {
          c.x = apex.x;
          c.y = apex.y;
          leg = 1;
          a = t.alive ? c.angleTo(t) : a + Math.PI / 2;
          cast.faceAngle = a;
          left = (t.alive ? c.distTo(t) : 80) + (d.overshoot || 50);
          spawnFx(game, d.impact, c.x, c.y - 4, { scale: 0.7 });
          return;
        }
        a = Math.atan2(apex.y - c.y, apex.x - c.x);
      } else if ((left -= step) <= 0) return end(game, c, cast, 0.15);
      cast.faceAngle = a;
      c.x += Math.cos(a) * step;
      c.y += Math.sin(a) * step;
      c.clamp();
      trail(game, c, d, cast, dt);
      for (const e of game.enemiesOf(c)) {
        if (hit.has(e) || c.distTo(e) > c.radius + e.radius + 8) continue;
        hit.add(e);
        if (contact(game, c, e, cast, { angle: a })) {
          spawnFx(game, d.slash, e.x, e.y - 6, { angle: a });
          game.shake(d.shake || 6, 0.25);
        }
      }
    };
    game.sfx?.('dash');
  },

  /** First Impression: crouches, then springs onto the target and pins it for a moment. */
  pounce(game, c, t, cast) {
    const d = cast.def;
    const crouch = (d.windup || 0.15) / cast.speed;
    c.sprite.play(d.chargeAnim || 'Charge', { loop: true, restart: true });
    spawnFx(game, d.charge, c.x, c.y, { follow: c, life: crouch + 0.1, loop: true, layer: 'under' });
    game.after(crouch, () => {
      begin(game, c, t, cast, d, { anim: d.riseAnim || 'Hop', speed: 1.6 });
      const from = { x: c.x, y: c.y };
      const to = t.alive ? { x: t.x - Math.cos(c.angleTo(t)) * (t.radius * 0.5), y: t.y } : from;
      let tt = 0;
      cast.drive = (dt) => {
        tt += dt;
        const k = Math.min(1, tt / d.dashTime);
        c.x = from.x + (to.x - from.x) * k;
        c.y = from.y + (to.y - from.y) * k;
        c.lift = Math.sin(k * Math.PI) * (d.height || 30);
        if (tt % 0.03 < dt) c.ghost(d.ghostTint);
        if (k < 1) return;
        c.lift = 0;
        c.sprite.play(d.anim, { loop: false, restart: true });
        for (const e of game.enemiesOf(c)) {
          if (c.distTo(e) > c.radius + e.radius + 14) continue;
          if (contact(game, c, e, cast, { angle: c.angleTo(e), kbMul: 0.2 })) e.stunT = Math.max(e.stunT, d.pin || 0.35);
        }
        spawnFx(game, d.land, c.x, c.y, { layer: 'under' });
        game.shake(d.shake || 4, 0.2);
        end(game, c, cast, 0.25);
      };
      game.sfx?.('dash');
    }, cast);
  },

  /** Wave Crash: rides a wide wave forward, sweeping up every foe in its path. */
  surf(game, c, t, cast) {
    const d = cast.def;
    const a = begin(game, c, t, cast, d, { speed: 2 });
    followFx(game, c, d, d.dashTime);
    const width = d.width || 26;
    const carried = new Map();
    let time = 0;
    let fxT = 0;
    cast.drive = (dt) => {
      time += dt;
      if (time >= d.dashTime) {
        for (const e of carried.keys()) if (e.alive) game.applyHit(c, e, cast, { angle: a, kbMul: 1.6, factor: 0.5 });
        spawnFx(game, d.impact, c.x + Math.cos(a) * 20, c.y + Math.sin(a) * 14 - 4);
        game.shake(d.shake || 6, 0.3);
        return end(game, c, cast, 0.2);
      }
      c.x += Math.cos(a) * d.dashSpeed * dt;
      c.y += Math.sin(a) * d.dashSpeed * dt;
      c.clamp();
      trail(game, c, d, cast, dt);
      if ((fxT -= dt) <= 0) {
        fxT = 0.05;
        const s = (Math.random() - 0.5) * 2 * width;
        spawnFx(game, d.spray, c.x + Math.cos(a) * 16 - Math.sin(a) * s, c.y + Math.sin(a) * 12 + Math.cos(a) * s * 0.7, { layer: 'over' });
      }
      for (const e of game.enemiesOf(c)) {
        if (carried.has(e)) {
          // Swept along in front of the wave.
          const off = carried.get(e);
          e.x = c.x + Math.cos(a) * (c.radius + e.radius) - Math.sin(a) * off;
          e.y = c.y + Math.sin(a) * (c.radius + e.radius) * 0.8 + Math.cos(a) * off * 0.7;
          e.clamp();
          e.stunT = Math.max(e.stunT, 0.1);
          continue;
        }
        const fwd = (e.x - c.x) * Math.cos(a) + (e.y - c.y) * Math.sin(a);
        const lat = -(e.x - c.x) * Math.sin(a) + (e.y - c.y) * Math.cos(a);
        if (fwd < -4 || fwd > c.radius + e.radius + 8 || Math.abs(lat) > width + e.radius) continue;
        if (contact(game, c, e, cast, { angle: a, factor: 0.5, kbMul: 0 })) {
          carried.set(e, Math.max(-width, Math.min(width, lat)));
          if (e.cast && !e.cast.released) game.cancelCast(e);
        }
      }
    };
    game.sfx?.('dash');
  },
};

// ---------------------------------------------------------------- melee strikes
/** What happens at the moment a melee skill connects. `hits` = several strikes in a row. */
export const MELEE = {
  basic(game, c, t, cast, d) {
    const hits = d.hits || 1;
    for (let k = 0; k < hits; k++) {
      game.after(k * (d.hitGap || 0.12), () => {
        if (!t.alive || c.ko) return;
        const a = c.angleTo(t);
        if (c.distTo(t) <= c.radius + t.radius + 34) contact(game, c, t, cast, { angle: a, factor: 1 / hits });
        else spawnFx(game, MOVEFX.common.dodge, c.x + Math.cos(a) * 26, c.y + Math.sin(a) * 26, { scale: 0.7 });
      }, null);
    }
  },

  /** Slashes and tail swings: hit every foe in a wide arc in front. */
  sweep(game, c, t, cast, d) {
    const a = t.alive ? c.angleTo(t) : cast.faceAngle;
    const reach = (d.reach || 44) + c.radius;
    let any = false;
    for (const e of game.enemiesOf(c)) {
      const off = Math.abs(norm(c.angleTo(e) - a));
      if (c.distTo(e) > reach + e.radius || off > (d.arc || 1.3)) continue;
      if (contact(game, c, e, cast, { angle: c.angleTo(e) })) any = true;
    }
    spawnFx(game, d.arcFx, c.x + Math.cos(a) * 18, c.y - 4 + Math.sin(a) * 12, { angle: a });
    if (!any) spawnFx(game, MOVEFX.common.dodge, c.x + Math.cos(a) * 26, c.y + Math.sin(a) * 26, { scale: 0.7 });
  },

  /** Sky Uppercut: launches the target into the air. */
  uppercut(game, c, t, cast, d) {
    if (!t.alive || c.distTo(t) > c.radius + t.radius + 34) return MELEE.basic(game, c, t, cast, { hits: 1 });
    if (contact(game, c, t, cast, { angle: c.angleTo(t), kbMul: 0.2 })) launch(game, t, d.height || 46, 0.55);
  },

  /** Body Slam / Hammer Arm: comes down on the target with a small shockwave. */
  slam(game, c, t, cast, d) {
    for (const e of game.enemiesOf(c)) {
      if (c.distTo(e) > c.radius + e.radius + (d.splash || 30)) continue;
      contact(game, c, e, cast, { angle: c.angleTo(e) });
    }
    spawnFx(game, d.land, c.x, c.y, { layer: 'under' });
    game.shake(d.shake || 5, 0.25);
  },

  /** Close Combat / Play Rough: a flurry of quick hits, stepping in a little each time. */
  combo(game, c, t, cast, d) {
    // Tail Slap: 2-5 hits (Skill Link: 5).
    const hits = d.randomHits ? (ab(c, 'skilllink') ? 5 : [2, 2, 2, 3, 3, 3, 4, 5][Math.floor(Math.random() * 8)]) : d.hits || 4;
    for (let k = 0; k < hits; k++) {
      game.after(k * (d.hitGap || 0.09), () => {
        if (!t.alive || c.ko) return;
        const a = c.angleTo(t);
        if (c.distTo(t) > c.radius + t.radius + 6) {
          c.x += Math.cos(a) * 6;
          c.y += Math.sin(a) * 6;
          c.clamp();
        }
        c.ghost();
        const last = k === hits - 1;
        if (c.distTo(t) <= c.radius + t.radius + 34) {
          const side = (k % 2 ? 1 : -1) * 8;
          contact(game, c, t, cast, { angle: a, factor: 1 / hits, kbMul: last ? 1.4 : 0.15, at: { x: t.x - Math.sin(a) * side, y: t.y + Math.cos(a) * side } });
        }
      }, null);
    }
  },

  /** Sacred Sword: one spin of the blade that hits every foe all around. */
  whirl(game, c, t, cast, d) {
    const reach = (d.reach || 48) + c.radius;
    for (const e of game.enemiesOf(c)) {
      if (c.distTo(e) > reach + e.radius) continue;
      contact(game, c, e, cast, { angle: c.angleTo(e) });
    }
    for (let i = 0; i < 4; i++) {
      game.after(i * 0.06, () => {
        c.dir = (c.dir + 2) % 8;
        const a = (i / 4) * Math.PI * 2;
        spawnFx(game, d.arcFx, c.x + Math.cos(a) * 22, c.y - 4 + Math.sin(a) * 14, { angle: a });
      }, null);
    }
    game.shake(d.shake || 3, 0.2);
  },

  /** Low Sweep: kicks the legs out; the target trips and falls for a moment. */
  trip(game, c, t, cast, d) {
    if (!t.alive || c.distTo(t) > c.radius + t.radius + 34) return MELEE.basic(game, c, t, cast, { hits: 1 });
    if (!contact(game, c, t, cast, { angle: c.angleTo(t), kbMul: 0.2 })) return;
    launch(game, t, 10, 0.25);
    t.stunT = Math.max(t.stunT, 0.5);
    game.after(0.25, () => spawnFx(game, d.land, t.x, t.y, { layer: 'under' }), null);
  },

  /** Rage Fist: one more punch for every two hits the user has taken (2 to 6 punches). */
  rage(game, c, t, cast, d) {
    const hits = Math.max(2, Math.min(6, 2 + Math.floor((c.timesHit || 0) / 2)));
    MELEE.combo(game, c, t, cast, { ...d, hits });
    if ((c.timesHit || 0) >= 4) spawnFx(game, d.hit2, c.x, c.y - 10, { follow: c });
  },

  /** Triple Kick: three spinning kicks, each one stronger; the first one that misses ends it. */
  triple(game, c, t, cast, d) {
    const gap = d.hitGap || 0.16;
    let on = true;
    for (let k = 0; k < 3; k++) {
      game.after(k * gap, () => {
        if (!on || !t.alive || c.ko) return;
        c.dir = (c.dir + 3) % 8;
        c.ghost(d.ghostTint);
        const a = c.angleTo(t);
        if (c.distTo(t) > c.radius + t.radius + 36 || !contact(game, c, t, cast, { angle: a, factor: k + 1, kbMul: k === 2 ? 1.3 : 0.2 })) {
          on = false;
          spawnFx(game, MOVEFX.common.dodge, c.x + Math.cos(a) * 26, c.y + Math.sin(a) * 26, { scale: 0.7 });
          return;
        }
        game.shake(2 + k, 0.12);
      }, null);
    }
  },

  /** Seismic Toss: grabs the target, swings it up over its head and slams it down behind. */
  throw(game, c, t, cast, d) {
    if (!t.alive || c.distTo(t) > c.radius + t.radius + 34) return MELEE.basic(game, c, t, cast, { hits: 1 });
    if (game.dodges(c, t)) return void game.dodgedText(t);
    if (t.cast && !t.cast.released) game.cancelCast(t);
    const from = { x: t.x, y: t.y };
    const back = c.angleTo(t) + Math.PI;
    const to = { x: c.x + Math.cos(back) * (c.radius + t.radius + 10), y: c.y + Math.sin(back) * (c.radius + t.radius + 10) * 0.7 };
    const time = d.throwTime || 0.45;
    t.stunT = Math.max(t.stunT, time + 0.2);
    spawnFx(game, d.grab, t.x, t.y - 8);
    let tt = 0;
    game.addUpdater((dt) => {
      tt += dt;
      if (!t.alive) return true;
      const k = Math.min(1, tt / time);
      t.x = from.x + (to.x - from.x) * k;
      t.y = from.y + (to.y - from.y) * k;
      t.lift = Math.sin(k * Math.PI) * (d.height || 70);
      if (k < 1) return false;
      t.lift = 0;
      t.clamp();
      game.applyHit(c, t, cast, { angle: back, kbMul: 0.4 });
      spawnFx(game, d.land, t.x, t.y, { layer: 'under' });
      game.shake(d.shake || 8, 0.3);
      game.sfx?.('boom');
      return true;
    });
  },

  /** Plasma Fists: blinks around the target, punching from every side. */
  flurry(game, c, t, cast, d) {
    const hits = d.hits || 4;
    const start = t.angleTo(c);
    const turn = Math.random() < 0.5 ? 1 : -1;
    for (let k = 0; k < hits; k++) {
      game.after(k * (d.hitGap || 0.11), () => {
        if (!t.alive || c.ko) return;
        c.ghost(d.ghostTint);
        const ang = start + turn * (k + 1) * ((Math.PI * 2) / hits) * 0.75;
        c.x = t.x + Math.cos(ang) * (t.radius + c.radius + 2);
        c.y = t.y + Math.sin(ang) * (t.radius + c.radius + 2) * 0.7;
        c.clamp();
        const a = c.angleTo(t);
        cast.faceAngle = a;
        c.dir = angleToDir(a);
        spawnFx(game, d.blink, c.x, c.y, { layer: 'under', scale: 0.7 });
        contact(game, c, t, cast, { angle: a, factor: 1 / hits, kbMul: k === hits - 1 ? 1.4 : 0.1 });
      }, null);
    }
  },

  /** Ivy Cudgel: leaps up with the club raised and smashes it down; the target is dazed. */
  axe(game, c, t, cast, d) {
    let any = false;
    const a = t.alive ? c.angleTo(t) : cast.faceAngle;
    for (const e of game.enemiesOf(c)) {
      if (c.distTo(e) > c.radius + e.radius + (d.splash || 26)) continue;
      if (contact(game, c, e, cast, { angle: c.angleTo(e), kbMul: 0.3 })) {
        any = true;
        e.stunT = Math.max(e.stunT, d.daze || 0.3);
      }
    }
    spawnFx(game, d.land, c.x + Math.cos(a) * 18, c.y + Math.sin(a) * 12, { layer: 'under' });
    game.shake(any ? d.shake || 7 : 3, 0.25);
  },

  /** Double Iron Bash: two heavy blows, one from each side, each with a shockwave. */
  twin(game, c, t, cast, d) {
    for (let k = 0; k < 2; k++) {
      game.after(k * (d.hitGap || 0.22), () => {
        if (!t.alive || c.ko) return;
        const a = c.angleTo(t);
        const side = (k ? 1 : -1) * 10;
        c.lift = 0;
        if (c.distTo(t) <= c.radius + t.radius + 36) {
          contact(game, c, t, cast, { angle: a, kbMul: k ? 1.3 : 0.2, at: { x: t.x - Math.sin(a) * side, y: t.y + Math.cos(a) * side } });
        }
        spawnFx(game, d.land, t.x - Math.sin(a) * side, t.y + 2, { layer: 'under' });
        game.shake(d.shake || 6, 0.2);
        c.ghost(d.ghostTint);
      }, null);
    }
  },

  /** Dragon Tail: a heavy swing that flings the target far away; in Trio a random teammate is dragged in. */
  hurl(game, c, t, cast, d) {
    if (!t.alive || c.distTo(t) > c.radius + t.radius + 36) return MELEE.basic(game, c, t, cast, { hits: 1 });
    if (!contact(game, c, t, cast, { angle: c.angleTo(t), kbMul: d.fling || 3.5 })) return;
    launch(game, t, 26, 0.4);
    game.after(0.4, () => game.dragOut?.(t), null);
  },

  /** Crunch / Fangs: bites and holds the target in place, then bites again. */
  clamp(game, c, t, cast, d) {
    if (!t.alive || c.distTo(t) > c.radius + t.radius + 34) return MELEE.basic(game, c, t, cast, { hits: 1 });
    if (!contact(game, c, t, cast, { angle: c.angleTo(t), factor: 0.6, kbMul: 0 })) return;
    const hold = d.hold || 0.45;
    t.stunT = Math.max(t.stunT, hold);
    const a = c.angleTo(t);
    let tt = 0;
    game.addUpdater((dt) => {
      tt += dt;
      if (!t.alive || c.ko) return true;
      t.x += (c.x + Math.cos(a) * (c.radius + t.radius - 4) - t.x) * Math.min(1, dt * 12);
      t.y += (c.y + Math.sin(a) * (c.radius + t.radius - 4) * 0.8 - t.y) * Math.min(1, dt * 12);
      return tt >= hold;
    });
    game.after(hold, () => {
      if (t.alive && !c.ko) contact(game, c, t, cast, { angle: a, factor: 0.4, kbMul: 1.2 });
    }, null);
  },
};
