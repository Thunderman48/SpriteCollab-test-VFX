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
/** Mold Breaker / Turboblaze: the attacker ignores the target's ability. */
// The move landing the current hit (Sunsteel Strike / Moongeist Beam ignore the target's ability).
let hitMove = null;
export const setHitMove = (m) => {
  hitMove = m;
};
const breaks = (att) => ab(att, 'moldbreaker') || ab(att, 'turboblaze') || ab(att, 'teravolt') || !!hitMove?.ignoreAbility;
const PROTECTS = ['protect', 'spikyshield', 'kingsshield'];
/** The defender's ability, unless the attacker ignores it. */
const defAb = (att, def, id) => !breaks(att) && ab(def, id);
/** A move's type for this user (Pixilate turns Normal moves into Fairy moves). */
export function moveType(f, m) {
  if (m.type === 'Normal' && ab(f, 'pixilate')) return 'Fairy';
  if (m.flags?.includes('sound') && ab(f, 'liquidvoice')) return 'Water';
  return m.type;
}

/** Priority (faster wind-up): the move's own priority, or Gale Wings on Flying moves at full HP. */
export const hasPriority = (f, m) =>
  m.priority > 0 || (ab(f, 'galewings') && m.type === 'Flying' && f.hp >= f.maxHp) || (ab(f, 'prankster') && m.category === 'Status');
/** Grounded (not flying / Levitate): affected by terrain. */
const grounded = (f) => !f.data.flying && !ab(f, 'levitate');
/** Terrain (Grassy Surge): 'grassy' or null. */
export const terrainNow = (game) => game.terrain?.id || null;
function setTerrain(game, id) {
  game.terrain = { id, t: WEATHER_TIME };
  say(game, id === 'electric' ? 'terrainElectric' : 'terrainGrassy');
}
export const stageMul = (n) => (n >= 0 ? (2 + n) / 2 : 2 / (2 - n));
const chance = (pct) => Math.random() * 100 < pct;
const say = (game, key, vars) => game.ui?.log(t(key, vars));
const float = (game, f, text, color, big = false) => game.addEffect(new FloatText(text, f.x + (Math.random() - 0.5) * 8, f.y - 30, color, big));
const fxAt = (game, def, f, opts = {}) => def && game.addEffect(new Effect(def, f.x, f.y + (opts.dy ?? -6), opts));

// ---------- weather ----------
/** Active weather id ('raindance' | 'sunnyday' | 'sandstorm') or null (Air Lock cancels it). */
export function weatherNow(game) {
  if (!game.weather) return null;
  if (game.fighters.some((f) => f.alive && (ab(f, 'airlock') || ab(f, 'cloudnine')))) return null;
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
export function boost(game, f, boosts, source = null, bounced = false) {
  if (!f.alive) return;
  const enemy = source && source.team !== f.team;
  let up = false;
  let down = false;
  for (let [k, raw] of Object.entries(boosts)) {
    if (!raw || !STAT_KEYS.includes(k)) continue;
    if (ab(f, 'contrary')) raw = -raw; // Contrary: reversed
    const guarded = ab(f, 'clearbody') || ab(f, 'fullmetalbody') || (k === 'atk' && ab(f, 'hypercutter'));
    if (raw < 0 && enemy && guarded) {
      ability(game, f);
      continue;
    }
    // Mirror Armor: the drop bounces back to the one who caused it.
    if (raw < 0 && enemy && ab(f, 'mirrorarmor') && !bounced) {
      ability(game, f);
      boost(game, source, { [k]: raw }, f, true);
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
  if (down && enemy && ab(f, 'competitive')) {
    ability(game, f);
    boost(game, f, { spa: 2 }, f);
  }
  if (down && enemy && ab(f, 'defiant')) {
    ability(game, f);
    boost(game, f, { atk: 2 }, f);
  }
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
  if (id === 'confusion') return f.confusedT > 0 ? 'has' : ab(f, 'owntempo') ? 'type' : null;
  if (f.status) return 'has';
  if (f.statusImmune > 0) return 'immune';
  const types = f.types;
  if (id === 'brn' && types.includes('Fire')) return 'type';
  if (id === 'par' && (types.includes('Electric') || ab(f, 'limber'))) return 'type';
  if ((id === 'psn' || id === 'tox') && (types.includes('Poison') || types.includes('Steel') || ab(f, 'immunity'))) return 'type';
  if (id === 'frz' && (types.includes('Ice') || weatherNow(game) === 'sunnyday')) return 'type';
  if (f.protectT > 0 && source && source !== f) return 'protect';
  if (id === 'slp' && (ab(f, 'vitalspirit') || (terrainNow(game) === 'electric' && grounded(f)))) return 'type';
  return null;
}

export function inflict(game, f, id, source = null, { force = false } = {}) {
  if (id === 'confusion') return confuse(game, f);
  if (!force && statusBlock(game, f, id, source)) return false;
  f.status = { id, t: STATUS_TIME[id] * (id === 'slp' && ab(f, 'earlybird') ? 0.5 : 1), tick: 0, n: 0 };
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
  if (!f.alive || f.confusedT > 0 || ab(f, 'owntempo')) return false;
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
  if (game.terrain && (game.terrain.t -= dt) <= 0) {
    say(game, game.terrain.id === 'electric' ? 'terrainEndElectric' : 'terrainEnd');
    game.terrain = null;
  }
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
    const def = MOVEFX.status[{ raindance: 'rain', sunnyday: 'sun', sandstorm: 'sand', snowscape: 'snow' }[w]];
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
  if (!w && terrainNow(game) === 'grassy') return 'rgba(60,200,60,0.1)';
  if (!w && terrainNow(game) === 'electric') return 'rgba(250,230,80,0.1)';
  return { raindance: 'rgba(40,70,140,0.18)', sunnyday: 'rgba(255,190,60,0.13)', sandstorm: 'rgba(170,130,60,0.2)', snowscape: 'rgba(220,235,255,0.2)' }[w] || null;
}

export function tickFighter(game, f, dt) {
  // Stat stage timers
  for (const k of Object.keys(f.boosts)) if ((f.boosts[k].t -= dt) <= 0) delete f.boosts[k];
  f.statusImmune = Math.max(0, f.statusImmune - dt);
  f.chillT = Math.max(0, f.chillT - dt);
  f.roostT = Math.max(0, f.roostT - dt);
  f.protectT = Math.max(0, f.protectT - dt);
  f.rechargeT = Math.max(0, f.rechargeT - dt);
  f.stunT = Math.max(0, (f.stunT || 0) - dt);
  f.anticipateT = Math.max(0, (f.anticipateT || 0) - dt);
  if (f.bladeT > 0 && (f.bladeT -= dt) <= 0) formChange(game, f, false); // Stance Change: back to Shield Forme
  if (f.confusedT > 0) f.confusedT = Math.max(0, f.confusedT - dt);
  f.fxT = (f.fxT || 0) - dt;
  const w = weatherNow(game);
  f.sec = (f.sec || 0) + dt;
  const perSecond = f.sec >= 1;
  if (perSecond) f.sec -= 1;

  const s = f.status;
  if (s) {
    s.t -= dt * (ab(f, 'naturalcure') ? 2 : 1);
    if (perSecond) {
      s.n++;
      if (s.id === 'brn') hurt(game, f, 0.02, '#f89858');
      const poisoned = s.id === 'psn' || s.id === 'tox';
      if (poisoned && ab(f, 'poisonheal')) f.heal(f.maxHp * 0.025);
      else if (s.id === 'psn') hurt(game, f, 0.025);
      else if (s.id === 'tox') hurt(game, f, Math.min(0.06, 0.012 * s.n));
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
    const sandProof = ['sandveil', 'sandrush', 'sandforce', 'overcoat'].some((a) => ab(f, a));
    if (ab(f, 'dryskin') && w === 'raindance') f.heal(f.maxHp * 0.01);
    if (ab(f, 'dryskin') && w === 'sunnyday') hurt(game, f, 0.01, '#f8d858');
    if (w === 'sandstorm' && !f.types.some((x) => ['Rock', 'Ground', 'Steel'].includes(x)) && !sandProof) hurt(game, f, 0.01, '#d8b878');
    if (ab(f, 'regenerator') && game.mode?.party === 1 && f.still && !f.cast) f.heal(f.maxHp * 0.005);
    if (terrainNow(game) === 'grassy' && grounded(f)) f.heal(f.maxHp * 0.01);
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
  f.enteredAt = game.fightTime || 0; // Fake Out works only right after entering
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
      if (['innerfocus', 'clearbody', 'oblivious', 'owntempo'].some((a) => ab(e, a))) continue;
      boost(game, e, { atk: -1 }, f);
    }
  }
  if (ab(f, 'sandstream')) setWeather(game, 'sandstorm', f);
  if (ab(f, 'drought')) setWeather(game, 'sunnyday', f);
  if (ab(f, 'drizzle')) setWeather(game, 'raindance', f);
  if (ab(f, 'grassysurge')) setTerrain(game, 'grassy');
  if (ab(f, 'electricsurge')) setTerrain(game, 'electric');
  if (ab(f, 'orichalcumpulse')) {
    ability(game, f);
    setWeather(game, 'sunnyday', f);
  }
  if (ab(f, 'intrepidsword') && !f.intrepidDone) {
    f.intrepidDone = true;
    ability(game, f);
    boost(game, f, { atk: 1 }, f);
  }
  if (ab(f, 'frisk')) {
    for (const e of foes) if (e.item && !e.itemSpent) game.ui?.log(t('frisked', { who: game.who(f), foe: game.who(e), item: e.itemLabel() }));
  }
  // Illusion: looks like the nearest foe until it's hit.
  if (ab(f, 'illusion') && !f.illusionBroken) {
    const near = game.nearestEnemy(f);
    if (near) f.setIllusion(near.art);
  }
}

/** Switching out (Trio): Regenerator heals, Natural Cure cures. */
export function onSwitchOut(game, f) {
  if (ab(f, 'regenerator') && f.alive) f.heal(f.maxHp / 3);
  if (ab(f, 'naturalcure') && f.status) {
    f.status = null;
    f.statusImmune = 0;
  }
}

/** Final damage tweaks: Disguise blocks the first hit. */
export function adjustDamage(game, att, def, dmg) {
  if (dmg >= def.hp && def.hp >= def.maxHp && defAb(att, def, 'sturdy')) {
    ability(game, def);
    game.ui?.log(t('enduredHit', { who: game.who(def) }));
    return def.hp - 1;
  }
  if (dmg > 0 && defAb(att, def, 'disguise') && !def.disguiseBroken) {
    def.disguiseBroken = true;
    ability(game, def);
    game.ui?.log(t('disguiseBusted', { who: game.who(def) }));
    return Math.floor(def.maxHp / 8);
  }
  return dmg;
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
    if (PROTECTS.includes(id)) return threatened(game, f);
    if (id === 'bellydrum') return f.hp > f.maxHp * 0.6 && stageOf(f, 'atk') < 4;
    if (isHeal(m) || id === 'rest') return f.hp < f.maxHp * (id === 'rest' ? 0.5 : 0.6) && !(id === 'rest' && f.status);
    if (id === 'focusenergy') return stageOf(f, 'crit') < 2;
    if (SELF_BUFF(m)) return Object.entries(m.boosts).some(([k, v]) => v > 0 && stageOf(f, k) < 4);
    return true;
  }
  if (!foe || !foe.alive) return false;
  if (f.distTo(foe) > fx.range + foe.radius) return false;
  if (!breaks(f) && wontAffect(f, foe, m)) return false;
  if (m.category === 'Status') {
    if (ab(foe, 'magicbounce')) return false;
    if (m.flags?.includes('powder') && foe.types.includes('Grass')) return false;
    if (m.status) return !statusBlock(game, foe, m.status, f) && !(m.status === 'par' && effectiveness('Electric', foe.types) === 0);
    if (m.volatile === 'confusion') return foe.confusedT <= 0;
    return true;
  }
  // Damaging: never waste a move the target is immune to (or absorbs).
  const type = moveType(f, m);
  if (effectiveness(type, foe.types) === 0) return false;
  if (!breaks(f) && immuneAbility(foe, type)) return false;
  if (id === 'solarbeam' && w === 'raindance') return Math.random() < 0.02;
  if (id === 'fakeout') return (game.fightTime || 0) - (f.enteredAt || 0) < 4;
  return true;
}

/** Abilities that make a move do nothing (Bulletproof, Soundproof, Overcoat, Good as Gold, Prankster vs Dark). */
function wontAffect(f, foe, m) {
  if (ab(foe, 'bulletproof') && m.flags?.includes('bullet')) return true;
  if (ab(foe, 'soundproof') && m.flags?.includes('sound')) return true;
  if (ab(foe, 'overcoat') && m.flags?.includes('powder')) return true;
  if (m.category === 'Status' && (ab(foe, 'goodasgold') || (ab(f, 'prankster') && foe.types.includes('Dark')))) return true;
  return false;
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

// Abilities that make a Pokémon immune to a type (and what they do when hit by it).
const IMMUNE = {
  waterabsorb: 'Water', flashfire: 'Fire', lightningrod: 'Electric', voltabsorb: 'Electric', sapsipper: 'Grass', levitate: 'Ground',
  motordrive: 'Electric', dryskin: 'Water',
};
const immuneAbility = (f, type) => IMMUNE[f?.ability] === type;

// ---------- hits ----------
/**
 * Before damage: Protect, absorbing abilities, evasion (Hustle / Telepathy / Sand Veil).
 * Returns true when the hit is stopped.
 */
export function preHit(game, att, def, cast) {
  const m = cast.move;
  const x = MOVEFX.moves[m.id]?.extra || {};
  if (def.protectT > 0 && !ab(att, 'infiltrator')) {
    if (x.breakProtect) {
      // Raging Bull smashes through.
      def.protectT = 0;
      float(game, def, t('shieldBroken'), '#f8a048', true);
      say(game, 'brokeProtect', { who: game.who(def) });
    } else {
      float(game, def, t('protected'), '#88f8f8');
      fxAt(game, MOVEFX.status[def.protectKind] || MOVEFX.status.protect, def, { follow: def });
      if (m.flags?.includes('contact') && att.alive && att !== def && !ab(att, 'longreach')) {
        if (def.protectKind === 'spikyshield') hurt(game, att, 0.125, '#78c850');
        if (def.protectKind === 'kingsshield') boost(game, att, { atk: -1 }, def);
      }
      return true;
    }
  }
  const nope = () => {
    ability(game, def);
    game.ui?.log(t('noEffect', { who: game.who(def) }));
    return true;
  };
  if (att.team !== def.team) {
    if (defAb(att, def, 'bulletproof') && m.flags?.includes('bullet')) return nope();
    if (defAb(att, def, 'soundproof') && m.flags?.includes('sound')) return nope();
    if (defAb(att, def, 'overcoat') && m.flags?.includes('powder')) return nope();
    if (defAb(att, def, 'goodasgold') && m.category === 'Status') return nope();
    if (m.category === 'Status' && ab(att, 'prankster') && def.types.includes('Dark')) {
      game.ui?.log(t('noEffect', { who: game.who(def) }));
      return true;
    }
  }
  if (m.category !== 'Status' && !breaks(att) && immuneAbility(def, moveType(att, m))) {
    ability(game, def);
    if (ab(def, 'waterabsorb') || ab(def, 'voltabsorb')) def.heal(def.maxHp * 0.25);
    if (ab(def, 'flashfire') && !def.flashFire) def.flashFire = true;
    if (ab(def, 'lightningrod')) boost(game, def, { spa: 1 }, def);
    if (ab(def, 'sapsipper')) boost(game, def, { atk: 1 }, def);
    if (ab(def, 'motordrive')) boost(game, def, { spe: 1 }, def);
    if (ab(def, 'dryskin')) def.heal(def.maxHp * 0.25);
    game.ui?.log(t('noEffect', { who: game.who(def) }));
    return true;
  }
  if (m.category === 'Physical' && ab(att, 'hustle') && Math.random() < 0.2) return miss(game, att, def);
  const sharpEyed = ab(att, 'keeneye') || ab(att, 'illuminate') || ab(att, 'compoundeyes');
  if (m.category !== 'Status' && !noGuard(att, def) && !sharpEyed) {
    if (defAb(att, def, 'snowcloak') && weatherNow(game) === 'snowscape' && Math.random() < 0.2) return miss(game, att, def);
    if (defAb(att, def, 'telepathy') && Math.random() < 0.1) return miss(game, att, def);
    if (defAb(att, def, 'sandveil') && weatherNow(game) === 'sandstorm' && Math.random() < 0.2) return miss(game, att, def);
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
  const type = moveType(att, m);
  const pinch = att.hp <= att.maxHp / 3;
  const PINCH = { blaze: 'Fire', overgrow: 'Grass', torrent: 'Water', swarm: 'Bug' };
  if (pinch && PINCH[att.ability] === type) mul *= 1.5;
  if (type !== m.type) mul *= 1.2; // Pixilate
  if (ab(att, 'sharpness') && m.flags?.includes('slicing')) mul *= 1.5;
  if (ab(att, 'analytic') && (def.cast || def.castGap > 0)) mul *= 1.3;
  if (ab(att, 'rivalry') && def.types.some((ty) => att.types.includes(ty))) mul *= 1.25;
  if (ab(att, 'sheerforce') && m.secondary) mul *= 1.3;
  if (terrainNow(game) === 'grassy') {
    if (type === 'Grass' && grounded(att)) mul *= 1.3;
    if (m.id === 'earthquake' && grounded(def)) mul *= 0.5;
  }
  if (terrainNow(game) === 'electric' && type === 'Electric' && grounded(att)) mul *= 1.3;
  if (x.superOn && def.types.includes(x.superOn)) mul *= 4; // Freeze-Dry hits Water super effectively
  if (ab(att, 'reckless') && (m.recoil || MOVEFX.moves[m.id]?.crash)) mul *= 1.2;
  const aura = { Fairy: 'fairyaura', Dark: 'darkaura' }[type];
  if (aura && game.fighters.some((f) => f.alive && ab(f, aura))) mul *= 4 / 3;
  if (m.flags?.includes('sound')) {
    if (ab(att, 'punkrock')) mul *= 1.3;
    if (defAb(att, def, 'punkrock')) mul *= 0.5;
  }
  if (defAb(att, def, 'dryskin') && type === 'Fire') mul *= 1.25;
  if (ab(def, 'shadowshield') && def.hp >= def.maxHp) mul *= 0.5; // can't be broken
  if (m.id === 'collisioncourse' && effectiveness(type, def.types) > 1) mul *= 4 / 3;
  if (ab(att, 'technician') && power <= 60) mul *= 1.5;
  if (ab(att, 'ironfist') && m.flags?.includes('punch')) mul *= 1.2;
  if (att.flashFire && type === 'Fire') mul *= 1.5;
  if (defAb(att, def, 'multiscale') && def.hp >= def.maxHp) mul *= 0.5;
  if (defAb(att, def, 'thickfat') && (type === 'Fire' || type === 'Ice')) mul *= 0.5;
  if (defAb(att, def, 'damp') && MOVEFX.moves[m.id]?.behavior === 'burst') mul *= 0.75;
  if (m.category === 'Physical' && att.status?.id === 'brn' && !ab(att, 'guts')) mul *= 0.5;
  const w = weatherNow(game);
  if (w === 'raindance') mul *= type === 'Water' ? 1.5 : type === 'Fire' ? 0.5 : 1;
  if (w === 'sunnyday') mul *= type === 'Fire' ? 1.5 : type === 'Water' ? 0.5 : 1;
  if (w === 'sandstorm' && ab(att, 'sandforce') && ['Rock', 'Ground', 'Steel'].includes(type)) mul *= 1.3;
  if (x.hpPower) power = Math.max(1, Math.floor((power * att.hp) / att.maxHp)); // Eruption
  if (m.id === 'knockoff' && def.item && !def.itemSpent) power *= 1.5;
  if (m.id === 'heavyslam') {
    const r = (att.data.weightkg || 1) / (def.data.weightkg || 1);
    power = r >= 5 ? 120 : r >= 4 ? 100 : r >= 3 ? 80 : r >= 2 ? 60 : 40;
  }
  if (m.id === 'acrobatics' && (!att.item || att.itemSpent)) power *= 2;
  if (m.id === 'hex' && def.status) power *= 2;
  if (m.id === 'ragefist') power = Math.min(350, 50 + 50 * (att.timesHit || 0));
  if (x.punish && def.cast) mul *= x.punish; // Sucker Punch
  const stab = ab(att, 'protean') || ab(att, 'libero') || att.types.includes(type) ? (ab(att, 'adaptability') ? 2 : 1.5) : 1;
  const critStage = m.willCrit ? 3 : (m.critRatio ? m.critRatio - 1 : 0) + stageOf(att, 'crit') + (ab(att, 'superluck') ? 1 : 0);
  return {
    mul, power, stab, critStage, type,
    offStat: m.offStat, // Body Press attacks with Defense
    defStat: m.defStat, // Psyshock hits Defense
    noCrit: defAb(att, def, 'shellarmor'),
    critMul: ab(att, 'sniper') ? 2.25 : 1.5,
    ignoreAtkStages: defAb(att, def, 'unaware'), // the defender ignores the attacker's boosts
    ignoreDefStages: ab(att, 'unaware') || !!m.ignoreStages || !!x.ignoreStages,
  };
}

/** After a hit landed: original secondary effects + this game's extra properties + contact abilities. */
export function afterHit(game, att, def, cast, dmg, { angle = 0, crit = false } = {}) {
  const m = cast.move;
  const x = MOVEFX.moves[m.id]?.extra || {};
  const once = (cast.effected ||= new Set());
  const first = !once.has(def);
  once.add(def);
  const sg = (ab(att, 'serenegrace') ? 2 : 1) * (ab(att, 'compoundeyes') ? 1.3 : 1);

  if (dmg > 0) {
    if (m.drain && att.alive) {
      const h = att.heal(Math.max(1, Math.round(dmg * m.drain)));
      if (h > 0) game.addEffect(new FloatText(`+${Math.round(h)}`, att.x, att.y - 24, '#78f878'));
    }
    if (m.recoil && !ab(att, 'rockhead')) game.recoil(att, Math.floor(dmg * m.recoil));
    if (def.status?.id === 'frz' && m.type === 'Fire') cureStatus(game, def);
  }
  if (first && def.alive) {
    for (const s of ab(att, 'sheerforce') ? [] : m.secondary || []) {
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
    if (crit && ab(def, 'angerpoint') && def.alive) {
      ability(game, def);
      boost(game, def, { atk: 12 }, def);
    }
    if (m.category === 'Physical' && ab(def, 'weakarmor') && def.alive) {
      ability(game, def);
      boost(game, def, { def: -1, spe: 2 }, def);
    }
    if (dmg > 0 && ab(att, 'magician') && !att.item && def.item && !def.itemSpent && def.alive) {
      ability(game, att);
      say(game, 'knockedOff', { who: game.who(def), item: def.itemLabel() });
      def.loseItem();
    }
    if (m.flags?.includes('contact') && att.alive && !ab(att, 'longreach')) {
      if (ab(att, 'poisontouch') && chance(30) && !statusBlock(game, def, 'psn', att)) {
        ability(game, att);
        inflict(game, def, 'psn', att);
      }
      if (ab(def, 'poisonpoint') && chance(30)) {
        ability(game, def);
        inflict(game, att, 'psn', def);
      }
      if (ab(def, 'effectspore') && chance(30) && !att.types.includes('Grass')) {
        ability(game, def);
        inflict(game, att, ['psn', 'par', 'slp'][Math.floor(Math.random() * 3)], def);
      }
      if (ab(def, 'static') && chance(30)) {
        ability(game, def);
        inflict(game, att, 'par', def);
      }
      if (ab(def, 'roughskin')) {
        ability(game, def);
        hurt(game, att, 0.06, '#f8a858');
      }
      if (ab(def, 'flamebody') && chance(30)) {
        ability(game, def);
        inflict(game, att, 'brn', def);
      }
      if (ab(def, 'cutecharm') && chance(30) && !ab(att, 'oblivious')) {
        ability(game, def);
        confuse(game, att);
      }
      if (ab(def, 'gooey')) {
        ability(game, def);
        boost(game, att, { spe: -1 }, def);
      }
      if (ab(def, 'pickpocket') && att.item && !att.itemSpent) {
        ability(game, def);
        say(game, 'knockedOff', { who: game.who(att), item: att.itemLabel() });
        att.loseItem();
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
    if (ab(def, 'magicbounce') && att.alive && att !== def) {
      // Bounced back at the user.
      ability(game, def);
      if (m.status) inflict(game, att, m.status, def);
      else if (m.volatile === 'confusion') confuse(game, att);
      return;
    }
    if (m.status) {
      if (m.status === 'par' && effectiveness('Electric', def.types) === 0) ok = false;
      else if (m.flags?.includes('powder') && def.types.includes('Grass')) ok = false; // Spore: Grass types are immune
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
  // Stance Change: attacking turns Aegislash into Blade Forme.
  if (ab(c, 'stancechange') && m.category !== 'Status') {
    if (!(c.bladeT > 0)) formChange(game, c, true);
    c.bladeT = 5;
  }
}

/** Skills with the `self` behaviour: buffs, heals, Protect, weather, Rest. */
export function selfMove(game, c, cast) {
  const m = cast.move;
  const w = weatherNow(game);
  if (m.weather) return setWeather(game, m.weather, c);
  if (PROTECTS.includes(m.id)) {
    c.protectT = 0.8;
    c.protectKind = m.id;
    if (m.id === 'kingsshield' && c.bladeT > 0) formChange(game, c, false);
    say(game, 'protectLog', { who: game.who(c) });
    game.addEffect(new Effect(MOVEFX.status[m.id] || MOVEFX.status.protect, c.x, c.y - 6, { follow: c, life: 0.8, loop: true }));
    return;
  }
  if (m.id === 'bellydrum') {
    if (c.hp <= c.maxHp / 2 || stageOf(c, 'atk') >= 6) return float(game, c, t('failed'), '#c8c8c8');
    const cost = Math.floor(c.maxHp / 2);
    c.hp -= cost;
    game.addEffect(new FloatText(String(cost), c.x + 6, c.y - 18, '#f8a858'));
    say(game, 'bellyDrum', { who: game.who(c) });
    return boost(game, c, { atk: 12 }, c);
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

/** Stance Change (Aegislash): Blade Forme swaps its attack and defense stats. */
function formChange(game, f, blade) {
  f.bladeT = blade ? 5 : 0;
  if (!f.alive) return;
  ability(game, f);
  say(game, blade ? 'bladeForme' : 'shieldForme', { who: game.who(f) });
  fxAt(game, MOVEFX.status[blade ? 'statUpRing' : 'statDownRing'], f, { dy: 6, layer: 'under' });
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
