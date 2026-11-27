// Optional CPU opponent (select "P2: CPU", or ?cpu / ?cpu=both in the URL).
// It only produces the same inputs a human has: a movement vector and dodge presses.
import { MOVEFX } from './moves.js';
import { DB, effectiveness } from './combat.js';

export class Bot {
  constructor(game, slot) {
    this.game = game;
    this.slot = slot;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.strafeT = 0;
    this.react = 0;
    this.planted = false;
    this.phaseT = 0.5;
  }

  think(dt) {
    const g = this.game;
    const me = g.fighters[this.slot];
    const foe = g.fighters[1 - this.slot];
    if (!me || !foe || me.ko || foe.ko) return { x: 0, y: 0, dodgePressed: false };

    // Preferred distance: reach of the move that's coming off cooldown soonest.
    let soon = null;
    for (const id of me.data.moves) if (!soon || me.cd[id] < me.cd[soon]) soon = id;
    const want = Math.max(50, Math.min(220, MOVEFX.moves[soon].range * 0.7));
    const d = me.distTo(foe);
    const a = me.angleTo(foe);
    this.strafeT -= dt;
    if (this.strafeT <= 0) {
      this.strafeT = 0.8 + Math.random() * 1.4;
      if (Math.random() < 0.5) this.strafe *= -1;
    }
    const radial = d > want + 20 ? 1 : d < want - 20 ? -1 : 0;
    let x = Math.cos(a) * radial - Math.sin(a) * this.strafe * 0.7;
    let y = Math.sin(a) * radial + Math.cos(a) * this.strafe * 0.7;
    // Keep away from walls.
    const b = g.bounds;
    if (me.x < b.x0 + 40) x += 1;
    if (me.x > b.x1 - 40) x -= 1;
    if (me.y < b.y0 + 30) y += 1;
    if (me.y > b.y1 - 20) y -= 1;

    // Attacks only charge and fire while standing still, so alternate repositioning with planting.
    this.phaseT -= dt;
    if (this.phaseT <= 0) {
      this.planted = !this.planted;
      this.phaseT = this.planted ? 1 + Math.random() * 1.2 : 0.5 + Math.random() * 0.8;
    }
    const ready = me.data.moves.find(
      (id) => me.cd[id] <= 0 && d <= MOVEFX.moves[id].range + foe.radius && effectiveness(DB.moves[id].type, foe.data.types) > 0,
    );
    const aimOff = Math.abs(Math.atan2(Math.sin(a - me.aimAngle), Math.cos(a - me.aimAngle)));
    if (me.cast) {
      // Rooted while attacking: a direction only turns the aim of a charging aimed move.
      const turn = me.cast.aimFacing && !me.cast.released;
      x = turn ? Math.cos(a) : 0;
      y = turn ? Math.sin(a) : 0;
    } else if (ready) {
      if (MOVEFX.moves[ready].aim === 'facing' && aimOff > 0.25) {
        const err = (Math.random() - 0.5) * 0.3; // tap toward the target to aim, a bit sloppily
        x = Math.cos(a + err);
        y = Math.sin(a + err);
      } else {
        x = 0;
        y = 0;
      }
    } else if (this.planted) {
      x = 0;
      y = 0;
    }

    // Dodge incoming projectiles / standing in a warning circle / point-blank dashes.
    let danger = null;
    for (const o of g.objects) {
      if (o.target === me && o.speed) {
        const dx = me.x - o.x;
        const dy = me.y - o.y;
        const dist = Math.hypot(dx, dy);
        const heading = (dx * Math.cos(o.angle) + dy * Math.sin(o.angle)) / (dist || 1);
        if (dist < 70 && heading > 0.8) danger = Math.atan2(dy, dx) + Math.PI / 2;
      } else if (o.radius && o.time && o.t > o.time * 0.5 && Math.hypot(me.x - o.x, me.y - o.y) < o.radius + me.radius) {
        danger = Math.atan2(me.y - o.y, me.x - o.x);
      }
    }
    if (foe.cast && !foe.cast.released && foe.cast.def.behavior === 'beam' && Math.random() < 0.03) danger = a + Math.PI / 2;
    let dodgePressed = false;
    this.react -= dt;
    if (danger !== null && me.dodgeCd <= 0 && this.react <= 0) {
      if (Math.random() < 0.55) {
        dodgePressed = true;
        x = Math.cos(danger);
        y = Math.sin(danger);
      }
      this.react = 0.35;
    }
    const len = Math.hypot(x, y);
    return len ? { x: x / len, y: y / len, dodgePressed } : { x: 0, y: 0, dodgePressed };
  }
}
