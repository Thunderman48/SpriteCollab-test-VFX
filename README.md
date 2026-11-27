# Pokémon Clash

A real-time Pokémon arena brawler for the browser, built on the [PMDCollab SpriteCollab](https://github.com/PMDCollab/SpriteCollab)
sprites, with move effects from PMD: Origins' [RawAsset](https://github.com/PMDCollab/RawAsset) sheets. The interface uses PMD: Origins'
own window borders, portrait frames, cursor, fonts and type icons, so it looks like Mystery Dungeon.

**Roster (36):** Rayquaza, Lucario, Garchomp, Gengar, Mewtwo, Charizard, Blastoise, Venusaur, Pikachu, Dialga, Palkia, Giratina, Blaziken, Gardevoir, Metagross, Tyranitar, Eevee, Snorlax, Dragonite, Umbreon, Gyarados, Alakazam, Machamp, Lapras, Scizor, Typhlosion, Sceptile, Swampert, Infernape, Salamence, Absol, Togekiss, Mew, Jirachi, Darkrai, Greninja. Each has 4 moves (71 different moves), and every move has its own VFX.

**Held items:** like in Mystery Dungeon, each Pokémon holds one item. There are 38 items with their real PMD names and sprites (Power Band, Choice Specs, Life Orb, Scope Lens, Shell Bell, Sitrus Berry, Reviver Seed, Warp Scarf, Charcoal and the other type boosters...). Effects that only make sense in a dungeon were adapted to real time; the in-game description says what each item does here.

## Screens

- **Title screen:** Play, Online Multiplayer (coming later), Sandbox (coming later), **Settings** and Credits.
- **Settings:** language (**English / 한국어**), *prevent double-tap zoom* on phones (on by default) and sound. Settings are saved in the browser.
  Korean uses the official Korean Pokémon, move, type and item names, and the Galmuri pixel font for Hangul.
- **Team setup:** a versus screen. Pick the battle mode from the **Mode** dropdown (top right). Each player panel shows the Pokémon on a stage,
  a **Player / CPU** switch, a **Random** button and (in Trio) the party of three. Click or tap a Pokémon to open the **editor**:
  all 36 Pokémon in one grid, plus tabs for **Stats**, **Skills**, **Equipment** (held item grid with descriptions) and **Personality** (coming later).
  Party members are stored as plain data (`species`, `item`, `moves`, `personality`, `statBoosts` in `js/modes.js`) so stat, skill and personality editing can be added later.
- Everything works with the mouse, touch, the keyboard (arrows / WASD move the cursor, Enter / Space choose, Esc goes back, Tab changes editor tab) or any gamepad.

## Battle modes

| Mode | Players | Rules |
|---|---|---|
| **Showdown** | 1 vs 1 | One Pokémon each. Last one standing wins. |
| **Trio** | 1 vs 1, parties of 3 | One Pokémon on the field at a time. When it faints the next one is sent out. You can **switch** (6 s cooldown). |
| **2vs2 Showdown** | 2 vs 2 (4 players) | Blue team (P1 + P3) against Pink team (P2 + P4). Knock out both opponents. |

Every slot can be a human or the CPU. Moves auto-target the nearest opponent, and projectiles, beams and area attacks hit any opponent in their path.

## Rules

Picked under **Rules** in the Mode dropdown, on top of any game mode:

| Rule | Effect |
|---|---|
| **Standard** | Normal stats. |
| **Balanced** | Every non-legendary's base stats are scaled to a **600** total (same proportions; e.g. Pikachu 320 → 600). Legendaries keep 680. |
| **All Legendary** | Only legendary / mythical Pokémon can be picked. |
| **Random Battle** | Every battle (and rematch) each player gets random Pokémon and random held items. |
| **Mirror Match** | The Pink team copies the Blue team (P2 = P1's party, P4 = P3's). |

**One legendary or mythical per team** (all rules except All Legendary): legendaries a team can't take are locked in the editor
(legendaries are marked with a gold diamond), Random never gives a team two, and switching mode or rule fixes any team that breaks the limit.

## Controls

| | Move | Dodge | Switch (Trio) |
|---|---|---|---|
| Player 1 | `W A S D` | `Space` | `E` |
| Player 2 | Arrow keys | `Enter` | `Right Shift` |
| Player 3 | `I J K L` | `O` | `U` |
| Player 4 | Numpad `8 4 5 6` | Numpad `0` | Numpad `.` |

- **Gamepads:** controller 1 plays as P1, controller 2 as P2, and so on (stick or d-pad to move, **A** to dodge, **Y / X / LB** to switch, **Start** for the menu). Controllers also navigate the menus.
- **Phones:** turn the phone sideways (the round **»** button dodges, the **Poké Ball** button switches). With 1–2 human players the screen splits into left / right halves; with 3–4 it splits into four corners (P1 bottom-left, P2 bottom-right, P3 top-left, P4 top-right). Touch anywhere in your area for a floating joystick; each player has a **Dodge** button (and **Switch** in Trio), or can double-tap to dodge.
- `Esc` / `P` opens the in-battle menu and `M` mutes.

## Rules

- **Stand still to attack.** Attacks are automatic and their cooldowns always recharge, but a ready move only fires while your Pokémon is standing still (not moving or dodging). While an attack plays you're rooted in place.
- Every move has its own cooldown based on its PP: `cooldown = 45 / PP` seconds, plus a short pause after each attack. High-PP moves fire often (Bullet Punch, 30 PP: every 1.5 s); low-PP moves fire rarely but hit hard (Hyper Beam, 5 PP: every 9 s).
- **Dodging** gives a short dash with invulnerability. Use it to slip through projectiles, beams and the red warning circles that area attacks show. Dodging during a wind-up cancels it, and the move stays ready.
- **Auto-attacks never waste a move the target is immune to** (e.g. Earth Power vs Rayquaza); the HUD greys such moves out.
- **Sudden death:** after a while (90 s in Showdown, 100 s in 2vs2, 200 s in Trio) all damage is doubled, so no match can stall forever.

URL shortcuts for testing: `?mode=trio&cpu=all&autostart` starts an all-CPU Trio battle; `?p1=rayquaza&p2=mewtwo&cpu=all` starts a CPU 1v1.

## Publishing on GitHub Pages

It's a static site with no build step.

1. Open **Settings → Pages**.
2. Under *Build and deployment*, set **Source: Deploy from a branch**.
3. Pick the `main` branch and the **`/ (root)`** folder, then save.
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
js/ui.js                   PMD-style screens: lobby, mode window, team setup, editor, HUD, log, menus
js/modes.js                battle modes + team setup data (party members)
js/i18n.js, js/settings.js English / Korean text, saved settings
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

`data/pokedex.json` (base stats, types, abilities), `data/moves.json` (type, category, power, accuracy, PP, cooldown, description) and `data/typechart.json` are generated from [`@pkmn/dex`](https://www.npmjs.com/package/@pkmn/dex), the Pokémon Showdown data. The editor's Stats and Skills tabs show this data.

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
