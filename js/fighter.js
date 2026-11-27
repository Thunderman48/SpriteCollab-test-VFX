// A Pokémon in the arena: movement, dodge, auto-cast scheduling, hurt/faint.
import { SpriteAnimator, angleToDir } from './sprite.js';
import { statsFor, HP_SCALE, DB, effectiveness } from './combat.js';
import { startCast, cancelCast, MOVEFX } from './moves.js';
import { Effect } from './vfx.js';

const DODGE_TIME = 0.2;
const DODGE_SPEED = 400;
const DODGE_INVULN = 0.3;
export const DODGE_COOLDOWN = 1.2;

export class Fighter {
  constructor(game, slot, data, art, x, y) {
    this.game = game;
    this.slot = slot;
    this.data = data;
    this.art = art;
    this.sprite = new SpriteAnimator(art);
    this.stats = statsFor(data.baseStats);
    this.maxHp = this.stats.hp * HP_SCALE;
    this.hp = this.maxHp;
    this.radius = data.hurtRadius;
    this.x = x;
    this.y = y;
    this.dir = slot === 0 ? 2 : 6;
    this.moveSpeed = 78 + this.stats.spe * 0.3;
    // Faster Pokémon recharge a little quicker (±~10%).
    this.recharge = 1 + (this.stats.spe - 115) / 350;
    this.cd = {};
    for (const id of data.moves) this.cd[id] = DB.moves[id].cooldown * (0.35 + Math.random() * 0.3);
    this.cast = null;
    this.castGap = 0.6;
    this.dodgeT = 0;
    this.dodgeCd = 0;
    this.dodgeAngle = 0;
    this.invuln = 0;
    this.flash = 0;
    this.hurtT = 0;
    this.kbx = 0;
    this.kby = 0;
    this.ko = false;
    this.koT = 0;
    this.moving = false;
    this.emotion = 'Normal';
    this.emotionT = 0;
  }

  get alive() {
    return !this.ko;
  }

  angleTo(o) {
    return Math.atan2(o.y - this.y, o.x - this.x);
  }

  distTo(o) {
    return Math.hypot(o.x - this.x, o.y - this.y);
  }

  setEmotion(e, t = 0.8) {
    if (this.art.portraits[e]) {
      this.emotion = e;
      this.emotionT = t;
    }
  }

  takeHit(dmg, angle) {
    this.hp = Math.max(0, this.hp - dmg);
    this.flash = 0.75;
    const kb = dmg > 0 ? 160 : 40;
    this.kbx = Math.cos(angle) * kb;
    this.kby = Math.sin(angle) * kb;
    this.setEmotion('Pain');
    if (this.hp <= 0) return this.faint();
    if (!this.cast && this.dodgeT <= 0) {
      this.hurtT = 0.3;
      this.sprite.play('Hurt', { loop: false, restart: true });
    }
  }

  faint() {
    if (this.ko) return;
    this.ko = true;
    this.koT = 0;
    if (this.cast) cancelCast(this.game, this);
    this.sprite.play(this.sprite.has('Faint') ? 'Faint' : 'Hurt', { loop: false, restart: true });
    this.game.addEffect(new Effect(MOVEFX.common.ko, this.x, this.y, { layer: 'over' }));
    this.game.onKO(this);
  }

  startDodge(input) {
    if (this.dodgeCd > 0 || this.ko) return;
    // Dodging interrupts your own cast: an unreleased move stays ready, a released
    // one keeps whatever it already fired (projectiles, beams, pending hits).
    if (this.cast) cancelCast(this.game, this);
    const len = Math.hypot(input.x, input.y);
    this.dodgeAngle = len > 0.2 ? Math.atan2(input.y, input.x) : ((90 - this.dir * 45) * Math.PI) / 180;
    this.dodgeT = DODGE_TIME;
    this.invuln = DODGE_INVULN;
    this.dodgeCd = DODGE_COOLDOWN;
    this.dir = angleToDir(this.dodgeAngle);
    this.sprite.play('Hop', { loop: false, restart: true, speed: 1.6 });
    this.game.addEffect(new Effect(MOVEFX.common.dodge, this.x, this.y + 6, { layer: 'under' }));
    this.game.sfx?.('dodge');
  }

  update(dt, input, opp) {
    this.sprite.update(dt);
    this.flash = Math.max(0, this.flash - dt * 7);
    if (this.emotionT > 0 && (this.emotionT -= dt) <= 0) this.emotion = 'Normal';
    if (this.ko) {
      this.koT += dt;
      return;
    }
    this.invuln = Math.max(0, this.invuln - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.castGap = Math.max(0, this.castGap - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    if (this.game.state === 'fight') {
      for (const id in this.cd) this.cd[id] = Math.max(0, this.cd[id] - dt * this.recharge);
    }

    if (input.dodgePressed && this.game.state === 'fight') this.startDodge(input);

    let vx = 0;
    let vy = 0;
    const len = Math.min(1, Math.hypot(input.x, input.y));
    this.moving = false;
    if (this.dodgeT > 0) {
      this.dodgeT -= dt;
      vx = Math.cos(this.dodgeAngle) * DODGE_SPEED;
      vy = Math.sin(this.dodgeAngle) * DODGE_SPEED;
      if (Math.random() < dt * 30) {
        this.game.addEffect(new Effect(MOVEFX.common.dodge, this.x, this.y + 6, { layer: 'under', scale: 0.6 }));
      }
    } else if (this.cast?.drive) {
      this.cast.drive(dt);
    } else if (len > 0.15 && this.game.state === 'fight') {
      const mul = this.cast ? this.cast.moveMul ?? 0.35 : 1;
      const a = Math.atan2(input.y, input.x);
      vx = Math.cos(a) * len * this.moveSpeed * mul;
      vy = Math.sin(a) * len * this.moveSpeed * mul;
      this.moving = mul > 0;
      if (!this.cast) this.dir = angleToDir(a);
    }
    this.x += (vx + this.kbx) * dt;
    this.y += (vy + this.kby) * dt;
    const damp = Math.exp(-dt * 10);
    this.kbx *= damp;
    this.kby *= damp;
    this.clamp();

    if (this.cast) {
      if (this.cast.track && opp) this.cast.faceAngle = this.angleTo(opp);
      this.dir = angleToDir(this.cast.faceAngle);
    }

    if (!this.cast && this.dodgeT <= 0 && this.hurtT <= 0) {
      this.sprite.play(this.moving ? 'Walk' : 'Idle');
    }

    if (this.game.state === 'fight' && opp && opp.alive) this.tryAutoCast(opp);
  }

  clamp() {
    const b = this.game.bounds;
    this.x = Math.max(b.x0 + this.radius, Math.min(b.x1 - this.radius, this.x));
    this.y = Math.max(b.y0 + 4, Math.min(b.y1 - 4, this.y));
  }

  /** Fire the strongest ready move whose range reaches the opponent. */
  tryAutoCast(opp) {
    if (this.cast || this.castGap > 0 || this.dodgeT > 0) return;
    const d = this.distTo(opp);
    let best = null;
    for (const id of this.data.moves) {
      if (this.cd[id] > 0) continue;
      // Auto-attacks are smart enough not to waste a move the target is immune to.
      if (effectiveness(DB.moves[id].type, opp.data.types) === 0) continue;
      const fx = MOVEFX.moves[id];
      if (d > fx.range + opp.radius) continue;
      if (!best || DB.moves[id].cooldown > DB.moves[best].cooldown) best = id;
    }
    if (best) startCast(this.game, this, opp, best);
  }

  draw(ctx) {
    let alpha = 1;
    if (this.ko) alpha = Math.max(0, 1 - Math.max(0, this.koT - 0.6) / 0.8);
    else if (this.invuln > 0) alpha = 0.55;
    const bob = this.data.flying ? Math.sin(this.game.time * 3 + this.slot) * 2 : 0;
    // Shadow
    ctx.save();
    ctx.globalAlpha = 0.35 * alpha;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    const sw = Math.max(8, this.radius * (this.data.flying ? 1.1 : 0.9));
    ctx.ellipse(Math.round(this.x), Math.round(this.y + 7), sw, sw * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    this.sprite.draw(ctx, this.x, this.y + bob - (this.data.flying ? 6 : 0), this.dir, { flash: this.flash, alpha });
  }
}
