// Battle modes and the editable team setup (party members are plain data so stats,
// skills, equipment and personality can be customised later).
import { DB } from './combat.js';

export const MODES = {
  showdown: { id: 'showdown', name: 'Showdown', short: '1 vs 1', slots: 2, party: 1, teams: [[0], [1]], suddenDeath: 90,
    desc: 'One Pokémon each. Last one standing wins.' },
  trio: { id: 'trio', name: 'Trio', short: '3 vs 3', slots: 2, party: 3, teams: [[0], [1]], suddenDeath: 200,
    desc: 'Parties of three. When one faints the next is sent out. You can switch.' },
  duo: { id: 'duo', name: '2vs2 Showdown', short: '2 vs 2', slots: 4, party: 1, teams: [[0, 2], [1, 3]], suddenDeath: 100,
    desc: 'Four players in two teams. Knock out both opponents.' },
};
export const MODE_ORDER = ['showdown', 'trio', 'duo'];

export const PLAYER_COUNT = 4;
export const TEAM_NAMES = ['Blue team', 'Pink team'];

export const teamOf = (mode, slot) => (MODES[mode].teams[0].includes(slot) ? 0 : 1);

/** A party member: what the future editor tabs (stats/skills/equipment/personality) change. */
export function makeMember(species, item = null) {
  return { species, item, moves: [...DB.pokedex[species].moves], personality: null, statBoosts: null };
}

const DEFAULT_PARTIES = [
  ['rayquaza', 'lucario', 'charizard'],
  ['mewtwo', 'garchomp', 'blastoise'],
  ['pikachu', 'gardevoir', 'tyranitar'],
  ['gengar', 'metagross', 'dragonite'],
];

export function defaultSetup() {
  return {
    mode: 'showdown',
    rule: 'standard',
    players: DEFAULT_PARTIES.map((p, i) => ({ human: i === 0, party: p.map((s) => makeMember(s)) })),
  };
}

/** Members actually used in a mode (party size may be 1 or 3). */
export const partyFor = (setup, slot) => setup.players[slot].party.slice(0, MODES[setup.mode].party);

// ---------- Rules (picked under "Rules" in the mode dropdown) ----------
export const RULE_ORDER = ['standard', 'balanced', 'legend', 'random', 'mirror'];
export const RULES = {
  standard: { id: 'standard', limitLegend: true },
  balanced: { id: 'balanced', limitLegend: true, bst: 600 }, // non-legendaries scaled to a 600 base stat total
  legend: { id: 'legend', limitLegend: false, onlyLegend: true },
  random: { id: 'random', limitLegend: true, randomTeams: true },
  mirror: { id: 'mirror', limitLegend: true, mirror: true }, // the Pink team copies the Blue team
};

export const isLegendary = (species) => !!DB.pokedex[species]?.legendary;
export const legendaries = () => Object.keys(DB.pokedex).filter(isLegendary);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** Base stats after the rule: Balanced scales non-legendaries to a 600 total (same proportions). */
export function effectiveBase(rule, species) {
  const d = DB.pokedex[species];
  const r = RULES[rule] || RULES.standard;
  if (!r.bst || d.legendary) return { ...d.baseStats };
  const k = r.bst / d.bst;
  const out = {};
  for (const [s, v] of Object.entries(d.baseStats)) out[s] = Math.round(v * k);
  // Fix rounding so the total is exactly the target.
  const diff = r.bst - Object.values(out).reduce((a, b) => a + b, 0);
  const top = Object.keys(out).sort((a, b) => out[b] - out[a])[0];
  out[top] += diff;
  return out;
}

/** Slots on a team in the current mode (e.g. [0, 2] for the Blue team in 2vs2). */
export const teamSlots = (setup, team) => MODES[setup.mode].teams[team];

/** Every party member a team uses, with where it lives. */
function teamMembers(setup, team) {
  return teamSlots(setup, team).flatMap((slot) => partyFor(setup, slot).map((m, idx) => ({ slot, idx, m })));
}

/** Can this species go into (slot, idx)? Enforces the one-legendary-per-team limit. */
export function canPick(setup, slot, idx, species) {
  const rule = RULES[setup.rule];
  if (rule.onlyLegend) return isLegendary(species);
  if (!rule.limitLegend || !isLegendary(species)) return true;
  const team = teamOf(setup.mode, slot);
  return !teamMembers(setup, team).some((e) => !(e.slot === slot && e.idx === idx) && isLegendary(e.m.species));
}

/** Random party for a slot that respects the rule and the rest of the team. */
export function randomParty(setup, slot, items = []) {
  const rule = RULES[setup.rule];
  const team = teamOf(setup.mode, slot);
  const others = teamMembers(setup, team).filter((e) => e.slot !== slot);
  let legendLeft = rule.limitLegend ? (others.some((e) => isLegendary(e.m.species)) ? 0 : 1) : 99;
  const party = [];
  const all = Object.keys(DB.pokedex);
  for (let i = 0; i < 3; i++) {
    let pool = rule.onlyLegend ? legendaries() : all.filter((k) => legendLeft > 0 || !isLegendary(k));
    const fresh = pool.filter((k) => !party.some((m) => m.species === k));
    if (fresh.length) pool = fresh;
    const species = pick(pool);
    if (isLegendary(species)) legendLeft--;
    party.push(makeMember(species, items.length && Math.random() < 0.85 ? pick(items).id : null));
  }
  setup.players[slot].party = party;
}

/** Make a setup legal for its rule: fix extra legendaries, fill All Legendary, copy Mirror teams. */
export function enforceRules(setup) {
  const rule = RULES[setup.rule];
  for (const team of [0, 1]) {
    let seen = 0;
    for (const { slot, idx, m } of teamMembers(setup, team)) {
      const party = setup.players[slot].party;
      if (rule.onlyLegend && !isLegendary(m.species)) {
        const fresh = legendaries().filter((k) => !party.some((x) => x.species === k));
        party[idx] = makeMember(pick(fresh.length ? fresh : legendaries()), m.item);
      } else if (rule.limitLegend && isLegendary(m.species) && seen++ >= 1) {
        const used = new Set(teamMembers(setup, team).map((e) => e.m.species));
        const pool = Object.keys(DB.pokedex).filter((k) => !isLegendary(k) && !used.has(k));
        party[idx] = makeMember(pick(pool), m.item);
      }
    }
  }
  if (rule.mirror) {
    const pairs = MODES[setup.mode].teams[0].map((s, i) => [s, MODES[setup.mode].teams[1][i]]);
    for (const [from, to] of pairs) setup.players[to].party = JSON.parse(JSON.stringify(setup.players[from].party));
  }
  return setup;
}

/** The setup actually used for a battle (Random Battle rolls new teams every time). */
export function battleSetup(setup, items) {
  const s = JSON.parse(JSON.stringify(setup));
  if (RULES[s.rule].randomTeams) {
    for (const p of s.players) p.party = [];
    for (let slot = 0; slot < MODES[s.mode].slots; slot++) randomParty(s, slot, items);
  }
  return enforceRules(s);
}

export const isMirrorCopy = (setup, slot) => RULES[setup.rule].mirror && teamOf(setup.mode, slot) === 1;
