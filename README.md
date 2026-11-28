# Pokémon Clash

A real-time Pokémon arena brawler for the browser, built on the [PMDCollab SpriteCollab](https://github.com/PMDCollab/SpriteCollab)
sprites, with move effects from PMD: Origins' [RawAsset](https://github.com/PMDCollab/RawAsset) sheets. The interface uses PMD: Origins'
own window borders, portrait frames, cursor, fonts and type icons, so it looks like Mystery Dungeon.

**Roster (200):** Rayquaza, Lucario, Garchomp, Gengar, Mewtwo, Charizard, Blastoise, Venusaur, Pikachu, Dialga, Palkia, Giratina, Blaziken, Gardevoir, Metagross, Tyranitar, Eevee, Snorlax, Dragonite, Umbreon, Gyarados, Alakazam, Machamp, Lapras, Scizor, Typhlosion, Sceptile, Swampert, Infernape, Salamence, Absol, Togekiss, Mew, Jirachi, Darkrai, Greninja, Arcanine, Ninetales, Vaporeon, Jolteon, Flareon, Espeon, Sylveon, Gallade, Zoroark, Mimikyu, Hydreigon, Volcarona, Heracross, Milotic, Lugia, Ho-Oh, Kyogre, Groudon, Celebi, Chandelure, Excadrill, Weavile, Dragapult, Goodra, Scyther, Starmie, Aerodactyl, Clefable, Slowbro, Zapdos, Moltres, Articuno, Feraligatr, Houndoom, Kingdra, Skarmory, Suicune, Crobat, Breloom, Aggron, Flygon, Latios, Empoleon, Luxray, Roserade, Mamoswine, Heatran, Serperior, Haxorus, Krookodile, Conkeldurr, Reshiram, Zekrom, Talonflame, Hawlucha, Decidueye, Incineroar, Primarina, Lycanroc, Cinderace, Rillaboom, Inteleon, Meowscarada, Ceruledge, Raichu, Nidoking, Golem, Hitmonlee, Hitmonchan, Pinsir, Tauros, Ampharos, Azumarill, Steelix, Ursaring, Donphan, Raikou, Entei, Medicham, Sharpedo, Altaria, Latias, Torterra, Staraptor, Toxicroak, Electivire, Magmortar, Gliscor, Froslass, Emboar, Samurott, Galvantula, Mienshao, Bisharp, Chesnaught, Delphox, Aegislash, Xerneas, Yveltal, Kommo-o, Tapu Koko, Solgaleo, Lunala, Corviknight, Toxtricity, Grimmsnarl, Zacian, Skeledirge, Quaquaval, Tinkaton, Annihilape, Kingambit, Gholdengo, Koraidon, Marowak, Cloyster, Beedrill, Butterfree, Weezing, Dugtrio, Porygon-Z, Hitmontop, Miltank, Blissey, Crawdaunt, Rhyperior, Magnezone, Mismagius, Abomasnow, Arceus, Shaymin, Darmanitan, Scrafty, Ferrothorn, Kyurem, Keldeo, Victini, Genesect, Clawitzer, Noivern, Trevenant, Diancie, Hoopa, Volcanion, Hariyama, Golisopod, Tsareena, Necrozma, Marshadow, Zeraora, Blacephalon, Zamazenta, Eternatus, Urshifu, Spectrier, Regieleki, Kleavor, Garganacl, Armarouge, Palafin, Baxcalibur, Great Tusk, Ogerpon, Thundurus. Each Pokémon picks 4 skills from the moves it can learn in the main games (258 skills in the game), and every skill has its own VFX.

**Held items:** like in Mystery Dungeon, each Pokémon holds one item. There are 38 items with their real PMD names and sprites (Power Band, Choice Specs, Life Orb, Scope Lens, Shell Bell, Sitrus Berry, Reviver Seed, Warp Scarf, Charcoal and the other type boosters...). Effects that only make sense in a dungeon were adapted to real time; the in-game description says what each item does here.

## Screens

- **Title screen:** Play, Online Multiplayer (coming later), Sandbox (coming later), **Settings** and Credits.
- **Settings:** language (**English / 한국어**), *prevent double-tap zoom* on phones (on by default) and sound. Settings are saved in the browser.
  Korean uses the official Korean Pokémon, move, type and item names, and the Galmuri pixel font for Hangul.
- **Team setup:** a versus screen. Pick the battle mode from the **Mode** dropdown (top right). Each player panel shows the Pokémon on a stage,
  a **Player / CPU** switch, a **Random** button and (in Trio) the party of three. Click or tap a Pokémon to open the **editor**:
  all 200 Pokémon in one scrolling grid, plus tabs for **Stats**, **Skills**, **Equipment** and **Personality** (see *Customizing a Pokémon* below).
  Builds and the team are saved in the browser: picking a Pokémon again brings back its last build, and **Reset to default** clears it.
- Everything works with the mouse, touch, the keyboard (arrows / WASD move the cursor, Enter / Space choose, Esc goes back, Tab changes editor tab) or any gamepad.

## Customizing a Pokémon

| Tab | What you change |
|---|---|
| **Stats** | **Stat Points**, like Pokémon Champions: 66 points per Pokémon, at most 32 in one stat, and each point adds +1 to that stat (Lv. 50). Use −/+ (hold to repeat), ←/→ on a row, or tap a row to fill / empty it. Stat names raised by the nature are red, lowered ones blue. |
| **Skills** | 4 skills **in priority order**: skill 1 is used first, then 2, 3, 4 (▲▼ reorders). Pick a slot to choose from every skill that Pokémon can learn in the main games. The info box shows the original effect and the ★ extra property. |
| **Equipment** | One held item (38 PMD items). |
| **Personality** | **Nature** from the 25-nature chart (rows: +10% stat, columns: −10% stat; the diagonal is neutral) and **Ability** from the Pokémon's real abilities (including the hidden one). |

**Skill order:** at the start of a battle skill 1 is ready first, then 2, 3 and 4. After that, whenever your Pokémon stands still, the highest skill that's ready *and useful right now* fires (in range, not immune, a buff not already at +4, a heal only when hurt, Protect only when an attack is coming, no weather that's already up...).

**Original skill effects, adapted to real time:**
- **Stat changes are timed buffs.** Swords Dance, Dragon Dance, Nasty Plot, Calm Mind, Bulk Up, Iron Defense, Agility, Shell Smash and Focus Energy raise stats; Close Combat, Draco Meteor, Superpower and others lower your own; Intimidate and many secondary effects lower the foe's. Each change lasts **20 s**; casting again stacks it (up to ±6, ×4 at +6 as in the games) and refreshes the timer. The HUD lists them under each Pokémon.
- **Status conditions are timed:** burn (8 s, HP loss, physical damage halved), poison and bad poison (8 s, HP loss), paralysis (8 s, slower, 20% of attacks fail), sleep (2.5 s), freeze (1.5 s, Fire thaws it), confusion (4 s, wobbly steering, 25% of attacks hit itself), flinch (interrupts a wind-up). After a status ends there's 3 s of immunity, so nobody gets stun-locked. Type immunities follow the games.
- **Weather** (Rain Dance, Sunny Day, Sandstorm, Snowscape, and Drizzle / Drought / Sand Stream) lasts 20 s: Water/Fire ×1.5 or ×0.5, sandstorm chip damage, Ice types' Defense ×1.5 in snow, Thunder and Hurricane strike instantly in rain, Blizzard strikes instantly in snow, Solar Beam needs no charge in sun. **Grassy Terrain** (Grassy Surge) boosts Grass moves and slowly heals grounded Pokémon. **Electric Terrain** (Electric Surge) boosts Electric moves and keeps grounded Pokémon awake.
- Drain, recoil, high critical-hit ratio, **priority** (faster wind-up), Hyper Beam's recharge, Outrage's rampage + confusion, U-turn (switches out in Trio), Knock Off (removes the held item), Protect / Spiky Shield (hurts attackers that touch it) / King's Shield (lowers their Attack), Raging Bull breaks through Protect, Body Press attacks with Defense, Psyshock hits Defense, Heavy Slam depends on weight, Hex doubles on a statused target, Acrobatics doubles without an item, Rage Fist grows with every hit taken, Fake Out and First Impression work only right after entering, Belly Drum, Geomancy (1.5 s charge), Recover / Roost / Moonlight / Synthesis / Soft-Boiled / Milk Drink / Rest all work. Also: Leech Seed drains the target for 8 s, Salt Cure eats at it (twice as fast on Water / Steel), Seismic Toss always deals 50, Focus Punch fails if you're hit while focusing, Wicked Blow always crits, Triple Kick and Rollout grow stronger with each hit, Gyro Ball / Electro Ball depend on Speed, Glaive Rush leaves the user taking double damage, Spectral Thief steals boosts, Clear Smog removes them, Mind Blown costs half your HP, Photon Geyser uses the better attack stat, Hyperspace Hole goes through Protect, Fell Stinger raises Attack on a KO.
- **Hazards:** Spikes, Toxic Spikes and Stealth Rock scatter pieces around the foe that stay on the field for 30 s; a foe that steps on one is hurt or poisoned (Stealth Rock hurts more if weak to Rock; flying Pokémon float over Spikes). Stone Axe leaves rocks too, and Rapid Spin blows the foe's hazards away. CPU players walk around them.
- **Every dash and melee skill moves in its own way** (`js/motion.js`):
  - Quick Attack and Accelerock zig-zag with afterimages.
  - Extreme Speed rushes through the target and back.
  - Aerial Ace and Feint Attack slip past the target and can't be dodged.
  - Brave Bird and High Jump Kick fly off-screen and dive onto a marked spot. High Jump Kick crashes if it misses.
  - Shadow Sneak travels as a shadow and pops up under the target.
  - U-turn hits and flies back.
  - Sucker Punch blinks behind the target.
  - Flare Blitz, Wild Charge and Head Smash wind up, then charge. Flare Blitz leaves burning ground and Wild Charge leaves sparks that can paralyze.
  - Dragon Rush and Bolt Strike catch the target and carry it.
  - Drill Peck and Darkest Lariat spin through, hitting several times.
  - Waterfall launches the target into the air.
  - Wood Hammer and Giga Impact leap and land with a shockwave.
  - Aqua Step dances in a circle around the target and strikes from the side.
  - Acrobatics flips along a curved path and springs back off the target.
  - Heavy Slam bounds over in heavy hops that shake the ground, then lands on the target.
  - Aqua Jet keeps speeding up; Behemoth Blade cuts through everything in line; Collision Course drives the target across the arena; Sunsteel Strike and Raging Bull wind up and charge.
  - Dig tunnels underground (can't be hit) and bursts up under the target; Rollout rolls in again and again, doubling each hit, until it misses; V-create cuts a V of fire; First Impression crouches and pounces; Wave Crash rides a wide wave that sweeps foes along.
  - Melee skills: slashes and tail swings hit everything in an arc, Sky Uppercut launches, Body Slam and Hammer Arm hop on the target, Close Combat and Play Rough are rapid combos, bites (Crunch, Fangs, Psychic Fangs, Leech Life) hold the target in place, Sacred Sword spins to hit all around, Low Sweep trips the target, Gigaton Hammer sends a shockwave, Rage Fist throws more punches the more the user was hit, Triple Kick lands three spinning kicks that grow stronger, Seismic Toss lifts the target over its head and slams it down, Plasma Fists blinks around the target punching from every side, Ivy Cudgel leaps up and smashes down, and Focus Punch / Wicked Blow tighten their focus first.
- **Ranged and area skills have shapes too** (`js/patterns.js`): Bonemerang flies out and comes back; Icicle Spear and Pin Missile fire 2-5 shots; Tri Attack's three orbs curve in from the sides; Salt Cure and Armor Cannon are lobbed onto a marked spot; Electro Ball bounces off the walls; Astral Barrage's ghosts circle the user, then fly at every foe; Sleep Powder drifts side to side; Dynamax Cannon sweeps across the arena; Steam Eruption fires in bursts; Seed Flare and Diamond Storm roll outwards as a ring you can dodge through; Glaciate raises rows of ice in a cone; Photon Geyser and Judgment raise pillars of light; Thunder Cage and Fire Spin trap the target in a zone that keeps hurting and slows it; Hyperspace Hole drags foes into a portal; Wildbolt Storm rains bolts all around.
- **Extra properties** make similar skills different, e.g. Flamethrower pierces through everyone in a line, Fire Blast leaves burning ground, Ice Beam chills (slows), Hydro Pump knocks far back, Sucker Punch hits harder mid-attack, Dragon Claw recharges faster, Mach Punch lunges from farther away.
- **All 167 abilities** of the roster work in real time (Neutralizing Gas, Zero to Hero, Zen Mode, Protosynthesis, Skill Link, Mega Launcher, Unseen Fist, Queenly Majesty, Beast Boost, Arena Trap, Download, Intimidate, Huge Power, Stance Change, Prankster, Defiant, Mirror Armor, Bulletproof, Soundproof, Good as Gold, Fairy / Dark Aura, Orichalcum Pulse, Multiscale, Rough Skin, Static, Sand Stream, Drought, Drizzle, Speed Boost, Moxie, Technician, Water / Volt Absorb, Levitate, Mold Breaker, Magic Bounce, Disguise, Illusion, Pixilate, Regenerator, No Guard...). The Personality tab describes each one.

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
| **Random Battle** | Every battle (and rematch) each player gets random Pokémon with random builds (nature, ability, Stat Points, skills) and held items. |
| **Mirror Match** | The Pink team copies the Blue team, builds included (P2 = P1's party, P4 = P3's). |

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

## How battles work

- **Stand still to attack.** Attacks are automatic and their cooldowns always recharge, but a ready move only fires while your Pokémon is standing still (not moving or dodging). While an attack plays you're rooted in place.
- Every skill has its own cooldown based on its PP: `cooldown = 45 / PP` seconds (status skills: `150 / PP`), plus a short pause after each attack. High-PP moves fire often (Bullet Punch, 30 PP: every 1.5 s); low-PP moves fire rarely but hit hard (Hyper Beam, 5 PP: every 9 s).
- **Dodging** gives a short dash with invulnerability. Use it to slip through projectiles, beams and the red warning circles that area attacks show. Dodging during a wind-up cancels it, and the move stays ready.
- **Auto-attacks never waste a move the target is immune to** (e.g. Earth Power vs Rayquaza, or a Water move into Water Absorb); the HUD greys such moves out.
- **Sudden death:** after a while (90 s in Showdown, 100 s in 2vs2, 200 s in Trio) all damage is doubled and keeps rising by +50% every 30 s, and healing shrinks by the same factor (×2 damage = ½ healing, ×3 = ⅓), so no match can stall forever.

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
js/moves.js                move behaviours: projectile, beam, melee, dash, targetArea, burst, hazard, vanish, self
js/motion.js               how dash / melee skills move (zig-zag, dive, shadow, ram, spin, burrow, roll, throws, combos...)
js/patterns.js             shapes of ranged / area skills (boomerang, volley, lob, ricochet, sweep, shockwave, zones) + hazards
js/effects.js              stat stages (timed buffs), status conditions, weather, move side effects, abilities
js/builds.js               builds (nature, ability, Stat Points, skills), saving, Random Battle builds
js/movetext.js             skill effect descriptions generated from the move data
js/fighter.js              movement, dodge, auto-cast scheduler, hurt/faint
js/combat.js               level-50 stats (nature + Stat Points), damage formula, STAB, type chart
js/ui.js                   PMD-style screens: lobby, mode window, team setup, editor, HUD, log, menus
js/modes.js                battle modes + team setup data (party members)
js/i18n.js, js/settings.js English / Korean text, saved settings
js/input.js, js/bot.js     keyboard + multi-touch joysticks, optional CPU player
data/roster.json           which Pokémon and moves are in the game   (hand-edited)
data/movefx.json           each skill's behaviour, sprite anim, VFX and extra property (hand-edited)
data/abilityfx.json        abilities: real-time effect descriptions, English + Korean (hand-edited)
data/itemfx.json           held items: PMD item id -> real-time effect + description (hand-edited)
data/items.json            generated: itemfx + real PMD names/sprites (from DumpAsset)
data/pokedex.json, moves.json, typechart.json, natures.json   generated database
assets/                    downloaded sprites, portraits, VFX + manifest.json
assets/ui/                 PMD window/portrait frames, cursor, pmd-text.ttf, type orbs, banner font
tools/                     scripts that generate data/ and assets/
```

### The Pokémon database

`data/pokedex.json` (base stats, types, abilities, learnable skills), `data/moves.json` (type, category, power, PP, cooldown, priority and the original effects: secondary chances, stat changes, drain, recoil...), `data/natures.json` and `data/typechart.json` are generated from [`@pkmn/dex`](https://www.npmjs.com/package/@pkmn/dex), the Pokémon Showdown data. The editor's Stats and Skills tabs show this data.

### Adding a Pokémon or changing moves

1. Add the Pokémon to `data/roster.json` with its 4 default move ids (Showdown ids, e.g. `"flamethrower"`).
2. Add a `data/movefx.json` entry for any new move (every move with an entry becomes learnable by the Pokémon that learn it in the games). Pick a behaviour and any sheet names from
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
