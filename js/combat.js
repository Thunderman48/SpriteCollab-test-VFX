// Stats + damage, loosely following the main-series formulas at level 50.

export const LEVEL = 50;
export const HP_SCALE = 10; // stretch fights: CPU-vs-CPU averages ~45 s
export const DB = { pokedex: {}, moves: {}, typechart: {} };

export function statsFor(base) {
  const other = (b) => Math.floor(((2 * b + 31) * LEVEL) / 100) + 5;
  return {
    hp: Math.floor(((2 * base.hp + 31) * LEVEL) / 100) + LEVEL + 10,
    atk: other(base.atk),
    def: other(base.def),
    spa: other(base.spa),
    spd: other(base.spd),
    spe: other(base.spe),
  };
}

export function effectiveness(moveType, defTypes) {
  return defTypes.reduce((m, t) => m * (DB.typechart[moveType]?.[t] ?? 1), 1);
}

/** factor scales the result (multi-hit pieces, meteor shards...). */
export function computeDamage(attacker, defender, move, factor = 1) {
  const physical = move.category === 'Physical';
  const A = physical ? attacker.stats.atk : attacker.stats.spa;
  const D = physical ? defender.stats.def : defender.stats.spd;
  const base = Math.floor(Math.floor((Math.floor((2 * LEVEL) / 5 + 2) * move.power * A) / D) / 50) + 2;
  const stab = attacker.data.types.includes(move.type) ? 1.5 : 1;
  const eff = effectiveness(move.type, defender.data.types);
  const am = attacker.mods || {};
  const dm = defender.mods || {};
  const crit = Math.random() < (am.crit ?? 1 / 24);
  const rand = 0.85 + Math.random() * 0.15;
  // Held items: type booster, Life Orb, Expert Belt, Metronome streak, Iron Ball.
  const items =
    (am.typeBoost?.[move.type] ?? 1) *
    (am.dmgMul ?? 1) *
    (eff > 1 ? am.superMul ?? 1 : 1) *
    (1 + Math.min(0.5, (attacker.metroStacks || 0) * (am.metronome || 0))) *
    (dm.takenMul ?? 1);
  const dmg = eff === 0 ? 0 : Math.max(1, Math.floor(base * stab * eff * (crit ? 1.5 : 1) * rand * factor * items));
  return { dmg, eff, crit };
}

export const TYPE_COLORS = {
  Normal: '#a8a77a', Fire: '#ee8130', Water: '#6390f0', Electric: '#f7d02c', Grass: '#7ac74c',
  Ice: '#96d9d6', Fighting: '#c22e28', Poison: '#a33ea1', Ground: '#e2bf65', Flying: '#a98ff3',
  Psychic: '#f95587', Bug: '#a6b91a', Rock: '#b6a136', Ghost: '#735797', Dragon: '#6f35fc',
  Dark: '#705746', Steel: '#b7b7ce', Fairy: '#d685ad',
};
