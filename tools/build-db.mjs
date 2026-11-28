// Builds the game's small Pokémon database from @pkmn/dex (Smogon/Showdown data).
// Output: data/pokedex.json, data/moves.json, data/typechart.json, data/natures.json
// Usage: cd tools && npm install && node build-db.mjs
import { Dex } from '@pkmn/dex';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const roster = JSON.parse(readFileSync(join(root, 'data/roster.json'), 'utf8'));
const movefx = JSON.parse(readFileSync(join(root, 'data/movefx.json'), 'utf8'));

// Cooldown rule: low PP = slow & rare, high PP = fast. 30 PP -> 1.5s, 5 PP -> 9s.
// Status moves (buffs, heals, weather...) recharge slower so they can't be spammed.
const cooldownFor = (pp, status) => Math.round(((status ? 150 : 45) / pp) * 100) / 100;
const toId = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Learnable moves: the species and its pre-evolutions.
async function learnset(species) {
  const out = {};
  let sp = Dex.species.get(species);
  while (sp?.exists) {
    Object.assign(out, (await Dex.learnsets.get(sp.id))?.learnset || {});
    sp = sp.prevo ? Dex.species.get(sp.prevo) : null;
  }
  return out;
}

/** The parts of a move's effect the arena uses (secondary chances, boosts, drain, recoil...). */
function effectsOf(m) {
  const e = {};
  const sec = m.secondaries || (m.secondary ? [m.secondary] : []);
  if (sec.length) {
    e.secondary = sec.map((s) => {
      const o = { chance: s.chance ?? 100 };
      if (s.status) o.status = s.status;
      if (s.volatileStatus) o.volatile = s.volatileStatus;
      if (s.boosts) o.boosts = s.boosts;
      if (s.self?.boosts) o.selfBoosts = s.self.boosts;
      return o;
    });
  }
  if (m.self?.boosts) e.selfBoosts = m.self.boosts;
  if (m.self?.boosts && m.self.chance) e.selfChance = m.self.chance; // Diamond Storm: 50%
  if (m.category !== 'Status' && !m.flags?.protect) e.noProtect = true; // Hyperspace Hole goes through Protect
  if (m.self?.volatileStatus === 'mustrecharge') e.recharge = true;
  if (m.self?.volatileStatus === 'lockedmove') e.locked = true;
  if (m.boosts) e.boosts = m.boosts; // status moves: target === 'self' -> own buffs
  if (m.status) e.status = m.status;
  if (m.volatileStatus) e.volatile = m.volatileStatus;
  if (m.drain) e.drain = m.drain[0] / m.drain[1];
  if (m.recoil) e.recoil = m.recoil[0] / m.recoil[1];
  if (m.heal) e.heal = m.heal[0] / m.heal[1];
  if (m.critRatio > 1) e.critRatio = m.critRatio;
  if (m.willCrit) e.willCrit = true;
  if (m.ignoreDefensive) e.ignoreStages = true;
  if (m.ignoreAbility) e.ignoreAbility = true; // Sunsteel Strike, Moongeist Beam
  if (m.overrideOffensiveStat) e.offStat = m.overrideOffensiveStat; // Body Press uses Defense
  if (m.overrideDefensiveStat) e.defStat = m.overrideDefensiveStat; // Psyshock hits Defense
  if (m.weather) e.weather = toId(m.weather);
  if (m.selfSwitch) e.selfSwitch = true;
  if (m.multihit) e.multihit = m.multihit;
  const flags = ['contact', 'punch', 'bite', 'sound', 'slicing', 'bullet', 'powder', 'cantusetwice', 'pulse'].filter((f) => m.flags?.[f]);
  if (flags.length) e.flags = flags;
  return e;
}

// Every move with a VFX definition is in the game; each Pokémon can pick the ones it learns.
const moves = {};
for (const id of Object.keys(movefx.moves)) {
  const m = Dex.moves.get(id);
  if (!m.exists) throw new Error(`Unknown move ${id}`);
  const status = m.category === 'Status';
  moves[id] = {
    id,
    name: m.name,
    type: m.type,
    category: m.category,
    power: m.basePower,
    accuracy: m.accuracy === true ? 100 : m.accuracy,
    alwaysHits: m.accuracy === true,
    pp: m.pp,
    priority: m.priority,
    target: m.target,
    cooldown: cooldownFor(m.pp, status),
    shortDesc: m.shortDesc || m.desc || '',
    ...effectsOf(m),
  };
}

const pokedex = {};
for (const r of roster) {
  const s = Dex.species.get(r.species);
  if (!s.exists) throw new Error(`Unknown species ${r.species}`);
  for (const id of r.moves) if (!moves[id]) throw new Error(`No VFX mapping for move ${id} in data/movefx.json`);
  const ls = await learnset(r.species);
  pokedex[r.key] = {
    key: r.key,
    name: s.name,
    dex: s.num,
    spriteId: String(s.num).padStart(4, '0'),
    types: s.types,
    baseStats: s.baseStats,
    bst: Object.values(s.baseStats).reduce((a, b) => a + b, 0),
    abilities: [...new Set(Object.values(s.abilities))].map(toId),
    abilityNames: Object.fromEntries(Object.values(s.abilities).map((a) => [toId(a), a])),
    weightkg: s.weightkg,
    color: s.color,
    gen: s.gen,
    moves: r.moves,
    // Skills this Pokémon can choose: moves in the game it can learn in the main series (+ its defaults).
    learnable: Object.keys(moves).filter((id) => ls[id] || r.moves.includes(id)),
    hurtRadius: r.hurtRadius,
    flying: !!r.flying,
    // Legendary / mythical (limited to one per team in most rules).
    legendary: s.tags.some((t) => /Legendary|Mythical/.test(t)),
  };
}

const natures = Dex.natures.all().map((n) => ({ id: n.id, name: n.name, plus: n.plus || null, minus: n.minus || null }));

// typechart[attacking][defending] = multiplier
const typeNames = Dex.types.names();
const typechart = {};
for (const atk of typeNames) {
  typechart[atk] = {};
  for (const def of typeNames) {
    const code = Dex.types.get(def).damageTaken[atk];
    typechart[atk][def] = code === 1 ? 2 : code === 2 ? 0.5 : code === 3 ? 0 : 1;
  }
}

const write = (f, obj) => writeFileSync(join(root, 'data', f), JSON.stringify(obj, null, 2) + '\n');
write('pokedex.json', pokedex);
write('moves.json', moves);
write('typechart.json', typechart);
write('natures.json', natures);
console.log(`Wrote ${Object.keys(pokedex).length} Pokémon, ${Object.keys(moves).length} moves, ${natures.length} natures, ${typeNames.length} types.`);
if (process.argv.includes('-v')) for (const m of Object.values(moves)) console.log(`  ${m.name.padEnd(14)} ${m.type.padEnd(9)} ${m.category.padEnd(8)} pow ${String(m.power).padStart(3)}  pp ${String(m.pp).padStart(2)}  cd ${m.cooldown}s`);
