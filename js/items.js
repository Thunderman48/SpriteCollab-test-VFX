// PMD held items (one per Pokémon), adapted to real time. Data: data/items.json
// (names/sprites from PMD: Origins, effects from data/itemfx.json).

export const ITEMS = { list: [], byId: {} };

export function setItems(list) {
  ITEMS.list = list;
  ITEMS.byId = Object.fromEntries(list.map((it) => [it.id, it]));
}

export const itemSprite = (it) => `assets/items/${it.sprite}.png`;

/** Neutral modifiers (no item). */
export function baseMods() {
  return {
    crit: 1 / 24,
    dmgMul: 1,
    superMul: 1,
    takenMul: 1,
    cooldownMul: 1,
    speedMul: 1,
    hitbox: 1,
    drain: 0,
    regen: 0,
    lifeOrb: 0,
    metronome: 0,
    typeBoost: {},
    noKnockback: false,
    warpDodge: false,
    sitrus: 0,
    revive: 0,
  };
}

/** Give a fighter its held item: stat multipliers + the modifiers used by combat code. */
export function equip(fighter, itemId) {
  const it = itemId ? ITEMS.byId[itemId] : null;
  fighter.item = it || null;
  fighter.itemSpent = false; // berries / seeds are used up once
  const m = baseMods();
  if (it) {
    const e = it.effect;
    for (const [k, v] of Object.entries(e)) {
      if (k === 'stats') continue;
      if (k === 'typeBoost') Object.assign(m.typeBoost, v);
      else m[k] = v;
    }
    for (const [stat, mul] of Object.entries(e.stats || {})) fighter.stats[stat] = Math.floor(fighter.stats[stat] * mul);
  }
  fighter.mods = m;
  fighter.metroStacks = 0;
}

/** Lose the held item for the rest of the battle (Knock Off). */
export function unequip(fighter) {
  fighter.item = null;
  fighter.itemSpent = true;
  fighter.itemGone = true; // Unburden
  fighter.stats = { ...fighter.rawStats };
  fighter.mods = baseMods();
}
