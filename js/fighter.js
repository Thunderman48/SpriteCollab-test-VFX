// A Pokémon in the arena: movement, dodge, auto-cast scheduling, hurt/faint.
import { SpriteAnimator, angleToDir } from './sprite.js';
import { statsFor, HP_SCALE, DB, effectiveness } from './combat.js';
import { effectiveBase } from './modes.js';
import { startCast, cancelCast, MOVEFX } from './moves.js';
import { Effect, FloatText } from './vfx.js';
import { equip, unequip } from './items.js';
import { t, itemName, abilityName } from './i18n.js';
import { ab, stageOf, stageMul, tickFighter, beforeCast, wantsMove, weatherNow } from './effects.js';

export const PLAYER_COLORS = ['#88c8f8', '#f8a0c8', '#88f888', '#f8e860'];
const DODGE_TIME = 0.2;
const DODGE_SPEED = 400;
const DODGE_INVULN = 0.3;
export const DODGE_COOLDOWN = 1.2;

export class Fighter {
  /**
   * slot = player index (0-3), team = 0/1, member = party member data
   * ({ species, item, moves, ... } from modes.js).
   */
  constructor(game, slot, team, member, art, x, y) {
    const data = DB.pokedex[member.species];
    this.game = game;
    this.slot = slot;
    this.team = team;
    this.member = member;
    this.data = data;
    this.moves = member.moves;
    this.art = art;
    this.sprite = new SpriteAnimator(art);
    // Nature + Stat Points on top of the rule-adjusted base stats (Balanced).
    this.rawStats = statsFor(effectiveBase(game.rule || 'standard', member.species), member);
    this.stats = { ...this.rawStats };
    this.ability = data.abilities.includes(member.ability) ? member.ability : data.abilities[0];
    this.maxHp = this.stats.hp * HP_SCALE;
    this.hp = this.maxHp;
    this.radius = data.hurtRadius;
    this.x = x;
    this.y = y;
    this.dir = team === 0 ? 2 : 6;
    this.facing = team === 0 ? 0 : Math.PI; // last movement direction (default dodge direction)
    this.moveSpeed = 64 + this.stats.spe * 0.22;
    this.recharge = 1;
    // Battle effects (js/effects.js): timed stat stages, status, short-lived states.
    this.boosts = {};
    this.status = null;
    this.statusImmune = 0;
    this.confusedT = 0;
    this.chillT = 0;
    this.roostT = 0;
    this.protectT = 0;
    this.rechargeT = 0;
    this.pendingRecharge = 0;
    this.lock = null; // Outrage
    this.flashFire = false;
    // Skill order: skill 1 is ready first, then 2, 3, 4; afterwards the top ready skill wins.
    this.cd = {};
    this.moves.forEach((id, i) => (this.cd[id] = 0.3 + 0.8 * i));
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
    this.still = true;
    this.emotion = 'Normal';
    this.emotionT = 0;
    equip(this, member.item);
    this.refreshSpeed();
  }

  /** Types right now (Roost removes Flying for a moment). */
  get types() {
    if (this.roostT > 0) {
      const t2 = this.data.types.filter((x) => x !== 'Flying');
      return t2.length ? t2 : ['Normal'];
    }
    return this.data.types;
  }

  abilityName() {
    return abilityName(this.ability, this.data.abilityNames?.[this.ability]);
  }

  itemLabel() {
    return this.item ? `<span class="yellow">${itemName(this.item)}</span>` : '';
  }

  /** Knock Off: the held item is gone for the rest of the battle. */
  loseItem() {
    unequip(this);
    this.refreshSpeed();
  }

  /** Illusion: look like another Pokémon (the foe) until hit. */
  setIllusion(art) {
    this.illusion = new SpriteAnimator(art);
  }

  breakIllusion() {
    if (!this.illusion) return;
    this.illusion = null;
    this.illusionBroken = true;
    this.game.addEffect(new Effect(MOVEFX.common.dodge, this.x, this.y - 6, { scale: 1.4 }));
    this.game.addEffect(new FloatText(this.abilityName(), this.x, this.y - 44, '#f8e048'));
    this.game.ui.log(t('illusionBroke', { who: this.game.who(this) }));
  }

  get stunned() {
    return this.status?.id === 'slp' || this.status?.id === 'frz' || this.rechargeT > 0;
  }

  /**
   * A stat with its timed stage and ability/weather modifiers.
   * critSide 'atk' ignores the attacker's drops, 'def' ignores the defender's raises.
   */
  statVal(k, critSide = null) {
    let n = stageOf(this, k);
    if ((critSide === 'atk' && n < 0) || (critSide === 'def' && n > 0)) n = 0;
    let v = this.stats[k] * stageMul(n);
    const w = weatherNow(this.game);
    if (k === 'atk' && ab(this, 'guts') && this.status) v *= 1.5;
    if (k === 'atk' && ab(this, 'hustle')) v *= 1.5;
    if (k === 'spa' && ab(this, 'solarpower') && w === 'sunnyday') v *= 1.5;
    if (k === 'spd' && w === 'sandstorm' && this.types.includes('Rock')) v *= 1.5;
    if (k === 'spe' && ab(this, 'chlorophyll') && w === 'sunnyday') v *= 1.5;
    if (k === 'spe' && ab(this, 'unburden') && this.itemGone) v *= 1.5;
    if (k === 'spe' && ab(this, 'quickfeet') && this.status) v *= 1.5;
    if (k === 'spe' && ab(this, 'sandrush') && w === 'sandstorm') v *= 1.5;
    if (k === 'def' && ab(this, 'marvelscale') && this.status) v *= 1.5;
    return v;
  }

  /** Movement speed + cooldown recharge from Speed (stages, paralysis, chill, Pressure...). */
  refreshSpeed() {
    const spe = this.statVal('spe');
    const ratio = Math.sqrt(spe / this.stats.spe); // stages help, but walking speed can't explode
    let move = (64 + this.stats.spe * 0.22 * ratio) * (this.mods?.speedMul ?? 1);
    if (ab(this, 'lightmetal')) move *= 1.1;
    if (this.status?.id === 'par' && !ab(this, 'quickfeet')) move *= 0.5;
    if (this.chillT > 0) move *= 0.6;
    this.moveSpeed = move;
    // Faster Pokémon recharge a little quicker (±~10% at +0).
    let r = Math.max(0.75, Math.min(1.6, 1 + (spe - 115) / 350));
    if (this.status?.id === 'par') r *= 0.75;
    if (this.game.enemiesOf?.(this).some((e) => ab(e, 'pressure'))) r *= 0.85;
    this.recharge = r;
  }

  /** Mark a one-shot held item (berry / seed) as used, with log + sparkle. */
  useItem(message) {
    this.itemSpent = true;
    this.itemGone = true; // Unburden
    this.game.ui.log(message);
    this.game.addEffect(new Effect(MOVEFX.common.spawn, this.x, this.y, { layer: 'over' }));
    this.game.sfx?.('go');
  }

  heal(amount) {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    return this.hp - before;
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

  takeHit(dmg, angle, kbMul = 1) {
    this.hp = Math.max(0, this.hp - dmg);
    if (dmg > 0 && this.illusion) this.breakIllusion();
    this.flash = 0.75;
    this.metroStacks = 0; // Metronome streak breaks when you're hit
    const kb = this.mods.noKnockback ? 0 : (dmg > 0 ? 160 : 40) * kbMul;
    this.kbx = Math.cos(angle) * kb;
    this.kby = Math.sin(angle) * kb;
    this.setEmotion('Pain');
    if (this.hp <= 0) return this.faint();
    const berryAt = ab(this, 'gluttony') ? 0.75 : 0.5;
    const unnerved = this.game.enemiesOf?.(this).some((e) => ab(e, 'unnerve'));
    if (this.mods.sitrus && !this.itemSpent && !unnerved && this.hp < this.maxHp * berryAt) {
      const healed = this.heal(Math.round(this.maxHp * this.mods.sitrus));
      this.useItem(t('sitrus', { who: this.game.who(this), item: `<span class="yellow">${itemName(this.item)}</span>`, n: healed }));
    }
    if (!this.cast && this.dodgeT <= 0 && !this.mods.noKnockback) {
      this.hurtT = 0.3;
      this.sprite.play('Hurt', { loop: false, restart: true });
    }
  }

  faint() {
    if (this.ko) return;
    if (this.mods.revive && !this.itemSpent) {
      // Reviver Seed: get back up instead of fainting.
      this.hp = Math.round(this.maxHp * this.mods.revive);
      this.invuln = 1;
      if (this.cast) cancelCast(this.game, this);
      this.useItem(t('reviveLog', { who: this.game.who(this), item: `<span class="yellow">${itemName(this.item)}</span>` }));
      this.game.addEffect(new Effect(MOVEFX.common.ko, this.x, this.y, { layer: 'over' }));
      this.game.addEffect(new FloatText(t('revived'), this.x, this.y - 26, '#f8f800'));
      return;
    }
    this.ko = true;
    this.koT = 0;
    if (this.cast) cancelCast(this.game, this);
    this.sprite.play(this.sprite.has('Faint') ? 'Faint' : 'Hurt', { loop: false, restart: true });
    this.game.addEffect(new Effect(MOVEFX.common.ko, this.x, this.y, { layer: 'over' }));
    this.game.onKO(this);
  }

  startDodge(input) {
    if (this.dodgeCd > 0 || this.ko || this.stunned) return;
    // Dodging interrupts your own cast: an unreleased move stays ready, a released
    // one keeps whatever it already fired (projectiles, beams, pending hits).
    if (this.cast) cancelCast(this.game, this);
    const len = Math.hypot(input.x, input.y);
    this.dodgeAngle = len > 0.2 ? Math.atan2(input.y, input.x) : this.facing;
    if (this.mods.warpDodge) {
      // Warp Scarf: blink a long way instead of dashing.
      this.game.addEffect(new Effect(MOVEFX.common.dodge, this.x, this.y + 6, { layer: 'under' }));
      this.x += Math.cos(this.dodgeAngle) * 120;
      this.y += Math.sin(this.dodgeAngle) * 120 * 0.8;
      this.clamp();
      this.game.addEffect(new Effect(MOVEFX.common.spawn, this.x, this.y, { layer: 'under' }));
      this.invuln = DODGE_INVULN;
      this.dodgeT = 0;
      this.dodgeCd = DODGE_COOLDOWN;
      this.game.sfx?.('dodge');
      return;
    }
    this.dodgeT = DODGE_TIME;
    this.invuln = DODGE_INVULN;
    this.dodgeCd = DODGE_COOLDOWN * (ab(this, 'runaway') ? 0.7 : 1);
    this.dir = angleToDir(this.dodgeAngle);
    this.sprite.play('Hop', { loop: false, restart: true, speed: 1.6 });
    this.game.addEffect(new Effect(MOVEFX.common.dodge, this.x, this.y + 6, { layer: 'under' }));
    this.game.sfx?.('dodge');
  }

  update(dt, input, opp) {
    if (this.status?.id !== 'frz') this.sprite.update(dt); // frozen solid: the sprite stops
    this.flash = Math.max(0, this.flash - dt * 7);
    if (this.emotionT > 0 && (this.emotionT -= dt) <= 0) this.emotion = 'Normal';
    if (this.ko) {
      this.koT += dt;
      return;
    }
    if (this.game.state === 'fight') tickFighter(this.game, this, dt);
    if (this.ko) return;
    if (!this.cast && this.pendingRecharge) {
      this.rechargeT = this.pendingRecharge; // Hyper Beam / Giga Impact: must recharge
      this.pendingRecharge = 0;
      this.game.ui.log(t('mustRecharge', { who: this.game.who(this) }));
    }
    this.refreshSpeed();
    if (this.stunned) input = { x: 0, y: 0, dodgePressed: false };
    else if (this.confusedT > 0 && (input.x || input.y)) {
      // Confused: steering wobbles.
      const a = Math.atan2(input.y, input.x) + Math.sin(this.game.time * 2.3 + this.slot) * 1.1;
      const l = Math.hypot(input.x, input.y);
      input = { ...input, x: Math.cos(a) * l, y: Math.sin(a) * l };
    }
    this.invuln = Math.max(0, this.invuln - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.castGap = Math.max(0, this.castGap - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    if (input.dodgePressed && this.game.state === 'fight') this.startDodge(input);

    let vx = 0;
    let vy = 0;
    const len = Math.min(1, Math.hypot(input.x, input.y));
    this.moving = false;
    if (len > 0.15 && this.game.state === 'fight' && this.dodgeT <= 0 && !this.cast) this.facing = Math.atan2(input.y, input.x);
    if (this.dodgeT > 0) {
      this.dodgeT -= dt;
      vx = Math.cos(this.dodgeAngle) * DODGE_SPEED;
      vy = Math.sin(this.dodgeAngle) * DODGE_SPEED;
      if (Math.random() < dt * 30) {
        this.game.addEffect(new Effect(MOVEFX.common.dodge, this.x, this.y + 6, { layer: 'under', scale: 0.6 }));
      }
    } else if (this.cast?.drive) {
      this.cast.drive(dt);
    } else if (len > 0.15 && this.game.state === 'fight' && !this.cast) {
      // While attacking you're rooted in place.
      const a = Math.atan2(input.y, input.x);
      vx = Math.cos(a) * len * this.moveSpeed;
      vy = Math.sin(a) * len * this.moveSpeed;
      this.moving = true;
      this.dir = angleToDir(a);
    }
    // Cooldowns always recharge, but a ready move only fires while standing still.
    this.still = !this.moving && this.dodgeT <= 0;
    if (this.game.state === 'fight') {
      for (const id in this.cd) this.cd[id] = Math.max(0, this.cd[id] - dt * this.recharge);
      if (this.still && this.mods.regen) this.heal(this.maxHp * this.mods.regen * dt); // Big Root
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

    if (this.status?.id === 'slp' && !this.cast) this.sprite.play('Sleep');
    else if (!this.cast && this.dodgeT <= 0 && this.hurtT <= 0) {
      this.sprite.play(this.moving ? 'Walk' : 'Idle');
    }

    if (this.game.state === 'fight' && opp && opp.alive) this.tryAutoCast(opp);
  }

  clamp() {
    const b = this.game.bounds;
    this.x = Math.max(b.x0 + this.radius, Math.min(b.x1 - this.radius, this.x));
    this.y = Math.max(b.y0 + 4, Math.min(b.y1 - 4, this.y));
  }

  /**
   * Skill order: fire the top skill (1 → 4) that is ready and useful right now
   * (in range, not immune, not a wasted buff/heal...). Outrage keeps raging.
   */
  tryAutoCast(opp) {
    if (this.cast || this.castGap > 0 || !this.still || this.stunned) return;
    const list = this.lock ? [this.lock.id] : this.moves;
    for (const id of list) {
      if (this.cd[id] > 0) continue;
      if (!wantsMove(this.game, this, id, opp)) continue;
      if (beforeCast(this.game, this, opp, id)) startCast(this.game, this, opp, id);
      return;
    }
  }

  draw(ctx) {
    if (this.hidden) return; // vanished (Shadow Force)
    const frozen = this.status?.id === 'frz';
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
    const sy = this.y + bob - (this.data.flying ? 6 : 0);
    const st = this.status?.id;
    const pulse = 0.5 + 0.5 * Math.sin(this.game.time * 6);
    const tint = frozen ? '#a8e0ff' : this.protectT > 0 ? '#88f8f8' : st === 'brn' ? '#f86030' : st === 'par' ? '#f8e048' : st === 'psn' || st === 'tox' ? '#b048f8' : null;
    const tintAmt = frozen ? 0.6 : this.protectT > 0 ? 0.35 : tint ? 0.15 + 0.15 * pulse : 0;
    // Illusion: the disguise copies whatever animation the real sprite is playing.
    let spr = this.sprite;
    if (this.illusion) {
      spr = this.illusion;
      if (spr.name !== spr.resolve(this.sprite.name)) spr.play(this.sprite.name, { loop: this.sprite.loop, restart: true });
      spr.update(1 / 60);
    }
    spr.draw(ctx, this.x, sy, this.dir, { flash: this.flash, alpha, tint, tintAmt });
    if (!this.ko) this.drawTag(ctx, sy);
  }

  /** "P1".."P4" tag above the head so every player can find their Pokémon. */
  drawTag(ctx, sy) {
    const idle = this.art.animData.anims.Idle;
    const y = Math.round(sy - Math.min(idle.fh / 2, 40) - 2);
    const text = `P${this.slot + 1}`;
    ctx.save();
    ctx.font = '12px PMD, Galmuri11';
    const w = ctx.measureText(text).width;
    const x = Math.round(this.x - w / 2);
    ctx.fillStyle = '#000';
    ctx.fillText(text, x + 1, y);
    ctx.fillText(text, x, y + 1);
    ctx.fillText(text, x + 1, y + 1);
    ctx.fillStyle = PLAYER_COLORS[this.slot];
    ctx.fillText(text, x, y);
    ctx.restore();
  }

}
