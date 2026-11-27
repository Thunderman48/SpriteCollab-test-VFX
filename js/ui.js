// Screens in the PMD: Origins style: lobby, battle-mode window, team setup, Pokémon editor,
// fight HUD (2-4 players), message log, pause/result menus, credits.
// Navigation: mouse/touch, or arrows/WASD + Enter/Space (Esc = back), or any gamepad.
import { DB, statsFor, HP_SCALE, effectiveness } from './combat.js';
import { SpriteAnimator } from './sprite.js';
import { MOVEFX } from './moves.js';
import { DODGE_COOLDOWN } from './fighter.js';
import { ITEMS, itemSprite } from './items.js';
import { MODES, MODE_ORDER, TEAM_NAMES, makeMember, partyFor, teamOf } from './modes.js';
import { KEYMAP } from './input.js';

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const TYPE_ORDER = ['???', 'Bug', 'Dark', 'Dragon', 'Electric', 'Fairy', 'Fighting', 'Fire', 'Flying', 'Ghost', 'Grass', 'Ground', 'Ice', 'Normal', 'Poison', 'Psychic', 'Rock', 'Steel', 'Water'];
const BEHAVIOR_LABEL = {
  projectile: 'Projectile',
  beam: 'Beam',
  melee: 'Melee',
  dash: 'Dash',
  targetArea: 'Area',
  burst: 'Burst',
  vanish: 'Vanish',
};
const STAT_LABEL = { hp: 'HP', atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed' };
const TABS = ['Stats', 'Skills', 'Equipment', 'Personality'];

const KEYS = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  ok: ['Enter', 'NumpadEnter', 'Space', 'PadConfirm'],
  back: ['Escape', 'Backspace'],
};

export const orb = (type) => `<i class="orb" style="--i:${Math.max(0, TYPE_ORDER.indexOf(type))}"></i>`;
const itemIcon = (it) => `<img class="item-ico" src="${itemSprite(it)}" alt="">`;
const typeText = (t) => `${orb(t)}${t}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export class UI {
  constructor(game, roster, arts) {
    this.game = game;
    this.roster = roster; // species keys
    this.arts = arts;
    this.logLines = [];
    this.focus = null;
    this.edit = null; // { slot, idx, tab }
    this.preview = null;
    this.buildLobby();
    this.buildModeWin();
    this.buildPause();
    this.buildResult();
    $('#credits-close').addEventListener('click', () => this.hideCredits());
    $('#info-close').addEventListener('click', () => this.back());
    // Mouse hover moves the keyboard cursor too, so both feel like one menu.
    document.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const el = e.target.closest?.('.nav');
      if (el && this.navItems().includes(el)) this.setFocus(el, false);
    });
  }

  get setup() {
    return this.game.setup;
  }

  // ---------- Lobby ----------
  buildLobby() {
    const root = $('#lobby');
    root.innerHTML = `
      <canvas class="title-img" aria-label="Pokémon Clash"></canvas>
      <div class="win lobby-menu"><ul class="menu">
        <li class="nav" data-act="play">Play</li>
        <li class="nav" data-act="online">Online Multiplayer</li>
        <li class="nav" data-act="sandbox">Sandbox</li>
        <li class="nav" data-act="credits">Credits</li>
      </ul></div>`;
    this.game.bannerFont?.toCanvas($('.title-img', root), 'Pokémon Clash', 2);
    $$('li', root).forEach((li) =>
      li.addEventListener('click', () => {
        const act = li.dataset.act;
        if (act === 'play') this.game.toSetup();
        else if (act === 'online') this.showInfo('Online Multiplayer', 'Coming soon.');
        else if (act === 'sandbox') this.showInfo('Sandbox', 'Coming soon.');
        else this.showCredits();
      }),
    );
  }

  showLobby() {
    this.renderModeWin();
    this.setFocus($('#lobby li'), false);
  }

  // ---------- Battle mode window (top right of lobby + setup) ----------
  buildModeWin() {
    const root = $('#mode-win');
    root.innerHTML = `<div class="cyan">Battle mode</div><ul class="menu">
      ${MODE_ORDER.map((m) => `<li class="nav" data-mode="${m}">${MODES[m].name} <span class="dim">${MODES[m].short}</span></li>`).join('')}
      </ul><div class="mode-desc dim"></div>`;
    $$('li', root).forEach((li) =>
      li.addEventListener('click', () => {
        this.setup.mode = li.dataset.mode;
        this.game.sfx('tick');
        this.renderModeWin();
        if (this.game.state === 'setup') this.renderSetup();
      }),
    );
  }

  renderModeWin() {
    const root = $('#mode-win');
    $$('li', root).forEach((li) => li.classList.toggle('sel', li.dataset.mode === this.setup.mode));
    $('.mode-desc', root).textContent = MODES[this.setup.mode].desc;
  }

  // ---------- Team setup ----------
  showSetup() {
    this.renderModeWin();
    this.renderSetup();
    this.setFocus($('#setup .start-btn'), false);
  }

  controlHint(slot) {
    const p = this.setup.players[slot];
    if (!p.human) return 'Controlled by the CPU';
    if (this.game.input?.touchMode) return 'Touch controls';
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const k = KEYMAP[slot];
    let hint = `${k.name} · ${k.dodgeLabel} dodge`;
    if (MODES[this.setup.mode].party > 1) hint += ` · ${k.swapLabel} switch`;
    if (pads[slot]) hint += ' · gamepad';
    return hint;
  }

  renderSetup() {
    const mode = MODES[this.setup.mode];
    const root = $('#setup');
    const card = (slot) => {
      const team = teamOf(this.setup.mode, slot);
      const p = this.setup.players[slot];
      const members = partyFor(this.setup, slot)
        .map((m, idx) => {
          const d = DB.pokedex[m.species];
          const item = m.item ? ITEMS.byId[m.item] : null;
          return `<button class="nav member" type="button" data-slot="${slot}" data-idx="${idx}" title="Edit ${esc(d.name)}">
            <span class="frame p${team + 1}"><img src="${this.arts[m.species].portraits.Normal}" alt=""></span>
            <span class="m-name">${d.name}</span>
            <span class="m-sub">${d.types.map(orb).join('')}${item ? itemIcon(item) : ''}</span>
          </button>`;
        })
        .join('');
      return `<div class="win p${team + 1} slot-card" data-slot="${slot}">
        <div class="card-head">
          <span class="c-p${slot + 1} p-tag">P${slot + 1}</span>
          <button class="nav ctl-btn" type="button" data-slot="${slot}">${p.human ? 'Player' : 'CPU'}</button>
          <button class="nav dice-btn" type="button" data-slot="${slot}">Random</button>
        </div>
        <div class="dim ctl-hint">${this.controlHint(slot)}</div>
        <div class="party">${members}</div>
      </div>`;
    };
    root.innerHTML = `
      <div class="setup-head">
        <button class="win nav back-btn" type="button">← Lobby</button>
        <span class="yellow">${mode.name}</span> <span class="dim">${mode.short}</span>
      </div>
      <div class="teams teams-${mode.id}">
        ${[0, 1].map((t) => `<section class="team">
          <div class="team-name ${t ? 'c-p2' : 'c-p1'}">${TEAM_NAMES[t]}</div>
          ${mode.teams[t].map(card).join('')}
        </section>`).join('<div class="vs">VS</div>')}
      </div>
      <div class="setup-foot"><button class="win nav start-btn" type="button">Start battle</button></div>`;
    $('.back-btn', root).addEventListener('click', () => this.game.toLobby());
    $('.start-btn', root).addEventListener('click', () => this.game.startBattle(this.setup));
    $$('.ctl-btn', root).forEach((b) =>
      b.addEventListener('click', () => {
        const p = this.setup.players[b.dataset.slot];
        p.human = !p.human;
        this.game.sfx('tick');
        this.renderSetup();
        this.setFocus($(`#setup .ctl-btn[data-slot="${b.dataset.slot}"]`), false);
      }),
    );
    $$('.dice-btn', root).forEach((b) =>
      b.addEventListener('click', () => {
        this.randomParty(Number(b.dataset.slot));
        this.renderSetup();
        this.setFocus($(`#setup .dice-btn[data-slot="${b.dataset.slot}"]`), false);
      }),
    );
    $$('.member', root).forEach((b) => b.addEventListener('click', () => this.openEditor(Number(b.dataset.slot), Number(b.dataset.idx))));
  }

  randomParty(slot) {
    const pool = [...this.roster].sort(() => Math.random() - 0.5);
    const items = ITEMS.list;
    this.setup.players[slot].party = pool.slice(0, 3).map((s) => makeMember(s, Math.random() < 0.85 ? items[Math.floor(Math.random() * items.length)].id : null));
    this.game.sfx('go');
  }

  // ---------- Pokémon editor (Stats / Skills / Equipment / Personality) ----------
  openEditor(slot, idx, tab = this.edit?.tab || 'Stats') {
    this.edit = { slot, idx, tab };
    const root = $('#editor');
    root.innerHTML = `<div class="win solid editor">
      <div class="ed-left">
        <div class="cyan">Pokémon</div>
        <div class="mon-grid">${this.roster
          .map((k) => `<button class="nav mon-cell" type="button" data-species="${k}" title="${DB.pokedex[k].name}"><img src="${this.arts[k].portraits.Normal}" alt="${DB.pokedex[k].name}"></button>`)
          .join('')}</div>
      </div>
      <div class="ed-right">
        <div class="ed-head"></div>
        <div class="tabs">${TABS.map((t) => `<button class="nav tab" type="button" data-tab="${t}">${t}</button>`).join('')}</div>
        <div class="tab-panel"></div>
      </div>
      <div class="ed-foot"><button class="win nav done-btn" type="button">Done</button></div>
    </div>`;
    $$('.mon-cell', root).forEach((b) =>
      b.addEventListener('click', () => {
        const m = this.member();
        this.setup.players[slot].party[idx] = makeMember(b.dataset.species, m.item);
        this.game.sfx('tick');
        this.renderEditor();
      }),
    );
    $$('.tab', root).forEach((b) =>
      b.addEventListener('click', () => {
        this.edit.tab = b.dataset.tab;
        this.renderEditor();
      }),
    );
    $('.done-btn', root).addEventListener('click', () => this.closeEditor());
    root.classList.add('show');
    this.renderEditor();
    this.setFocus($(`#editor .mon-cell[data-species="${this.member().species}"]`), false);
  }

  member() {
    return this.setup.players[this.edit.slot].party[this.edit.idx];
  }

  closeEditor() {
    $('#editor').classList.remove('show');
    const { slot, idx } = this.edit;
    this.preview = null;
    this.renderSetup();
    this.setFocus($(`#setup .member[data-slot="${slot}"][data-idx="${idx}"]`), false);
  }

  renderEditor() {
    const root = $('#editor');
    const m = this.member();
    const d = DB.pokedex[m.species];
    const item = m.item ? ITEMS.byId[m.item] : null;
    const partySize = MODES[this.setup.mode].party;
    $$('.mon-cell', root).forEach((b) => b.classList.toggle('sel', b.dataset.species === m.species));
    $$('.tab', root).forEach((b) => b.classList.toggle('sel', b.dataset.tab === this.edit.tab));
    $('.ed-head', root).innerHTML = `
      <canvas class="preview" width="80" height="60"></canvas>
      <div>
        <div><span class="c-p${this.edit.slot + 1}">P${this.edit.slot + 1}</span>${partySize > 1 ? ` <span class="dim">Pokémon ${this.edit.idx + 1}/${partySize}</span>` : ''}</div>
        <div><span class="yellow">${d.name}</span> <span class="dim">No.${String(d.dex).padStart(3, '0')}</span></div>
        <div>${d.types.map(typeText).join(' ')}</div>
        <div><span class="cyan">Item</span> ${item ? `${itemIcon(item)}${item.name}` : '<span class="dim">None</span>'}</div>
      </div>`;
    if (!this.preview || this.preview.key !== m.species) {
      this.preview = { key: m.species, anim: new SpriteAnimator(this.arts[m.species]) };
    }
    this.preview.cv = $('.preview', root);
    const panel = $('.tab-panel', root);
    const tab = this.edit.tab;
    if (tab === 'Stats') {
      const st = statsFor(d.baseStats);
      panel.innerHTML = `<div class="stat-list">${Object.entries(d.baseStats)
        .map(([k, v]) => `<div class="stat-row"><span class="cyan">${STAT_LABEL[k]}</span><b>${v}</b><i style="--w:${Math.min(100, (v / 160) * 100)}%"></i></div>`)
        .join('')}</div>
        <div class="row"><span><span class="cyan">Total</span> ${d.bst}</span><span><span class="cyan">Arena HP</span> ${st.hp * HP_SCALE}</span></div>
        <div><span class="cyan">Ability</span> ${d.abilities.map(esc).join(' / ')}</div>`;
    } else if (tab === 'Skills') {
      panel.innerHTML = `<ul class="skill-list">${m.moves
        .map((id) => {
          const mv = DB.moves[id];
          const fx = MOVEFX.moves[id];
          return `<li><div class="row"><span>${orb(mv.type)}<span class="green">${mv.name}</span></span><span>${mv.category === 'Physical' ? 'Phys' : 'Spec'} ${mv.power} · <span class="cyan">PP</span> ${mv.pp} · ${mv.cooldown}s</span></div>
            <div class="dim">${mv.type} · ${mv.category} · ${BEHAVIOR_LABEL[fx.behavior] || ''}</div></li>`;
        })
        .join('')}</ul>`;
    } else if (tab === 'Equipment') {
      const opts = [null, ...ITEMS.list];
      panel.innerHTML = `<div class="item-grid">${opts
        .map((it) => `<button class="nav item-cell ${(it?.id ?? null) === m.item ? 'sel' : ''}" type="button" data-id="${it?.id ?? ''}" title="${it ? esc(it.name) : 'No item'}">${it ? itemIcon(it) : '<span class="dim">–</span>'}</button>`)
        .join('')}</div><div class="item-info"></div>`;
      $$('.item-cell', panel).forEach((b) =>
        b.addEventListener('click', () => {
          m.item = b.dataset.id || null;
          this.game.sfx('tick');
          const id = b.dataset.id;
          this.renderEditor();
          this.setFocus($(`#editor .item-cell[data-id="${id}"]`), false);
        }),
      );
      this.renderItemInfo(m.item);
    } else {
      panel.innerHTML = `<div class="dim">Coming soon.</div>`;
    }
  }

  renderItemInfo(id) {
    const box = $('#editor .item-info');
    if (!box) return;
    const it = id ? ITEMS.byId[id] : null;
    box.innerHTML = it ? `<div>${itemIcon(it)}<span class="yellow">${it.name}</span></div><div>${esc(it.desc)}</div>` : '<div class="yellow">No item</div><div class="dim">Fight without a held item.</div>';
    box.title = it ? `Original PMD description: ${it.pmdDesc}` : '';
  }

  tick(dt) {
    const p = this.preview;
    if (!p || !p.cv || !$('#editor').classList.contains('show')) return;
    p.anim.update(dt);
    const ctx = p.cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, p.cv.width, p.cv.height);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(40, 52, 12, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    p.anim.draw(ctx, 40, 46, 1);
  }

  // ---------- Keyboard / gamepad navigation (spatial, like a console menu) ----------
  layers() {
    for (const id of ['credits', 'info', 'editor', 'pause', 'result']) {
      const el = $(`#${id}`);
      if (el.classList.contains('show')) return [el];
    }
    const s = this.game.state;
    if (s === 'lobby') return [$('#lobby'), $('#mode-win')];
    if (s === 'setup') return [$('#setup'), $('#mode-win')];
    return [];
  }

  navItems() {
    return this.layers().flatMap((l) => $$('.nav', l)).filter((el) => el.offsetParent !== null && !el.disabled);
  }

  setFocus(el, sound = true) {
    if (!el) return;
    if (this.focus) this.focus.classList.remove('focus');
    this.focus = el;
    el.classList.add('focus');
    el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    if (el.classList.contains('item-cell')) this.renderItemInfo(el.dataset.id || null);
    if (sound) this.game.sfx('tick');
  }

  move(dx, dy) {
    const items = this.navItems();
    if (!items.length) return;
    if (!this.focus || !items.includes(this.focus)) return this.setFocus(items[0]);
    const r0 = this.focus.getBoundingClientRect();
    const cx = r0.left + r0.width / 2;
    const cy = r0.top + r0.height / 2;
    let best = null;
    let bestScore = Infinity;
    for (const el of items) {
      if (el === this.focus) continue;
      const r = el.getBoundingClientRect();
      const ex = r.left + r.width / 2;
      const ey = r.top + r.height / 2;
      const along = (ex - cx) * dx + (ey - cy) * dy;
      if (along <= 2) continue;
      const across = Math.abs((ex - cx) * dy) + Math.abs((ey - cy) * dx);
      const score = along + across * 2.5;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    // Entering another list (e.g. the battle-mode window) lands on its selected entry.
    const list = best?.closest('ul');
    if (list && list !== this.focus.closest('ul')) best = list.querySelector('li.sel.nav') || best;
    if (best) this.setFocus(best);
  }

  /** Lobby / setup / any open window. Returns true when the key was used. */
  navKey(code) {
    if (KEYS.up.includes(code)) this.move(0, -1);
    else if (KEYS.down.includes(code)) this.move(0, 1);
    else if (KEYS.left.includes(code)) this.move(-1, 0);
    else if (KEYS.right.includes(code)) this.move(1, 0);
    else if (KEYS.ok.includes(code)) {
      if (this.focus && this.navItems().includes(this.focus)) this.focus.click();
      else this.move(0, 1);
    } else if (KEYS.back.includes(code) || (code === 'KeyP' && this.game.state === 'paused')) this.back();
    else if (code === 'Tab' && this.edit && $('#editor').classList.contains('show')) {
      const i = TABS.indexOf(this.edit.tab);
      this.edit.tab = TABS[(i + 1) % TABS.length];
      this.renderEditor();
      this.setFocus($(`#editor .tab[data-tab="${this.edit.tab}"]`));
    } else return false;
    return true;
  }

  back() {
    if ($('#credits').classList.contains('show')) return this.hideCredits();
    if ($('#info').classList.contains('show')) {
      $('#info').classList.remove('show');
      return this.refocus();
    }
    if ($('#editor').classList.contains('show')) return this.closeEditor();
    if (this.game.state === 'paused') return this.game.togglePause();
    if (this.game.state === 'result') return this.game.toSetup();
    if (this.game.state === 'setup') return this.game.toLobby();
  }

  refocus() {
    const items = this.navItems();
    if (items.length) this.setFocus(items[0], false);
  }

  /** Keys while a window is open on top of the game. */
  menuKey(code) {
    const open = ['credits', 'info', 'editor', 'pause', 'result'].some((id) => $(`#${id}`).classList.contains('show'));
    if (!open) return false;
    this.navKey(code);
    return true;
  }

  showInfo(title, text) {
    $('#info-title').textContent = title;
    $('#info-text').textContent = text;
    $('#info').classList.add('show');
    this.setFocus($('#info-close'), false);
  }

  showCredits() {
    $('#credits').classList.add('show');
    this.setFocus($('#credits-close'), false);
  }

  hideCredits() {
    $('#credits').classList.remove('show');
    this.refocus();
  }

  hideOverlays() {
    for (const id of ['pause', 'result', 'editor', 'info']) $(`#${id}`).classList.remove('show');
  }

  // ---------- Fight HUD ----------
  buildHUD() {
    const g = this.game;
    const hud = $('#hud');
    const compact = g.parties.length > 2;
    const panel = (p) => {
      const f = p.members[p.active];
      const right = p.team === 1;
      const minis = p.members.length > 1 ? `<span class="party-minis">${p.members.map((m, k) => `<img class="mini ${k === p.active ? 'on' : ''} ${m.ko ? 'ko' : ''}" src="${m.art.portraits.Normal}" alt="">`).join('')}</span>` : '';
      return `<div class="win p${p.team + 1} hud-p ${right ? 'right' : ''} ${compact ? 'compact' : ''}" data-slot="${p.slot}">
        <span class="frame p${p.team + 1}"><img class="hud-portrait" src="${f.art.portraits.Normal}" alt=""></span>
        <div class="hud-main">
          <div class="hud-name"><span class="c-p${p.slot + 1}">${compact ? `P${p.slot + 1} ` : ''}${f.data.name}</span>${compact ? '' : ' <span class="dim">Lv.50</span>'}${f.item ? ` <span class="hud-item" title="${esc(f.item.name)}">${itemIcon(f.item)}</span>` : ''}${minis}</div>
          <div class="hp-line"><span class="cyan">HP</span><span class="hp-text"></span><span class="hp-bar"><i></i></span></div>
          <div class="cds">
            ${f.moves.map((id) => `<div class="cd" title="${DB.moves[id].name}">${orb(DB.moves[id].type)}<b><i></i></b></div>`).join('')}
            <div class="cd dodge" title="Dodge"><span class="dodge-ico">${right ? '←' : '→'}</span><b><i></i></b></div>
          </div>
        </div>
      </div>`;
    };
    const left = g.parties.filter((p) => p.team === 0);
    const right = g.parties.filter((p) => p.team === 1).reverse();
    hud.className = compact ? 'compact' : '';
    hud.innerHTML = `<div class="hud-side">${left.map(panel).join('')}</div>
      <button class="win menu-btn" type="button" aria-label="Menu">Menu</button>
      <div class="hud-side right">${right.map(panel).join('')}</div>`;
    $('.menu-btn', hud).addEventListener('click', () => this.game.togglePause());
    this.hudEls = g.parties.map((p) => {
      const el = $(`.hud-p[data-slot="${p.slot}"]`, hud);
      return { slot: p.slot, f: p.members[p.active], portrait: $('.hud-portrait', el), hp: $('.hp-bar i', el), hpText: $('.hp-text', el), cds: $$('.cd', el), item: $('.hud-item', el), minis: $$('.mini', el), emotion: 'Normal', lastHp: -1 };
    });
    if (g.state === 'countdown' || g.state === 'loading') this.clearLog();
  }

  updateHUD() {
    if (!this.hudEls) return;
    const g = this.game;
    for (const h of this.hudEls) {
      const f = h.f;
      const party = g.parties[h.slot];
      if (!party) continue;
      const k = f.hp / f.maxHp;
      const hp = Math.ceil(f.hp);
      if (hp !== h.lastHp) {
        h.lastHp = hp;
        h.hp.style.width = `${k * 100}%`;
        h.hp.style.background = k > 0.5 ? '#58f858' : k > 0.25 ? '#f8f800' : '#f85840';
        h.hpText.textContent = `${hp}/${f.maxHp}`;
      }
      const emo = f.ko ? 'Pain' : f.emotion !== 'Normal' ? f.emotion : k < 0.25 ? 'Determined' : 'Normal';
      if (emo !== h.emotion && f.art.portraits[emo]) {
        h.emotion = emo;
        h.portrait.src = f.art.portraits[emo];
      }
      if (h.item) h.item.classList.toggle('spent', f.itemSpent);
      h.minis.forEach((img, i) => img.classList.toggle('ko', party.members[i].ko));
      const foe = g.nearestEnemy(f);
      f.moves.forEach((id, j) => {
        const cd = DB.moves[id].cooldown;
        const c = h.cds[j];
        c.classList.toggle('immune', foe ? effectiveness(DB.moves[id].type, foe.data.types) === 0 : false);
        c.classList.toggle('ready', f.cd[id] <= 0);
        c.classList.toggle('casting', f.cast?.id === id);
        c.lastChild.firstChild.style.width = `${(1 - f.cd[id] / cd) * 100}%`;
      });
      const dc = h.cds[h.cds.length - 1];
      dc.classList.toggle('ready', f.dodgeCd <= 0);
      dc.lastChild.firstChild.style.width = `${(1 - f.dodgeCd / DODGE_COOLDOWN) * 100}%`;
    }
  }

  // ---------- Message log ----------
  log(html) {
    this.logLines.push(html);
    if (this.logLines.length > 3) this.logLines.shift();
    const el = $('#log');
    el.innerHTML = this.logLines.map((l) => `<p>${l}</p>`).join('');
    el.classList.add('has-lines');
    clearTimeout(this.logTimer);
    this.logTimer = setTimeout(() => this.clearLog(), 4000);
  }

  clearLog() {
    this.logLines = [];
    const el = $('#log');
    el.innerHTML = '';
    el.classList.remove('has-lines');
  }

  // ---------- Result / pause / credits ----------
  buildResult() {
    $('#result').innerHTML = `<div class="win solid dialog">
      <div class="result-top"><span class="win-portraits"></span><div><h2 class="win-title"></h2><div class="win-sub"></div></div></div>
      <table class="win-stats"></table>
      <ul class="menu">
        <li class="nav" data-act="rematch">Rematch</li>
        <li class="nav" data-act="setup">Change teams</li>
        <li class="nav" data-act="lobby">Lobby</li>
      </ul></div>`;
    $$('#result li').forEach((li) =>
      li.addEventListener('click', () => {
        const a = li.dataset.act;
        if (a === 'rematch') this.game.rematch();
        else if (a === 'setup') this.game.toSetup();
        else this.game.toLobby();
      }),
    );
  }

  showResult(winTeam) {
    const g = this.game;
    const r = $('#result');
    const winners = g.parties.filter((p) => p.team === winTeam);
    $('.win-portraits', r).innerHTML = winners
      .map((p) => {
        const f = p.members[p.active];
        const src = f.art.portraits.Joyous || f.art.portraits.Happy || f.art.portraits.Normal;
        return `<span class="frame p${winTeam + 1}"><img src="${src}" alt=""></span>`;
      })
      .join('');
    $('.win-title', r).textContent = g.parties.length === 2 ? `Player ${winners[0].slot + 1} wins!` : `${TEAM_NAMES[winTeam]} wins!`;
    $('.win-sub', r).innerHTML = winners.map((p) => this.game.who(p.members[p.active])).join(' & ');
    $('.win-stats', r).innerHTML =
      `<tr><th></th>${g.parties.map((p) => `<th class="c-p${p.slot + 1}">P${p.slot + 1}</th>`).join('')}</tr>` +
      [
        ['Damage dealt', (s) => s.damage],
        ['Moves used', (s) => s.casts],
        ['Hits landed', (s) => s.hits],
        ['Dodges', (s) => s.dodges],
        ['Super effective', (s) => s.supers],
      ]
        .map(([label, fn]) => `<tr><td>${label}</td>${g.parties.map((p) => `<td>${fn(g.stats[p.slot])}</td>`).join('')}</tr>`)
        .join('');
    r.classList.add('show');
    this.setFocus($('#result li'), false);
  }

  buildPause() {
    $('#pause').innerHTML = `<div class="win solid dialog"><h2>Menu</h2><ul class="menu">
      <li class="nav" data-act="resume">Resume</li>
      <li class="nav" data-act="setup">Change teams</li>
      <li class="nav" data-act="lobby">Lobby</li>
      <li class="nav" data-act="credits">Credits</li></ul></div>`;
    $$('#pause li').forEach((li) =>
      li.addEventListener('click', () => {
        const a = li.dataset.act;
        if (a === 'resume') this.game.togglePause();
        else if (a === 'setup') this.game.toSetup();
        else if (a === 'lobby') this.game.toLobby();
        else this.showCredits();
      }),
    );
  }

  // Used by main.js togglePause (puts the cursor on Resume).
  get pauseMenu() {
    return { set: () => this.setFocus($('#pause li'), false) };
  }
}
