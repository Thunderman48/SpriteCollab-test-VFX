// CPU player for any slot. It only produces the inputs a human has:
// a movement vector, dodge presses and (in Trio) switch presses.
import { MOVEFX } from './moves.js';
import { wantsMove } from './effects.js';

export class Bot {
  constructor(game, slot) {
    this.game = game;
    this.slot = slot;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.strafeT = 0;
    this.react = 0;
  }

  think(dt) {
    const g = this.game;
    const me = g.activeOf(this.slot);
    const foe = me && g.nearestEnemy(me);
    if (!me || !foe || me.ko) return { x: 0, y: 0, dodgePressed: false, switchPressed: false };

    // Preferred distance: reach of the move that's coming off cooldown soonest.
    let soon = null;
    for (const id of me.moves) if (MOVEFX.moves[id].behavior !== 'self' && (!soon || me.cd[id] < me.cd[soon])) soon = id;
    const want = Math.max(50, Math.min(220, (soon ? MOVEFX.moves[soon].range : 150) * 0.7));
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

    // Walk around the foes' Spikes / Stealth Rock.
    for (const o of g.objects) {
      if (!o.hazard || o.owner.team === me.team) continue;
      const dx = me.x - o.x;
      const dy = me.y - o.y;
      const dd = Math.hypot(dx, dy);
      if (dd < 34 && dd > 0.1) {
        x += (dx / dd) * 1.2;
        y += (dy / dd) * 1.2;
      }
    }

    // Moves only fire while standing still: stop when one is ready (or while attacking).
    const ready = (me.lock ? [me.lock.id] : me.moves).find((id) => me.cd[id] <= 0 && wantsMove(g, me, id, foe));
    if (me.cast || ready || me.stunned) {
      x = 0;
      y = 0;
    }

    // Dodge incoming projectiles / standing in a warning circle / point-blank dashes.
    let danger = null;
    for (const o of g.objects) {
      if (o.speed && o.owner && o.owner.team !== me.team) {
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
    // Trio: pull out a badly hurt Pokémon if a healthier one is waiting.
    let switchPressed = false;
    if (g.canSwitch(this.slot) && me.hp < me.maxHp * 0.25 && !me.cast && Math.random() < dt * 0.8) {
      switchPressed = g.benchOf(this.slot).some((f) => f.hp > me.hp * 2);
    }
    const len = Math.hypot(x, y);
    return len ? { x: x / len, y: y / len, dodgePressed, switchPressed } : { x: 0, y: 0, dodgePressed, switchPressed };
  }
}
