// Stats + damage, loosely following the main-series formulas at level 50.

export const LEVEL = 50;
export const HP_SCALE = 10; // stretch fights: CPU-vs-CPU averages ~45 s
export const DB = { pokedex: {}, moves: {}, typechart: {}, natures: {}, abilities: {} };

/** Nature multiplier for a stat (×1.1 raised, ×0.9 lowered). */
export function natureMul(natureId, stat) {
  const n = DB.natures[natureId];
  return !n ? 1 : n.plus === stat && n.minus !== stat ? 1.1 : n.minus === stat && n.plus !== stat ? 0.9 : 1;
}

/**
 * Level-50 stats with max IVs, a nature and Stat Points (Pokémon Champions style:
 * 1 SP = +1 to that stat).
 */
export function statsFor(base, build = {}) {
  const sp = build.sp || {};
  const core = (b) => Math.floor(((2 * b + 31) * LEVEL) / 100);
  const other = (k) => Math.floor((core(base[k]) + 5 + (sp[k] || 0)) * natureMul(build.nature, k));
  return {
    hp: core(base.hp) + LEVEL + 10 + (sp.hp || 0),
    atk: other('atk'),
    def: other('def'),
    spa: other('spa'),
    spd: other('spd'),
    spe: other('spe'),
  };
}

export function effectiveness(moveType, defTypes) {
  return defTypes.reduce((m, t) => m * (DB.typechart[moveType]?.[t] ?? 1), 1);
}

const CRIT_CHANCE = [1 / 24, 1 / 8, 1 / 2, 1];

/**
 * factor scales the result (multi-hit pieces, meteor shards...).
 * x = modifiers from effects.damageMods (abilities, weather, burn, STAB, crit stage, power).
 */
export function computeDamage(attacker, defender, move, factor = 1, x = {}) {
  const physical = move.category === 'Physical';
  const am = attacker.mods || {};
  const dm = defender.mods || {};
  const stage = (am.crit > 1 / 24 ? 1 : 0) + (x.critStage || 0);
  const crit = !x.noCrit && Math.random() < CRIT_CHANCE[Math.max(0, Math.min(3, stage))];
  // Stat stages count, except that crits ignore the attacker's drops and the defender's raises.
  const A = attacker.statVal ? attacker.statVal(physical ? 'atk' : 'spa', crit ? 'atk' : null) : physical ? attacker.stats.atk : attacker.stats.spa;
  const D = defender.statVal ? defender.statVal(physical ? 'def' : 'spd', crit ? 'def' : null) : physical ? defender.stats.def : defender.stats.spd;
  const power = x.power ?? move.power;
  const base = Math.floor(Math.floor((Math.floor((2 * LEVEL) / 5 + 2) * power * A) / D) / 50) + 2;
  const type = x.type || move.type; // Pixilate can change it
  const atkTypes = attacker.types || attacker.data.types;
  const stab = x.stab ?? (atkTypes.includes(type) ? 1.5 : 1);
  const eff = effectiveness(type, defender.types || defender.data.types);
  const rand = 0.85 + Math.random() * 0.15;
  // Held items: type booster, Life Orb, Expert Belt, Metronome streak, Iron Ball.
  const items =
    (am.typeBoost?.[type] ?? 1) *
    (am.dmgMul ?? 1) *
    (eff > 1 ? am.superMul ?? 1 : 1) *
    (1 + Math.min(0.5, (attacker.metroStacks || 0) * (am.metronome || 0))) *
    (dm.takenMul ?? 1);
  const dmg = eff === 0 ? 0 : Math.max(1, Math.floor(base * stab * eff * (crit ? 1.5 : 1) * rand * factor * items * (x.mul ?? 1)));
  return { dmg, eff, crit };
}

export const TYPE_COLORS = {
  Normal: '#a8a77a', Fire: '#ee8130', Water: '#6390f0', Electric: '#f7d02c', Grass: '#7ac74c',
  Ice: '#96d9d6', Fighting: '#c22e28', Poison: '#a33ea1', Ground: '#e2bf65', Flying: '#a98ff3',
  Psychic: '#f95587', Bug: '#a6b91a', Rock: '#b6a136', Ghost: '#735797', Dragon: '#6f35fc',
  Dark: '#705746', Steel: '#b7b7ce', Fairy: '#d685ad',
};
