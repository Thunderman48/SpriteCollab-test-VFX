// Builds the game's small Pokémon database from @pkmn/dex (Smogon/Showdown data).
// Output: data/pokedex.json, data/moves.json, data/typechart.json
// Usage: cd tools && npm install && node build-db.mjs
import { Dex } from '@pkmn/dex';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const roster = JSON.parse(readFileSync(join(root, 'data/roster.json'), 'utf8'));
const movefx = JSON.parse(readFileSync(join(root, 'data/movefx.json'), 'utf8'));

// Cooldown rule: low PP = slow & rare, high PP = fast. 30 PP -> 1.5s, 5 PP -> 9s.
const cooldownFor = (pp) => Math.round((45 / pp) * 100) / 100;

const pokedex = {};
const moves = {};
for (const r of roster) {
  const s = Dex.species.get(r.species);
  if (!s.exists) throw new Error(`Unknown species ${r.species}`);
  pokedex[r.key] = {
    key: r.key,
    name: s.name,
    dex: s.num,
    spriteId: String(s.num).padStart(4, '0'),
    types: s.types,
    baseStats: s.baseStats,
    bst: Object.values(s.baseStats).reduce((a, b) => a + b, 0),
    abilities: Object.values(s.abilities),
    weightkg: s.weightkg,
    color: s.color,
    gen: s.gen,
    moves: r.moves,
    hurtRadius: r.hurtRadius,
    flying: !!r.flying,
    // Legendary / mythical (limited to one per team in most rules).
    legendary: s.tags.some((t) => /Legendary|Mythical/.test(t)),
  };
  for (const id of r.moves) {
    if (moves[id]) continue;
    const m = Dex.moves.get(id);
    if (!m.exists) throw new Error(`Unknown move ${id}`);
    if (!movefx.moves[id]) throw new Error(`No VFX mapping for move ${id} in data/movefx.json`);
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
      cooldown: cooldownFor(m.pp),
      shortDesc: m.shortDesc || m.desc || '',
    };
  }
}

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
console.log(`Wrote ${Object.keys(pokedex).length} Pokémon, ${Object.keys(moves).length} moves, ${typeNames.length} types.`);
for (const m of Object.values(moves)) console.log(`  ${m.name.padEnd(14)} ${m.type.padEnd(9)} ${m.category.padEnd(8)} pow ${String(m.power).padStart(3)}  pp ${String(m.pp).padStart(2)}  cd ${m.cooldown}s`);
