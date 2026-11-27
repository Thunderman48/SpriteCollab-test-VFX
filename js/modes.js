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
    players: DEFAULT_PARTIES.map((p, i) => ({ human: i === 0, party: p.map((s) => makeMember(s)) })),
  };
}

/** Members actually used in a mode (party size may be 1 or 3). */
export const partyFor = (setup, slot) => setup.players[slot].party.slice(0, MODES[setup.mode].party);
