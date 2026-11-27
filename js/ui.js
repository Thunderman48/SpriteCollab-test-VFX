// DOM screens in the PMD: Origins style: windows, ▶-cursor menus, framed portraits, type orbs.
import { DB, statsFor, HP_SCALE, effectiveness } from './combat.js';
import { SpriteAnimator } from './sprite.js';
import { MOVEFX } from './moves.js';
import { DODGE_COOLDOWN } from './fighter.js';

const $ = (sel, el = document) => el.querySelector(sel);
const TYPE_ORDER = ['???', 'Bug', 'Dark', 'Dragon', 'Electric', 'Fairy', 'Fighting', 'Fire', 'Flying', 'Ghost', 'Grass', 'Ground', 'Ice', 'Normal', 'Poison', 'Psychic', 'Rock', 'Steel', 'Water'];
const BEHAVIOR_LABEL = {
  projectile: 'Projectile',
  beam: 'Beam',
  melee: 'Melee',
  dash: 'Dash',
  targetArea: 'Aimed area',
  burst: 'Burst around self',
};
const CONTROLS = [
  { keys: 'WASD', dodge: 'Space', ready: 'Space' },
  { keys: '←↑→↓', dodge: 'Enter', ready: 'Enter' },
];
const KEYS = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  ok: ['Enter', 'NumpadEnter', 'Space', 'KeyF'],
  back: ['Escape', 'Backspace'],
};

export const orb = (type) => `<i class="orb" style="--i:${Math.max(0, TYPE_ORDER.indexOf(type))}"></i>`;
const typeText = (t) => `${orb(t)}${t}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** A ▶-cursor option list. items: [{ label, act }] */
class Menu {
  constructor(ul, items) {
    this.ul = ul;
    this.items = items;
    this.index = 0;
    ul.innerHTML = items.map((it, i) => `<li data-i="${i}">${it.label}</li>`).join('');
    ul.querySelectorAll('li').forEach((li) => {
      li.addEventListener('pointerenter', () => this.set(Number(li.dataset.i)));
      li.addEventListener('click', () => {
        this.set(Number(li.dataset.i));
        this.choose();
      });
    });
    this.set(0);
  }
  set(i) {
    this.index = (i + this.items.length) % this.items.length;
    this.ul.querySelectorAll('li').forEach((li, j) => li.classList.toggle('sel', j === this.index));
  }
  key(code) {
    if (KEYS.up.includes(code)) this.set(this.index - 1);
    else if (KEYS.down.includes(code)) this.set(this.index + 1);
    else if (KEYS.ok.includes(code)) this.choose();
    else return false;
    return true;
  }
  choose() {
    this.items[this.index].act();
  }
}

export class UI {
  constructor(game, roster, arts) {
    this.game = game;
    this.roster = roster; // array of keys
    this.arts = arts;
    this.pick = [0, 4];
    this.ready = [false, false];
    this.cpu = [false, false];
    this.previews = [];
    this.logLines = [];
    this.buildSelect();
    this.buildResult();
    this.buildPause();
    this.creditsMenu = { key: (code) => (KEYS.ok.includes(code) || KEYS.back.includes(code) ? (this.hideCredits(), true) : false) };
    $('#credits-close').addEventListener('click', () => this.hideCredits());
  }

  // ---------- Character select ----------
  buildSelect() {
    const root = $('#select');
    root.innerHTML = `
      <header class="select-title">
        <canvas class="banner-img" aria-label="SpriteCollab VFX Arena"></canvas>
        <span class="dim">Stand still to attack: moves fire on their own (high PP = fast, low PP = strong). <span class="cyan">→</span> moves fire where you face.</span>
      </header>
      <div class="select-cols">
        ${[0, 1].map((i) => `
          <section class="pcol p${i + 1}" data-p="${i}">
            <div class="pcol-head">
              <span class="c-p${i + 1}">Player ${i + 1} <span class="dim kb-only">${CONTROLS[i].keys} move · ${CONTROLS[i].dodge} dodge</span></span>
              ${i === 1 ? '<button class="cpu-toggle" type="button">P2: Human</button>' : ''}
            </div>
            <div class="pick-row">
              <div class="win p${i + 1} roster"><ul class="menu" aria-label="Player ${i + 1} Pokémon">
                ${this.roster.map((k, j) => `<li data-j="${j}">${DB.pokedex[k].name}</li>`).join('')}
              </ul></div>
              <div class="win who"><canvas class="preview" width="80" height="60"></canvas></div>
            </div>
            <div class="win info"></div>
            <div class="win moves-win"><ul class="moves"></ul></div>
            <div class="win p${i + 1} ready-win" role="button" tabindex="0"></div>
          </section>`).join('')}
      </div>
      <footer class="select-foot">
        <button class="credits-btn" type="button">Credits</button>
      </footer>`;
    root.querySelectorAll('.pcol').forEach((col) => {
      const i = Number(col.dataset.p);
      col.querySelectorAll('.roster li').forEach((li) =>
        li.addEventListener('click', () => {
          if (i === 1 && this.cpu[1]) this.ready[1] = true;
          else this.ready[i] = false;
          this.pick[i] = Number(li.dataset.j);
          this.renderSelect();
        }),
      );
      $('.ready-win', col).addEventListener('click', () => this.toggleReady(i));
    });
    $('.cpu-toggle', root).addEventListener('click', (e) => {
      this.cpu[1] = !this.cpu[1];
      e.currentTarget.textContent = `P2: ${this.cpu[1] ? 'CPU' : 'Human'}`;
      this.ready[1] = this.cpu[1];
      this.renderSelect();
      this.checkStart();
    });
    $('.credits-btn', root).addEventListener('click', () => this.showCredits());
    const title = $('.banner-img', root);
    if (this.game.bannerFont) this.game.bannerFont.toCanvas(title, 'SpriteCollab VFX Arena');
    this.renderSelect();
  }

  toggleReady(i) {
    if (i === 1 && this.cpu[1]) return;
    this.ready[i] = !this.ready[i];
    this.game.sfx(this.ready[i] ? 'go' : 'tick');
    this.renderSelect();
    this.checkStart();
  }

  checkStart() {
    if (this.ready[0] && this.ready[1]) {
      setTimeout(() => {
        if (this.ready[0] && this.ready[1] && this.game.state === 'select') {
          this.game.startFight(this.pick.map((j) => this.roster[j]), this.cpu.slice());
        }
      }, 350);
    }
  }

  selectKey(code) {
    if (this.game.state !== 'select') return false;
    const nav = [
      { prev: ['KeyW', 'KeyA'], next: ['KeyS', 'KeyD'], ready: ['Space', 'KeyF', 'ShiftLeft'] },
      { prev: ['ArrowUp', 'ArrowLeft'], next: ['ArrowDown', 'ArrowRight'], ready: ['Enter', 'NumpadEnter', 'ShiftRight'] },
    ];
    nav.forEach((n, i) => {
      if (i === 1 && this.cpu[1]) return;
      const n5 = this.roster.length;
      if (n.prev.includes(code) && !this.ready[i]) this.pick[i] = (this.pick[i] + n5 - 1) % n5;
      else if (n.next.includes(code) && !this.ready[i]) this.pick[i] = (this.pick[i] + 1) % n5;
      else if (n.ready.includes(code)) return this.toggleReady(i);
      else return;
      this.game.sfx('tick');
      this.renderSelect();
    });
    return true;
  }

  renderSelect() {
    const root = $('#select');
    root.querySelectorAll('.pcol').forEach((col) => {
      const i = Number(col.dataset.p);
      col.classList.toggle('is-ready', this.ready[i]);
      col.querySelectorAll('.roster li').forEach((li) => li.classList.toggle('sel', Number(li.dataset.j) === this.pick[i]));
      const key = this.roster[this.pick[i]];
      if (col.dataset.key !== key) {
        col.dataset.key = key;
        this.renderCard(col, key, i);
        this.previews[i] = { cv: $('.preview', col), anim: new SpriteAnimator(this.arts[key]), dir: i === 0 ? 1 : 7 };
      }
      const cpu = i === 1 && this.cpu[1];
      $('.ready-win', col).innerHTML = this.ready[i]
        ? `${cpu ? 'CPU is ready!' : 'Ready!'} <span class="more-arrow"></span>`
        : `Press ${CONTROLS[i].ready} when ready`;
      if (!this.ready[i] && this.game.input?.touchMode) $('.ready-win', col).textContent = 'Tap here when ready';
    });
  }

  renderCard(col, key, i) {
    const d = DB.pokedex[key];
    const st = statsFor(d.baseStats);
    const s = d.baseStats;
    $('.info', col).innerHTML = `
      <div class="row" style="justify-content:flex-start;gap:calc(5*var(--u))">
        <span class="frame p${i + 1}"><img src="${this.arts[key].portraits.Normal}" alt=""></span>
        <div>
          <div><span class="yellow">${d.name}</span> <span class="dim">No.${String(d.dex).padStart(3, '0')}</span></div>
          <div>${d.types.map(typeText).join(' ')}</div>
          <div><span class="cyan">Ability</span> ${d.abilities.map(esc).join(' / ')}</div>
        </div>
      </div>
      <div class="stats">
        <span><span class="cyan">HP</span>${s.hp}</span><span><span class="cyan">Atk</span>${s.atk}</span><span><span class="cyan">Def</span>${s.def}</span>
        <span><span class="cyan">SpA</span>${s.spa}</span><span><span class="cyan">SpD</span>${s.spd}</span><span><span class="cyan">Spe</span>${s.spe}</span>
      </div>
`;
    $('.info', col).title = `Lv.50 · arena HP ${st.hp * HP_SCALE} · base stat total ${d.bst}`;
    $('.moves', col).innerHTML = d.moves
      .map((id) => {
        const m = DB.moves[id];
        const fx = MOVEFX.moves[id];
        const aimed = fx.aim === 'facing';
        const tip = `${m.name} · ${m.type} ${m.category} · Power ${m.power} · ${BEHAVIOR_LABEL[fx.behavior]}${aimed ? ', fired where you face' : ', aims itself'}. ${m.shortDesc}`;
        return `<li title="${esc(tip)}"><span class="mv-name">${orb(m.type)}<span class="green">${m.name}</span>${aimed ? ' <span class="cyan">→</span>' : ''}</span><span>${m.category === 'Physical' ? 'Phys' : 'Spec'} ${m.power}</span><span><span class="cyan">PP</span>${String(m.pp).padStart(3, ' ')} <span class="dim">${m.cooldown}s</span></span></li>`;
      })
      .join('');
  }

  tickPreviews(dt) {
    for (const p of this.previews) {
      if (!p) continue;
      p.anim.update(dt);
      const ctx = p.cv.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, p.cv.width, p.cv.height);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(40, 52, 12, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      p.anim.draw(ctx, 40, 46, p.dir);
    }
  }

  // ---------- HUD ----------
  buildHUD(fighters) {
    const hud = $('#hud');
    hud.innerHTML =
      fighters
        .map((f, i) => `
      <div class="win p${i + 1} hud-p p${i + 1}">
        <span class="frame p${i + 1}"><img class="hud-portrait" src="${f.art.portraits.Normal}" alt=""></span>
        <div class="hud-main">
          <div class="hud-name"><span class="c-p${i + 1}">${f.data.name}</span> <span class="dim">Lv.50</span></div>
          <div class="hp-line"><span class="cyan">HP</span><span class="hp-text"></span><span class="hp-bar"><i></i></span></div>
          <div class="cds">
            ${f.data.moves.map((id) => `<div class="cd" title="${DB.moves[id].name}">${orb(DB.moves[id].type)}<b><i></i></b></div>`).join('')}
            <div class="cd dodge" title="Dodge"><span class="dodge-ico">${i === 0 ? '↗' : '↖'}</span><b><i></i></b></div>
          </div>
        </div>
      </div>`)
        .join('') + '<button class="win menu-btn" type="button" aria-label="Menu">Menu</button>';
    // ↗/↖ aren't in the PMD font; use plain arrows that are.
    hud.querySelectorAll('.dodge-ico').forEach((el, i) => (el.textContent = i === 0 ? '→' : '←'));
    $('.menu-btn', hud).addEventListener('click', () => this.game.togglePause());
    this.hudEls = fighters.map((f, i) => {
      const el = $(`.hud-p.p${i + 1}`, hud);
      return {
        portrait: $('.hud-portrait', el),
        hp: $('.hp-bar i', el),
        hpText: $('.hp-text', el),
        cds: [...el.querySelectorAll('.cd')],
        emotion: 'Normal',
        lastHp: -1,
      };
    });
    this.clearLog();
  }

  updateHUD(fighters) {
    if (!this.hudEls) return;
    fighters.forEach((f, i) => {
      const h = this.hudEls[i];
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
      if (h.paused !== !f.still) {
        h.paused = !f.still;
        h.cds[0].parentElement.classList.toggle('paused', h.paused);
      }
      const foe = fighters[1 - i];
      f.data.moves.forEach((id, j) => {
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
    });
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
    const r = $('#result');
    r.innerHTML = `<div class="win solid dialog">
      <div class="result-top"><span class="frame"><img class="win-portrait" alt=""></span><div><h2 class="win-title"></h2><div class="win-sub"></div></div></div>
      <table class="win-stats"></table>
      <ul class="menu"></ul></div>`;
    this.resultMenu = new Menu($('.menu', r), [
      { label: 'Rematch', act: () => this.game.rematch() },
      { label: 'Change Pokémon', act: () => this.game.toSelect() },
    ]);
  }

  showResult(winner, fighters, stats) {
    const r = $('#result');
    $('.win-portrait', r).src = winner.art.portraits.Joyous || winner.art.portraits.Happy || winner.art.portraits.Normal;
    $('.frame', r).className = `frame p${winner.slot + 1}`;
    $('.win-title', r).textContent = `Player ${winner.slot + 1} wins!`;
    $('.win-sub', r).innerHTML = `<span class="c-p${winner.slot + 1}">${winner.data.name}</span> has ${Math.ceil(winner.hp)} HP left.`;
    $('.win-stats', r).innerHTML =
      `<tr><th></th>${fighters.map((f) => `<th>P${f.slot + 1} ${f.data.name}</th>`).join('')}</tr>` +
      [
        ['Damage dealt', (s) => s.damage],
        ['Moves used', (s) => s.casts],
        ['Hits landed', (s) => s.hits],
        ['Dodges', (s) => s.dodges],
        ['Super effective', (s) => s.supers],
      ]
        .map(([label, fn]) => `<tr><td>${label}</td>${stats.map((s) => `<td>${fn(s)}</td>`).join('')}</tr>`)
        .join('');
    this.resultMenu.set(0);
    r.classList.add('show');
  }

  hideResult() {
    $('#result').classList.remove('show');
  }

  buildPause() {
    const p = $('#pause');
    p.innerHTML = `<div class="win solid dialog"><h2>Menu</h2><ul class="menu"></ul></div>`;
    this.pauseMenu = new Menu($('.menu', p), [
      { label: 'Resume', act: () => this.game.togglePause() },
      { label: 'Change Pokémon', act: () => this.game.toSelect() },
      { label: 'Credits', act: () => this.showCredits() },
    ]);
  }

  showCredits() {
    $('#credits').classList.add('show');
  }

  hideCredits() {
    $('#credits').classList.remove('show');
  }

  /** Keyboard for whichever menu window is on top. Returns true if the key was used. */
  menuKey(code) {
    if ($('#credits').classList.contains('show')) return this.creditsMenu.key(code);
    if (this.game.state === 'paused') {
      if (KEYS.back.includes(code)) return this.game.togglePause(), true;
      return this.pauseMenu.key(code);
    }
    if (this.game.state === 'result') {
      if (KEYS.back.includes(code)) return this.game.toSelect(), true;
      return this.resultMenu.key(code);
    }
    return false;
  }
}
