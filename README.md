# SpriteCollab VFX Arena

A small local **2-player** Pokémon arena for testing the [PMDCollab SpriteCollab](https://github.com/PMDCollab/SpriteCollab)
sprite library in the browser, with move effects from PMD: Origins' [RawAsset](https://github.com/PMDCollab/RawAsset) VFX sheets.
The interface uses PMD: Origins' own window borders, portrait frames, cursor, text/banner fonts and type icons, so it looks like Mystery Dungeon.

**Roster (20):** Rayquaza, Lucario, Garchomp, Gengar, Mewtwo, Charizard, Blastoise, Venusaur, Pikachu, Dialga, Palkia, Giratina, Blaziken, Gardevoir, Metagross, Tyranitar, Eevee, Snorlax, Dragonite, Umbreon. Each has 4 moves (53 different moves), and every move has its own VFX.

**Held items:** like in Mystery Dungeon, each Pokémon can hold one item, chosen on the select screen. There are 38 items with their real PMD names and sprites (Power Band, Choice Specs, Life Orb, Scope Lens, Shell Bell, Sitrus Berry, Reviver Seed, Warp Scarf, Charcoal and the other type boosters...). Effects that only make sense in a dungeon were adapted to real time, and the in-game description says what each item does here.

## How to play

| | Player 1 | Player 2 |
|---|---|---|
| Move | `W A S D` | Arrow keys |
| Dodge | `Space` (or `Left Shift` / `F`) | `Enter` (or `Right Shift` / `/`) |
| Pick Pokémon, then held item | `W` / `S` + `Space` to confirm, `Q` to go back | `↑` / `↓` + `Enter` to confirm, `Backspace` to go back |

- **Mobile:** turn the phone sideways. P1 touches anywhere on the left half for a floating joystick and P2 on the right half. Each player has a **DODGE** button, or can double-tap their side to dodge.
- **Stand still to attack.** Attacks are automatic, but they only recharge and fire while your Pokémon is standing still. Moving or dodging pauses every cooldown (the HUD bars turn grey), and while an attack plays you're rooted in place.
- Every move has its own cooldown based on its PP: `cooldown = 45 / PP` seconds of standing still, plus a short pause after each attack.
  - High-PP moves fire often, e.g. Bullet Punch (30 PP) every 1.5 s.
  - Low-PP moves fire rarely but hit hard, e.g. Hyper Beam (5 PP) every 9 s.
  - Every move aims itself at the opponent: it fires as soon as it's ready and the opponent is in range.
- **Sudden death:** after 90 seconds of fighting all damage is doubled, so no match can stall forever.
- **Dodging** gives a short dash with invulnerability. Use it to slip through projectiles, beams and the red warning circles that area attacks show. Dodging during a wind-up cancels it, and the move stays ready.
- **Auto-attacks never waste a move the target is immune to** (e.g. Earth Power vs Rayquaza). The HUD greys such moves out and marks super-effective ones with ▲.
- `Esc` / `P` opens the menu (↑/↓ to move the cursor, Enter/Space to pick) and `M` mutes. On the select screen, **P2: CPU** lets you play solo.

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
js/ui.js                   PMD-style screens: select, HUD, message log, menus
js/input.js, js/bot.js     keyboard + multi-touch joysticks, optional CPU player
data/roster.json           which Pokémon and moves are in the game   (hand-edited)
data/movefx.json           each move's behaviour, sprite anim and VFX (hand-edited)
data/itemfx.json           held items: PMD item id -> real-time effect + description (hand-edited)
data/items.json            generated: itemfx + real PMD names/sprites (from DumpAsset)
data/pokedex.json, moves.json, typechart.json   generated database
assets/                    downloaded sprites, portraits, VFX + manifest.json
assets/ui/                 PMD window/portrait frames, cursor, pmd-text.ttf, type orbs, banner font
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
   node fetch-assets.mjs    # sprites, portraits, VFX, PMD UI art + font glyphs, manifest, CREDITS.md
   cd ..
   pip install pillow fonttools
   python3 -I tools/build-ui.py   # PMD window frames, pmd-text.ttf, type orbs, banner atlas
   ```
   Behind an HTTPS proxy, run the second step as `NODE_USE_ENV_PROXY=1 node fetch-assets.mjs`.

## Credits

Sprites and portraits are by the SpriteCollab contributors, licensed [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/). VFX come from PMDCollab RawAsset / PMD: Origins. The window art, fonts and type icons come from PMD: Origins (DumpAsset `Content/UI`, RawAsset `font/`). The full per-Pokémon artist list is in [CREDITS.md](CREDITS.md).

This is a non-commercial fan test. Pokémon © Nintendo / Creatures Inc. / GAME FREAK inc., and this project is not affiliated with or endorsed by them.
