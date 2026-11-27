// Pokémon builds (nature, ability, Stat Points, skills, item), saved in the browser.
import { DB } from './combat.js';

export const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
export const SP_TOTAL = 66; // Pokémon Champions: 66 Stat Points per Pokémon...
export const SP_MAX = 32; // ...at most 32 in one stat; 1 SP = +1 to the stat at Lv50
export const NEUTRAL_NATURE = 'hardy';

const KEY_BUILDS = 'pokeclash-builds';
const KEY_TEAM = 'pokeclash-team';
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export const zeroSp = () => Object.fromEntries(STATS.map((k) => [k, 0]));
export const spUsed = (sp) => STATS.reduce((s, k) => s + (sp?.[k] || 0), 0);

export function defaultBuild(species, item = null) {
  const d = DB.pokedex[species];
  return { species, item, moves: [...d.moves], nature: NEUTRAL_NATURE, ability: d.abilities[0], sp: zeroSp() };
}

/** Make any (possibly old or hand-edited) member legal: learnable unique moves, known nature/ability, SP caps. */
export function sanitize(m, itemExists = () => true) {
  const d = DB.pokedex[m.species];
  const def = defaultBuild(m.species);
  const moves = [...new Set((m.moves || []).filter((id) => d.learnable.includes(id)))].slice(0, 4);
  for (const id of def.moves) if (moves.length < 4 && !moves.includes(id)) moves.push(id);
  const sp = zeroSp();
  let left = SP_TOTAL;
  for (const k of STATS) {
    const v = Math.max(0, Math.min(SP_MAX, Math.floor(m.sp?.[k] || 0), left));
    sp[k] = v;
    left -= v;
  }
  return {
    species: m.species,
    item: m.item && itemExists(m.item) ? m.item : null,
    moves,
    nature: DB.natures[m.nature] ? m.nature : NEUTRAL_NATURE,
    ability: d.abilities.includes(m.ability) ? m.ability : def.ability,
    sp,
  };
}

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}
function write(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / storage full: builds just aren't remembered */
  }
}

/** The last build used for this species, or null. */
export function savedBuild(species) {
  const b = read(KEY_BUILDS)?.[species];
  return b ? sanitize({ ...b, species }) : null;
}

export function saveBuild(m) {
  const all = read(KEY_BUILDS) || {};
  const { species, ...rest } = m;
  all[species] = rest;
  write(KEY_BUILDS, all);
}

export function forgetBuild(species) {
  const all = read(KEY_BUILDS) || {};
  delete all[species];
  write(KEY_BUILDS, all);
}

/** Team setup (mode, rule, players) is remembered too. */
export function saveTeam(setup) {
  write(KEY_TEAM, setup);
}

export function loadTeam() {
  const s = read(KEY_TEAM);
  if (!s || !Array.isArray(s.players) || s.players.length !== 4) return null;
  for (const p of s.players) {
    if (!Array.isArray(p.party) || p.party.length !== 3 || p.party.some((m) => !DB.pokedex[m?.species])) return null;
    p.party = p.party.map((m) => sanitize(m));
    p.human = !!p.human;
  }
  return s;
}

/** Random Battle: random nature, ability, a 32/32/2 Stat Point spread and 4 learnable skills. */
export function randomBuild(species, item = null) {
  const d = DB.pokedex[species];
  const moves = DB.moves;
  const dmg = d.learnable.filter((id) => moves[id].category !== 'Status');
  const stab = dmg.filter((id) => d.types.includes(moves[id].type));
  const chosen = new Set();
  // 3 attacks (at least one of its own types when it can), then anything.
  if (stab.length) chosen.add(pick(stab));
  while (chosen.size < 3 && chosen.size < dmg.length) chosen.add(pick(Math.random() < 0.5 && stab.length > chosen.size ? stab : dmg));
  const rest = d.learnable.filter((id) => !chosen.has(id));
  if (rest.length) chosen.add(pick(rest));
  const physical = d.baseStats.atk >= d.baseStats.spa;
  const main = physical ? 'atk' : 'spa';
  const second = Math.random() < 0.6 ? 'spe' : 'hp';
  const sp = zeroSp();
  sp[main] = 32;
  sp[second] = 32;
  sp[second === 'hp' ? 'spe' : 'hp'] = 2;
  return sanitize({
    species,
    item,
    moves: [...chosen],
    nature: pick(Object.keys(DB.natures)),
    ability: pick(d.abilities),
    sp,
  });
}
