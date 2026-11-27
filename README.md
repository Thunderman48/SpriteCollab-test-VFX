# SpriteCollab VFX Arena

A small local **2-player** Pokémon arena for testing the [PMDCollab SpriteCollab](https://github.com/PMDCollab/SpriteCollab)
sprite library in the browser, with move effects from PMD: Origins' [RawAsset](https://github.com/PMDCollab/RawAsset) VFX sheets.

**Roster:** Rayquaza, Lucario, Garchomp, Gengar, Mewtwo. Each has 4 moves, and all 19 moves have their own VFX.

## How to play

| | Player 1 | Player 2 |
|---|---|---|
| Move | `W A S D` | Arrow keys |
| Dodge | `Space` (or `Left Shift` / `F`) | `Enter` (or `Right Shift` / `/`) |
| Pick Pokémon | `A` / `D`, then `Space` to ready | `←` / `→`, then `Enter` to ready |

- **Mobile:** turn the phone sideways. P1 touches anywhere on the left half for a floating joystick and P2 on the right half. Each player has a **DODGE** button, or can double-tap their side to dodge.
- **Attacks are automatic.** Every move has its own cooldown based on its PP: `cooldown = 30 / PP` seconds.
  - High-PP moves fire often, e.g. Bullet Punch (30 PP) every 1 s.
  - Low-PP moves fire rarely but hit hard, e.g. Hyper Beam (5 PP) every 6 s.
  - A move fires as soon as it's ready and the opponent is in its range.
- **Dodging** gives a short dash with invulnerability. Use it to slip through projectiles, beams and the red warning circles that area attacks show. Dodging during a wind-up cancels it, and the move stays ready.
- **Auto-attacks never waste a move the target is immune to** (e.g. Earth Power vs Rayquaza). The HUD greys such moves out and marks super-effective ones with ▲.
- `Esc` / `P` pauses and `M` mutes. On the select screen, **P2: CPU** lets you play solo.

URL shortcuts for testing:
- `?cpu=both&p1=rayquaza&p2=mewtwo` starts a CPU-vs-CPU fight straight away.
- `?cpu` makes P2 a CPU.

## Publishing on GitHub Pages

It's a static site with no build step.

1. Open **Settings → Pages**.
2. Under *Build and deployment*, set **Source: Deploy from a branch**.
3. Pick the branch (`main` once merged, or the working branch) and the **`/ (root)`** folder, then save.
4. The site appears at `https://<user>.github.io/<repo>/` after a minute.

To try it locally, serve the folder over HTTP, e.g. `python3 -m http.server`, and open `http://localhost:8000`. Opening `index.html` directly from disk won't work because ES modules need HTTP.

## How it's built

```
index.html, style.css      page + UI
js/main.js                 game loop, arena, hit handling, screens
js/sprite.js               SpriteCollab AnimData player (8 directions, frame durations, Hit/Rush/Return frames)
js/vfx.js                  RawAsset particle player, beams (Head/Body/Tail), warning circles, damage text
js/moves.js                move behaviours: projectile, beam, melee, dash, targetArea, burst
js/fighter.js              movement, dodge, auto-cast scheduler, hurt/faint
js/combat.js               level-50 stats, damage formula, STAB, type chart
js/input.js, js/bot.js     keyboard + multi-touch joysticks, optional CPU player
data/roster.json           which Pokémon and moves are in the game   (hand-edited)
data/movefx.json           each move's behaviour, sprite anim and VFX (hand-edited)
data/pokedex.json, moves.json, typechart.json   generated database
assets/                    downloaded sprites, portraits, VFX + manifest.json
tools/                     scripts that generate data/ and assets/
```

### The Pokémon database

`data/pokedex.json` (base stats, types, abilities), `data/moves.json` (type, category, power, accuracy, PP, cooldown, description) and `data/typechart.json` are generated from [`@pkmn/dex`](https://www.npmjs.com/package/@pkmn/dex), the Pokémon Showdown data. The select screen shows this data on each Pokémon's card.

### Adding a Pokémon or changing moves

1. Add the Pokémon to `data/roster.json` with its 4 move ids (Showdown ids, e.g. `"flamethrower"`).
2. Add a `data/movefx.json` entry for any new move. Pick a behaviour and any sheet names from
   [RawAsset/Particle](https://github.com/PMDCollab/RawAsset/tree/master/Particle) or a `Beam/...` set. Sheet names follow `Name.Tag`:
   - `None` / `Flip`: one row of square frames
   - `DirN`: N direction rows
   - a number: that many frames
3. Regenerate:
   ```sh
   cd tools
   npm install
   node build-db.mjs        # database
   node fetch-assets.mjs    # sprites, portraits, VFX, manifest, CREDITS.md
   ```
   Behind an HTTPS proxy, run the second step as `NODE_USE_ENV_PROXY=1 node fetch-assets.mjs`.

## Credits

Sprites and portraits are by the SpriteCollab contributors, licensed [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/). VFX come from PMDCollab RawAsset / PMD: Origins. The full per-Pokémon artist list is in [CREDITS.md](CREDITS.md).

This is a non-commercial fan test. Pokémon © Nintendo / Creatures Inc. / GAME FREAK inc., and this project is not affiliated with or endorsed by them.
