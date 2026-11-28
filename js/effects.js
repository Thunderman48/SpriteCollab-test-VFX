// Battle effects adapted to real time: stat stages as timed buffs, status conditions,
// weather, move side effects (secondary chances, drain, recoil...) and abilities.
// Data: data/moves.json (original effects from @pkmn/dex), data/movefx.json `extra`
// (this game's extra properties) and data/abilityfx.json (ability texts).
import { DB, effectiveness, LEVEL } from './combat.js';
import { MOVEFX } from './moves.js';
import { Effect, FloatText } from './vfx.js';
import { t } from './i18n.js';

export const BUFF_TIME = 20; // seconds a stat change lasts (recasting stacks + refreshes)
export const STATUS_TIME = { brn: 8, psn: 8, tox: 8, par: 8, slp: 2.5, frz: 1.5 };
const IMMUNE_AFTER = 3; // no new status for a moment after one ends (no stun-locks)
const CONFUSE_TIME = 4;
const WEATHER_TIME = 20;
export const STAT_KEYS = ['atk', 'def', 'spa', 'spd', 'spe', 'crit'];

// Abilities that Neutralizing Gas can't switch off.
const UNSUPPRESSED = ['neutralizinggas', 'multitype', 'stancechange', 'zerotohero', 'zenmode', 'disguise'];
/** Neutralizing Gas: while one is out, every other Pokémon's ability stops working. */
const gassed = (f) => !UNSUPPRESSED.includes(f.ability) && !!f.game?.fighters?.some((o) => o !== f && !o.ko && o.ability === 'neutralizinggas');
export const ab = (f, id) => !!f && f.ability === id && !gassed(f) && !(f.gastroT > 0 && !UNSUPPRESSED.includes(id));
/** Mold Breaker / Turboblaze: the attacker ignores the target's ability. */
// The move landing the current hit (Sunsteel Strike / Moongeist Beam ignore the target's ability).
let hitMove = null;
export const setHitMove = (m) => {
  hitMove = m;
};
const breaks = (att) => ab(att, 'moldbreaker') || ab(att, 'turboblaze') || ab(att, 'teravolt') || !!hitMove?.ignoreAbility;
const PROTECTS = ['protect', 'spikyshield', 'kingsshield', 'banefulbunker', 'obstruct', 'silktrap'];
/** The defender's ability, unless the attacker ignores it. */
const defAb = (att, def, id) => !breaks(att) && ab(def, id);
/** A move's type for this user (Pixilate turns Normal moves into Fairy moves). */
export function moveType(f, m) {
  // Weather Ball takes the weather's type; Aura Wheel turns Dark when Morpeko is hangry.
  if (m.id === 'weatherball') return { sunnyday: 'Fire', raindance: 'Water', sandstorm: 'Rock', snowscape: 'Ice' }[weatherNow(f.game)] || 'Normal';
  if (m.id === 'aurawheel' && f.hangry) return 'Dark';
  if (m.type === 'Normal' && ab(f, 'pixilate')) return 'Fairy';
  if (m.type === 'Normal' && ab(f, 'refrigerate')) return 'Ice';
  if (m.flags?.includes('sound') && ab(f, 'liquidvoice')) return 'Water';
  return m.type;
}

/** Priority (faster wind-up): the move's own priority, or Gale Wings on Flying moves at full HP. */
export const hasPriority = (f, m) =>
  m.priority > 0 ||
  (m.id === 'grassyglide' && f.game?.terrain?.id === 'grassy') || (ab(f, 'galewings') && m.type === 'Flying' && f.hp >= f.maxHp) || (ab(f, 'prankster') && m.category === 'Status');
/** Grounded (not flying / Levitate): affected by terrain. */
const grounded = (f) => f.smackT > 0 || f.game?.gravity?.t > 0 || (!(f.magnetT > 0) && !f.data.flying && !ab(f, 'levitate'));
export const isGrounded = grounded;
/** Arena Trap (grounded foes) / Magnet Pull (Steel foes): their dodge recharges slower. */
export const trapped = (game, f) =>
  game.enemiesOf?.(f).some((e) => (ab(e, 'arenatrap') && grounded(f)) || (ab(e, 'magnetpull') && f.types.includes('Steel')));
const allies = (game, f) => game.fighters.filter((o) => o !== f && o.alive && o.team === f.team);
/** Terrain (Grassy Surge): 'grassy' or null. */
export const terrainNow = (game) => game.terrain?.id || null;
const TERRAIN_SAY = { grassy: 'terrainGrassy', electric: 'terrainElectric', psychic: 'terrainPsychic', misty: 'terrainMisty' };
export function setTerrain(game, id) {
  game.terrain = { id, t: WEATHER_TIME };
  say(game, TERRAIN_SAY[id]);
}
/** Message when a terrain ends. */
export const terrainEndKey = (id) => ({ grassy: 'terrainEnd', electric: 'terrainEndElectric', psychic: 'terrainEndPsychic', misty: 'terrainEndMisty' })[id];

// ---------- team / field effects (Tailwind, Reflect, Light Screen, Trick Room) ----------
const SIDE_TIME = { tailwind: 12, reflect: 12, lightscreen: 12, auroraveil: 12, safeguard: 12 };
/** Time left on a team effect for f's team (0 = off). */
export const sideOn = (game, team, id) => game.sides?.[team]?.[id] > 0;
function setSide(game, c, id) {
  game.sides ||= [{}, {}];
  game.sides[c.team][id] = SIDE_TIME[id];
  say(game, 'side_' + id, { who: game.who(c) });
}
/** Trick Room: for 10 s slower Pokémon move and recharge faster. Using it again ends it. */
export const trickRoom = (game) => game.room?.id === 'trickroom';
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
    // Flower Veil: Grass-type Pokémon on its team keep their stats.
    const veiled = f.types.includes('Grass') && f.game?.fighters?.some((o) => o.alive && o.team === f.team && ab(o, 'flowerveil'));
    const guarded = ab(f, 'clearbody') || ab(f, 'fullmetalbody') || (k === 'atk' && ab(f, 'hypercutter')) || veiled;
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
  // Corrosion: it can poison even Poison and Steel types.
  if ((id === 'psn' || id === 'tox') && (types.includes('Poison') || types.includes('Steel')) && !ab(source, 'corrosion')) return 'type';
  if ((id === 'psn' || id === 'tox') && ab(f, 'immunity')) return 'type';
  if (id === 'frz' && (types.includes('Ice') || weatherNow(game) === 'sunnyday')) return 'type';
  if (f.protectT > 0 && source && source !== f) return 'protect';
  if (id === 'slp' && (ab(f, 'vitalspirit') || (terrainNow(game) === 'electric' && grounded(f)))) return 'type';
  if (id === 'slp' && [f, ...allies(game, f)].some((o) => ab(o, 'sweetveil'))) return 'type';
  if (id === 'brn' && (ab(f, 'thermalexchange') || ab(f, 'waterbubble'))) return 'type';
  if (id === 'slp' && ab(f, 'insomnia')) return 'type';
  if (terrainNow(game) === 'misty' && grounded(f)) return 'type'; // Misty Terrain: no status on the ground
  if (sideOn(game, f.team, 'safeguard') && source && source.team !== f.team) return 'type'; // Safeguard
  if (ab(f, 'comatose')) return 'type'; // Komala is always half asleep
  if (id === 'brn' && ab(f, 'waterveil')) return 'type';
  if (ab(f, 'purifyingsalt') || (ab(f, 'leafguard') && weatherNow(game) === 'sunnyday')) return 'type';
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
  // Poison Puppeteer: its poison also confuses.
  if (source && ab(source, 'poisonpuppeteer') && (id === 'psn' || id === 'tox')) confuse(game, f);
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
    say(game, terrainEndKey(game.terrain.id));
    game.terrain = null;
  }
  if (game.gravity && (game.gravity.t -= dt) <= 0) {
    say(game, 'gravityEnd');
    game.gravity = null;
  }
  if (game.room && (game.room.t -= dt) <= 0) {
    say(game, 'roomEnd');
    game.room = null;
  }
  for (const [team, side] of (game.sides || []).entries()) {
    for (const k of Object.keys(side)) {
      if ((side[k] -= dt) > 0) continue;
      delete side[k];
      game.ui?.log(t('sideEnd_' + k, { team: team + 1 }));
    }
    // Tailwind: streaks of wind behind the team.
    if (side.tailwind > 0 && Math.random() < dt * 6) {
      const f = game.fighters.find((o) => o.team === team && o.alive);
      if (f) game.addEffect(new Effect(MOVEFX.status.tailwind, f.x - 20 + Math.random() * 40, f.y - 10 + Math.random() * 16, { layer: 'over', alpha: 0.6 }));
    }
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
  if (!w && terrainNow(game) === 'psychic') return 'rgba(230,110,230,0.12)';
  if (!w && terrainNow(game) === 'misty') return 'rgba(255,190,235,0.14)';
  if (!w && trickRoom(game)) return 'rgba(170,90,255,0.12)';
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
  f.glaiveT = Math.max(0, (f.glaiveT || 0) - dt);
  f.tauntT = Math.max(0, (f.tauntT || 0) - dt);
  f.gastroT = Math.max(0, (f.gastroT || 0) - dt);
  f.magnetT = Math.max(0, (f.magnetT || 0) - dt);
  f.followT = Math.max(0, (f.followT || 0) - dt);
  // Perish Body: a countdown to fainting (switching out clears it).
  if (f.perishT > 0) {
    const before = Math.ceil(f.perishT);
    f.perishT -= dt;
    if (Math.ceil(f.perishT) !== before && f.perishT > 0) float(game, f, String(Math.ceil(f.perishT)), '#c878f8', true);
    if (f.perishT <= 0 && f.alive) {
      say(game, 'perished', { who: game.who(f) });
      f.hp = 0;
      f.faint();
      return;
    }
  }
  // Yawn: drowsy now, asleep in a moment.
  if (f.yawnT > 0 && (f.yawnT -= dt) <= 0) inflict(game, f, 'slp', f.yawnBy);
  f.bondT = Math.max(0, (f.bondT || 0) - dt);
  f.smackT = Math.max(0, (f.smackT || 0) - dt);
  f.trapT = Math.max(0, (f.trapT || 0) - dt);
  f.syrupT = Math.max(0, (f.syrupT || 0) - dt);
  if (f.slowT > 0 && (f.slowT -= dt) <= 0) say(game, 'slowStartEnd', { who: game.who(f) });
  if (f.encore && (f.encore.t -= dt) <= 0) f.encore = null;
  if (f.stance && (f.stance.t -= dt) <= 0) f.stance = null;
  // Power Construct: once, below half HP, Zygarde becomes Complete Forme and recovers.
  if (ab(f, 'powerconstruct') && !f.complete && f.alive && f.hp < f.maxHp / 2) {
    f.complete = true;
    ability(game, f);
    say(game, 'completeForme', { who: game.who(f) });
    healText(game, f, f.heal(f.maxHp * 0.4));
  }
  // Zen Mode: below half HP Darmanitan turns Fire/Psychic and its Attack and Sp. Atk swap.
  if (ab(f, 'zenmode') && !f.zen && f.alive && f.hp < f.maxHp / 2) {
    f.zen = true;
    ability(game, f);
    say(game, 'zenMode', { who: game.who(f) });
    fxAt(game, MOVEFX.status.statUpRing, f, { dy: 6, layer: 'under' });
  }
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

  // Leech Seed / Salt Cure: lose HP every second for a while.
  if (f.seed && perSecond && f.alive) {
    const by = f.seed.by;
    const before = f.hp;
    hurt(game, f, 0.02, '#78c850');
    if (by?.alive && f.hp < before) {
      const h = by.heal(before - f.hp);
      if (h > 0) game.addEffect(new FloatText(`+${Math.round(h)}`, by.x, by.y - 24, '#78f878'));
    }
    fxAt(game, MOVEFX.status.seed, f, { dy: -10 });
    if ((f.seed.t -= 1) <= 0) f.seed = null;
  }
  if (f.cursed && perSecond && f.alive) {
    hurt(game, f, 0.025, '#a058f8');
    fxAt(game, MOVEFX.status.curse, f, { dy: -20 });
    if ((f.cursed.t -= 1) <= 0) f.cursed = null;
  }
  // Octolock: Defense and Sp. Def keep dropping while it's held.
  if (f.octo && perSecond && f.alive) {
    boost(game, f, { def: -1, spd: -1 }, f.octo.by);
    if ((f.octo.t -= 1) <= 0) f.octo = null;
  }
  // Aqua Ring / Ingrain: slowly heal.
  if (f.ringT > 0 && perSecond && f.alive) {
    f.heal(f.maxHp * 0.02);
    fxAt(game, MOVEFX.status[f.ringKind] || MOVEFX.status.heal, f, { dy: 4, layer: 'under' });
    f.ringT -= 1;
  }
  if (f.salt && perSecond && f.alive) {
    hurt(game, f, f.types.some((x) => x === 'Water' || x === 'Steel') ? 0.03 : 0.015, '#e8e8f8');
    fxAt(game, MOVEFX.status.salt, f, { dy: -8 });
    if ((f.salt.t -= 1) <= 0) f.salt = null;
  }
  if (perSecond && f.alive) {
    if (ab(f, 'shedskin') && f.status && chance(10)) {
      ability(game, f);
      cureStatus(game, f);
    }
    if (ab(f, 'icebody') && w === 'snowscape') f.heal(f.maxHp * 0.01);
    // Ice Face comes back in snow.
    if (ab(f, 'iceface') && f.faceBroken && w === 'snowscape') {
      f.faceBroken = false;
      ability(game, f);
    }
    // Symbiosis: hands its item to a partner who used theirs up.
    if (ab(f, 'symbiosis') && f.item && !f.itemSpent) {
      const mate = allies(game, f).find((o) => o.itemSpent && !o.itemPassed);
      if (mate) {
        mate.itemPassed = true;
        game.passItem?.(f, mate);
      }
    }
    // Moody: every 8 s one stat sharply rises and another falls.
    if (ab(f, 'moody') && (f.moodyT = (f.moodyT ?? 8) - 1) <= 0) {
      f.moodyT = 8;
      const ks = ['atk', 'def', 'spa', 'spd', 'spe'].sort(() => Math.random() - 0.5);
      ability(game, f);
      boost(game, f, { [ks[0]]: 2, [ks[1]]: -1 }, f);
    }
    // Honey Gather: now and then it finds honey and eats it.
    if (ab(f, 'honeygather') && (f.honeyT = (f.honeyT ?? 8) - 1) <= 0) {
      f.honeyT = 8;
      ability(game, f);
      healText(game, f, f.heal(f.maxHp * 0.04));
    }
    // Healer: now and then cures its partner's status.
    if (ab(f, 'healer') && (f.healerT = (f.healerT ?? 6) - 1) <= 0) {
      f.healerT = 6;
      const sick = allies(game, f).find((o) => o.status);
      if (sick) {
        ability(game, f);
        cureStatus(game, sick);
      }
    }
    // Harvest: a used berry may grow back (always in sun).
    if (ab(f, 'harvest') && f.item && f.itemSpent && /berry/.test(f.item.id) && (f.harvestT = (f.harvestT ?? 5) - 1) <= 0) {
      f.harvestT = 5;
      if (w === 'sunnyday' || chance(50)) {
        f.itemSpent = false;
        ability(game, f);
        say(game, 'harvested', { who: game.who(f), item: f.itemLabel() });
      }
    }
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
    const copy = near && !['trace', 'illusion', ...UNSUPPRESSED].includes(near.ability) ? near.ability : null;
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
  if (ab(f, 'snowwarning')) setWeather(game, 'snowscape', f);
  if (ab(f, 'psychicsurge')) setTerrain(game, 'psychic');
  // Pickup: empty-handed, it may find a Sitrus Berry.
  if (ab(f, 'pickup') && !f.item && !f.pickedUp && Math.random() < 0.5) {
    f.pickedUp = true;
    game.giveItem?.(f, 'berry_sitrus');
  }
  // Imposter: transforms into the foe right away.
  if (ab(f, 'imposter') && !f.transformed) {
    const near = game.nearestEnemy(f);
    if (near) game.after(0.3, () => f.alive && near.alive && !f.transformed && transform(game, f, near), null);
  }
  // Forewarn: reveals the foe's strongest skill.
  if (ab(f, 'forewarn')) {
    const best = foes.flatMap((e) => e.moves.map((id) => [e, DB.moves[id]])).sort((a, b) => (b[1].power || 0) - (a[1].power || 0))[0];
    if (best) game.ui?.log(t('forewarned', { who: game.who(f), foe: game.who(best[0]), move: best[1].name }));
  }
  if (game.healWish?.[f.slot]) {
    // Healing Wish: the next Pokémon in comes in fully healed.
    game.healWish[f.slot] = false;
    f.status = null;
    healText(game, f, f.heal(f.maxHp));
  }
  if (ab(f, 'mistysurge')) setTerrain(game, 'misty');
  if (ab(f, 'slowstart')) {
    ability(game, f);
    f.slowT = 5;
    say(game, 'slowStart', { who: game.who(f) });
  }
  if (ab(f, 'supersweetsyrup') && !f.syrupDone) {
    f.syrupDone = true;
    ability(game, f);
    for (const e of foes) e.syrupT = 10;
  }
  if (ab(f, 'neutralizinggas')) {
    ability(game, f);
    say(game, 'gasOut');
  }
  if (ab(f, 'dauntlessshield') && !f.dauntlessDone) {
    f.dauntlessDone = true;
    ability(game, f);
    boost(game, f, { def: 1 }, f);
  }
  // Download: raises Attack or Sp. Atk, whichever the foes defend worse against.
  if (ab(f, 'download') && foes.length) {
    const def = foes.reduce((s2, e) => s2 + e.statVal('def'), 0);
    const spd = foes.reduce((s2, e) => s2 + e.statVal('spd'), 0);
    ability(game, f);
    boost(game, f, def < spd ? { atk: 1 } : { spa: 1 }, f);
  }
  if (f.hero && !f.heroShown) {
    f.heroShown = true;
    ability(game, f);
    say(game, 'heroForm', { who: game.who(f) });
  }
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
  if (ab(f, 'zerotohero') && f.alive) f.hero = true; // comes back in as Hero Palafin
  f.seed = null; // switching out shakes off Leech Seed
  f.perishT = 0;
  f.glaiveT = 0;
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
  if (fx.behavior === 'hazard') return !!foe?.alive && (game.hazardCount?.(f, id) ?? 0) < (fx.max || 6) - 1;
  if (f.tauntT > 0 && m.category === 'Status') return false; // Taunt
  if (fx.stance) return threatenedBy(game, f, fx.stance.cat);
  if (fx.behavior === 'self') {
    if (id === 'auroraveil') return w === 'snowscape' && !sideOn(game, f.team, id);
    if (SIDE_TIME[id]) return !sideOn(game, f.team, id);
    if (id === 'coaching') return allies(game, f).length > 0 && allies(game, f).some((o) => stageOf(o, 'atk') < 3);
    if (id === 'lifedew' || id === 'junglehealing') return [f, ...allies(game, f)].some((o) => o.hp < o.maxHp * 0.7 || (id === 'junglehealing' && o.status));
    if (id === 'transform') return !!foe && !f.transformed && foe.data.key !== 'ditto';
    if (id === 'metronome') return !!foe && f.distTo(foe) < 260;
    if (id === 'curse') return f.types.includes('Ghost') ? !!foe && !foe.cursed && f.hp > f.maxHp * 0.5 : stageOf(f, 'atk') < 4;
    if (id === 'wish') return f.hp < f.maxHp * 0.7;
    if (id === 'healingwish') return f.hp < f.maxHp * 0.3 && (game.benchOf?.(f.slot) || []).some((o) => o.hp < o.maxHp * 0.7);
    if (id === 'aromatherapy' || id === 'healbell') return [...(game.parties[f.slot]?.members || []), ...allies(game, f)].some((o) => o.status && !o.ko);
    if (id === 'substitute') return !f.sub && f.hp > f.maxHp * 0.5;
    if (id === 'gravity') return !(game.gravity?.t > 0) && !!foe && foe.dodgeCd <= 0;
    if (id === 'magnetrise') return !(f.magnetT > 0) && !!foe && foe.moves.some((x) => DB.moves[x]?.type === 'Ground');
    if (id === 'aquaring' || id === 'ingrain') return !(f.ringT > 0) && f.hp < f.maxHp * 0.85;
    if (id === 'followme') return allies(game, f).length > 0 && !(f.followT > 0);
    if (id === 'powertrick') return !f.powerTrick && f.stats.def > f.stats.atk;
    if (id === 'teleport') return f.hp < f.maxHp * 0.35 && !!foe && f.distTo(foe) < 90;
    if (id === 'trickroom') return !trickRoom(game) && foe && foe.statVal('spe') > f.statVal('spe');
    if (id === 'psychicterrain' || id === 'mistyterrain') return terrainNow(game) !== id.replace('terrain', '');
    if (id === 'haze') return !!foe && Object.values(foe.boosts).reduce((n, b) => n + b.n, 0) >= 2;
    if (id === 'destinybond') return f.hp < f.maxHp * 0.3 && threatened(game, f);
    if (id === 'tidyup') return Object.values(f.boosts).some(() => true) ? stageOf(f, 'atk') < 3 : true;
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
    if (m.volatile === 'leechseed') return !foe.seed && !foe.types.includes('Grass');
    if (m.volatile === 'yawn') return !foe.status && !(foe.yawnT > 0) && !statusBlock(game, foe, 'slp', f);
    if (m.volatile === 'octolock') return !foe.octo;
    if (m.volatile === 'gastroacid') return !(foe.gastroT > 0) && !UNSUPPRESSED.includes(foe.ability);
    if (id === 'painsplit') return f.hp / f.maxHp < foe.hp / foe.maxHp - 0.2;
    if (id === 'trick') return !!(f.item && !f.itemSpent) !== !!(foe.item && !foe.itemSpent) || Math.random() < 0.1;
    if (id === 'topsyturvy') return Object.values(foe.boosts).reduce((n, b) => n + b.n, 0) >= 2;
    if (id === 'psychup') return Object.values(foe.boosts).reduce((n, b) => n + b.n, 0) >= 2;
    if (id === 'skillswap') return !UNSUPPRESSED.includes(foe.ability) && Math.random() < 0.3;
    if (id === 'partingshot') return true;
    if (id === 'sketch') return !!foe.lastMove && !f.moves.includes(foe.lastMove) && !!MOVEFX.moves[foe.lastMove];
    if (m.volatile === 'taunt') return !(foe.tauntT > 0) && foe.moves.some((x) => DB.moves[x]?.category === 'Status');
    if (m.volatile === 'encore') return !!foe.lastMove && !foe.encore && (game.fightTime || 0) - (foe.lastMoveAt || 0) < 3;
    if (id === 'strengthsap') return f.hp < f.maxHp * 0.7;
    return true;
  }
  // Damaging: never waste a move the target is immune to (or absorbs).
  const type = moveType(f, m);
  const scrappy = ab(f, 'scrappy') && (type === 'Normal' || type === 'Fighting');
  const arrows = id === 'thousandarrows';
  if (effectiveness(type, scrappy || arrows ? foe.types.filter((x) => x !== (arrows ? 'Flying' : 'Ghost')) : foe.types) === 0) return false;
  if (!breaks(f) && immuneAbility(foe, type) && id !== 'thousandarrows') return false;
  if (id === 'solarbeam' && w === 'raindance') return Math.random() < 0.02;
  if (id === 'fakeout' || id === 'firstimpression') return (game.fightTime || 0) - (f.enteredAt || 0) < 4;
  if (id === 'focuspunch') return !threatened(game, f); // don't tighten focus with an attack coming
  if (id === 'mindblown') return f.hp > f.maxHp * 0.55 || foe.hp < foe.maxHp * 0.3;
  if (id === 'saltcure' && foe.salt) return Math.random() < 0.3;
  if (id === 'explosion') return !game.fighters.some((o) => o.alive && ab(o, 'damp')) && (f.hp < f.maxHp * 0.25 || ((game.benchOf?.(f.slot) || []).length > 0 && f.hp < f.maxHp * 0.5)) && f.distTo(foe) < 90;
  if (id === 'poltergeist') return !!foe.item && !foe.itemSpent;
  if (id === 'fling') return !!f.item && !f.itemSpent;
  if (id === 'burnup') return f.types.includes('Fire');
  if (id === 'steelroller') return !!game.terrain;
  if (id === 'comeuppance') return (game.fightTime || 0) - (f.lastHurtAt ?? -99) < 3 && (f.lastHurtDmg || 0) > 0;
  if (id === 'mistyexplosion') return (f.hp < f.maxHp * 0.25 || ((game.benchOf?.(f.slot) || []).length > 0 && f.hp < f.maxHp * 0.5)) && f.distTo(foe) < 90;
  if (id === 'chloroblast') return f.hp > f.maxHp * 0.6 || foe.hp < foe.maxHp * 0.25;
  if (id === 'doubleshock') return f.types.includes('Electric');
  if (m.category !== 'Status' && foe.magnetT > 0 && type === 'Ground') return false;
  if (m.category !== 'Status' && ab(foe, 'wonderguard') && !breaks(f) && effectiveness(type, foe.types) <= 1) return false;
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

/** Is an attack of this category (Physical / Special / any) about to hit f? (Counter, Mirror Coat, Shell Trap) */
export function threatenedBy(game, f, cat) {
  const okCat = (m) => !!m && m.category !== 'Status' && (cat === 'any' || m.category === cat);
  for (const e of game.enemiesOf(f)) {
    if (e.cast && !e.cast.released && okCat(e.cast.move) && f.distTo(e) < MOVEFX.moves[e.cast.id].range + f.radius) return true;
  }
  for (const o of game.objects) {
    if (!o.speed || !o.owner || o.owner.team === f.team || !okCat(o.move)) continue;
    const dx = f.x - o.x;
    const dy = f.y - o.y;
    const d = Math.hypot(dx, dy);
    if (d < 110 && (dx * Math.cos(o.angle) + dy * Math.sin(o.angle)) / (d || 1) > 0.8) return true;
  }
  return false;
}

/** Counter / Mirror Coat / Shell Trap: the stance answers the hit it was waiting for. */
export function stanceAnswer(game, def, att, m, dmg) {
  const st = def.stance;
  if (!st || !def.alive || !att.alive || att === def || m.category === 'Status') return;
  if (st.cat !== 'any' && m.category !== st.cat) return;
  def.stance = null;
  const fx = MOVEFX.moves[st.id];
  game.after(0.08, () => {
    if (!def.alive || !att.alive) return;
    if (fx.stance.burst) return game.stanceBurst?.(def, st);
    // Counter / Mirror Coat: double the damage straight back.
    const back = Math.max(1, Math.round(dmg * 2));
    game.addEffect(new Effect(fx.hit, att.x, att.y - 6));
    att.takeHit(back, def.angleTo(att), 1.6);
    game.addEffect(new FloatText(String(back), att.x, att.y - 20, '#f8f800', true));
    say(game, 'countered', { who: game.who(def), foe: game.who(att) });
    game.shake(6, 0.25);
    game.sfx?.('hitBig');
    if (att.ko) onKnockOut(game, def, DB.moves[st.id], att);
  }, null);
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
  const throughProtect = ab(att, 'infiltrator') || m.noProtect || (ab(att, 'unseenfist') && m.flags?.includes('contact'));
  if (def.protectT > 0 && !throughProtect) {
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
        if (def.protectKind === 'obstruct') boost(game, att, { def: -2 }, def);
        if (def.protectKind === 'silktrap') boost(game, att, { spe: -1 }, def);
        if (def.protectKind === 'banefulbunker') inflict(game, att, 'psn', def);
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
    // Psychic Terrain: grounded Pokémon can't be hit by priority moves.
    if (hasPriority(att, m) && m.category !== 'Status' && terrainNow(game) === 'psychic' && grounded(def)) {
      game.ui?.log(t('psychicProtected', { who: game.who(def) }));
      return true;
    }
    if (m.category === 'Status' && defAb(att, def, 'wonderskin') && Math.random() < 0.5) return nope();
    // Queenly Majesty / Dazzling / Armor Tail: foes' priority moves can't touch it (or its partner).
    if (hasPriority(att, m) && [def, ...allies(game, def)].some((o) => ['queenlymajesty', 'dazzling', 'armortail'].some((a2) => defAb(att, o, a2)))) return nope();
    if (m.id === 'present' && att.presentPower === 0) {
      // Present: sometimes it's a gift that heals the target instead.
      healText(game, def, def.heal(def.maxHp * 0.08));
      say(game, 'presentHeal', { who: game.who(def) });
      return true;
    }
    if (m.id === 'poltergeist' && (!def.item || def.itemSpent)) {
      float(game, def, t('failed'), '#c8c8c8');
      return true;
    }
    if (m.category !== 'Status' && def.magnetT > 0 && moveType(att, m) === 'Ground' && !(game.gravity?.t > 0)) {
      game.ui?.log(t('noEffect', { who: game.who(def) }));
      return true;
    }
    // Wonder Guard: only super-effective hits get through.
    if (m.category !== 'Status' && defAb(att, def, 'wonderguard') && m.id !== 'struggle' && effectiveness(moveType(att, m), def.types) <= 1) return nope();
    if (m.category === 'Status' && ab(att, 'prankster') && def.types.includes('Dark')) {
      game.ui?.log(t('noEffect', { who: game.who(def) }));
      return true;
    }
  }
  if (m.category !== 'Status' && !breaks(att) && immuneAbility(def, moveType(att, m)) && m.id !== 'thousandarrows') {
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
  const sharpEyed = ab(att, 'keeneye') || ab(att, 'illuminate') || ab(att, 'compoundeyes') || victoryStar(game, att);
  if (m.category !== 'Status' && !noGuard(att, def) && !sharpEyed) {
    if (defAb(att, def, 'snowcloak') && weatherNow(game) === 'snowscape' && Math.random() < 0.2) return miss(game, att, def);
    if (defAb(att, def, 'telepathy') && Math.random() < 0.1) return miss(game, att, def);
    if (defAb(att, def, 'sandveil') && weatherNow(game) === 'sandstorm' && Math.random() < 0.2) return miss(game, att, def);
  }
  // Spectral Thief: steals the target's stat boosts before it strikes.
  if (m.id === 'spectralthief') {
    const up = Object.fromEntries(Object.entries(def.boosts).filter(([, b]) => b.n > 0).map(([k, b]) => [k, b.n]));
    if (Object.keys(up).length) {
      for (const k of Object.keys(up)) delete def.boosts[k];
      say(game, 'stoleBoosts', { who: game.who(att), foe: game.who(def) });
      boost(game, att, up, att);
    }
  }
  return false;
}

/** Victory Star: it and its partner's attacks ignore evasion, effect chances ×1.2. */
const victoryStar = (game, f) => [f, ...allies(game, f)].some((o) => ab(o, 'victorystar'));

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
  if (aura && game.fighters.some((f) => f.alive && ab(f, aura))) mul *= game.fighters.some((f) => f.alive && ab(f, 'aurabreak')) ? 0.75 : 4 / 3;
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
  if (m.category === 'Physical' && att.status?.id === 'brn' && !ab(att, 'guts') && m.id !== 'facade') mul *= 0.5;
  const w = weatherNow(game);
  if (w === 'raindance') mul *= type === 'Water' ? 1.5 : type === 'Fire' ? 0.5 : 1;
  if (w === 'sunnyday') mul *= type === 'Fire' || m.id === 'hydrosteam' ? 1.5 : type === 'Water' ? 0.5 : 1;
  if (w === 'sandstorm' && ab(att, 'sandforce') && ['Rock', 'Ground', 'Steel'].includes(type)) mul *= 1.3;
  if (x.hpPower) power = Math.max(1, Math.floor((power * att.hp) / att.maxHp)); // Eruption
  if (m.id === 'knockoff' && def.item && !def.itemSpent) power *= 1.5;
  if (m.id === 'heavyslam') {
    const r = (att.data.weightkg || 1) / (def.data.weightkg || 1);
    power = r >= 5 ? 120 : r >= 4 ? 100 : r >= 3 ? 80 : r >= 2 ? 60 : 40;
  }
  if (m.id === 'acrobatics' && (!att.item || att.itemSpent)) power *= 2;
  if (m.id === 'hex' && (def.status || ab(def, 'comatose'))) power *= 2;
  if (m.id === 'ragefist') power = Math.min(350, 50 + 50 * (att.timesHit || 0));
  // Gyro Ball: stronger the slower the user is. Electro Ball: stronger the faster it is.
  if (m.id === 'gyroball') power = Math.max(1, Math.min(150, Math.floor((25 * def.statVal('spe')) / att.statVal('spe')) + 1));
  if (m.id === 'electroball') {
    const r = att.statVal('spe') / Math.max(1, def.statVal('spe'));
    power = r >= 4 ? 150 : r >= 3 ? 120 : r >= 2 ? 80 : r >= 1 ? 60 : 40;
  }
  // Type match after Scrappy (Normal / Fighting moves hit Ghosts) / Thousand Arrows (hits flying foes).
  const scrappy = (ab(att, 'scrappy') && (type === 'Normal' || type === 'Fighting') && def.types.includes('Ghost')) || (m.id === 'thousandarrows' && def.types.includes('Flying'));
  const typeless = m.id === 'struggle'; // Struggle has no type: it hits everything for neutral damage
  const eff = typeless ? 1 : effectiveness(type, scrappy ? def.types.filter((x) => x !== 'Ghost' && !(m.id === 'thousandarrows' && x === 'Flying')) : def.types);
  if (m.id === 'lastrespects') power = 50 + 50 * (game.parties?.[att.slot]?.members.filter((o) => o !== att && o.ko).length || 0);
  if (m.id === 'storedpower') power = 20 + 20 * Object.values(att.boosts).reduce((n, b) => n + Math.max(0, b.n), 0);
  if (m.id === 'crushgrip') power = Math.max(1, Math.floor((120 * def.hp) / def.maxHp));
  if (m.id === 'weatherball' && weatherNow(game)) power *= 2;
  if (m.id === 'facade' && att.status) power *= 2;
  if (m.id === 'lashout' && Object.values(att.boosts).some((b) => b.n < 0)) power *= 2;
  if (m.id === 'beatup') power = 50;
  if (m.id === 'fling') power = 80;
  if (m.id === 'mistyexplosion' && terrainNow(game) === 'misty') power *= 1.5;
  // Wind Power: charged by wind, its next Electric move is doubled.
  if (att.charged && type === 'Electric') {
    power *= 2;
    att.charged = false;
  }
  if (m.id === 'avalanche' && (game.fightTime || 0) - (att.lastHurtAt ?? -99) < 2) power *= 2; // hit back harder
  if (m.id === 'risingvoltage' && terrainNow(game) === 'electric' && grounded(def)) power *= 2;
  if (m.id === 'heatcrash') {
    const r = (att.data.weightkg || 1) / (def.data.weightkg || 1);
    power = r >= 5 ? 120 : r >= 4 ? 100 : r >= 3 ? 80 : r >= 2 ? 60 : 40;
  }
  if (m.id === 'present') power = att.presentPower || 40;
  if (m.flags?.includes('contact') && ab(att, 'toughclaws')) mul *= 1.3;
  if (m.category === 'Special' && defAb(att, def, 'icescales')) mul *= 0.5;
  // Beads of Ruin: everyone else's Sp. Def is lowered.
  if (m.category === 'Special' && game.fighters.some((o) => o.alive && o !== def && ab(o, 'beadsofruin'))) mul *= 4 / 3;
  if (type !== m.type && ab(att, 'refrigerate')) mul *= 1;
  // Bolt Beak / Fishious Rend: double power if the target hasn't attacked in the last 2 s.
  if (x.firstStrike && (game.fightTime || 0) - (def.lastMoveAt ?? -99) > 2) mul *= 2;
  if (m.id === 'ficklebeam' && Math.random() < 0.3) {
    power *= 2;
    say(game, 'fickle');
  }
  if (m.id === 'expandingforce' && terrainNow(game) === 'psychic') power *= 1.5;
  if (m.id === 'psyblade' && terrainNow(game) === 'electric') power *= 1.5;
  if (terrainNow(game) === 'psychic' && type === 'Psychic' && grounded(att)) mul *= 1.3;
  if (terrainNow(game) === 'misty' && type === 'Dragon' && grounded(def)) mul *= 0.5;
  if ((sideOn(game, def.team, m.category === 'Physical' ? 'reflect' : 'lightscreen') || sideOn(game, def.team, 'auroraveil')) && m.category !== 'Status') mul *= 0.5;
  if (type === 'Steel' && ab(att, 'steelworker')) mul *= 1.5;
  if (type === 'Dragon' && ab(att, 'dragonsmaw')) mul *= 1.5;
  if (m.flags?.includes('bite') && ab(att, 'strongjaw')) mul *= 1.5;
  if (type === 'Water' && ab(att, 'waterbubble')) mul *= 2;
  if (type === 'Fire' && (defAb(att, def, 'waterbubble') || defAb(att, def, 'heatproof'))) mul *= 0.5;
  if (defAb(att, def, 'fluffy')) mul *= (m.flags?.includes('contact') ? 0.5 : 1) * (type === 'Fire' ? 2 : 1);
  if (ab(att, 'stakeout') && (game.fightTime || 0) - (def.enteredAt || 0) < 3) mul *= 2;
  // Friend Guard: its partner takes less damage.
  if (allies(game, def).some((o) => ab(o, 'friendguard'))) mul *= 0.75;
  if (eff > 0 && eff < 1 && ab(att, 'tintedlens')) mul *= 2;
  if (eff > 1 && (defAb(att, def, 'solidrock') || defAb(att, def, 'filter') || ab(def, 'prismarmor'))) mul *= 0.75;
  if (type === 'Electric' && ab(att, 'transistor')) mul *= 1.3;
  if (m.flags?.includes('pulse') && ab(att, 'megalauncher')) mul *= 1.5;
  if (type === 'Ghost' && defAb(att, def, 'purifyingsalt')) mul *= 0.5;
  if (def.glaiveT > 0) mul *= 2; // Glaive Rush leaves the user wide open
  // Protosynthesis: in sun its best stat is ×1.3 (handled in statVal); Photon Geyser hits with its better attack.
  let offStat = m.offStat;
  let defStat = m.defStat;
  if (m.id === 'photongeyser' && att.statVal('atk') > att.statVal('spa')) {
    offStat = 'atk';
    defStat = 'def';
  }
  if (x.punish && def.cast) mul *= x.punish; // Sucker Punch
  const stab = ab(att, 'protean') || ab(att, 'libero') || att.types.includes(type) ? (ab(att, 'adaptability') ? 2 : 1.5) : 1;
  const critStage = m.willCrit || (ab(att, 'merciless') && (def.status?.id === 'psn' || def.status?.id === 'tox')) ? 3 : (m.critRatio ? m.critRatio - 1 : 0) + stageOf(att, 'crit') + (ab(att, 'superluck') ? 1 : 0);
  return {
    mul, power, stab, critStage, type,
    offStat, // Body Press attacks with Defense
    defStat, // Psyshock hits Defense
    eff: scrappy || typeless ? eff : undefined,
    offFrom: m.id === 'foulplay' ? 'def' : null, // Foul Play uses the target's Attack
    // Seismic Toss: damage equal to the user's level. Ruination: 1/8 of the target's current HP.
    fixed: m.id === 'seismictoss' ? LEVEL : m.id === 'ruination' ? Math.max(1, Math.floor(def.hp / 8)) : m.id === 'comeuppance' ? Math.max(1, Math.round((att.lastHurtDmg || 0) * 1.5)) : 0,
    noCrit: defAb(att, def, 'shellarmor') || defAb(att, def, 'battlearmor'),
    critMul: ab(att, 'sniper') ? 2.25 : 1.5,
    noKnock: ab(def, 'stalwart'),
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
  const sg = (ab(att, 'serenegrace') ? 2 : 1) * (ab(att, 'compoundeyes') ? 1.3 : 1) * (victoryStar(game, att) ? 1.2 : 1);

  if (dmg > 0 && def.stance) stanceAnswer(game, def, att, m, dmg);
  if (dmg > 0) {
    if (m.drain && att.alive) {
      const h = att.heal(Math.max(1, Math.round(dmg * m.drain)));
      if (h > 0) game.addEffect(new FloatText(`+${Math.round(h)}`, att.x, att.y - 24, '#78f878'));
    }
    if (m.recoil && !ab(att, 'rockhead')) game.recoil(att, Math.floor(dmg * m.recoil));
    if (def.status?.id === 'frz' && m.type === 'Fire') cureStatus(game, def);
  }
  if (first && def.alive) {
    for (const s of ab(att, 'sheerforce') || (ab(def, 'shielddust') && !s_selfOnly(m)) ? [] : m.secondary || []) {
      if (!chance(s.chance * sg)) continue;
      if (s.status) inflict(game, def, s.status, att);
      if (s.volatile === 'flinch') flinch(game, def, att);
      if (s.volatile === 'confusion') confuse(game, def);
      if (s.boosts) boost(game, def, s.boosts, att);
      if (s.selfBoosts) boost(game, att, s.selfBoosts, att);
      if (s.volatile === 'saltcure') salt(game, def, att);
    }
    if (m.id === 'thousandarrows' && !grounded(def)) {
      def.smackT = 8;
      say(game, 'smackedDown', { who: game.who(def) });
    }
    if (x.trap) {
      def.trapT = x.trap;
      def.chillT = Math.max(def.chillT, x.trap);
      say(game, 'trappedLog', { who: game.who(def) });
    }
    if (m.id === 'thief' && dmg > 0 && (!att.item || att.itemSpent) && def.item && !def.itemSpent && !ab(def, 'stickyhold')) game.stealItem?.(att, def);
    if (m.id === 'burningjealousy' && Object.values(def.boosts).some((b) => b.n > 0)) inflict(game, def, 'brn', att);
    if (ab(att, 'toxicchain') && dmg > 0 && chance(30)) {
      ability(game, att);
      inflict(game, def, 'tox', att);
    }
    if (m.flags?.includes('contact') && ab(def, 'perishbody') && att.alive && !(att.perishT > 0)) {
      ability(game, def);
      att.perishT = 6;
      if (!(def.perishT > 0)) def.perishT = 6.1; // the one that touched it goes down first
      say(game, 'perishBody');
    }
    if (m.flags?.includes('wind') && ab(def, 'windpower') && def.alive && !def.charged) {
      ability(game, def);
      def.charged = true;
    }
    if (x.jawlock && def.alive) {
      def.trapT = Math.max(def.trapT || 0, 6);
      att.trapT = Math.max(att.trapT || 0, 6);
      say(game, 'jawLocked');
    }
    // Color Change: becomes the type of the move that hit it.
    if (ab(def, 'colorchange') && dmg > 0 && def.alive && !def.types.includes(moveType(att, m))) {
      ability(game, def);
      def.colorType = moveType(att, m);
    }
    // Gulp Missile: spits out its catch at whoever hits it.
    if (def.gulp && dmg > 0 && def.alive && att.alive) {
      def.gulp = false;
      ability(game, def);
      hurt(game, att, 0.12, '#58a8f8');
      boost(game, att, { def: -1 }, def);
    }
    if (ab(def, 'berserk') && def.alive && def.hp < def.maxHp / 2 && def.hp + dmg >= def.maxHp / 2) {
      ability(game, def);
      boost(game, def, { spa: 1 }, def);
    }
    if (m.flags?.includes('contact') && ab(def, 'wanderingspirit') && att.alive && def.alive && !UNSUPPRESSED.includes(att.ability)) {
      ability(game, def);
      [att.ability, def.ability] = [def.ability, att.ability];
    }
    if (ab(def, 'stamina') && dmg > 0 && def.alive) {
      ability(game, def);
      boost(game, def, { def: 1 }, def);
    }
    // Toxic Debris: hit by a physical move, it scatters poison spikes.
    if (ab(def, 'toxicdebris') && m.category === 'Physical' && def.alive && (game.hazardCount?.(def, 'toxicspikes') ?? 9) < 4) {
      ability(game, def);
      game.placeHazard?.(def, 'toxicspikes', att.x + (Math.random() - 0.5) * 30, att.y + (Math.random() - 0.5) * 20);
    }
    // Stench: its attacks may make the target flinch.
    if (ab(att, 'stench') && dmg > 0 && !(m.secondary || []).some((s) => s.volatile === 'flinch') && chance(10)) flinch(game, def, att);
    // Stone Axe: leaves sharp rocks (Stealth Rock) around the target.
    if (x.rocks && dmg > 0) {
      for (let i = 0; i < x.rocks; i++) {
        const a = Math.random() * Math.PI * 2;
        game.placeHazard?.(att, 'stealthrock', def.x + Math.cos(a) * 34, def.y + Math.sin(a) * 24);
      }
    }
    if (m.id === 'clearsmog' && Object.keys(def.boosts).length) {
      def.boosts = {};
      say(game, 'boostsCleared', { who: game.who(def) });
    }
    if (m.type === 'Fire' && dmg > 0 && ab(def, 'thermalexchange') && def.alive) {
      ability(game, def);
      boost(game, def, { atk: 1 }, def);
    }
    // Emergency Exit: dropping below half HP, it flees (Trio switches it out).
    if (ab(def, 'emergencyexit') && def.alive && def.hp < def.maxHp / 2 && def.hp + dmg >= def.maxHp / 2) {
      ability(game, def);
      game.after(0.2, () => game.uturn?.(def), null);
    }
    if (x.chill) {
      def.chillT = x.chill;
      fxAt(game, MOVEFX.status.chill, def);
    }
    if (m.id === 'knockoff' && def.item && !def.itemSpent && !ab(def, 'stickyhold')) {
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
    if (dmg > 0 && ab(att, 'magician') && !att.item && def.item && !def.itemSpent && def.alive && !ab(def, 'stickyhold')) {
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
      if (ab(def, 'roughskin') || ab(def, 'ironbarbs')) {
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
    else if (m.volatile === 'leechseed') ok = seed(game, def, att);
    else if (m.volatile === 'taunt') {
      ok = !(def.tauntT > 0) && !ab(def, 'oblivious');
      if (ok) {
        def.tauntT = 6;
        say(game, 'taunted', { who: game.who(def) });
      }
    } else if (m.volatile === 'encore') {
      ok = !!def.lastMove && !def.encore && def.moves.includes(def.lastMove);
      if (ok) {
        def.encore = { id: def.lastMove, t: 5 };
        say(game, 'encored', { who: game.who(def) });
      }
    } else if (m.volatile === 'yawn') {
      ok = !def.status && !(def.yawnT > 0) && !statusBlock(game, def, 'slp', att);
      if (ok) {
        def.yawnT = 2.5;
        def.yawnBy = att;
        say(game, 'yawned', { who: game.who(def) });
      }
    } else if (m.volatile === 'octolock') {
      ok = !def.octo;
      if (ok) {
        def.octo = { by: att, t: 6 };
        def.trapT = Math.max(def.trapT || 0, 6);
        say(game, 'octolocked', { who: game.who(def) });
      }
    } else if (m.volatile === 'gastroacid') {
      ok = !UNSUPPRESSED.includes(def.ability);
      if (ok) {
        def.gastroT = 10;
        say(game, 'gastroLog', { who: game.who(def) });
      }
    } else if (m.id === 'painsplit') {
      ok = def.alive && att.alive;
      if (ok) {
        // Pain Split: share the HP evenly (by fraction of max HP).
        const k = (att.hp / att.maxHp + def.hp / def.maxHp) / 2;
        att.hp = Math.max(1, Math.round(att.maxHp * k));
        def.hp = Math.max(1, Math.round(def.maxHp * k));
        say(game, 'painSplit');
      }
    } else if (m.id === 'trick') {
      ok = (att.item && !att.itemSpent) || (def.item && !def.itemSpent);
      if (ok && !ab(def, 'stickyhold')) {
        game.swapItems?.(att, def);
        say(game, 'tricked', { who: game.who(att) });
      }
    } else if (m.id === 'topsyturvy') {
      ok = Object.keys(def.boosts).length > 0;
      for (const b of Object.values(def.boosts)) b.n = -b.n;
      if (ok) say(game, 'topsy', { who: game.who(def) });
    } else if (m.id === 'psychup') {
      ok = true;
      att.boosts = JSON.parse(JSON.stringify(def.boosts));
      say(game, 'psychedUp', { who: game.who(att), foe: game.who(def) });
    } else if (m.id === 'skillswap') {
      ok = !UNSUPPRESSED.includes(def.ability) && !UNSUPPRESSED.includes(att.ability);
      if (ok) {
        [att.ability, def.ability] = [def.ability, att.ability];
        say(game, 'skillSwapped', { who: game.who(att) });
      }
    } else if (m.id === 'sketch') {
      // Sketch: copies the foe's last skill for good.
      const id2 = def.lastMove;
      ok = !!id2 && id2 !== 'sketch' && !att.moves.includes(id2) && !!MOVEFX.moves[id2];
      if (ok) {
        att.moves = att.moves.map((x2) => (x2 === 'sketch' ? id2 : x2));
        att.cd[id2] = 0.5;
        att._cantHurt = undefined;
        say(game, 'sketched', { who: game.who(att), move: DB.moves[id2].name });
      }
    } else if (m.id === 'partingshot') {
      ok = true;
      boost(game, def, { atk: -1, spa: -1 }, att);
    } else if (m.boosts && m.target !== 'self') {
      ok = true;
      boost(game, def, m.boosts, att); // Parting Shot
    } else if (m.id === 'strengthsap') {
      ok = def.alive;
      if (ok) {
        healText(game, att, att.heal(Math.min(att.maxHp * 0.5, def.statVal('atk') * 5)));
        boost(game, def, { atk: -1 }, att);
      }
    }
    if (!ok) float(game, def, t('failed'), '#c8c8c8');
  }
}

/** Once per cast, when the move is used: self stat changes (Close Combat, Draco Meteor...), Outrage lock. */
export function onMoveUsed(game, c, id) {
  const m = DB.moves[id];
  // Diamond Storm: its self boost only happens half the time.
  if (m.selfBoosts && (!m.selfChance || chance(m.selfChance * (ab(c, 'serenegrace') ? 2 : 1)))) game.after(0.3, () => c.alive && boost(game, c, m.selfBoosts, c), null);
  if (id === 'glaiverush') c.glaiveT = 2;
  c.lastMove = id;
  c.lastMoveAt = game.fightTime || 0;
  if (m.category !== 'Status' && !MOVEFX.moves[id]?.stance) c.lastAttackAt = game.fightTime || 0;
  if (id === 'mortalspin') game.clearHazards?.(c);
  if (id === 'aurawheel' && ab(c, 'hungerswitch')) c.hangry = !c.hangry; // Hunger Switch
  if (id === 'doubleshock') c.lostElectric = true;
  if (id === 'burnup') c.lostFire = true;
  if (id === 'steelroller' && game.terrain) {
    say(game, terrainEndKey(game.terrain.id));
    game.terrain = null;
  }
  if (id === 'chloroblast' && !ab(c, 'magicguard')) game.after(0.5, () => game.recoil(c, Math.ceil(c.maxHp / 2)), null);
  if (id === 'mistyexplosion') {
    const d2 = MOVEFX.moves[id];
    game.after((d2.delay || 0.5) + 0.05, () => {
      if (!c.alive) return;
      c.hp = 0;
      c.faint();
    }, null);
  }
  // Truant: after attacking it loafs around for a moment.
  if (ab(c, 'truant') && m.category !== 'Status') {
    c.loafT = 1.4;
    game.after(0.5, () => c.alive && say(game, 'loafing', { who: game.who(c) }), null);
  }
  if (id === 'tailwind') for (const f of game.fighters) if (f.alive && f.team === c.team && ab(f, 'windpower')) f.charged = true;
  if ((id === 'surf' || id === 'dive') && ab(c, 'gulpmissile')) c.gulp = true;
  if (id === 'present') {
    const r = Math.random();
    c.presentPower = r < 0.4 ? 40 : r < 0.7 ? 80 : r < 0.8 ? 120 : 0; // 0 = it heals the target
  }
  if (id === 'explosion') {
    // Explosion: the user faints when it goes off.
    const d = MOVEFX.moves[id];
    game.after((d.delay || 0.5) + 0.05, () => {
      if (!c.alive) return;
      c.hp = 0;
      c.faint();
    }, null);
  }
  if (id === 'struggle') game.after(0.4, () => game.recoil(c, Math.ceil(c.maxHp * 0.025)), null);
  if (id === 'electroshot') boost(game, c, { spa: 1 }, c);
  const xs = MOVEFX.moves[id]?.extra;
  if (xs?.afterBoost) game.after(0.6, () => c.alive && boost(game, c, xs.afterBoost, c), null);
  // Relic Song: Meloetta switches between Aria and Pirouette Forme.
  if (id === 'relicsong' && c.data.key === 'meloetta') {
    c.pirouette = !c.pirouette;
    say(game, c.pirouette ? 'pirouette' : 'aria', { who: game.who(c) });
  }
  if (id === 'mindblown' && !ab(c, 'magicguard')) {
    // Mind Blown: costs half its max HP.
    say(game, 'mindBlown', { who: game.who(c) });
    game.recoil(c, Math.ceil(c.maxHp / 2), 'mindblown', false);
  }
  if (id === 'rapidspin') game.clearHazards?.(c);
  if (id === 'icespinner' && game.terrain) {
    say(game, game.terrain.id === 'electric' ? 'terrainEndElectric' : 'terrainEnd');
    game.terrain = null;
  }
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
  if (SIDE_TIME[m.id]) return setSide(game, c, m.id);
  const foe = game.nearestEnemy(c);
  if (m.id === 'transform') return foe ? transform(game, c, foe) : null;
  if (m.id === 'metronome') {
    // Waggles a finger: a random attacking skill comes out.
    const pool = Object.keys(MOVEFX.moves).filter((k) => DB.moves[k]?.category !== 'Status' && !['struggle', 'metronome', 'explosion'].includes(k));
    const pick = pool[Math.floor(Math.random() * pool.length)];
    game.ui?.log(t('metronomeLog', { move: DB.moves[pick].name }));
    if (foe) game.after(0.18, () => c.alive && !c.cast && foe.alive && game.forceCast?.(c, foe, pick), null);
    return;
  }
  if (m.id === 'curse') {
    if (c.types.includes('Ghost')) {
      // Ghost Curse: cuts its own HP to lay a curse on the foe.
      if (!foe || foe.cursed) return float(game, c, t('failed'), '#c8c8c8');
      const cost = Math.floor(c.maxHp / 4);
      c.hp = Math.max(1, c.hp - cost);
      game.addEffect(new FloatText(String(cost), c.x + 6, c.y - 18, '#a058f8'));
      foe.cursed = { by: c, t: 10 };
      fxAt(game, MOVEFX.status.curse, foe, { dy: -20 });
      return say(game, 'cursedLog', { who: game.who(c), foe: game.who(foe) });
    }
    return boost(game, c, { spe: -1, atk: 1, def: 1 }, c);
  }
  if (m.id === 'coaching') {
    const mates = allies(game, c);
    if (!mates.length) return float(game, c, t('failed'), '#c8c8c8');
    for (const f of mates) boost(game, f, { atk: 1, def: 1 }, c);
    return;
  }
  if (m.id === 'lifedew' || m.id === 'junglehealing') {
    for (const f of [c, ...allies(game, c)]) {
      healText(game, f, f.heal(f.maxHp * 0.25));
      if (m.id === 'junglehealing' && f.status) cureStatus(game, f);
    }
    return;
  }
  if (m.id === 'growth') return boost(game, c, w === 'sunnyday' ? { atk: 2, spa: 2 } : { atk: 1, spa: 1 }, c);
  if (m.id === 'wish') {
    say(game, 'wishMade', { who: game.who(c) });
    const slot = c.slot;
    game.after(2, () => {
      const f = game.activeOf(slot);
      if (f?.alive) {
        say(game, 'wishCame', { who: game.who(f) });
        healText(game, f, f.heal(f.maxHp / 2));
      }
    }, null);
    return;
  }
  if (m.id === 'healingwish') {
    game.healWish ||= {};
    game.healWish[c.slot] = true;
    say(game, 'healingWishLog', { who: game.who(c) });
    c.hp = 0;
    c.faint();
    return;
  }
  if (m.id === 'aromatherapy' || m.id === 'healbell') {
    for (const f of game.parties[c.slot]?.members || [c]) if (f.status && !f.ko) cureStatus(game, f);
    for (const f of allies(game, c)) if (f.status) cureStatus(game, f);
    return say(game, 'teamCured', { who: game.who(c) });
  }
  if (m.id === 'substitute') {
    const cost = Math.floor(c.maxHp / 4);
    if (c.hp <= cost || c.sub) return float(game, c, t('failed'), '#c8c8c8');
    c.hp -= cost;
    c.sub = { hp: cost };
    game.addEffect(new FloatText(String(cost), c.x + 6, c.y - 18, '#f8a858'));
    return say(game, 'subMade', { who: game.who(c) });
  }
  if (m.id === 'gravity') {
    game.gravity = { t: 8 };
    return say(game, 'gravityLog');
  }
  if (m.id === 'magnetrise') {
    c.magnetT = 8;
    return say(game, 'magnetRose', { who: game.who(c) });
  }
  if (m.id === 'aquaring' || m.id === 'ingrain') {
    c.ringT = m.id === 'ingrain' ? 20 : 15;
    c.ringKind = m.id;
    if (m.id === 'ingrain') c.trapT = Math.max(c.trapT || 0, 20);
    return say(game, m.id === 'ingrain' ? 'ingrainLog' : 'aquaRingLog', { who: game.who(c) });
  }
  if (m.id === 'followme') {
    c.followT = 5;
    return say(game, 'followMe', { who: game.who(c) });
  }
  if (m.id === 'powertrick') {
    c.powerTrick = !c.powerTrick;
    return say(game, 'powerTrickLog', { who: game.who(c) });
  }
  if (m.id === 'teleport') {
    // Blinks away to the spot farthest from the foes (in Trio it then switches out).
    const b = game.bounds;
    const spots = [[b.x0 + 30, b.y0 + 20], [b.x1 - 30, b.y0 + 20], [b.x0 + 30, b.y1 - 20], [b.x1 - 30, b.y1 - 20]];
    const far = spots.sort((p, q) => Math.hypot(q[0] - (foe?.x || 0), q[1] - (foe?.y || 0)) - Math.hypot(p[0] - (foe?.x || 0), p[1] - (foe?.y || 0)))[0];
    fxAt(game, MOVEFX.common.dodge, c, { scale: 1.3 });
    c.x = far[0];
    c.y = far[1];
    fxAt(game, MOVEFX.common.spawn, c);
    return;
  }
  if (m.id === 'trickroom') {
    if (trickRoom(game)) {
      game.room = null;
      return say(game, 'roomEnd');
    }
    game.room = { id: 'trickroom', t: 10 };
    return say(game, 'roomStart', { who: game.who(c) });
  }
  if (m.id === 'psychicterrain') return setTerrain(game, 'psychic');
  if (m.id === 'mistyterrain') return setTerrain(game, 'misty');
  if (m.id === 'haze') {
    for (const f of game.fighters) f.boosts = {};
    return say(game, 'hazed');
  }
  if (m.id === 'tidyup') {
    game.clearAllHazards?.();
    say(game, 'tidiedUp', { who: game.who(c) });
    return boost(game, c, { atk: 1, spe: 1 }, c);
  }
  if (m.id === 'destinybond') {
    c.bondT = 3;
    return say(game, 'bondLog', { who: game.who(c) });
  }
  // Counter / Mirror Coat / Shell Trap: a stance that answers the next hit.
  const st = MOVEFX.moves[m.id]?.stance;
  if (st) {
    c.stance = { id: m.id, cat: st.cat, t: st.time || 1, cast };
    if (st.fx) game.addEffect(new Effect(st.fx, c.x, c.y - 6, { follow: c, oy: -6, loop: true, life: st.time || 1, layer: 'over', alpha: 0.75 }));
    return say(game, 'stanceLog', { who: game.who(c) });
  }
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
export function onKnockOut(game, killer, move = null, victim = null) {
  // Aftermath: knocked out by a contact move, it hurts the attacker.
  if (victim && ab(victim, 'aftermath') && killer?.alive && move?.flags?.includes('contact')) {
    ability(game, victim);
    hurt(game, killer, 0.12, '#f8a858');
  }
  // Receiver: takes over the ability of a partner who fainted.
  if (victim) for (const f of allies(game, victim)) if (ab(f, 'receiver') && !UNSUPPRESSED.includes(victim.ability)) {
    ability(game, f);
    f.ability = victim.ability;
  }
  // Soul-Heart: any Pokémon fainting raises its Sp. Atk.
  for (const f of game.fighters) if (f.alive && ab(f, 'soulheart')) boost(game, f, { spa: 1 }, f);
  if (!killer?.alive) return;
  // Destiny Bond: the one who knocked it out goes down with it.
  if (victim?.bondT > 0 && killer.team !== victim.team) {
    say(game, 'bondTook', { who: game.who(killer) });
    killer.hp = 0;
    killer.faint();
    return;
  }
  if (ab(killer, 'chillingneigh')) {
    ability(game, killer);
    boost(game, killer, { atk: 1 }, killer);
  }
  if (move?.id === 'fellstinger') boost(game, killer, { atk: 3 }, killer);
  if (ab(killer, 'grimneigh')) {
    ability(game, killer);
    boost(game, killer, { spa: 1 }, killer);
  }
  if (ab(killer, 'beastboost')) {
    // Beast Boost: raises its highest stat.
    const best = ['atk', 'def', 'spa', 'spd', 'spe'].reduce((b, k) => (killer.stats[k] > killer.stats[b] ? k : b), 'atk');
    ability(game, killer);
    boost(game, killer, { [best]: 1 }, killer);
  }
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

/** Leech Seed: the target loses a little HP every second for 8 s and the user drinks it. */
function seed(game, f, by) {
  if (!f.alive || f.seed || f.types.includes('Grass')) return false;
  f.seed = { by, t: 8 };
  say(game, 'seeded', { who: game.who(f) });
  fxAt(game, MOVEFX.status.seed, f, { dy: -10 });
  return true;
}

/** Salt Cure: salt eats away at the target for 8 s (twice as fast on Water / Steel types). */
function salt(game, f, by) {
  if (!f.alive || f.salt) return;
  f.salt = { by, t: 8 };
  say(game, 'salted', { who: game.who(f) });
}

/** Focus Punch: getting hit while tightening focus loses it (the punch goes on cooldown). */
export function loseFocus(game, f) {
  const cast = f.cast;
  if (!cast?.focusing) return;
  cast.focusing = false;
  cast.release();
  game.cancelCast(f);
  f.castGap = 0.6;
  say(game, 'lostFocus', { who: game.who(f) });
  float(game, f, t('stn_flinch'), '#f8f8f8');
}

/** Secondary effects that only touch the user (Shield Dust doesn't stop them). */
const s_selfOnly = (m) => (m.secondary || []).every((s2) => s2.selfBoosts && !s2.boosts && !s2.status && !s2.volatile);

/** Transform / Imposter: becomes a copy of the foe (look, types, stats except HP, skills, ability, stat changes). */
export function transform(game, f, foe) {
  if (f.transformed || !foe?.alive) return;
  game.addEffect(new Effect(MOVEFX.status.transform, f.x, f.y - 6, { scale: 1.4 }));
  f.transformInto(foe);
  say(game, 'transformed', { who: game.who(f), foe: game.who(foe) });
  game.ui?.buildHUD?.();
}
