// Pokémon Clash — boot, game loop, arena rendering, battles (Showdown / Trio / 2vs2), hits.
import { loadJSON, loadImage, loadFighterArt, loadParticle, loadBeam } from './assets.js';
import { DB, computeDamage } from './combat.js';
import * as FXE from './effects.js';
import { defaultBuild, loadTeam, saveTeam } from './builds.js';
import { Fighter } from './fighter.js';
import { SpriteAnimator } from './sprite.js';
import { MODES, defaultSetup, makeMember, partyFor, teamOf, battleSetup } from './modes.js';
import { ITEMS } from './items.js';
import { MOVEFX, cancelCast, startCast } from './moves.js';
import { equip } from './items.js';
import { clearHazards, hazardCount, placeHazard } from './patterns.js';
import { FX, Effect, FloatText, BannerFont } from './vfx.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { setItems } from './items.js';
import { Bot } from './bot.js';
import { Sfx } from './sfx.js';
import { t, monName, moveName, setAbilityData } from './i18n.js';
import { loadSettings, SETTINGS } from './settings.js';

const W = 640; // arena size in game pixels
const H = 360;
const START_X = 150; // spawn distance from the side walls
const SWITCH_COOLDOWN = 6; // Trio: seconds between switches
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
    this.bots = [];
    this.parties = [];
    this.decor = [];
    this.dodgeTextT = [0, 0, 0, 0];
    this.setup = null; // filled once data is loaded (modes.defaultSetup)
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
  cancelCast(f) {
    cancelCast(this, f);
  }
  /** Does `def` avoid this hit by dodging? (No Guard lands it anyway; a vanished Pokémon can't be hit.) */
  dodges(att, def) {
    if (def.hidden) return true;
    return def.invuln > 0 && !FXE.noGuard(att, def);
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
    const tag = this.parties.length > 2 ? `P${f.slot + 1} ` : '';
    return `<span class="c-p${f.slot + 1}">${tag}${monName(f.data.key, f.data.name)}</span>`;
  }

  // ---------- teams ----------
  activeOf(slot) {
    const p = this.parties[slot];
    return p ? p.members[p.active] : null;
  }
  benchOf(slot) {
    const p = this.parties[slot];
    return p ? p.members.filter((m, i) => i !== p.active && !m.ko) : [];
  }
  enemiesOf(f) {
    return this.fighters.filter((o) => o.team !== f.team && o.alive);
  }
  nearestEnemy(f) {
    // Follow Me: a foe calling attention gets targeted first.
    const caller = this.enemiesOf(f).find((o) => o.followT > 0);
    if (caller && !FXE.ab(f, 'propellertail') && !FXE.ab(f, 'stalwart')) return caller; // Propeller Tail ignores Follow Me
    let best = null;
    for (const o of this.enemiesOf(f)) if (!best || f.distTo(o) < f.distTo(best)) best = o;
    return best;
  }
  teamAlive(team) {
    return this.parties.some((p) => p.team === team && p.members.some((m) => !m.ko));
  }
  canSwitch(slot) {
    const p = this.parties[slot];
    const cur = p && p.members[p.active];
    // Shadow Tag / Anchor Shot / Thousand Waves: can't switch out.
    const held = cur && (cur.trapT > 0 || this.enemiesOf(cur).some((e) => FXE.ab(e, 'shadowtag') && !FXE.ab(cur, 'shadowtag')));
    return !!p && this.mode.party > 1 && this.state === 'fight' && p.switchCd <= 0 && this.benchOf(slot).length > 0 && !held;
  }

  /** Put a party member on the field in place of the current one (switch or send-out). */
  sendOut(slot, next, at) {
    const p = this.parties[slot];
    const prev = p.members[p.active];
    // Shed Tail: the one coming in hides behind a substitute.
    if (prev?.passSub && prev !== next) {
      next.sub = { hp: Math.floor(next.maxHp / 4) };
      prev.passSub = false;
    }
    // Baton Pass: the stat changes go to the one coming in.
    if (prev?.passBoosts && prev !== next) {
      next.boosts = prev.passBoosts;
      prev.passBoosts = null;
    }
    p.active = p.members.indexOf(next);
    next.x = at.x;
    next.y = at.y;
    next.clamp();
    next.invuln = Math.max(next.invuln, 0.6);
    const i = this.fighters.indexOf(prev);
    if (i >= 0) this.fighters[i] = next;
    else this.fighters.push(next);
    this.addEffect(new Effect(MOVEFX.common.spawn, next.x, next.y, { layer: 'under' }));
    this.ui.buildHUD();
    FXE.onEntry(this, next);
  }

  trySwitch(slot) {
    if (!this.canSwitch(slot)) return;
    const p = this.parties[slot];
    const cur = p.members[p.active];
    if (cur.ko || cur.cast?.released) return;
    if (cur.cast) cancelCast(this, cur);
    // Next healthy member after the current one in party order.
    const order = p.members.map((_, k) => p.members[(p.active + 1 + k) % p.members.length]);
    const next = order.find((m) => m !== cur && !m.ko);
    p.switchCd = SWITCH_COOLDOWN;
    FXE.onSwitchOut(this, cur); // Regenerator, Natural Cure
    this.ui.log(t('comeBack', { a: this.who(cur), b: this.who(next) }));
    this.sfx('dodge');
    this.sendOut(slot, next, { x: cur.x, y: cur.y });
  }

  announce(c, move) {
    this.stats[c.slot].casts++;
    this.ui.log(t('used', { who: this.who(c), move: `<span class="green">${moveName(move.id, move.name)}</span>` }));
  }

  dodgedText(f) {
    if (this.dodgeTextT[f.slot] > 0) return;
    this.dodgeTextT[f.slot] = 0.4;
    this.stats[f.slot].dodges++;
    this.addEffect(new FloatText(t('dodged'), f.x, f.y - 26, '#00f8f8'));
  }

  applyHit(att, def, cast, opts = {}) {
    FXE.setHitMove(cast.move);
    try {
      return this.landHit(att, def, cast, opts);
    } finally {
      FXE.setHitMove(null);
    }
  }

  landHit(att, def, cast, { angle = 0, factor = 1, at = null, noFx = false, kbMul = null } = {}) {
    if (!def.alive || this.state === 'result') return;
    const move = cast.move;
    const fxd = cast.def;
    const hx = at ? (at.x + def.x) / 2 : def.x;
    const hy = at ? (at.y + def.y) / 2 : def.y - 4;
    // Protect, absorbing abilities, evasion.
    if (FXE.preHit(this, att, def, cast)) return 0;
    if (!noFx) {
      if (fxd.hit) this.addEffect(new Effect(fxd.hit, hx, hy, { angle }));
      if (fxd.hit2) this.addEffect(new Effect(fxd.hit2, hx, hy, { angle, layer: 'under' }));
    }
    // Status skills aimed at a foe (Will-O-Wisp, Thunder Wave...) only apply their effect.
    if (move.category === 'Status') {
      FXE.afterHit(this, att, def, cast, 0, { angle });
      return 0;
    }
    const x = FXE.damageMods(this, att, def, cast);
    const r = computeDamage(att, def, move, factor * this.damageMul, x);
    // Substitute takes the hit instead (sound moves and Infiltrator go around it).
    if (def.sub && att !== def && !move.flags?.includes('sound') && !FXE.ab(att, 'infiltrator')) {
      def.sub.hp -= r.dmg;
      this.addEffect(new FloatText(String(r.dmg), def.x, def.y - 20, '#c8c8c8'));
      if (def.sub.hp <= 0) {
        def.sub = null;
        this.ui.log(t('subFaded', { who: this.who(def) }));
        this.addEffect(new Effect(MOVEFX.common.dodge, def.x, def.y - 6, { scale: 1.4 }));
      }
      return 0;
    }
    // Ice Face: Eiscue's ice head takes the first physical hit.
    if (FXE.ab(def, 'iceface') && !def.faceBroken && move.category === 'Physical' && r.dmg > 0) {
      def.faceBroken = true;
      this.ui.log(t('iceFaceBroke', { who: this.who(def) }));
      this.addEffect(new Effect(MOVEFX.common.hitNeutral, def.x, def.y - 6, { scale: 1.4 }));
      return 0;
    }
    const { eff, crit } = r;
    const dmg = FXE.adjustDamage(this, att, def, r.dmg); // Disguise
    if (eff > 1) this.addEffect(new Effect(MOVEFX.common.hitSuper, def.x, def.y - 6, { scale: 1.2 }));
    else if (noFx && eff > 0) this.addEffect(new Effect(MOVEFX.common.hitNeutral, def.x, def.y - 6));
    const s = this.stats[att.slot];
    s.damage += dmg;
    s.hits++;
    if (eff > 1) s.supers++;
    this.moveLog[move.id] = (this.moveLog[move.id] || 0) + 1;
    def.takeHit(dmg, angle, x.noKnock ? 0 : kbMul ?? fxd.extra?.kbMul ?? 1);
    if (att.mods.drain && dmg > 0 && att.alive) att.heal(Math.max(1, Math.round(dmg * att.mods.drain))); // Shell Bell
    const color = eff === 0 ? '#a0a0a0' : eff > 1 ? '#f8f800' : eff < 1 ? '#c8c8c8' : '#f8f8f8';
    this.addEffect(new FloatText(String(dmg), def.x + (Math.random() - 0.5) * 10, def.y - 20, color, eff > 1 || crit));
    if (eff === 0) this.ui.log(t('noEffect', { who: this.who(def) }));
    else if (eff > 1) this.ui.log(`<span class="yellow">${t('superEff')}</span>`);
    else if (eff < 1) this.ui.log(t('notVery'));
    if (crit) this.ui.log(t('crit'));
    this.shake(Math.min(5, 1 + dmg / 40), 0.15);
    this.sfx(eff > 1 ? 'hitBig' : 'hit');
    if (eff > 0) FXE.afterHit(this, att, def, cast, dmg, { angle, crit });
    if (def.ko) FXE.onKnockOut(this, att, move, def);
    return dmg;
  }

  /** Called when a move actually fires (after any wind-up). */
  onMoveUsed(c, id) {
    const m = c.mods;
    if (m.metronome) c.metroStacks = Math.min(5, (c.metroStacks || 0) + 1);
    if (m.lifeOrb && DB.moves[id]?.category !== 'Status') this.recoil(c, Math.round(c.maxHp * m.lifeOrb), `its ${c.item.name}`, false);
    if (id) FXE.onMoveUsed(this, c, id);
  }

  /** U-turn: in Trio the user switches out after hitting (if someone can come in). */
  uturn(c) {
    const p = this.parties[c.slot];
    if (!c.alive || this.mode.party < 2 || this.activeOf(c.slot) !== c || !this.benchOf(c.slot).length || this.state !== 'fight') return;
    p.switchCd = 0;
    if (c.cast) cancelCast(this, c);
    this.trySwitch(c.slot);
  }

  /** A foe stepped on a hazard trail (Flare Blitz fire, Wild Charge sparks): small damage + status chance. */
  hazardHit(owner, e, h) {
    if (!e.alive || FXE.ab(e, 'magicguard')) return;
    const dmg = Math.max(1, Math.round(e.maxHp * (h.dmg || 0.01)));
    e.hp = Math.max(0, e.hp - dmg);
    this.addEffect(new FloatText(String(dmg), e.x + 6, e.y - 18, '#f89858'));
    if (h.status && Math.random() * 100 < (h.chance || 10)) FXE.inflict(this, e, h.status, owner);
    if (e.hp <= 0) e.faint();
  }

  /** Rapid Spin: clears the foes' Spikes / Stealth Rock. */
  clearHazards(c) {
    clearHazards(this, c);
  }
  hazardCount(c, kind) {
    return hazardCount(this, c, kind);
  }
  placeHazard(c, kind, x, y) {
    placeHazard(this, c, kind, x, y);
  }
  /** Trick: the two Pokémon swap held items. */
  swapItems(a, b) {
    const ia = a.item && !a.itemSpent ? a.item.id : null;
    const ib = b.item && !b.itemSpent ? b.item.id : null;
    for (const [f, id] of [[a, ib], [b, ia]]) {
      f.stats = { ...f.rawStats };
      equip(f, id);
      f.refreshSpeed();
    }
  }
  /** Pickup: hand a Pokémon an item mid-battle. */
  giveItem(f, id) {
    f.stats = { ...f.rawStats };
    equip(f, id);
    this.ui.log(t('pickedUp', { who: this.who(f), item: f.itemLabel() }));
  }
  /** Thief: takes the target's held item. */
  stealItem(att, def) {
    const id = def.item?.id;
    if (!id) return;
    def.loseItem();
    att.stats = { ...att.rawStats };
    equip(att, id);
    this.ui.log(t('stoleItem', { who: this.who(att), foe: this.who(def), item: att.itemLabel() }));
  }
  /** Symbiosis: gives its own item to a partner. */
  passItem(from, to) {
    const id = from.item?.id;
    if (!id) return;
    to.stats = { ...to.rawStats };
    equip(to, id);
    from.loseItem();
    this.ui.log(t('symbiosisLog', { who: this.who(from), foe: this.who(to) }));
  }
  /** Metronome: start another skill right away. */
  forceCast(c, t2, id) {
    startCast(this, c, t2, id);
  }
  /** Tidy Up: every hazard on the field is cleared. */
  clearAllHazards() {
    for (const o of this.objects) if (o.hazard) o.dead = true;
  }
  /** Dragon Tail / Circle Throw: in Trio the target is dragged out and a random teammate comes in. */
  dragOut(f) {
    const p = this.parties[f.slot];
    const bench = this.benchOf(f.slot);
    if (!f.alive || this.mode.party < 2 || !bench.length || this.activeOf(f.slot) !== f || this.state !== 'fight' || FXE.ab(f, 'suctioncups')) return;
    const next = bench[Math.floor(Math.random() * bench.length)];
    if (f.cast) cancelCast(this, f);
    FXE.onSwitchOut(this, f);
    p.switchCd = Math.max(p.switchCd, 1);
    this.ui.log(t('draggedOut', { who: this.who(next) }));
    this.sendOut(f.slot, next, { x: f.x, y: f.y });
  }
  /** Bide: releases double the damage it stored, all around it. */
  bideRelease(c, st) {
    const d = MOVEFX.moves[st.id];
    this.ui.log(t('bideUnleashed', { who: this.who(c) }));
    this.addEffect(new Effect(d.hit, c.x, c.y - 6, { scale: 1.6 }));
    this.shake(8, 0.3);
    this.sfx('boom');
    if (!st.stored) return;
    for (const e of this.enemiesOf(c)) {
      if (c.distTo(e) > (d.stance.radius || 100) + e.radius) continue;
      const dmg = Math.round(st.stored * 2);
      e.takeHit(dmg, c.angleTo(e), 1.6);
      this.addEffect(new FloatText(String(dmg), e.x, e.y - 20, '#f8f800', true));
    }
  }
  /** Shell Trap: the trap goes off, blasting everyone around. */
  stanceBurst(c, st) {
    const d = MOVEFX.moves[st.id];
    this.addEffect(new Effect(d.hit, c.x, c.y - 6, { scale: 1.6 }));
    if (d.hit2) this.addEffect(new Effect(d.hit2, c.x, c.y, { layer: 'under' }));
    this.shake(9, 0.35);
    this.sfx('boom');
    this.ui.log(t('shellTrapLog', { who: this.who(c) }));
    const cast = { id: st.id, def: d, move: DB.moves[st.id] };
    for (const e of this.enemiesOf(c)) if (c.distTo(e) < (d.stance.radius || 90) + e.radius) this.applyHit(c, e, cast, { angle: c.angleTo(e), noFx: true });
  }

  /** High Jump Kick missed: the user crashes and loses part of its HP. */
  crash(f, frac) {
    if (!f.alive || FXE.ab(f, 'magicguard')) return;
    this.ui.log(t('crashed', { who: this.who(f) }));
    this.recoil(f, Math.round(f.maxHp * frac), 'crash', false);
  }

  /** Self-damage from moves like Flare Blitz (and Life Orb). Magic Guard is immune. */
  recoil(f, amount, what = 'recoil', log = true) {
    if (!f.alive || amount <= 0 || FXE.ab(f, 'magicguard')) return;
    f.hp = Math.max(0, f.hp - amount);
    if (log) this.ui.log(t('recoil', { who: this.who(f) }));
    this.addEffect(new FloatText(String(amount), f.x, f.y - 20, '#f85840'));
    if (f.hp <= 0) f.faint();
  }

  onKO(f) {
    if (this.state !== 'fight') return;
    this.ui.log(t('fainted', { who: this.who(f) }));
    this.sfx('ko');
    const next = this.parties[f.slot].members.find((m) => !m.ko);
    if (next) {
      // Trio: the next party member is sent out where the trainer started.
      this.after(1.2, () => {
        if (this.state !== 'fight' && this.state !== 'ko') return;
        this.ui.log(t('sentOut', { who: this.who(next) }));
        this.sendOut(f.slot, next, this.parties[f.slot].spawn);
      });
      return;
    }
    if (this.teamAlive(f.team)) return; // 2vs2: the partner fights on
    const winTeam = 1 - f.team;
    this.state = 'ko';
    this.slowmo = 0.3;
    this.banner('K.O.!', 1.5);
    this.after(1.6, () => {
      this.slowmo = 1;
      this.state = 'result';
      for (const w of this.fighters) if (w.team === winTeam && w.alive) w.sprite.play('Pose', { loop: true, restart: true });
      this.ui.showResult(winTeam);
    });
  }

  /** Big centred title drawn on the canvas with the PMD banner font. */
  banner(text, time = 0.55) {
    this.bannerState = { text, t: 0, time };
  }

  // ---------- screens ----------
  /** Start a battle from a setup template (Random Battle rolls fresh teams here every time). */
  startBattle(template = this.setup) {
    this.lastTemplate = JSON.parse(JSON.stringify(template));
    this.launch(battleSetup(template, ITEMS.list));
  }

  /** Start a battle from a concrete, rule-checked setup. Loads missing animations first. */
  launch(setup) {
    const mode = MODES[setup.mode];
    const slots = [...Array(mode.slots).keys()];
    const arts = [...new Set(slots.flatMap((s) => partyFor(setup, s).map((m) => m.species)))].map((k) => this.arts[k]);
    if (!arts.every((a) => a.full)) {
      const status = document.getElementById('loading-status');
      const screen = document.getElementById('loading');
      status.textContent = 'Now loading...';
      screen.classList.remove('done');
      Promise.all(arts.map((a) => a.loadRest())).then(() => {
        screen.classList.add('done');
        this.launch(setup);
      });
      return;
    }
    this.mode = mode;
    this.rule = setup.rule || 'standard';
    this.lastSetup = JSON.parse(JSON.stringify(setup));
    this.objects = [];
    this.timers = [];
    this.updaters = [];
    this.tints = [];
    this.bannerState = null;
    this.stats = [0, 1, 2, 3].map(() => ({ damage: 0, casts: 0, hits: 0, dodges: 0, supers: 0 }));
    this.moveLog = {};
    const midY = (this.bounds.y0 + this.bounds.y1) / 2 + 6;
    this.parties = slots.map((s) => {
      const team = teamOf(setup.mode, s);
      const nth = mode.teams[team].indexOf(s);
      const perTeam = mode.teams[team].length;
      const spawn = { x: team === 0 ? START_X : W - START_X, y: perTeam > 1 ? midY + (nth === 0 ? -60 : 60) : midY };
      const members = partyFor(setup, s).map((m) => new Fighter(this, s, team, m, this.arts[m.species], spawn.x, spawn.y));
      return { slot: s, team, members, active: 0, switchCd: 0, spawn };
    });
    this.fighters = this.parties.map((p) => p.members[0]);
    this.bots = slots.map((s) => (setup.players[s].human ? null : new Bot(this, s)));
    const humans = slots.filter((s) => setup.players[s].human);
    this.input.setHumans(humans, slots.map((s) => teamOf(setup.mode, s)), mode.party > 1);
    this.fighters.forEach((f) => this.addEffect(new Effect(MOVEFX.common.spawn, f.x, f.y, { layer: 'under' })));
    this.ui.buildHUD();
    this.ui.hideOverlays();
    document.body.dataset.screen = 'fight';
    this.state = 'countdown';
    this.input.clearPresses();
    const steps = ['3', '2', '1', 'FIGHT!'];
    steps.forEach((s, i) => this.after(i * 0.6, () => {
      this.banner(s, i === 3 ? 0.8 : 0.55);
      this.sfx(i === 3 ? 'go' : 'tick');
    }));
    this.after(steps.length * 0.6 - 0.6, () => {
      this.state = 'fight';
      this.fightTime = 0;
      for (const f of this.fighters) FXE.onEntry(this, f); // Intimidate, Sand Stream, Trace
    });
    this.damageMul = 1;
    this.slowmo = 1; // never inherit the KO slow motion of a battle that was left early
    this.weather = null;
    this.terrain = null;
    this.room = null;
    this.sides = [{}, {}];
    this.gravity = null;
    this.healWish = {};
  }

  /** Quick 1v1 helper (used by tests and URL shortcuts). */
  startFight(keys, cpu = [false, false], items = [null, null]) {
    const s = defaultSetup();
    keys.forEach((k, i) => {
      s.players[i].party = [defaultBuild(k, items[i] || null)];
      s.players[i].human = !cpu[i];
    });
    this.setup = s;
    this.startBattle(s);
  }

  rematch() {
    if (this.lastTemplate) this.startBattle(this.lastTemplate);
  }

  leaveBattle() {
    this.gravity = null;
    this.healWish = {};
    this.weather = null;
    this.terrain = null;
    this.room = null;
    this.sides = [{}, {}];
    this.fighters = [];
    this.parties = [];
    this.objects = [];
    this.timers = [];
    this.bannerState = null;
    this.ui.hideOverlays();
    this.ui.clearHUD();
  }

  toLobby() {
    this.leaveBattle();
    this.state = 'lobby';
    document.body.dataset.screen = 'lobby';
    this.ui.showLobby();
  }

  toSetup() {
    this.leaveBattle();
    this.state = 'setup';
    document.body.dataset.screen = 'setup';
    this.ui.showSetup();
  }

  // Old name kept for test scripts.
  toSelect() {
    this.toSetup();
  }

  /** A few idle Pokémon standing around in the lobby / setup background. */
  makeDecor() {
    const keys = Object.keys(this.arts).sort(() => Math.random() - 0.5).slice(0, 6);
    const spots = [[60, 200], [110, 330], [230, 335], [410, 335], [530, 330], [590, 210]]; // around the edges
    this.decor = keys.map((k, i) => ({
      anim: new SpriteAnimator(this.arts[k]),
      x: spots[i][0],
      y: spots[i][1],
      dir: Math.floor(Math.random() * 8),
    }));
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
    if (this.state === 'lobby' || this.state === 'setup') return this.ui.navKey(code);
    if (code === 'Escape' || code === 'KeyP') return this.togglePause();
  }

  // ---------- loop ----------
  update(dt) {
    this.time += dt;
    this.input.pollPads();
    if (this.state === 'lobby' || this.state === 'setup') {
      for (const d of this.decor) d.anim.update(dt);
      this.ui.tick(dt);
      return;
    }
    if (this.state === 'paused' || this.state === 'loading') return;
    if (this.bannerState) {
      this.bannerState.t += dt;
      if (this.bannerState.t >= this.bannerState.time) this.bannerState = null;
    }
    dt *= this.slowmo;
    if (this.state === 'fight') {
      this.fightTime += dt;
      if (this.damageMul === 1 && this.fightTime >= this.mode.suddenDeath) {
        // Stops stalemates (e.g. two Pokémon mostly immune to each other).
        this.damageMul = 2;
        this.banner('SUDDEN DEATH!', 1.2);
        this.ui.log(`<span class="yellow">${t('sudden')}</span>`);
        this.sfx('go');
      }
      // Sudden death keeps escalating (+50% damage every 30 s) so even two healers can't stall forever.
      if (this.damageMul > 1) this.damageMul = 2 + Math.floor((this.fightTime - this.mode.suddenDeath) / 30) * 0.5;
    }
    this.dodgeTextT = this.dodgeTextT.map((t) => Math.max(0, t - dt));

    if (this.state === 'fight') FXE.tickGame(this, dt);
    for (const t of this.timers) t.t -= dt;
    const due = this.timers.filter((t) => t.t <= 0);
    this.timers = this.timers.filter((t) => t.t > 0);
    for (const t of due) t.fn();

    for (const p of this.parties) {
      p.switchCd = Math.max(0, p.switchCd - dt);
      const f = p.members[p.active];
      const inp = this.bots[p.slot] ? this.bots[p.slot].think(dt) : this.input.read(p.slot);
      if (this.bots[p.slot]) this.input.read(p.slot); // drain stray human presses
      if (f.ko) continue;
      if (inp.switchPressed) this.trySwitch(p.slot);
      const cur = this.activeOf(p.slot);
      cur.update(dt, inp, this.nearestEnemy(cur));
    }
    // Fainted Pokémon keep animating (fade out) until they're replaced.
    for (const f of this.fighters) if (f.ko) f.update(dt, { x: 0, y: 0 }, null);
    // Push fighters apart so they can't stand inside each other.
    const live = this.fighters.filter((f) => f.alive);
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i];
        const b = live[j];
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
    }

    this.updaters = this.updaters.filter((u) => !u.fn(dt));
    for (const o of this.objects) o.update(dt);
    this.objects = this.objects.filter((o) => !o.dead);
    this.shakeT -= dt;
    for (const t of this.tints) t.t += dt;
    this.tints = this.tints.filter((t) => t.t < t.time);
    this.ui.updateHUD();
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
    const wt = this.fighters.length ? FXE.weatherTint(this) : null;
    if (wt) {
      ctx.fillStyle = wt;
      ctx.fillRect(-10, -10, W + 20, H + 20);
    }
    layer('under');
    if (this.state === 'lobby') {
      for (const d of [...this.decor].sort((p, q) => p.y - q.y)) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(d.x, d.y + 7, 12, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        d.anim.draw(ctx, d.x, d.y, d.dir);
      }
    }
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
    for (const x of [START_X, W - START_X]) {
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
  loadSettings();
  const status = document.getElementById('loading-status');
  const canvas = document.getElementById('arena');
  const game = new Game(canvas);
  window.__arena = game; // handy for debugging / automated tests

  try {
    const [pokedex, moves, typechart, movefx, roster, manifest, items, natures, abilities] = await Promise.all([
      loadJSON('data/pokedex.json'),
      loadJSON('data/moves.json'),
      loadJSON('data/typechart.json'),
      loadJSON('data/movefx.json'),
      loadJSON('data/roster.json'),
      loadJSON('assets/manifest.json'),
      loadJSON('data/items.json'),
      loadJSON('data/natures.json'),
      loadJSON('data/abilityfx.json'),
    ]);
    setItems(items);
    setAbilityData(abilities);
    Object.assign(DB, { pokedex, moves, typechart, natures: Object.fromEntries(natures.map((n) => [n.id, n])), abilities });
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
    const [bannerImg, bannerMeta] = await Promise.all([
      loadImage('assets/ui/banner.png'),
      loadJSON('assets/ui/banner.json'),
      document.fonts.load('12px PMD'),
      SETTINGS.lang === 'ko' ? document.fonts.load('12px Galmuri11', '한') : null,
    ]);
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
    game.input.setLabels(t('dodge'), t('switch'));
    if (game.input.touchMode) document.body.classList.add('touch');
    game.input.onKey((code) => game.onKey(code));
    game.setup = loadTeam() || defaultSetup(); // the last team is remembered
    game.saveTeam = () => saveTeam(game.setup);
    game.makeDecor();
    game.ui = new UI(game, keys, game.arts);
    document.getElementById('loading').classList.add('done');
    game.toLobby();
    // URL shortcuts for testing: ?mode=trio&cpu=all&autostart, ?p1=rayquaza&p2=mewtwo&cpu
    const params = new URLSearchParams(location.search);
    if (params.has('mode') && MODES[params.get('mode')]) game.setup.mode = params.get('mode');
    if (params.has('cpu')) game.setup.players.forEach((p, i) => (p.human = params.get('cpu') !== 'all' && params.get('cpu') !== 'both' ? i === 0 : false));
    if (params.has('p1') || params.has('p2')) {
      game.startFight([params.get('p1') || 'rayquaza', params.get('p2') || 'garchomp'], game.setup.players.map((p) => !p.human), [params.get('i1'), params.get('i2')]);
    } else if (params.has('autostart')) game.startBattle(game.setup);
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
