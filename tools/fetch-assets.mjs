// Downloads only the SpriteCollab sprites/portraits and RawAsset VFX this game uses
// into ../assets, and writes ../CREDITS.md.
// Usage: cd tools && node fetch-assets.mjs
// (behind an HTTPS proxy on Node >= 22.21: NODE_USE_ENV_PROXY=1 node fetch-assets.mjs)
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SC = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master';
const RA = 'https://raw.githubusercontent.com/PMDCollab/RawAsset/master';
const FORCE = process.argv.includes('--force');

const roster = JSON.parse(readFileSync(join(root, 'data/roster.json'), 'utf8'));
const movefx = JSON.parse(readFileSync(join(root, 'data/movefx.json'), 'utf8'));

// Sprite anims every fighter needs, on top of the per-move anims from movefx.json.
const BASE_ANIMS = ['Idle', 'Walk', 'Hurt', 'Hop', 'Faint', 'Charge', 'Pose'];
const PORTRAITS = ['Normal', 'Determined', 'Pain', 'Happy', 'Joyous'];

let failures = 0;
async function get(url, { optional = false, text = false } = {}) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 404) {
        if (!optional) { console.error(`404 ${url}`); failures++; }
        return null;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return text ? await res.text() : Buffer.from(await res.arrayBuffer());
    } catch (e) {
      if (attempt === 4) { console.error(`FAILED ${url}: ${e.message}`); failures++; return null; }
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
}
async function save(url, dest, opts) {
  const path = join(root, dest);
  if (!FORCE && existsSync(path)) return true;
  const data = await get(url, opts);
  if (data == null) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
  return true;
}

// Collect every "fx" particle name and beam "set" from movefx.json.
const particles = new Set();
const beams = new Set();
(function walk(o) {
  if (!o || typeof o !== 'object') return;
  for (const [k, v] of Object.entries(o)) {
    if (k === 'fx' && typeof v === 'string') particles.add(v);
    else if (k === 'set' && typeof v === 'string') beams.add(v);
    else walk(v);
  }
})(movefx);

const credits = [];
const tasks = [];

for (const r of roster) {
  const id = String(r.dex).padStart(4, '0');
  const xml = await get(`${SC}/sprite/${id}/AnimData.xml`, { text: true });
  if (!xml) continue;
  mkdirSync(join(root, `assets/sprites/${id}`), { recursive: true });
  writeFileSync(join(root, `assets/sprites/${id}/AnimData.xml`), xml);

  // name -> CopyOf (or itself)
  const anims = {};
  for (const block of xml.match(/<Anim>[\s\S]*?<\/Anim>/g)) {
    const name = block.match(/<Name>(.*?)<\/Name>/)[1];
    const copy = block.match(/<CopyOf>(.*?)<\/CopyOf>/);
    anims[name] = copy ? copy[1] : name;
  }
  const wanted = new Set(BASE_ANIMS);
  for (const m of r.moves) {
    const fx = movefx.moves[m];
    if (fx.anim) wanted.add(fx.anim);
    if (fx.chargeAnim) wanted.add(fx.chargeAnim);
  }
  for (const a of wanted) {
    if (!anims[a]) { console.warn(`  ${r.species}: no ${a} anim (game will fall back)`); continue; }
    const file = anims[a];
    tasks.push(save(`${SC}/sprite/${id}/${file}-Anim.png`, `assets/sprites/${id}/${file}-Anim.png`));
  }
  for (const p of PORTRAITS) tasks.push(save(`${SC}/portrait/${id}/${p}.png`, `assets/portraits/${id}/${p}.png`, { optional: true }));
  const sc = await get(`${SC}/sprite/${id}/credits.txt`, { text: true, optional: true });
  const pc = await get(`${SC}/portrait/${id}/credits.txt`, { text: true, optional: true });
  credits.push({ species: r.species, id, sprite: sc || '', portrait: pc || '' });
}

for (const p of particles) tasks.push(save(`${RA}/Particle/${p}.png`, `assets/vfx/particle/${p}.png`));
for (const b of beams) {
  for (const part of ['Head.png', 'Body.png', 'Tail.png', 'BeamData.xml']) {
    tasks.push(save(`${RA}/${b}/${part}`, `assets/vfx/${b.toLowerCase()}/${part}`));
  }
}
await Promise.all(tasks);

// Manifest of what was actually downloaded, so the game never requests missing files.
const manifest = { sprites: {}, portraits: {} };
for (const r of roster) {
  const id = String(r.dex).padStart(4, '0');
  const list = (d) => (existsSync(join(root, d)) ? readdirSync(join(root, d)).filter((f) => f.endsWith('.png')).sort() : []);
  manifest.sprites[id] = list(`assets/sprites/${id}`).map((f) => f.replace('-Anim.png', ''));
  manifest.portraits[id] = list(`assets/portraits/${id}`).map((f) => f.replace('.png', ''));
}
writeFileSync(join(root, 'assets/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// ---- CREDITS.md ----
const namesTxt = (await get(`${SC}/credit_names.txt`, { text: true })) || '';
const names = {};
for (const line of namesTxt.split('\n').slice(1)) {
  const [name, discord, contact] = line.split('\t');
  if (discord) names[discord.trim()] = { name: name.trim(), contact: (contact || '').trim() };
}
const who = (raw) => {
  const people = new Set();
  for (const line of raw.split('\n')) {
    const cols = line.split('\t');
    if (cols.length < 2) continue;
    const id = cols[1].trim();
    people.add(names[id]?.name || id.replace(/<@!?(\d+)>/, 'Discord user $1'));
  }
  return [...people].join(', ') || 'unknown';
};
let md = `# Credits

This is a **non-commercial fan test** of the PMDCollab sprite library. Pokémon and all related
names are trademarks of Nintendo, Creatures Inc. and GAME FREAK inc. This project is not
affiliated with or endorsed by them.

## Sprites and portraits — [PMDCollab/SpriteCollab](https://github.com/PMDCollab/SpriteCollab)

Licensed under [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/).
Artists for the files used here (from each folder's \`credits.txt\`, names from \`credit_names.txt\`):

| Pokémon | Sprite artists | Portrait artists |
|---|---|---|
`;
for (const c of credits) md += `| ${c.species} (#${c.id}) | ${who(c.sprite)} | ${who(c.portrait)} |\n`;
md += `
## Move effects (VFX) — [PMDCollab/RawAsset](https://github.com/PMDCollab/RawAsset)

Particle and beam sheets from the asset repository of
[PMD: Origins](https://github.com/audinowho/PMDODump) by Audino and the PMDCollab contributors.
Used unmodified for this non-commercial demo; all rights remain with their creators.

Files used: ${[...particles].sort().map((p) => `\`${p}\``).join(', ')}; beams ${[...beams].map((b) => `\`${b}\``).join(', ')}.

## Pokémon data — [@pkmn/dex](https://github.com/pkmn/ps)

Base stats, types, abilities, moves and the type chart are generated from \`@pkmn/dex\` (MIT),
which is derived from Pokémon Showdown.
`;
writeFileSync(join(root, 'CREDITS.md'), md);

console.log(`Particles: ${particles.size}, beams: ${beams.size}, fighters: ${credits.length}. Failures: ${failures}`);
process.exit(failures ? 1 : 0);
