// Battle effects adapted to real time: stat stages as timed buffs, status conditions,
// weather, move side effects (secondary chances, drain, recoil...) and abilities.
// Data: data/moves.json (original effects from @pkmn/dex), data/movefx.json `extra`
// (this game's extra properties) and data/abilityfx.json (ability texts).
import { DB, effectiveness } from './combat.js';
import { MOVEFX } from './moves.js';
import { Effect, FloatText } from './vfx.js';
import { t } from './i18n.js';

export const BUFF_TIME = 20; // seconds a stat change lasts (recasting stacks + refreshes)
export const STATUS_TIME = { brn: 8, psn: 8, tox: 8, par: 8, slp: 2.5, frz: 1.5 };
const IMMUNE_AFTER = 3; // no new status for a moment after one ends (no stun-locks)
const CONFUSE_TIME = 4;
const WEATHER_TIME = 20;
export const STAT_KEYS = ['atk', 'def', 'spa', 'spd', 'spe', 'crit'];

export const ab = (f, id) => !!f && f.ability === id;
export const stageMul = (n) => (n >= 0 ? (2 + n) / 2 : 2 / (2 - n));
const chance = (pct) => Math.random() * 100 < pct;
const say = (game, key, vars) => game.ui?.log(t(key, vars));
const float = (game, f, text, color, big = false) => game.addEffect(new FloatText(text, f.x + (Math.random() - 0.5) * 8, f.y - 30, color, big));
const fxAt = (game, def, f, opts = {}) => def && game.addEffect(new Effect(def, f.x, f.y + (opts.dy ?? -6), opts));

// ---------- weather ----------
/** Active weather id ('raindance' | 'sunnyday' | 'sandstorm') or null (Air Lock cancels it). */
export function weatherNow(game) {
  if (!game.weather) return null;
  if (game.fighters.some((f) => f.alive && ab(f, 'airlock'))) return null;
  return game.weather.id;
}

export function setWeather(game, id, by) {
  game.weather = { id, t: WEATHER_TIME };
  say(game, 'w_' + id);
  game.sfx?.('charge');
  if (by) game.ui?.buildHUD?.();
}

// ---------- stat stages ----------
export const stageOf = (f, k) => f.boosts?.[k]?.n || 0;

/**
 * Change stat stages: boosts = { atk: 2, spe: 1 }. source = the Pokémon causing it
 * (an enemy source is blocked by Clear Body).
 */
export function boost(game, f, boosts, source = null) {
  if (!f.alive) return;
  const enemy = source && source.team !== f.team;
  let up = false;
  let down = false;
  for (const [k, raw] of Object.entries(boosts)) {
    if (!raw || !STAT_KEYS.includes(k)) continue;
    if (raw < 0 && enemy && ab(f, 'clearbody')) {
      ability(game, f);
      continue;
    }
    const cur = f.boosts[k] || { n: 0, t: 0 };
    const n = Math.max(-6, Math.min(6, cur.n + raw));
    if (n === cur.n) continue;
    f.boosts[k] = { n, t: BUFF_TIME };
    if (n === 0) delete f.boosts[k];
    const sharp = Math.abs(raw) >= 2;
    say(game, raw > 0 ? (sharp ? 'statUp2' : 'statUp') : sharp ? 'statDown2' : 'statDown', { who: game.who(f), stat: t('s_' + k) });
    float(game, f, `${t('sh_' + k)}${(raw > 0 ? '↑' : '↓').repeat(Math.min(3, Math.abs(raw)))}`, raw > 0 ? '#f87858' : '#58a8f8');
    if (raw > 0) up = true;
    else down = true;
  }
  if (up) statFx(game, f, true);
  if (down) statFx(game, f, false);
  if (up || down) game.sfx?.(up ? 'go' : 'tick');
}

/** PMD-style stat change: streaks rising (raised) or falling (lowered) around the Pokémon + a ring. */
function statFx(game, f, up) {
  const def = MOVEFX.status[up ? 'statUp' : 'statDown'];
  for (let i = 0; i < 7; i++) {
    game.after(i * 0.05, () => {
      const x = f.x + (Math.random() - 0.5) * f.radius * 1.8;
      const y = f.y + (up ? 6 : -30) - Math.random() * 10;
      game.addEffect(new Effect(def, x, y, { vy: up ? -90 : 90, layer: 'over' }));
    }, null);
  }
  game.addEffect(new Effect(MOVEFX.status[up ? 'statUpRing' : 'statDownRing'], f.x, f.y + 6, { layer: 'under' }));
}

function ability(game, f) {
  const name = f.abilityName();
  game.addEffect(new FloatText(name, f.x, f.y - 44, '#f8e048'));
}

// ---------- status conditions ----------
/** Why a status can't be given (null = it can). */
export function statusBlock(game, f, id, source) {
  if (!f.alive) return 'ko';
  if (id === 'confusion') return f.confusedT > 0 ? 'has' : null;
  if (f.status) return 'has';
  if (f.statusImmune > 0) return 'immune';
  const types = f.types;
  if (id === 'brn' && types.includes('Fire')) return 'type';
  if (id === 'par' && types.includes('Electric')) return 'type';
  if ((id === 'psn' || id === 'tox') && (types.includes('Poison') || types.includes('Steel') || ab(f, 'immunity'))) return 'type';
  if (id === 'frz' && (types.includes('Ice') || weatherNow(game) === 'sunnyday')) return 'type';
  if (f.protectT > 0 && source && source !== f) return 'protect';
  return null;
}

export function inflict(game, f, id, source = null, { force = false } = {}) {
  if (id === 'confusion') return confuse(game, f);
  if (!force && statusBlock(game, f, id, source)) return false;
  f.status = { id, t: STATUS_TIME[id], tick: 0, n: 0 };
  if (f.cast && (id === 'slp' || id === 'frz')) game.cancelCast(f);
  say(game, 'st_' + id, { who: game.who(f) });
  float(game, f, t('stn_' + id), '#f8b8f8');
  fxAt(game, MOVEFX.status[id], f, { follow: f });
  game.sfx?.('hit');
  // Synchronize: the one who gave it a burn/poison/paralysis gets the same.
  if (ab(f, 'synchronize') && source && source !== f && ['brn', 'psn', 'tox', 'par'].includes(id)) {
    ability(game, f);
    inflict(game, source, id === 'tox' ? 'psn' : id, f);
  }
  return true;
}

function confuse(game, f) {
  if (!f.alive || f.confusedT > 0) return false;
  f.confusedT = CONFUSE_TIME;
  say(game, 'st_confusion', { who: game.who(f) });
  float(game, f, t('stn_confusion'), '#f8b8f8');
  return true;
}

export function cureStatus(game, f) {
  if (!f.status) return;
  if (f.status.id === 'slp') say(game, 'wokeUp', { who: game.who(f) });
  if (f.status.id === 'frz') say(game, 'thawed', { who: game.who(f) });
  f.status = null;
  f.statusImmune = IMMUNE_AFTER;
}

function flinch(game, f, source) {
  if (!f.alive || ab(f, 'innerfocus')) return;
  // Only matters while winding up: the attack is interrupted (it stays ready).
  if (!f.cast || f.cast.released) return;
  game.cancelCast(f);
  f.castGap = 0.5;
  say(game, 'st_flinch', { who: game.who(f) });
  float(game, f, t('stn_flinch'), '#f8f8f8');
  fxAt(game, MOVEFX.status.flinch, f, { dy: -30 });
  if (ab(f, 'steadfast')) {
    ability(game, f);
    boost(game, f, { spe: 1 }, f);
  }
}

/** Loses HP outside of attacks (burn, poison, sand...). Magic Guard is immune. */
function hurt(game, f, frac, color = '#c878f8') {
  if (ab(f, 'magicguard') || !f.alive) return;
  const dmg = Math.max(1, Math.round(f.maxHp * frac));
  f.hp = Math.max(0, f.hp - dmg);
  game.addEffect(new FloatText(String(dmg), f.x + 6, f.y - 18, color));
  if (f.hp <= 0) f.faint();
}

// ---------- per-frame ----------
export function tickGame(game, dt) {
  if (game.weather && (game.weather.t -= dt) <= 0) {
    say(game, 'w_end_' + game.weather.id);
    game.weather = null;
  }
  const w = weatherNow(game);
  if (!w) return;
  // Weather particles over the arena.
  game.weatherFxT = (game.weatherFxT || 0) - dt;
  if (game.weatherFxT <= 0) {
    const b = game.bounds;
    const def = MOVEFX.status[w === 'raindance' ? 'rain' : w === 'sunnyday' ? 'sun' : 'sand'];
    const n = w === 'sunnyday' ? 1 : 3;
    for (let i = 0; i < n; i++) {
      const x = b.x0 + Math.random() * (b.x1 - b.x0);
      const y = w === 'sunnyday' ? 20 + Math.random() * 20 : b.y0 + Math.random() * (b.y1 - b.y0);
      game.addEffect(new Effect(def, x, y, { layer: 'over', alpha: w === 'sunnyday' ? 0.8 : 0.7 }));
    }
    game.weatherFxT = w === 'sunnyday' ? 0.5 : 0.06;
  }
}

/** Screen colour for the current weather (drawn over the arena floor). */
export function weatherTint(game) {
  const w = weatherNow(game);
  return w === 'raindance' ? 'rgba(40,70,140,0.18)' : w === 'sunnyday' ? 'rgba(255,190,60,0.13)' : w === 'sandstorm' ? 'rgba(170,130,60,0.2)' : null;
}

export function tickFighter(game, f, dt) {
  // Stat stage timers
  for (const k of Object.keys(f.boosts)) if ((f.boosts[k].t -= dt) <= 0) delete f.boosts[k];
  f.statusImmune = Math.max(0, f.statusImmune - dt);
  f.chillT = Math.max(0, f.chillT - dt);
  f.roostT = Math.max(0, f.roostT - dt);
  f.protectT = Math.max(0, f.protectT - dt);
  f.rechargeT = Math.max(0, f.rechargeT - dt);
  f.anticipateT = Math.max(0, (f.anticipateT || 0) - dt);
  if (f.confusedT > 0) f.confusedT = Math.max(0, f.confusedT - dt);
  f.fxT = (f.fxT || 0) - dt;
  const w = weatherNow(game);
  f.sec = (f.sec || 0) + dt;
  const perSecond = f.sec >= 1;
  if (perSecond) f.sec -= 1;

  const s = f.status;
  if (s) {
    s.t -= dt;
    if (perSecond) {
      s.n++;
      if (s.id === 'brn') hurt(game, f, 0.02, '#f89858');
      if (s.id === 'psn') hurt(game, f, 0.025);
      if (s.id === 'tox') hurt(game, f, Math.min(0.06, 0.012 * s.n));
    }
    if (f.fxT <= 0 && f.alive) {
      f.fxT = s.id === 'slp' ? 0.8 : s.id === 'frz' ? 0.35 : 0.7;
      fxAt(game, MOVEFX.status[s.id], f, { dy: s.id === 'slp' ? -26 : -8, layer: 'over' });
    }
    if (w === 'raindance' && ab(f, 'hydration')) {
      ability(game, f);
      cureStatus(game, f);
    } else if (f.status && f.status.t <= 0) cureStatus(game, f);
  } else if (f.confusedT > 0 && f.fxT <= 0) {
    f.fxT = 0.9;
    fxAt(game, MOVEFX.status.confusion, f, { dy: -30 });
  } else if (f.chillT > 0 && f.fxT <= 0) {
    f.fxT = 0.4;
    fxAt(game, MOVEFX.status.chill, f, { dy: -4 });
  }

  if (perSecond && f.alive) {
    if (w === 'sandstorm' && !f.types.some((x) => ['Rock', 'Ground', 'Steel'].includes(x)) && !ab(f, 'sandveil')) hurt(game, f, 0.01, '#d8b878');
    if (w === 'raindance' && ab(f, 'raindish')) f.heal(f.maxHp * 0.01);
    if (w === 'sunnyday' && ab(f, 'solarpower')) hurt(game, f, 0.01, '#f8d858');
    // Bad Dreams: sleeping foes lose HP.
    if (ab(f, 'baddreams')) for (const e of game.enemiesOf(f)) if (e.status?.id === 'slp') hurt(game, e, 0.04, '#a058f8');
  }
  // Outrage lock ends if the foe stays out of reach.
  if (f.lock && !f.cast && (f.lock.idle = (f.lock.idle || 0) + dt) > 3) {
    f.lock = null;
    confuse(game, f);
  }
  if (f.lock && f.cast) f.lock.idle = 0;
  if (ab(f, 'speedboost')) {
    f.speedBoostT = (f.speedBoostT ?? 8) - dt;
    if (f.speedBoostT <= 0) {
      f.speedBoostT = 8;
      ability(game, f);
      boost(game, f, { spe: 1 }, f);
    }
  }
}

// ---------- entering the field ----------
export function onEntry(game, f) {
  const foes = game.enemiesOf(f);
  if (ab(f, 'trace')) {
    const near = game.nearestEnemy(f);
    const copy = near && near.ability !== 'trace' ? near.ability : null;
    if (copy) {
      ability(game, f);
      f.ability = copy;
      game.ui?.log(t('traced', { who: game.who(f), ability: f.abilityName() }));
    }
  }
  if (ab(f, 'intimidate')) {
    ability(game, f);
    for (const e of foes) {
      if (ab(e, 'innerfocus') || ab(e, 'clearbody')) continue;
      boost(game, e, { atk: -1 }, f);
    }
  }
  if (ab(f, 'sandstream')) setWeather(game, 'sandstorm', f);
}

// ---------- casting ----------
/** Paralysis may stop a cast; confusion may make it hit itself. Returns false if the cast is lost. */
export function beforeCast(game, f, target, id) {
  if (f.status?.id === 'par' && Math.random() < 0.2) {
    say(game, 'fullPara', { who: game.who(f) });
    float(game, f, t('stn_par'), '#f8e048');
    fxAt(game, MOVEFX.status.par, f);
    f.castGap = 0.8;
    return false;
  }
  if (f.confusedT > 0 && Math.random() < 0.25) {
    say(game, 'hitSelf');
    const dmg = Math.max(1, Math.floor((Math.floor((22 * 40 * f.stats.atk) / f.stats.def) / 50 + 2) * (0.85 + Math.random() * 0.15)));
    f.takeHit(dmg, f.facing + Math.PI);
    game.addEffect(new FloatText(String(dmg), f.x, f.y - 20, '#f8f8f8'));
    f.castGap = 0.8;
    return false;
  }
  // Anticipation: a super-effective wind-up aimed at it recharges its dodge.
  if (target && ab(target, 'anticipation') && target.anticipateT <= 0) {
    const mv = DB.moves[id];
    if (mv.category !== 'Status' && effectiveness(mv.type, target.types) > 1) {
      target.anticipateT = 8;
      target.dodgeCd = 0;
      ability(game, target);
    }
  }
  return true;
}

/** Is the attacker allowed to land a hit through the defender's dodge? (No Guard) */
export const noGuard = (att, def) => ab(att, 'noguard') || ab(def, 'noguard');

const SELF_BUFF = (m) => m.category === 'Status' && m.target === 'self' && m.boosts;
// Healing skills (Moonlight / Synthesis heal by weather, so the data has no fixed fraction).
const WEATHER_HEAL = ['moonlight', 'synthesis', 'morningsun'];
const isHeal = (m) => !!m.heal || WEATHER_HEAL.includes(m.id);

/** Smart auto-cast: skip skills that would be wasted right now. */
export function wantsMove(game, f, id, foe) {
  const m = DB.moves[id];
  const fx = MOVEFX.moves[id];
  if (!m || !fx) return false;
  const w = weatherNow(game);
  if (fx.behavior === 'self') {
    if (m.weather) return game.weather?.id !== m.weather;
    if (id === 'protect') return threatened(game, f);
    if (isHeal(m) || id === 'rest') return f.hp < f.maxHp * (id === 'rest' ? 0.5 : 0.6) && !(id === 'rest' && f.status);
    if (id === 'focusenergy') return stageOf(f, 'crit') < 2;
    if (SELF_BUFF(m)) return Object.entries(m.boosts).some(([k, v]) => v > 0 && stageOf(f, k) < 4);
    return true;
  }
  if (!foe || !foe.alive) return false;
  if (f.distTo(foe) > fx.range + foe.radius) return false;
  if (m.category === 'Status') {
    if (m.status) return !statusBlock(game, foe, m.status, f) && !(m.status === 'par' && effectiveness('Electric', foe.types) === 0);
    if (m.volatile === 'confusion') return foe.confusedT <= 0;
    return true;
  }
  // Damaging: never waste a move the target is immune to (or absorbs).
  if (effectiveness(m.type, foe.types) === 0) return false;
  if (absorbs(foe, m.type)) return false;
  if (id === 'solarbeam' && w === 'raindance') return Math.random() < 0.02;
  return true;
}

/** Is something about to hit f? (for Protect) */
export function threatened(game, f) {
  for (const e of game.enemiesOf(f)) {
    if (e.cast && !e.cast.released && f.distTo(e) < MOVEFX.moves[e.cast.id].range + f.radius) return true;
  }
  for (const o of game.objects) {
    if (o.speed && o.owner && o.owner.team !== f.team) {
      const dx = f.x - o.x;
      const dy = f.y - o.y;
      const d = Math.hypot(dx, dy);
      if (d < 90 && (dx * Math.cos(o.angle) + dy * Math.sin(o.angle)) / (d || 1) > 0.8) return true;
    } else if (o.radius && o.time && Math.hypot(f.x - o.x, f.y - o.y) < o.radius + f.radius) return true;
  }
  return false;
}

const ABSORB = { Water: 'waterabsorb', Fire: 'flashfire', Electric: 'lightningrod' };
const absorbs = (f, type) => ab(f, ABSORB[type]);

// ---------- hits ----------
/**
 * Before damage: Protect, absorbing abilities, evasion (Hustle / Telepathy / Sand Veil).
 * Returns true when the hit is stopped.
 */
export function preHit(game, att, def, cast) {
  const m = cast.move;
  if (def.protectT > 0) {
    float(game, def, t('protected'), '#88f8f8');
    fxAt(game, MOVEFX.status.protect, def, { follow: def });
    return true;
  }
  if (m.category !== 'Status' && absorbs(def, m.type)) {
    ability(game, def);
    if (ab(def, 'waterabsorb')) def.heal(def.maxHp * 0.25);
    if (ab(def, 'flashfire') && !def.flashFire) def.flashFire = true;
    if (ab(def, 'lightningrod')) boost(game, def, { spa: 1 }, def);
    game.ui?.log(t('noEffect', { who: game.who(def) }));
    return true;
  }
  if (m.category === 'Physical' && ab(att, 'hustle') && Math.random() < 0.2) return miss(game, att, def);
  if (m.category !== 'Status' && !noGuard(att, def)) {
    if (ab(def, 'telepathy') && Math.random() < 0.1) return miss(game, att, def);
    if (ab(def, 'sandveil') && weatherNow(game) === 'sandstorm' && Math.random() < 0.2) return miss(game, att, def);
  }
  return false;
}

function miss(game, att, def) {
  float(game, def, t('missed'), '#c8c8c8');
  say(game, 'avoided', { who: game.who(def) });
  return true;
}

/** Damage multipliers from abilities, weather, status, extra properties (see computeDamage). */
export function damageMods(game, att, def, cast) {
  const m = cast.move;
  const x = MOVEFX.moves[m.id]?.extra || {};
  let mul = 1;
  let power = m.power;
  const pinch = att.hp <= att.maxHp / 3;
  const PINCH = { blaze: 'Fire', overgrow: 'Grass', torrent: 'Water', swarm: 'Bug' };
  if (pinch && PINCH[att.ability] === m.type) mul *= 1.5;
  if (ab(att, 'technician') && power <= 60) mul *= 1.5;
  if (ab(att, 'ironfist') && m.flags?.includes('punch')) mul *= 1.2;
  if (att.flashFire && m.type === 'Fire') mul *= 1.5;
  if (ab(def, 'multiscale') && def.hp >= def.maxHp) mul *= 0.5;
  if (ab(def, 'thickfat') && (m.type === 'Fire' || m.type === 'Ice')) mul *= 0.5;
  if (ab(def, 'damp') && MOVEFX.moves[m.id]?.behavior === 'burst') mul *= 0.75;
  if (m.category === 'Physical' && att.status?.id === 'brn' && !ab(att, 'guts')) mul *= 0.5;
  const w = weatherNow(game);
  if (w === 'raindance') mul *= m.type === 'Water' ? 1.5 : m.type === 'Fire' ? 0.5 : 1;
  if (w === 'sunnyday') mul *= m.type === 'Fire' ? 1.5 : m.type === 'Water' ? 0.5 : 1;
  if (x.hpPower) power = Math.max(1, Math.floor((power * att.hp) / att.maxHp)); // Eruption
  if (m.id === 'knockoff' && def.item && !def.itemSpent) power *= 1.5;
  if (x.punish && def.cast) mul *= x.punish; // Sucker Punch
  const stab = ab(att, 'protean') || att.types.includes(m.type) ? (ab(att, 'adaptability') ? 2 : 1.5) : 1;
  const critStage = (m.critRatio ? m.critRatio - 1 : 0) + stageOf(att, 'crit') + (ab(att, 'superluck') ? 1 : 0);
  return { mul, power, stab, critStage, noCrit: ab(def, 'shellarmor') };
}

/** After a hit landed: original secondary effects + this game's extra properties + contact abilities. */
export function afterHit(game, att, def, cast, dmg, { angle = 0 } = {}) {
  const m = cast.move;
  const x = MOVEFX.moves[m.id]?.extra || {};
  const once = (cast.effected ||= new Set());
  const first = !once.has(def);
  once.add(def);
  const sg = ab(att, 'serenegrace') ? 2 : 1;

  if (dmg > 0) {
    if (m.drain && att.alive) {
      const h = att.heal(Math.max(1, Math.round(dmg * m.drain)));
      if (h > 0) game.addEffect(new FloatText(`+${Math.round(h)}`, att.x, att.y - 24, '#78f878'));
    }
    if (m.recoil) game.recoil(att, Math.floor(dmg * m.recoil));
    if (def.status?.id === 'frz' && m.type === 'Fire') cureStatus(game, def);
  }
  if (first && def.alive) {
    for (const s of m.secondary || []) {
      if (!chance(s.chance * sg)) continue;
      if (s.status) inflict(game, def, s.status, att);
      if (s.volatile === 'flinch') flinch(game, def, att);
      if (s.volatile === 'confusion') confuse(game, def);
      if (s.boosts) boost(game, def, s.boosts, att);
      if (s.selfBoosts) boost(game, att, s.selfBoosts, att);
    }
    if (x.chill) {
      def.chillT = x.chill;
      fxAt(game, MOVEFX.status.chill, def);
    }
    if (m.id === 'knockoff' && def.item && !def.itemSpent) {
      say(game, 'knockedOff', { who: game.who(def), item: def.itemLabel() });
      def.loseItem();
    }
    // Contact abilities of the one that got hit.
    if (m.flags?.includes('contact') && att.alive) {
      if (ab(def, 'static') && chance(30)) {
        ability(game, def);
        inflict(game, att, 'par', def);
      }
      if (ab(def, 'roughskin')) {
        ability(game, def);
        hurt(game, att, 0.06, '#f8a858');
      }
    }
    if (ab(def, 'cursedbody') && chance(30) && att.cd[m.id] !== undefined) {
      ability(game, def);
      att.cd[m.id] = m.cooldown;
    }
    if (ab(def, 'justified') && m.type === 'Dark') {
      ability(game, def);
      boost(game, def, { atk: 1 }, def);
    }
  }
  // Status moves aimed at a foe (Will-O-Wisp, Thunder Wave, Toxic, Confuse Ray, Dark Void).
  if (m.category === 'Status' && first) {
    let ok = false;
    if (m.status) {
      if (m.status === 'par' && effectiveness('Electric', def.types) === 0) ok = false;
      else ok = inflict(game, def, m.status, att);
    } else if (m.volatile === 'confusion') ok = confuse(game, def);
    if (!ok) float(game, def, t('failed'), '#c8c8c8');
  }
}

/** Once per cast, when the move is used: self stat changes (Close Combat, Draco Meteor...), Outrage lock. */
export function onMoveUsed(game, c, id) {
  const m = DB.moves[id];
  if (m.selfBoosts) game.after(0.3, () => c.alive && boost(game, c, m.selfBoosts, c), null);
  if (m.recharge) c.pendingRecharge = 1.2;
  if (m.locked) {
    // Outrage: keeps raging for 2 more uses, then becomes confused.
    if (!c.lock) c.lock = { id, left: 2 };
    else if (--c.lock.left <= 0) {
      c.lock = null;
      game.after(0.5, () => confuse(game, c), null);
    }
    if (c.lock) c.cd[id] = 0.9;
  }
  if (m.selfSwitch) game.after(0.45, () => game.uturn?.(c), null);
}

/** Skills with the `self` behaviour: buffs, heals, Protect, weather, Rest. */
export function selfMove(game, c, cast) {
  const m = cast.move;
  const w = weatherNow(game);
  if (m.weather) return setWeather(game, m.weather, c);
  if (m.id === 'protect') {
    c.protectT = 0.8;
    say(game, 'protectLog', { who: game.who(c) });
    game.addEffect(new Effect(MOVEFX.status.protect, c.x, c.y - 6, { follow: c, life: 0.8, loop: true }));
    return;
  }
  if (m.id === 'rest') {
    const h = c.heal(c.maxHp);
    healText(game, c, h);
    c.status = null;
    c.statusImmune = 0;
    inflict(game, c, 'slp', c, { force: true });
    return;
  }
  if (m.id === 'focusenergy') return boost(game, c, { crit: 2 }, c);
  if (isHeal(m)) {
    let frac = m.heal || 0.5;
    if (WEATHER_HEAL.includes(m.id)) frac = w === 'sunnyday' ? 2 / 3 : w ? 0.25 : 0.5;
    healText(game, c, c.heal(c.maxHp * frac));
    if (m.id === 'roost' && c.data.types.includes('Flying')) c.roostT = 3;
    return;
  }
  if (m.boosts) boost(game, c, m.boosts, c);
}

function healText(game, c, h) {
  game.addEffect(new FloatText(`+${Math.round(h)}`, c.x, c.y - 26, '#78f878', true));
  game.addEffect(new Effect(MOVEFX.status.heal, c.x, c.y - 10, { follow: c, oy: -10 }));
  say(game, 'healLog', { who: game.who(c) });
}

/** A Pokémon was knocked out by an attack from `killer`. */
export function onKnockOut(game, killer) {
  if (!killer?.alive) return;
  if (ab(killer, 'moxie')) {
    ability(game, killer);
    boost(game, killer, { atk: 1 }, killer);
  }
  if (ab(killer, 'battlebond')) {
    ability(game, killer);
    boost(game, killer, { atk: 1, spa: 1, spe: 1 }, killer);
  }
}

/** Burning ground left by Fire Blast. */
export function burnGround(game, att, x, y, r, time) {
  let tt = 0;
  let life = 0;
  game.addUpdater((dt) => {
    life += dt;
    tt -= dt;
    if (tt <= 0) {
      tt = 0.25;
      const a = Math.random() * Math.PI * 2;
      const rr = Math.random() * r;
      game.addEffect(new Effect(MOVEFX.status.burnGround, x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.6, { layer: 'under', scale: 0.8 }));
      for (const e of game.enemiesOf(att)) {
        if (Math.hypot(e.x - x, (e.y - y) / 0.7) > r + e.radius || e.invuln > 0) continue;
        hurt(game, e, 0.012, '#f89858');
        if (chance(8)) inflict(game, e, 'brn', att);
      }
    }
    return life >= time;
  });
}
