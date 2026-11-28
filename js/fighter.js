// A Pokémon in the arena: movement, dodge, auto-cast scheduling, hurt/faint.
import { SpriteAnimator, angleToDir } from './sprite.js';
import { statsFor, HP_SCALE, DB, effectiveness } from './combat.js';
import { effectiveBase } from './modes.js';
import { startCast, cancelCast, MOVEFX } from './moves.js';
import { Effect, FloatText } from './vfx.js';
import { equip, unequip, baseMods } from './items.js';
import { t, itemName, abilityName } from './i18n.js';
import { ab, stageOf, stageMul, tickFighter, beforeCast, wantsMove, weatherNow, loseFocus, trapped, sideOn, trickRoom, terrainNow } from './effects.js';

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
    // Shedinja always has 1 HP.
    this.maxHp = data.baseStats.hp === 1 ? HP_SCALE : this.stats.hp * HP_SCALE;
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
    this.protectKind = null;
    this.timesHit = 0; // Rage Fist
    this.bladeT = 0; // Stance Change
    this.glaiveT = 0; // Glaive Rush: takes double damage meanwhile
    this.seed = null; // Leech Seed
    this.salt = null; // Salt Cure
    this.zen = false; // Zen Mode (Darmanitan)
    this.hero = false; // Zero to Hero (Palafin)
    this.burrowing = false; // Dig
    this.rechargeT = 0;
    this.pendingRecharge = 0;
    this.lock = null; // Outrage
    this.flashFire = false;
    // Motion of dash / melee skills (js/motion.js): height, afterimages, shadow travel, short stun.
    this.lift = 0;
    this.ghosts = [];
    this.sneaking = false;
    this.stunT = 0;
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
    // Klutz: it can't use its held item at all.
    if (this.ability === 'klutz' && this.item) {
      this.stats = { ...this.rawStats };
      this.mods = baseMods();
      this.itemSpent = true;
    }
    this.refreshSpeed();
  }

  /** Types right now (Roost removes Flying for a moment). */
  get types() {
    if (ab(this, 'forecast')) {
      const ft = { sunnyday: 'Fire', raindance: 'Water', snowscape: 'Ice' }[weatherNow(this.game)];
      if (ft) return [ft];
    }
    if (this.colorType) return [this.colorType]; // Color Change
    if (this.transformed) return this.transformed.types;
    if (this.lostFire) {
      // Burn Up: no longer Fire type.
      const rest = this.data.types.filter((x) => x !== 'Fire');
      if (!this.lostElectric) return rest.length ? rest : ['Normal'];
    }
    if (this.lostElectric) {
      // Double Shock: no longer Electric type.
      const rest = this.data.types.filter((x) => x !== 'Electric');
      return rest.length ? rest : ['Normal'];
    }
    if (this.zen) return ['Fire', 'Psychic'];
    if (this.pirouette) return ['Normal', 'Fighting']; // Meloetta Pirouette Forme
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
    return this.status?.id === 'slp' || this.status?.id === 'frz' || this.rechargeT > 0 || this.stunT > 0;
  }

  /** Leave an afterimage of the current frame (speed moves). */
  ghost(tint = null) {
    this.ghosts.push({ x: this.x, y: this.y - this.lift, dir: this.dir, anim: this.sprite.anim, frame: this.sprite.frame, t: 0, tint });
    if (this.ghosts.length > 10) this.ghosts.shift();
  }

  /**
   * A stat with its timed stage and ability/weather modifiers.
   * critSide 'atk' ignores the attacker's drops, 'def' ignores the defender's raises.
   */
  statVal(k, critSide = null, ignoreStages = false) {
    let n = ignoreStages ? 0 : stageOf(this, k);
    if ((critSide === 'atk' && n < 0) || (critSide === 'def' && n > 0)) n = 0;
    // Stance Change: Blade Forme swaps attack and defense stats.
    let key = this.bladeT > 0 && ab(this, 'stancechange') ? { atk: 'def', def: 'atk', spa: 'spd', spd: 'spa' }[k] || k : k;
    // Zen Mode: Attack and Sp. Atk trade places; Hero Palafin is far stronger.
    // Power Trick swaps Attack and Defense.
    if (this.powerTrick && (key === 'atk' || key === 'def')) key = key === 'atk' ? 'def' : 'atk';
    const swap = this.zen || this.pirouette; // Zen Mode / Pirouette Forme swap Attack and Sp. Atk
    const k2 = swap && (key === 'atk' || key === 'spa') ? (key === 'atk' ? 'spa' : 'atk') : key;
    let v = this.stats[k2] * stageMul(n);
    if (this.zen && (k2 === 'def' || k2 === 'spd')) v *= 1.6;
    if (this.hero) v *= { atk: 2, def: 1.27, spa: 1.72, spd: 1.3 }[k] || 1;
    const w = weatherNow(this.game);
    if (k === 'spe' && sideOn(this.game, this.team, 'tailwind')) v *= 2;
    if ((k === 'atk' || k === 'spe') && this.slowT > 0) v *= 0.5; // Slow Start
    // Protosynthesis (sun) / Quark Drive (Electric Terrain): its best stat goes up (Speed ×1.5, others ×1.3).
    if ((w === 'sunnyday' && ab(this, 'protosynthesis')) || (terrainNow(this.game) === 'electric' && ab(this, 'quarkdrive'))) {
      const best = ['atk', 'def', 'spa', 'spd', 'spe'].reduce((b, s) => (this.stats[s] > this.stats[b] ? s : b), 'atk');
      if (k === best) v *= k === 'spe' ? 1.5 : 1.3;
    }
    if (k === 'atk' && (ab(this, 'hugepower') || ab(this, 'purepower'))) v *= 2;
    if (k === 'atk' && ab(this, 'orichalcumpulse') && w === 'sunnyday') v *= 4 / 3;
    if (k === 'spa' && ab(this, 'plus') && this.game.fighters?.some((o) => o !== this && o.alive && o.team === this.team)) v *= 1.5;
    if ((k === 'atk' || k === 'spa') && ab(this, 'supremeoverlord')) {
      const fallen = this.game.parties?.[this.slot]?.members.filter((o) => o !== this && o.ko).length || 0;
      v *= 1 + 0.1 * fallen;
    }
    if (k === 'atk' && ab(this, 'guts') && this.status) v *= 1.5;
    if (k === 'atk' && ab(this, 'toxicboost') && (this.status?.id === 'psn' || this.status?.id === 'tox')) v *= 1.5;
    if (k === 'spa' && ab(this, 'flareboost') && this.status?.id === 'brn') v *= 1.5;
    if (k === 'atk' && ab(this, 'hustle')) v *= 1.5;
    if (k === 'spa' && ab(this, 'solarpower') && w === 'sunnyday') v *= 1.5;
    if (k === 'spd' && w === 'sandstorm' && this.types.includes('Rock')) v *= 1.5;
    if (k === 'spe' && ab(this, 'chlorophyll') && w === 'sunnyday') v *= 1.5;
    if (k === 'spe' && ab(this, 'unburden') && this.itemGone) v *= 1.5;
    if (k === 'spe' && ab(this, 'quickfeet') && this.status) v *= 1.5;
    if (k === 'spe' && ab(this, 'sandrush') && w === 'sandstorm') v *= 1.5;
    if (k === 'spe' && ab(this, 'swiftswim') && w === 'raindance') v *= 1.5;
    if (k === 'def' && w === 'snowscape' && this.types.includes('Ice')) v *= 1.5;
    if (k === 'def' && ab(this, 'marvelscale') && this.status) v *= 1.5;
    return v;
  }

  /** Movement speed + cooldown recharge from Speed (stages, paralysis, chill, Pressure...). */
  refreshSpeed() {
    let spe = this.statVal('spe');
    // Trick Room: the slower you are, the faster you move and recharge.
    if (trickRoom(this.game)) spe = Math.max(20, 260 - spe);
    const ratio = Math.sqrt(spe / this.stats.spe); // stages help, but walking speed can't explode
    let move = (64 + this.stats.spe * 0.22 * ratio) * (this.mods?.speedMul ?? 1);
    if (ab(this, 'lightmetal')) move *= 1.1;
    if (ab(this, 'heavymetal')) move *= 0.9;
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
    // Sudden death: healing shrinks as damage grows (×2 damage = half healing, ×3 = a third...).
    if (this.game.damageMul > 1) amount /= this.game.damageMul;
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
    if (dmg > 0) this.timesHit++;
    if (dmg > 0) {
      this.lastHurtAt = this.game.fightTime || 0; // Avalanche
      this.lastHurtDmg = dmg; // Comeuppance
    }
    if (dmg > 0 && this.cast?.focusing) loseFocus(this.game, this); // Focus Punch
    if (dmg > 0 && this.illusion) this.breakIllusion();
    this.flash = 0.75;
    this.metroStacks = 0; // Metronome streak breaks when you're hit
    const kb = this.mods.noKnockback ? 0 : (dmg > 0 ? 160 : 40) * kbMul * (ab(this, 'heavymetal') ? 0.4 : 1);
    this.kbx = Math.cos(angle) * kb;
    this.kby = Math.sin(angle) * kb;
    this.setEmotion('Pain');
    if (this.hp <= 0) return this.faint();
    const berryAt = ab(this, 'gluttony') ? 0.75 : 0.5;
    const unnerved = this.game.enemiesOf?.(this).some((e) => ab(e, 'unnerve'));
    if (this.mods.sitrus && !this.itemSpent && !unnerved && this.hp < this.maxHp * berryAt) {
      const healed = this.heal(Math.round(this.maxHp * this.mods.sitrus));
      this.useItem(t('sitrus', { who: this.game.who(this), item: `<span class="yellow">${itemName(this.item)}</span>`, n: healed }));
      if (ab(this, 'cheekpouch')) this.heal(this.maxHp / 3); // Cheek Pouch
      // Cud Chew: chews the berry again a moment later.
      if (ab(this, 'cudchew') && !this.chewed) {
        this.chewed = true;
        this.game.after(3, () => this.alive && this.heal(this.maxHp * this.mods.sitrus), null);
      }
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
    this.dodgeCd = DODGE_COOLDOWN * (ab(this, 'runaway') ? 0.7 : 1) * (trapped(this.game, this) ? 1.5 : 1) * (this.syrupT > 0 ? 1.3 : 1) * (this.game.gravity?.t > 0 ? 2 : 1); // Gravity
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
    this.loafT = Math.max(0, (this.loafT || 0) - dt); // Truant
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
      if (!this.cast.lockDir) this.dir = angleToDir(this.cast.faceAngle);
    }
    for (const g of this.ghosts) g.t += dt;
    this.ghosts = this.ghosts.filter((g) => g.t < 0.3);

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
    if (this.cast || this.castGap > 0 || !this.still || this.stunned || this.loafT > 0) return;
    // Outrage keeps raging; Encore repeats the last skill.
    const list = this.lock ? [this.lock.id] : this.encore ? [this.encore.id] : this.moves;
    // Struggle: a Pokémon with no way to deal damage (Wobbuffet) struggles after 5 s without attacking.
    if (this.wantsStruggle(opp)) {
      if (beforeCast(this.game, this, opp, 'struggle')) startCast(this.game, this, opp, 'struggle');
      return;
    }
    for (const id of list) {
      if (this.cd[id] > 0) continue;
      if (!wantsMove(this.game, this, id, opp)) continue;
      if (beforeCast(this.game, this, opp, id)) startCast(this.game, this, opp, id);
      return;
    }
  }

  /** Transform: becomes a copy of the foe (look, types, stats except HP, skills, ability, stat changes). */
  transformInto(foe) {
    this.transformed = { types: [...foe.types], from: foe.data.key };
    this.art = foe.art;
    this.sprite = new SpriteAnimator(foe.art);
    this.radius = foe.radius;
    const hp = this.stats.hp;
    this.stats = { ...foe.stats, hp };
    this.rawStats = { ...foe.rawStats, hp };
    this.moves = [...foe.moves];
    this.cd = {};
    this.moves.forEach((id, i) => (this.cd[id] = 0.4 + 0.5 * i));
    this.ability = foe.ability;
    this.boosts = JSON.parse(JSON.stringify(foe.boosts));
    this._cantHurt = undefined;
  }

  /** Struggle time: no way to deal damage and nothing thrown for 5 s. */
  wantsStruggle(opp) {
    return !this.lock && !this.encore && !!opp && this.cantHurt() && (this.game.fightTime || 0) - (this.lastAttackAt ?? this.enteredAt ?? 0) > 5 && this.distTo(opp) < 220;
  }

  /** No skill that can deal damage (Counter / Mirror Coat only answer hits). */
  cantHurt() {
    return (this._cantHurt ??= this.moves.every((id) => DB.moves[id].category === 'Status' || MOVEFX.moves[id]?.stance));
  }

  draw(ctx) {
    if (this.sneaking) return this.drawSneak(ctx);
    if (this.burrowing) return this.drawBurrow(ctx);
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
    const sw = Math.max(8, this.radius * (this.data.flying ? 1.1 : 0.9)) * (1 - Math.min(0.6, this.lift / 200));
    ctx.ellipse(Math.round(this.x), Math.round(this.y + 7), sw, sw * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    const sy = this.y + bob - (this.data.flying ? 6 : 0) - this.lift;
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
    // Afterimages (speed moves): earlier frames, fading out.
    for (const g of this.ghosts) {
      const keep = [spr.anim, spr.frame];
      if (spr === this.sprite) [spr.anim, spr.frame] = [g.anim, g.frame];
      spr.draw(ctx, g.x, g.y + (sy - this.y + this.lift), g.dir, { alpha: 0.45 * (1 - g.t / 0.3), tint: g.tint || '#ffffff', tintAmt: 0.5 });
      [spr.anim, spr.frame] = keep;
    }
    if (this.sub) {
      // Substitute: a pale decoy stands in front; the real one hides behind it.
      spr.draw(ctx, this.x - 6, sy - 3, this.dir, { alpha: alpha * 0.35 });
      spr.draw(ctx, this.x + 4, sy + 2, this.dir, { flash: this.flash, alpha, tint: '#f8f8f8', tintAmt: 0.75 });
    } else spr.draw(ctx, this.x, sy, this.dir, { flash: this.flash, alpha, tint, tintAmt });
    if (!this.ko) this.drawTag(ctx, sy);
  }

  /** Travelling as a shadow (Shadow Sneak): only a dark stretched shadow on the ground. */
  drawSneak(ctx) {
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = '#201030';
    ctx.beginPath();
    const w = this.radius * 1.3;
    ctx.ellipse(Math.round(this.x), Math.round(this.y + 6), w, w * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Tunnelling (Dig): a mound of dirt moving along the ground. */
  drawBurrow(ctx) {
    const x = Math.round(this.x);
    const y = Math.round(this.y + 4);
    const w = this.radius * 0.9;
    const wob = Math.sin(this.game.time * 30) * 1.5;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y + 3, w + 2, (w + 2) * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8a6a3a';
    ctx.beginPath();
    ctx.ellipse(x, y, w, w * 0.45 + wob, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b08850';
    ctx.beginPath();
    ctx.ellipse(x - 2, y - 2, w * 0.55, w * 0.2, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.restore();
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
