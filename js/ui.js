// Screens in the PMD: Origins style: title menu, settings, team setup (versus screen with a mode
// dropdown), Pokémon editor, fight HUD (2-4 players), message log, pause/result menus, credits.
// Everything works with mouse/touch, keyboard (arrows/WASD + Enter, Esc = back) or a gamepad.
import { DB, statsFor, HP_SCALE, effectiveness } from './combat.js';
import { moveEffectText } from './movetext.js';
import { SpriteAnimator } from './sprite.js';
import { MOVEFX } from './moves.js';
import { DODGE_COOLDOWN } from './fighter.js';
import { ITEMS, itemSprite } from './items.js';
import { MODES, MODE_ORDER, RULES, RULE_ORDER, makeMember, partyFor, teamOf, canPick, enforceRules, effectiveBase, randomParty, isMirrorCopy, isLegendary } from './modes.js';
import { KEYMAP } from './input.js';
import { t, LANGS, monName, moveName, typeName, itemName, itemDesc, I18N, natureName, abilityName, abilityDesc } from './i18n.js';
import { STATS, SP_TOTAL, SP_MAX, spUsed, zeroSp, saveBuild, forgetBuild, defaultBuild, sanitize } from './builds.js';
import { weatherNow, wantsMove } from './effects.js';
import { SETTINGS, saveSettings } from './settings.js';
import { Sfx } from './sfx.js';

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const TYPE_ORDER = ['???', 'Bug', 'Dark', 'Dragon', 'Electric', 'Fairy', 'Fighting', 'Fire', 'Flying', 'Ghost', 'Grass', 'Ground', 'Ice', 'Normal', 'Poison', 'Psychic', 'Rock', 'Steel', 'Water'];
const TABS = ['Stats', 'Skills', 'Equipment', 'Personality'];
const OVERLAYS = ['settings', 'credits', 'info', 'editor', 'pause', 'result'];
export const VERSION = 'v1.2';

const KEYS = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  ok: ['Enter', 'NumpadEnter', 'Space', 'PadConfirm'],
  back: ['Escape', 'Backspace'],
};

export const orb = (type) => `<i class="orb" style="--i:${Math.max(0, TYPE_ORDER.indexOf(type))}" title="${typeName(type)}"></i>`;
const itemIcon = (it) => `<img class="item-ico" src="${itemSprite(it)}" alt="">`;
const typeText = (type) => `${orb(type)}${typeName(type)}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const mon = (key) => monName(key, DB.pokedex[key].name);
const key = (k) => `<span class="key">${k}</span>`;

export class UI {
  constructor(game, roster, arts) {
    this.game = game;
    this.roster = roster; // species keys
    this.arts = arts;
    this.logLines = [];
    this.focus = null;
    this.edit = null; // { slot, idx, tab }
    this.preview = null;
    this.stages = {}; // setup screen: slot -> { anim, cv, dir }
    this.shown = [0, 0, 0, 0]; // which party member each setup panel shows
    this.ddOpen = false;
    this.renderStatic();
    // Mouse hover moves the keyboard cursor too, so both feel like one menu.
    document.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const el = e.target.closest?.('.nav');
      if (el && this.navItems().includes(el)) this.setFocus(el, false);
    });
    // Clicking anywhere else closes the mode dropdown.
    document.addEventListener('click', (e) => {
      if (this.ddOpen && !e.target.closest('.mode-dd')) this.toggleDropdown(false);
    });
  }

  get setup() {
    return this.game.setup;
  }

  /** (Re)build everything that only depends on the language. */
  renderStatic() {
    this.renderLobby();
    this.buildPause();
    this.buildResult();
    this.renderCredits();
    $('#loading-status').textContent = t('loading');
    $('#rotate-hint').textContent = t('rotate');
    this.game.input?.setLabels(t('dodge'), t('switch'));
  }

  /** Language changed: redraw whatever is on screen. */
  relocalize() {
    this.renderStatic();
    if (this.game.state === 'setup') this.renderSetup();
    if ($('#editor').classList.contains('show')) this.renderEditor();
    if ($('#settings').classList.contains('show')) this.renderSettings();
    if (this.game.parties.length) this.buildHUD();
  }

  // ---------- Title screen ----------
  renderLobby() {
    const root = $('#lobby');
    const items = ['play', 'online', 'sandbox', 'settings', 'credits'];
    root.innerHTML = `
      <canvas class="title-img" aria-label="Pokémon Clash"></canvas>
      <div class="win lobby-menu"><ul class="menu">
        ${items.map((a) => `<li class="nav" data-act="${a}">${t(a)}</li>`).join('')}
      </ul></div>
      <div class="promptbar"><span class="kb-only">${key('↑↓')} ${t('select')} ${key('Enter')} ${t('confirm')}</span><span class="dim version">${VERSION}</span></div>`;
    this.game.bannerFont?.toCanvas($('.title-img', root), 'Pokémon Clash', 2);
    $$('li', root).forEach((li) =>
      li.addEventListener('click', () => {
        const act = li.dataset.act;
        if (act === 'play') this.game.toSetup();
        else if (act === 'online') this.showInfo(t('online'), t('comingSoon'));
        else if (act === 'sandbox') this.showInfo(t('sandbox'), t('comingSoon'));
        else if (act === 'settings') this.showSettings();
        else this.showCredits();
      }),
    );
  }

  showLobby() {
    this.renderLobby();
    this.setFocus($('#lobby li'), false);
  }

  // ---------- Settings ----------
  showSettings() {
    $('#settings').classList.add('show');
    this.renderSettings();
    this.setFocus($('#settings .nav'), false);
  }

  renderSettings() {
    const root = $('#settings');
    const onOff = (v) => `<span class="${v ? 'yellow' : 'dim'}">${v ? t('on') : t('off')}</span>`;
    root.innerHTML = `<div class="win solid dialog settings">
      <h2>${t('settings')}</h2>
      <ul class="menu opt-list">
        <li class="nav" data-opt="lang"><span>${t('language')}</span><span class="opt-val">${Object.entries(LANGS).map(([k, v]) => `<span class="${k === SETTINGS.lang ? 'yellow' : 'dim'}">${v}</span>`).join(' / ')}</span></li>
        <li class="nav" data-opt="noZoom"><span>${t('noZoom')}</span><span class="opt-val">${onOff(SETTINGS.noZoom)}</span></li>
        <li class="nav" data-opt="sound"><span>${t('sound')}</span><span class="opt-val">${onOff(!Sfx.muted)}</span></li>
      </ul>
      <ul class="menu"><li class="nav" data-opt="close">${t('close')}</li></ul>
    </div>`;
    $$('li', root).forEach((li) =>
      li.addEventListener('click', () => {
        const opt = li.dataset.opt;
        if (opt === 'close') return this.back();
        if (opt === 'lang') SETTINGS.lang = SETTINGS.lang === 'en' ? 'ko' : 'en';
        if (opt === 'noZoom') SETTINGS.noZoom = !SETTINGS.noZoom;
        if (opt === 'sound') Sfx.toggle();
        saveSettings();
        this.game.sfx('tick');
        if (opt === 'lang') {
          if (I18N.lang === 'ko') document.fonts.load('12px Galmuri11', '한');
          this.relocalize();
        }
        this.renderSettings();
        this.setFocus($(`#settings li[data-opt="${opt}"]`), false);
      }),
    );
  }

  // ---------- Team setup (versus screen) ----------
  showSetup() {
    this.ddOpen = false;
    this.renderSetup();
    this.setFocus($('#setup .battle-btn'), false);
  }

  controlHint(slot) {
    const p = this.setup.players[slot];
    if (!p.human) return t('cpuHint');
    if (this.game.input?.touchMode) return t('touchHint');
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const k = KEYMAP[slot];
    let hint = t('keysHint', { keys: k.name, dodge: k.dodgeLabel });
    if (MODES[this.setup.mode].party > 1) hint += t('swapHint', { swap: k.swapLabel });
    if (pads[slot]) hint += t('padHint');
    return hint;
  }

  renderSetup() {
    enforceRules(this.setup); // never show an illegal team (legendary limit, All Legendary, Mirror)
    const mode = MODES[this.setup.mode];
    const rule = RULES[this.setup.rule];
    const root = $('#setup');
    const panel = (slot) => {
      const team = teamOf(this.setup.mode, slot);
      const p = this.setup.players[slot];
      const party = partyFor(this.setup, slot);
      const shown = Math.min(this.shown[slot], party.length - 1);
      const m = party[shown];
      const d = DB.pokedex[m.species];
      const item = m.item ? ITEMS.byId[m.item] : null;
      const mystery = rule.randomTeams; // Random Battle: teams are rolled when the battle starts
      const mirror = isMirrorCopy(this.setup, slot); // Mirror Match: copies the other team
      const locked = mystery || mirror;
      const nav = locked ? '' : 'nav';
      const strip =
        party.length > 1
          ? `<div class="party-strip">${party
              .map((pm, idx) => `<button class="${nav} member ${idx === shown ? 'on' : ''}" type="button" ${locked ? 'disabled' : ''} data-slot="${slot}" data-idx="${idx}" title="${mystery ? '' : `${t('edit')}: ${esc(mon(pm.species))}`}">
                  <span class="frame p${team + 1}">${mystery ? '<span class="mystery-mini">?</span>' : `<img src="${this.arts[pm.species].portraits.Normal}" alt="">`}</span>
                  ${!mystery && pm.item ? itemIcon(ITEMS.byId[pm.item]) : ''}
                </button>`)
              .join('')}</div>`
          : '';
      const plate = mystery
        ? `<div class="yellow">${t('mystery')}</div><div class="plate-item dim">${t('rule_random')}</div>`
        : this.plateHTML(m);
      return `<div class="win p${team + 1} ppanel ${mystery ? 'mystery' : ''} ${mirror ? 'mirror' : ''}" data-slot="${slot}">
        <div class="pp-head">
          <span class="p-tag c-p${slot + 1}">P${slot + 1}</span>
          <button class="nav seg ctl-btn" type="button" data-slot="${slot}"><span class="${p.human ? 'on' : ''}">${t('player')}</span><span class="${p.human ? '' : 'on'}">${t('cpu')}</span></button>
          ${mirror ? `<span class="mirror-tag">${t('mirrorTag')}</span>` : mystery ? '' : `<button class="nav dice-btn" type="button" data-slot="${slot}">${t('random')}</button>`}
        </div>
        <button class="${nav} stage" type="button" ${locked ? 'disabled' : ''} data-slot="${slot}" data-idx="${shown}" title="${locked ? '' : t('edit')}"><canvas width="128" height="96"></canvas>${locked ? '' : `<span class="edit-tag">${t('edit')}</span>`}</button>
        <div class="plate">${plate}</div>
        ${strip}
        <div class="dim ctl-hint">${this.controlHint(slot)}</div>
      </div>`;
    };
    root.innerHTML = `
      <div class="topbar">
        <button class="win nav back-btn" type="button">← ${t('lobby')}</button>
        <div class="topbar-title yellow">${t('teamSetup')}</div>
        <div class="mode-dd ${this.ddOpen ? 'open' : ''}">
          <button class="win nav mode-btn" type="button" aria-haspopup="listbox" aria-expanded="${this.ddOpen}">
            ${t('m_' + mode.id)} <span class="dim">·</span> ${t('rule_' + rule.id)} <i class="dd-arrow"></i>
          </button>
          <div class="win solid dd-list" role="listbox">
            <div class="cyan dd-head">${t('gameMode')}</div>
            <ul class="menu">${MODE_ORDER.map((id) => `<li class="nav ${id === mode.id ? 'sel' : ''}" data-mode="${id}" role="option">${t('m_' + id)} <span class="dim">${MODES[id].short}</span></li>`).join('')}</ul>
            <div class="cyan dd-head">${t('rules')}</div>
            <ul class="menu">${RULE_ORDER.map((id) => `<li class="nav ${id === rule.id ? 'sel' : ''}" data-rule="${id}" role="option">${t('rule_' + id)}</li>`).join('')}</ul>
          </div>
        </div>
      </div>
      <div class="versus vs-${mode.id}">
        <div class="side">${mode.teams[0].map(panel).join('')}</div>
        <canvas class="vs-img" aria-label="VS"></canvas>
        <div class="side">${mode.teams[1].map(panel).join('')}</div>
      </div>
      <div class="promptbar">
        <span class="kb-only">${key('Enter')} ${t('edit')} ${key('Esc')} ${t('back')}</span>
        <button class="win nav battle-btn" type="button">${t('battle')}</button>
      </div>`;
    this.game.bannerFont?.toCanvas($('.vs-img', root), 'VS', 2);
    $('.back-btn', root).addEventListener('click', () => this.game.toLobby());
    $('.battle-btn', root).addEventListener('click', () => this.game.startBattle(this.setup));
    $('.mode-btn', root).addEventListener('click', () => this.toggleDropdown(!this.ddOpen));
    $$('.dd-list li', root).forEach((li) =>
      li.addEventListener('click', () => {
        if (li.dataset.mode) this.setup.mode = li.dataset.mode;
        if (li.dataset.rule) this.setup.rule = li.dataset.rule;
        this.game.sfx('go');
        this.ddOpen = false;
        this.renderSetup();
        this.setFocus($('#setup .mode-btn'), false);
      }),
    );
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
    $$('.member, .stage', root).forEach((b) => b.addEventListener('click', () => this.openEditor(Number(b.dataset.slot), Number(b.dataset.idx))));
    // Stage canvases: animated Idle of the shown party member.
    this.stages = {};
    $$('.ppanel', root).forEach((el) => {
      const slot = Number(el.dataset.slot);
      const party = partyFor(this.setup, slot);
      const m = party[Math.min(this.shown[slot], party.length - 1)];
      this.stages[slot] = { cv: $('.stage canvas', el), anim: new SpriteAnimator(this.arts[m.species]), dir: teamOf(this.setup.mode, slot) === 0 ? 1 : 7, mystery: rule.randomTeams };
    });
  }

  /** Name, types, item and build (nature · ability) under a setup panel's stage. */
  plateHTML(m) {
    const d = DB.pokedex[m.species];
    const item = m.item ? ITEMS.byId[m.item] : null;
    return `<div><span class="yellow">${mon(m.species)}</span> ${d.types.map(orb).join('')}</div>
      <div class="plate-item">${item ? `${itemIcon(item)}${itemName(item)}` : `<span class="dim">${t('noItem')}</span>`}</div>
      <div class="plate-build dim">${natureName(DB.natures[m.nature])} · ${abilityName(m.ability, d.abilityNames[m.ability])}</div>`;
  }

  toggleDropdown(open) {
    this.ddOpen = open;
    $('#setup .mode-dd')?.classList.toggle('open', open);
    $('#setup .mode-btn')?.setAttribute('aria-expanded', String(open));
    this.game.sfx('tick');
    if (open) this.setFocus($('#setup .dd-list li[data-mode].sel'), false);
    else this.setFocus($('#setup .mode-btn'), false);
  }

  randomParty(slot) {
    randomParty(this.setup, slot, ITEMS.list); // respects the rule + one legendary per team
    this.game.sfx('go');
  }

  // ---------- Pokémon editor (Stats / Skills / Equipment / Personality) ----------
  openEditor(slot, idx, tab = this.edit?.tab || 'Stats') {
    this.edit = { slot, idx, tab, pick: null };
    this.shown[slot] = idx;
    const root = $('#editor');
    root.innerHTML = `<div class="win solid editor">
      <div class="ed-left">
        <div class="cyan ed-label"></div>
        <div class="mon-grid">${this.roster
          .map((k) => `<button class="nav mon-cell" type="button" data-species="${k}"><img src="${this.arts[k].portraits.Normal}" alt=""></button>`)
          .join('')}</div>
      </div>
      <div class="ed-right">
        <div class="ed-head"></div>
        <div class="tabs">${TABS.map((tb) => `<button class="nav tab" type="button" data-tab="${tb}"></button>`).join('')}</div>
        <div class="tab-panel"></div>
      </div>
      <div class="ed-foot"><span class="kb-only">${key('Tab')} ${t('changeTab')} ${key('Esc')} ${t('back')}</span><span class="foot-btns"><button class="win nav reset-btn" type="button"></button><button class="win nav done-btn" type="button"></button></span></div>
    </div>`;
    $$('.mon-cell', root).forEach((b) =>
      b.addEventListener('click', () => {
        const m = this.member();
        if (!canPick(this.setup, slot, idx, b.dataset.species)) return this.game.sfx('tick');
        this.setup.players[slot].party[idx] = makeMember(b.dataset.species, m.item);
        this.edit.pick = null;
        this.game.sfx('tick');
        this.game.saveTeam?.();
        this.renderEditor();
      }),
    );
    $$('.tab', root).forEach((b) =>
      b.addEventListener('click', () => {
        this.edit.tab = b.dataset.tab;
        this.edit.pick = null;
        this.renderEditor();
      }),
    );
    $('.done-btn', root).addEventListener('click', () => this.closeEditor());
    $('.reset-btn', root).addEventListener('click', () => {
      // Back to the default build (moves, neutral nature, first ability, no Stat Points); the item stays.
      const m = this.member();
      forgetBuild(m.species);
      this.setup.players[slot].party[idx] = defaultBuild(m.species, m.item);
      this.edit.pick = null;
      this.changed();
      this.renderEditor();
      this.setFocus($('#editor .reset-btn'), false);
    });
    root.classList.add('show');
    this.renderEditor();
    this.setFocus($(`#editor .mon-cell[data-species="${this.member().species}"]`), false);
  }

  member() {
    const party = this.setup.players[this.edit.slot].party;
    const m = party[this.edit.idx];
    // Older / hand-made members without a full build get one (default nature, ability, no SP).
    if (!m.sp || !m.nature || !m.ability) party[this.edit.idx] = sanitize(m);
    return party[this.edit.idx];
  }

  closeEditor() {
    $('#editor').classList.remove('show');
    this.game.saveTeam?.();
    const { slot, idx } = this.edit;
    this.preview = null;
    this.renderSetup();
    this.setFocus($(`#setup .member[data-slot="${slot}"][data-idx="${idx}"]`) || $(`#setup .stage[data-slot="${slot}"]`), false);
  }

  renderEditor() {
    const root = $('#editor');
    const m = this.member();
    const d = DB.pokedex[m.species];
    const item = m.item ? ITEMS.byId[m.item] : null;
    const partySize = MODES[this.setup.mode].party;
    $('.ed-label', root).textContent = t('pokemon');
    $('.done-btn', root).textContent = t('done');
    $('.reset-btn', root).textContent = t('resetBuild');
    const onlyLegend = RULES[this.setup.rule].onlyLegend;
    $$('.mon-cell', root).forEach((b) => {
      const sp = b.dataset.species;
      const ok = canPick(this.setup, this.edit.slot, this.edit.idx, sp);
      b.classList.toggle('sel', sp === m.species);
      b.classList.toggle('legend', isLegendary(sp));
      b.classList.toggle('locked', !ok);
      b.disabled = !ok;
      b.title = ok ? mon(sp) : `${mon(sp)} · ${onlyLegend ? t('onlyLegend') : t('lockLegend')}`;
    });
    $$('.tab', root).forEach((b) => {
      b.classList.toggle('sel', b.dataset.tab === this.edit.tab);
      b.textContent = t('t_' + b.dataset.tab);
    });
    const nat = DB.natures[m.nature];
    $('.ed-head', root).innerHTML = `
      <canvas class="preview" width="80" height="60"></canvas>
      <div>
        <div><span class="c-p${this.edit.slot + 1}">P${this.edit.slot + 1}</span>${partySize > 1 ? ` <span class="dim">${t('partyPos', { n: this.edit.idx + 1, m: partySize })}</span>` : ''}</div>
        <div><span class="yellow">${mon(m.species)}</span> <span class="dim">No.${String(d.dex).padStart(3, '0')}</span> ${d.types.map(orb).join('')}</div>
        <div><span class="cyan">${t('nature')}</span> ${natureName(nat)} <span class="cyan">${t('ability')}</span> ${abilityName(m.ability, d.abilityNames[m.ability])}</div>
        <div><span class="cyan">${t('item')}</span> ${item ? `${itemIcon(item)}${itemName(item)}` : `<span class="dim">${t('none')}</span>`}</div>
      </div>`;
    if (!this.preview || this.preview.key !== m.species) {
      this.preview = { key: m.species, anim: new SpriteAnimator(this.arts[m.species]) };
    }
    this.preview.cv = $('.preview', root);
    const panel = $('.tab-panel', root);
    const tab = this.edit.tab;
    if (tab === 'Stats') this.renderStatsTab(panel, m);
    else if (tab === 'Skills') this.renderSkillsTab(panel, m);
    else if (tab === 'Equipment') {
      const opts = [null, ...ITEMS.list];
      panel.innerHTML = `<div class="item-grid">${opts
        .map((it) => `<button class="nav item-cell ${(it?.id ?? null) === m.item ? 'sel' : ''}" type="button" data-id="${it?.id ?? ''}" title="${it ? esc(itemName(it)) : t('noItem')}">${it ? itemIcon(it) : '<span class="dim">–</span>'}</button>`)
        .join('')}</div><div class="item-info"></div>`;
      $$('.item-cell', panel).forEach((b) =>
        b.addEventListener('click', () => {
          m.item = b.dataset.id || null;
          this.changed();
          const id = b.dataset.id;
          this.renderEditor();
          this.setFocus($(`#editor .item-cell[data-id="${id}"]`), false);
        }),
      );
      this.renderItemInfo(m.item);
    } else this.renderPersonalityTab(panel, m);
  }

  /** A build was edited: remember it (per species) and the team. */
  changed(sound = true) {
    const m = this.member();
    saveBuild(m);
    this.game.saveTeam?.();
    if (sound) this.game.sfx('tick');
  }

  // Stats: nature colours + Stat Points (66 total, 32 max per stat; 1 SP = +1 at Lv50).
  renderStatsTab(panel, m) {
    const base = effectiveBase(this.setup.rule, m.species); // Balanced scales non-legendaries to 600
    const d = DB.pokedex[m.species];
    const st = statsFor(base, m);
    const nat = DB.natures[m.nature];
    const total = Object.values(base).reduce((a, b) => a + b, 0);
    const used = spUsed(m.sp);
    panel.innerHTML = `<div class="stat-list">${STATS.map((k) => {
      const cls = nat?.plus === k && nat.minus !== k ? 'nat-up' : nat?.minus === k && nat.plus !== k ? 'nat-down' : 'cyan';
      return `<button class="nav sp-row" type="button" data-stat="${k}">
        <span class="${cls}">${t('s_' + k)}</span><span class="dim sp-base">${base[k]}</span>
        <span class="sp-ctl"><span class="sp-btn" data-d="-1">−</span><b>${m.sp[k]}</b><span class="sp-btn" data-d="1">+</span></span>
        <span class="sp-val">${st[k]}</span><i style="--w:${Math.min(100, (st[k] / (k === 'hp' ? 300 : 260)) * 100)}%"></i></button>`;
    }).join('')}</div>
      <div class="row stat-foot"><span><span class="cyan">${t('statPoints')}</span> <span class="${used === SP_TOTAL ? 'yellow' : ''}">${used}/${SP_TOTAL}</span> <span class="dim">${t('base')} ${total}${total !== d.bst ? ` (${d.bst})` : ''}</span></span>
      <span><span class="cyan">${t('arenaHp')}</span> ${st.hp * HP_SCALE}</span><button class="nav sp-reset" type="button">${t('reset')}</button></div>`;
    $$('.sp-row', panel).forEach((row) => {
      const k = row.dataset.stat;
      // Enter / tap on the row fills the stat (or empties it if already filled).
      row.addEventListener('click', (e) => {
        const btn = e.target.closest('.sp-btn');
        if (btn) return;
        this.setSp(k, m.sp[k] > 0 ? -m.sp[k] : SP_MAX);
      });
      $$('.sp-btn', row).forEach((b) => {
        b.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const dd = Number(b.dataset.d);
          this.setSp(k, dd);
          // Hold to repeat. The row is re-rendered under the finger, so listen for the release on window.
          let n = 0;
          clearInterval(this.spRepeat);
          this.spRepeat = setInterval(() => {
            if (n++ > 4 && !this.setSp(k, dd)) clearInterval(this.spRepeat);
          }, 70);
          const stop = () => clearInterval(this.spRepeat);
          addEventListener('pointerup', stop, { once: true });
          addEventListener('pointercancel', stop, { once: true });
        });
        b.addEventListener('click', (e) => e.stopPropagation());
      });
    });
    $('.sp-reset', panel).addEventListener('click', () => {
      m.sp = zeroSp();
      this.changed();
      this.renderEditor();
      this.setFocus($('#editor .sp-reset'), false);
    });
  }

  /** Change one stat's Stat Points by `delta`, within the caps. Keeps focus on that row. */
  setSp(k, delta) {
    if (this.edit?.tab !== 'Stats' || !$('#editor').classList.contains('show')) return false;
    const m = this.member();
    const left = SP_TOTAL - spUsed(m.sp);
    const v = Math.max(0, Math.min(SP_MAX, m.sp[k] + Math.min(delta, left)));
    if (v === m.sp[k]) return false;
    m.sp[k] = v;
    this.changed();
    const panel = $('#editor .tab-panel');
    this.renderStatsTab(panel, m);
    this.setFocus($(`#editor .sp-row[data-stat="${k}"]`), false);
    return true;
  }

  // Skills: 4 slots in priority order (1 fires first), each replaceable by a learnable skill.
  renderSkillsTab(panel, m) {
    const d = DB.pokedex[m.species];
    const pick = this.edit.pick;
    const moveLabel = (id) => {
      const mv = DB.moves[id];
      return `${orb(mv.type)}<span class="${mv.category === 'Status' ? 'cyan' : 'green'}">${moveName(id, mv.name)}</span>`;
    };
    const meta = (id) => {
      const mv = DB.moves[id];
      return `${mv.category === 'Physical' ? t('phys') : mv.category === 'Special' ? t('spec') : t('stat')}${mv.power ? ' ' + mv.power : ''} · ${mv.cooldown}s`;
    };
    if (pick == null) {
      panel.innerHTML = `<div class="dim skill-hint">${t('skillOrder')}</div>
        <ul class="slot-list">${m.moves.map((id, i) => `<li>
          <span class="slot-n yellow">${i + 1}</span>
          <button class="nav skill-slot" type="button" data-i="${i}" data-move="${id}"><span>${moveLabel(id)}</span><span class="dim">${meta(id)}</span></button>
          <button class="nav ord-btn" type="button" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''}>▲</button><button class="nav ord-btn" type="button" data-i="${i}" data-d="1" ${i === 3 ? 'disabled' : ''}>▼</button>
        </li>`).join('')}</ul>
        <div class="move-info"></div>`;
      $$('.skill-slot', panel).forEach((b) =>
        b.addEventListener('click', () => {
          this.edit.pick = Number(b.dataset.i);
          this.game.sfx('tick');
          this.renderSkillsTab(panel, m);
          this.setFocus($(`#editor .move-opt[data-move="${m.moves[this.edit.pick]}"]`) || $('#editor .move-opt'), false);
        }),
      );
      $$('.ord-btn', panel).forEach((b) =>
        b.addEventListener('click', () => {
          const i = Number(b.dataset.i);
          const j = i + Number(b.dataset.d);
          if (j < 0 || j > 3) return;
          [m.moves[i], m.moves[j]] = [m.moves[j], m.moves[i]];
          this.changed();
          this.renderSkillsTab(panel, m);
          const again = $(`#editor .ord-btn[data-i="${j}"][data-d="${b.dataset.d}"]`);
          this.setFocus(again && !again.disabled ? again : $(`#editor .skill-slot[data-i="${j}"]`), false);
        }),
      );
      this.renderMoveInfo(m.moves[0]);
      return;
    }
    const types = d.types;
    const list = [...d.learnable].sort((a, b) => {
      const A = DB.moves[a];
      const B = DB.moves[b];
      const rank = (x) => (x.category === 'Status' ? 2 : types.includes(x.type) ? 0 : 1);
      return rank(A) - rank(B) || A.type.localeCompare(B.type) || B.power - A.power;
    });
    panel.innerHTML = `<div class="row pick-head"><span><span class="yellow">${t('slotN', { n: pick + 1 })}</span> <span class="dim">·</span> <span class="cyan">${t('learnable', { n: list.length })}</span></span><button class="nav pick-back" type="button">← ${t('back')}</button></div>
      <div class="move-grid">${list.map((id) => {
        const j = m.moves.indexOf(id);
        return `<button class="nav move-opt ${j === pick ? 'sel' : ''}" type="button" data-move="${id}">${moveLabel(id)}${j >= 0 ? `<span class="slot-tag">${j + 1}</span>` : ''}</button>`;
      }).join('')}</div>
      <div class="move-info"></div>`;
    $('.pick-back', panel).addEventListener('click', () => this.closePicker());
    $$('.move-opt', panel).forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.move;
        const j = m.moves.indexOf(id);
        if (j >= 0) [m.moves[j], m.moves[pick]] = [m.moves[pick], m.moves[j]]; // already known: swap slots
        else m.moves[pick] = id;
        this.changed();
        this.closePicker();
      }),
    );
    this.renderMoveInfo(m.moves[pick]);
  }

  closePicker() {
    const i = this.edit.pick;
    this.edit.pick = null;
    this.renderSkillsTab($('#editor .tab-panel'), this.member());
    this.setFocus($(`#editor .skill-slot[data-i="${i}"]`), false);
  }

  renderMoveInfo(id) {
    const box = $('#editor .move-info');
    if (!box || !id) return;
    const mv = DB.moves[id];
    const fx = MOVEFX.moves[id];
    const extra = fx.extra ? (I18N.lang === 'ko' ? fx.extra.descKo : fx.extra.desc) : '';
    const effect = moveEffectText(mv);
    box.innerHTML = `<div>${orb(mv.type)}<span class="yellow">${moveName(id, mv.name)}</span> <span class="dim">${typeName(mv.type)} · ${t(mv.category)}${mv.power ? ` · ${t('power')} ${mv.power}` : ''} · ${t('cooldown')} ${mv.cooldown}s · ${t('b_' + fx.behavior)}</span></div>
      <div>${effect || (extra ? '' : `<span class="dim">${t('e_none')}</span>`)}</div>${extra ? `<div class="extra">★ ${esc(extra)}</div>` : ''}`;
  }

  // Personality: nature chart (rows = raised stat, columns = lowered stat) + ability.
  renderPersonalityTab(panel, m) {
    const d = DB.pokedex[m.species];
    const order = ['atk', 'def', 'spa', 'spd', 'spe'];
    const byPair = {};
    for (const n of Object.values(DB.natures)) byPair[n.plus ? `${n.plus}-${n.minus}` : n.id] = n;
    const NEUTRAL = { atk: 'hardy', def: 'docile', spa: 'bashful', spd: 'quirky', spe: 'serious' };
    const cell = (up, down) => {
      const n = up === down ? DB.natures[NEUTRAL[up]] : byPair[`${up}-${down}`];
      return `<button class="nav nat-cell ${n.id === m.nature ? 'sel' : ''} ${up === down ? 'neutral' : ''}" type="button" data-nature="${n.id}">${natureName(n)}</button>`;
    };
    panel.innerHTML = `<div class="nat-info"></div>
      <div class="nat-chart"><span></span>${order.map((k) => `<span class="nat-down">−${t('sh_' + k)}</span>`).join('')}
        ${order.map((up) => `<span class="nat-up">+${t('sh_' + up)}</span>${order.map((down) => cell(up, down)).join('')}`).join('')}</div>
      <div class="ab-row"><span class="cyan">${t('ability')}</span>${d.abilities.map((a) => `<button class="nav ab-btn ${a === m.ability ? 'sel' : ''}" type="button" data-ability="${a}">${abilityName(a, d.abilityNames[a])}</button>`).join('')}</div>
      <div class="ab-info"></div>`;
    $$('.nat-cell', panel).forEach((b) =>
      b.addEventListener('click', () => {
        m.nature = b.dataset.nature;
        this.changed();
        this.renderEditor();
        this.setFocus($(`#editor .nat-cell[data-nature="${m.nature}"]`), false);
      }),
    );
    $$('.ab-btn', panel).forEach((b) =>
      b.addEventListener('click', () => {
        m.ability = b.dataset.ability;
        this.changed();
        this.renderEditor();
        this.setFocus($(`#editor .ab-btn[data-ability="${m.ability}"]`), false);
      }),
    );
    this.renderNatureInfo(m.nature);
    this.renderAbilityInfo(m.ability);
  }

  renderNatureInfo(id) {
    const box = $('#editor .nat-info');
    const n = DB.natures[id];
    if (!box || !n) return;
    const neutral = !n.plus || n.plus === n.minus;
    box.innerHTML = `<span class="cyan">${t('nature')}</span> <span class="yellow">${natureName(n)}</span> ${
      neutral ? `<span class="dim">${t('neutral')}</span>` : `<span class="nat-up">${t('natureUp', { stat: t('s_' + n.plus) })}</span> <span class="nat-down">${t('natureDown', { stat: t('s_' + n.minus) })}</span>`
    }`;
  }

  renderAbilityInfo(id) {
    const box = $('#editor .ab-info');
    if (!box) return;
    const d = DB.pokedex[this.member().species];
    box.innerHTML = `<span class="yellow">${abilityName(id, d.abilityNames[id])}</span> ${esc(abilityDesc(id))}`;
  }

  renderItemInfo(id) {
    const box = $('#editor .item-info');
    if (!box) return;
    const it = id ? ITEMS.byId[id] : null;
    box.innerHTML = it ? `<div>${itemIcon(it)}<span class="yellow">${itemName(it)}</span></div><div>${esc(itemDesc(it))}</div>` : `<div class="yellow">${t('noItem')}</div><div class="dim">${t('noItemDesc')}</div>`;
  }

  /** Per-frame animation of the preview sprites (setup panels + editor). */
  tick(dt) {
    // Holding ←/→ on a Stat Point row keeps changing it.
    const h = this.spHold;
    if (h) {
      if (!this.game.input?.down.has(h.code) || !this.focus?.classList.contains('sp-row')) this.spHold = null;
      else if ((h.t += dt) >= 0.06) {
        h.t = 0;
        this.setSp(this.focus.dataset.stat, h.dd);
      }
    }
    const draw = (cv, anim, dir, big) => {
      anim.update(dt);
      const ctx = cv.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, cv.width, cv.height);
      const idle = anim.art.animData.anims.Idle;
      const s = big && idle.fh * 2 <= cv.height + 44 && idle.fw * 2 <= cv.width + 40 ? 2 : 1;
      const base = cv.height - 12;
      // Pedestal
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.ellipse(cv.width / 2, base, cv.width * 0.32, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(cv.width / 2, base, 11 * s, 3.5 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      anim.draw(ctx, cv.width / 2, base - 7 * s, dir, { scale: s });
    };
    if (this.game.state === 'setup' && !$('#editor').classList.contains('show')) {
      for (const st of Object.values(this.stages)) {
        if (!st.cv.isConnected) continue;
        if (!st.mystery) draw(st.cv, st.anim, st.dir, true);
        else if (!st.drawn) {
          // Random Battle: a "?" on the pedestal until the battle rolls the team.
          const ctx = st.cv.getContext('2d');
          ctx.clearRect(0, 0, st.cv.width, st.cv.height);
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.beginPath();
          ctx.ellipse(st.cv.width / 2, st.cv.height - 12, st.cv.width * 0.32, 9, 0, 0, Math.PI * 2);
          ctx.fill();
          this.game.bannerFont?.draw(ctx, '?', st.cv.width / 2, st.cv.height / 2 - 4, 2);
          st.drawn = true;
        }
      }
    }
    const p = this.preview;
    if (p && p.cv && $('#editor').classList.contains('show')) draw(p.cv, p.anim, 1, false);
  }

  // ---------- Keyboard / gamepad navigation (spatial, like a console menu) ----------
  layers() {
    for (const id of OVERLAYS) {
      const el = $(`#${id}`);
      if (el.classList.contains('show')) return [el];
    }
    const s = this.game.state;
    if (s === 'lobby') return [$('#lobby')];
    if (s === 'setup') return this.ddOpen ? [$('#setup .dd-list')] : [$('#setup')];
    return [];
  }

  navItems() {
    return this.layers()
      .flatMap((l) => $$('.nav', l))
      .filter((el) => el.offsetParent !== null && !el.disabled && (this.ddOpen || !el.closest('.dd-list')));
  }

  setFocus(el, sound = true) {
    if (!el) return;
    if (this.focus) this.focus.classList.remove('focus');
    this.focus = el;
    el.classList.add('focus');
    el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    if (el.classList.contains('item-cell')) this.renderItemInfo(el.dataset.id || null);
    if (el.dataset.move) this.renderMoveInfo(el.dataset.move);
    if (el.dataset.nature) this.renderNatureInfo(el.dataset.nature);
    if (el.dataset.ability) this.renderAbilityInfo(el.dataset.ability);
    // Setup: hovering / moving onto a party member shows it on the panel's stage.
    if (el.classList.contains('member') && this.game.state === 'setup' && !$('#editor').classList.contains('show')) {
      const slot = Number(el.dataset.slot);
      const idx = Number(el.dataset.idx);
      if (this.shown[slot] !== idx) {
        this.shown[slot] = idx;
        const m = partyFor(this.setup, slot)[idx];
        const st = this.stages[slot];
        if (st) st.anim = new SpriteAnimator(this.arts[m.species]);
        const panel = $(`#setup .ppanel[data-slot="${slot}"]`);
        $$('.member', panel).forEach((b) => b.classList.toggle('on', Number(b.dataset.idx) === idx));
        $('.plate', panel).innerHTML = this.plateHTML(m);
        $('.stage', panel).dataset.idx = idx;
      }
    }
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
    if (best) this.setFocus(best);
  }

  /** Title / setup / any open window. Returns true when the key was used. */
  navKey(code) {
    // Stat Point rows: ←/→ change the value (hold to repeat).
    if (this.focus?.classList.contains('sp-row') && (KEYS.left.includes(code) || KEYS.right.includes(code))) {
      const dd = KEYS.left.includes(code) ? -1 : 1;
      this.setSp(this.focus.dataset.stat, dd);
      this.spHold = { code, dd, t: -0.3 };
      return true;
    }
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
      this.edit.pick = null;
      this.renderEditor();
      this.setFocus($(`#editor .tab[data-tab="${this.edit.tab}"]`));
    } else return false;
    return true;
  }

  back() {
    if ($('#settings').classList.contains('show')) {
      $('#settings').classList.remove('show');
      return this.setFocus($('#lobby li[data-act="settings"]'), false);
    }
    if ($('#credits').classList.contains('show')) return this.hideCredits();
    if ($('#info').classList.contains('show')) {
      $('#info').classList.remove('show');
      return this.refocus();
    }
    if ($('#editor').classList.contains('show')) return this.edit?.pick != null ? this.closePicker() : this.closeEditor();
    if (this.ddOpen) return this.toggleDropdown(false);
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
    const open = OVERLAYS.some((id) => $(`#${id}`).classList.contains('show'));
    if (!open) return false;
    this.navKey(code);
    return true;
  }

  showInfo(title, text) {
    $('#info').innerHTML = `<div class="win solid dialog"><h2>${title}</h2><p>${text}</p><ul class="menu"><li class="nav" id="info-close">${t('close')}</li></ul></div>`;
    $('#info-close').addEventListener('click', () => this.back());
    $('#info').classList.add('show');
    this.setFocus($('#info-close'), false);
  }

  renderCredits() {
    const link = (url, label) => `<a href="${url}" target="_blank" rel="noopener">${label}</a>`;
    $('#credits').innerHTML = `<div class="win solid dialog credits-panel">
      <h2>${t('credits')}</h2>
      <p><span class="cyan">${t('cr_sprites')}</span><br>${t('cr_spritesText').replace('PMDCollab/SpriteCollab', link('https://github.com/PMDCollab/SpriteCollab', 'PMDCollab/SpriteCollab')).replace('CREDITS.md', link('CREDITS.md', 'CREDITS.md'))}</p>
      <p><span class="cyan">${t('cr_vfx')}</span><br>${t('cr_vfxText').replace('PMDCollab/RawAsset', link('https://github.com/PMDCollab/RawAsset', 'PMDCollab/RawAsset'))}</p>
      <p><span class="cyan">${t('cr_ui')}</span><br>${t('cr_uiText').replace('DumpAsset', link('https://github.com/audinowho/DumpAsset', 'DumpAsset'))}</p>
      <p><span class="cyan">${t('cr_data')}</span><br>${t('cr_dataText').replace('@pkmn/dex', link('https://github.com/pkmn/ps', '@pkmn/dex'))}</p>
      <p class="dim">${t('cr_legal')}</p>
      <ul class="menu"><li class="nav" id="credits-close">${t('close')}</li></ul>
    </div>`;
    $('#credits-close').addEventListener('click', () => this.hideCredits());
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
    for (const id of ['pause', 'result', 'editor', 'info', 'settings']) $(`#${id}`).classList.remove('show');
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
          <div class="hud-name"><span class="c-p${p.slot + 1}">${compact ? `P${p.slot + 1} ` : ''}${mon(f.data.key)}</span>${compact ? '' : ' <span class="dim">Lv.50</span>'}${f.item ? ` <span class="hud-item" title="${esc(itemName(f.item))}">${itemIcon(f.item)}</span>` : ''}${minis}</div>
          <div class="hp-line"><span class="cyan">HP</span><span class="hp-text"></span><span class="hp-bar"><i></i></span></div>
          <div class="hud-fx"></div>
          <div class="cds">
            ${f.moves.map((id) => `<div class="cd" title="${moveName(id, DB.moves[id].name)}">${orb(DB.moves[id].type)}<b><i></i></b></div>`).join('')}
            <div class="cd dodge" title="${t('dodge')}"><img class="dodge-ico" src="assets/ui/icon-dash.png" alt=""><b><i></i></b></div>
          </div>
        </div>
      </div>`;
    };
    const left = g.parties.filter((p) => p.team === 0);
    const right = g.parties.filter((p) => p.team === 1).reverse();
    hud.className = compact ? 'compact' : '';
    hud.innerHTML = `<div class="hud-side">${left.map(panel).join('')}</div>
      <div class="hud-mid"><button class="win menu-btn" type="button">${t('menu')}</button><div class="weather-chip"></div></div>
      <div class="hud-side right">${right.map(panel).join('')}</div>`;
    $('.menu-btn', hud).addEventListener('click', () => this.game.togglePause());
    this.hudEls = g.parties.map((p) => {
      const el = $(`.hud-p[data-slot="${p.slot}"]`, hud);
      return { slot: p.slot, f: p.members[p.active], portrait: $('.hud-portrait', el), hp: $('.hp-bar i', el), hpText: $('.hp-text', el), cds: $$('.cd', el), item: $('.hud-item', el), minis: $$('.mini', el), fx: $('.hud-fx', el), fxSig: '', emotion: 'Normal', lastHp: -1 };
    });
    this.weatherEl = $('.weather-chip', hud);
    this.weatherSig = '';
    if (g.state === 'countdown' || g.state === 'loading') this.clearLog();
  }

  clearHUD() {
    $('#hud').innerHTML = '';
    this.hudEls = null;
    this.clearLog();
  }

  updateHUD() {
    if (!this.hudEls) return;
    const g = this.game;
    const w = weatherNow(g);
    const tr = g.terrain;
    const parts = [];
    if (w) parts.push(`${t('wn_' + w)} <span class="dim">${Math.ceil(g.weather.t)}</span>`);
    if (tr) parts.push(`<span class="green">${t('wn_' + tr.id)}</span> <span class="dim">${Math.ceil(tr.t)}</span>`);
    const wsig = parts.join(' · ');
    if (wsig !== this.weatherSig && this.weatherEl) {
      this.weatherSig = wsig;
      this.weatherEl.innerHTML = wsig;
      this.weatherEl.classList.toggle('on', !!wsig);
    }
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
      // Status condition + timed stat changes.
      const parts = [];
      if (f.status) parts.push(`<span class="st st-${f.status.id}">${t('stn_' + f.status.id)}</span>`);
      if (f.confusedT > 0) parts.push(`<span class="st st-confusion">${t('stn_confusion')}</span>`);
      for (const [k, b] of Object.entries(f.boosts)) parts.push(`<span class="bst ${b.n > 0 ? 'up' : 'down'}">${t('sh_' + k)}${b.n > 0 ? '+' : ''}${b.n}</span>`);
      const sig = parts.join('');
      if (sig !== h.fxSig) {
        h.fxSig = sig;
        h.fx.innerHTML = sig;
      }
      const foe = g.nearestEnemy(f);
      f.moves.forEach((id, j) => {
        const cd = DB.moves[id].cooldown;
        const c = h.cds[j];
        const mv = DB.moves[id];
        c.classList.toggle('immune', foe && mv.category !== 'Status' ? effectiveness(mv.type, foe.types) === 0 : false);
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

  // ---------- Result / pause ----------
  buildResult() {
    $('#result').innerHTML = `<div class="win solid dialog">
      <div class="result-top"><span class="win-portraits"></span><div><h2 class="win-title"></h2><div class="win-sub"></div></div></div>
      <table class="win-stats"></table>
      <ul class="menu">
        <li class="nav" data-act="rematch">${t('rematch')}</li>
        <li class="nav" data-act="setup">${t('changeTeams')}</li>
        <li class="nav" data-act="lobby">${t('lobby')}</li>
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
    $('.win-title', r).textContent = g.parties.length === 2 ? t('winsPlayer', { n: winners[0].slot + 1 }) : t('winsTeam', { team: t('team' + winTeam) });
    $('.win-sub', r).innerHTML = winners.map((p) => this.game.who(p.members[p.active])).join(' & ');
    $('.win-stats', r).innerHTML =
      `<tr><th></th>${g.parties.map((p) => `<th class="c-p${p.slot + 1}">P${p.slot + 1}</th>`).join('')}</tr>` +
      ['damage', 'casts', 'hits', 'dodges', 'supers']
        .map((k) => `<tr><td>${t('r_' + k)}</td>${g.parties.map((p) => `<td>${g.stats[p.slot][k]}</td>`).join('')}</tr>`)
        .join('');
    r.classList.add('show');
    this.setFocus($('#result li'), false);
  }

  buildPause() {
    $('#pause').innerHTML = `<div class="win solid dialog"><h2>${t('menu')}</h2><ul class="menu">
      <li class="nav" data-act="resume">${t('resume')}</li>
      <li class="nav" data-act="setup">${t('changeTeams')}</li>
      <li class="nav" data-act="lobby">${t('lobby')}</li>
      <li class="nav" data-act="credits">${t('credits')}</li></ul></div>`;
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
