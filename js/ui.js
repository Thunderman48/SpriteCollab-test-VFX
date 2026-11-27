// DOM screens: character select (with database card), HUD, result, pause, credits.
import { DB, TYPE_COLORS, statsFor, HP_SCALE, effectiveness } from './combat.js';
import { SpriteAnimator } from './sprite.js';
import { MOVEFX } from './moves.js';
import { DODGE_COOLDOWN } from './fighter.js';

const $ = (sel, el = document) => el.querySelector(sel);
const STAT_LABELS = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };
const BEHAVIOR_LABEL = {
  projectile: 'Projectile',
  beam: 'Beam',
  melee: 'Melee',
  dash: 'Dash',
  targetArea: 'Area (aimed)',
  burst: 'Burst (around self)',
};
const CONTROLS = [
  { keys: 'W A S D', dodge: 'Space', pick: 'A / D', ready: 'Space' },
  { keys: '↑ ← ↓ →', dodge: 'Enter', pick: '← / →', ready: 'Enter' },
];

export function typeBadge(t) {
  return `<span class="type" style="--tc:${TYPE_COLORS[t] || '#888'}">${t}</span>`;
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
    this.buildSelect();
    this.buildResult();
    this.buildPause();
  }

  // ---------- Character select ----------
  buildSelect() {
    const root = $('#select');
    root.innerHTML = `
      <header class="select-head">
        <h1>SpriteCollab <span>VFX Arena</span></h1>
        <p class="sub">Move &amp; dodge only. Attacks fire on their own: <b>high PP = fast</b>, <b>low PP = slow but strong</b>.</p>
      </header>
      <div class="select-cols">
        ${[0, 1].map((i) => `
          <section class="pcol p${i + 1}" data-p="${i}">
            <div class="pcol-head">
              <h2>Player ${i + 1}</h2>
              <span class="keys kb-only">${CONTROLS[i].keys} move · <kbd>${CONTROLS[i].dodge}</kbd> dodge</span>
              ${i === 1 ? '<button class="cpu-toggle" type="button">P2: Human</button>' : ''}
            </div>
            <div class="roster" role="listbox" aria-label="Player ${i + 1} Pokémon">
              ${this.roster.map((k, j) => `<button class="mon" type="button" role="option" data-j="${j}" title="${DB.pokedex[k].name}"><img src="${this.arts[k].portraits.Normal}" alt="${DB.pokedex[k].name}"></button>`).join('')}
            </div>
            <div class="card"></div>
            <button class="ready-btn" type="button">Ready <span class="kb-only">(${CONTROLS[i].ready})</span></button>
          </section>`).join('')}
      </div>
      <footer class="select-foot">
        <button class="link-btn credits-btn" type="button">Credits &amp; data sources</button>
      </footer>`;
    root.querySelectorAll('.pcol').forEach((col) => {
      const i = Number(col.dataset.p);
      col.querySelectorAll('.mon').forEach((b) =>
        b.addEventListener('click', () => {
          this.pick[i] = Number(b.dataset.j);
          this.ready[i] = false;
          this.renderSelect();
        }),
      );
      $('.ready-btn', col).addEventListener('click', () => this.toggleReady(i));
    });
    $('.cpu-toggle', root).addEventListener('click', (e) => {
      this.cpu[1] = !this.cpu[1];
      e.currentTarget.textContent = `P2: ${this.cpu[1] ? 'CPU' : 'Human'}`;
      if (this.cpu[1]) this.ready[1] = true;
      this.renderSelect();
      this.checkStart();
    });
    $('.credits-btn', root).addEventListener('click', () => this.showCredits());
    this.renderSelect();
  }

  toggleReady(i) {
    this.ready[i] = !this.ready[i];
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
      { prev: ['KeyA', 'KeyW'], next: ['KeyD', 'KeyS'], ready: ['Space', 'KeyF', 'ShiftLeft'] },
      { prev: ['ArrowLeft', 'ArrowUp'], next: ['ArrowRight', 'ArrowDown'], ready: ['Enter', 'NumpadEnter', 'ShiftRight'] },
    ];
    nav.forEach((n, i) => {
      if (i === 1 && this.cpu[1]) return;
      const n5 = this.roster.length;
      if (n.prev.includes(code) && !this.ready[i]) this.pick[i] = (this.pick[i] + n5 - 1) % n5;
      else if (n.next.includes(code) && !this.ready[i]) this.pick[i] = (this.pick[i] + 1) % n5;
      else if (n.ready.includes(code)) return this.toggleReady(i);
      else return;
      this.renderSelect();
    });
    return true;
  }

  renderSelect() {
    const root = $('#select');
    root.querySelectorAll('.pcol').forEach((col) => {
      const i = Number(col.dataset.p);
      col.classList.toggle('is-ready', this.ready[i]);
      col.querySelectorAll('.mon').forEach((b) => b.classList.toggle('sel', Number(b.dataset.j) === this.pick[i]));
      const key = this.roster[this.pick[i]];
      const card = $('.card', col);
      if (card.dataset.key !== key) {
        card.dataset.key = key;
        card.innerHTML = this.cardHTML(key);
        const cv = $('canvas', card);
        this.previews[i] = { cv, anim: new SpriteAnimator(this.arts[key]), dir: i === 0 ? 1 : 7 };
      }
      $('.ready-btn', col).classList.toggle('on', this.ready[i]);
      $('.ready-btn', col).firstChild.textContent = this.ready[i] ? (i === 1 && this.cpu[1] ? 'CPU ' : 'Ready! ') : 'Ready ';
    });
  }

  cardHTML(key) {
    const d = DB.pokedex[key];
    const st = statsFor(d.baseStats);
    const stats = Object.entries(d.baseStats)
      .map(([k, v]) => `<div class="stat"><span>${STAT_LABELS[k]}</span><b>${v}</b><i style="--w:${Math.min(100, (v / 180) * 100)}%;--c:${v >= 120 ? '#4ade80' : v >= 90 ? '#facc15' : '#fb923c'}"></i></div>`)
      .join('');
    const moves = d.moves
      .map((id) => {
        const m = DB.moves[id];
        const fx = MOVEFX.moves[id];
        return `<li style="--tc:${TYPE_COLORS[m.type]}">
          <div class="mv-top"><b>${m.name}</b>${typeBadge(m.type)}</div>
          <div class="mv-meta"><span>${m.category === 'Physical' ? 'Phys' : 'Spec'} ${m.power}</span><span>PP ${m.pp}</span><span>every ${m.cooldown}s</span><span>${BEHAVIOR_LABEL[fx.behavior]}</span></div>
          <div class="mv-desc">${m.shortDesc}</div>
        </li>`;
      })
      .join('');
    return `
      <div class="card-top">
        <canvas class="preview" width="160" height="128"></canvas>
        <div class="card-id">
          <div class="dexno">#${String(d.dex).padStart(4, '0')}</div>
          <h3>${d.name}</h3>
          <div class="types">${d.types.map(typeBadge).join('')}</div>
          <div class="facts">Ability: ${d.abilities.join(' / ')}<br>${d.weightkg} kg · Lv 50 · Arena HP ${st.hp * HP_SCALE}</div>
        </div>
      </div>
      <div class="stats">${stats}<div class="bst">Total <b>${d.bst}</b></div></div>
      <ul class="moves">${moves}</ul>`;
  }

  tickPreviews(dt) {
    for (const p of this.previews) {
      if (!p) continue;
      p.anim.update(dt);
      const ctx = p.cv.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, p.cv.width, p.cv.height);
      // Pick the scale from the Idle frame size so the preview doesn't jump around.
      const idle = p.anim.art.animData.anims.Idle;
      const s = idle.fh * 2 <= 128 && idle.fw * 2 <= 160 ? 2 : 1;
      const cy = s === 2 ? 60 : 66;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(80, cy + 8 * s, 12 * s, 4 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      p.anim.draw(ctx, 80, cy, p.dir, { scale: s });
    }
  }

  // ---------- HUD ----------
  buildHUD(fighters) {
    const hud = $('#hud');
    hud.innerHTML = fighters
      .map((f, i) => `
      <div class="hud-p p${i + 1}">
        <img class="hud-portrait" src="${f.art.portraits.Normal}" alt="">
        <div class="hud-main">
          <div class="hud-name">P${i + 1} ${f.data.name} ${f.data.types.map(typeBadge).join('')}</div>
          <div class="hp"><i></i><span></span></div>
          <div class="cds">
            ${f.data.moves.map((id) => `<div class="cd" style="--tc:${TYPE_COLORS[DB.moves[id].type]}" title="${DB.moves[id].name}"><i></i><span>${DB.moves[id].name}</span></div>`).join('')}
            <div class="cd dodge" title="Dodge"><i></i><span>Dodge</span></div>
          </div>
        </div>
      </div>`)
      .join('') + '<button class="pause-btn" type="button" aria-label="Pause">II</button>';
    $('.pause-btn', hud).addEventListener('click', () => this.game.togglePause());
    this.hudEls = fighters.map((f, i) => {
      const el = $(`.hud-p.p${i + 1}`, hud);
      return {
        el,
        portrait: $('.hud-portrait', el),
        hp: $('.hp i', el),
        hpText: $('.hp span', el),
        cds: [...el.querySelectorAll('.cd')],
        emotion: 'Normal',
      };
    });
  }

  updateHUD(fighters) {
    if (!this.hudEls) return;
    fighters.forEach((f, i) => {
      const h = this.hudEls[i];
      const k = f.hp / f.maxHp;
      h.hp.style.width = `${k * 100}%`;
      h.hp.style.background = k > 0.5 ? '#4ade80' : k > 0.2 ? '#facc15' : '#ef4444';
      h.hpText.textContent = `${Math.ceil(f.hp)} / ${f.maxHp}`;
      const emo = f.ko ? 'Pain' : f.emotion !== 'Normal' ? f.emotion : k < 0.25 ? 'Determined' : 'Normal';
      if (emo !== h.emotion && f.art.portraits[emo]) {
        h.emotion = emo;
        h.portrait.src = f.art.portraits[emo];
      }
      const foe = fighters[1 - i];
      f.data.moves.forEach((id, j) => {
        const cd = DB.moves[id].cooldown;
        const eff = foe ? effectiveness(DB.moves[id].type, foe.data.types) : 1;
        h.cds[j].classList.toggle('immune', eff === 0);
        h.cds[j].classList.toggle('super', eff > 1);
        const ready = f.cd[id] <= 0;
        h.cds[j].classList.toggle('ready', ready);
        h.cds[j].classList.toggle('casting', f.cast?.id === id);
        h.cds[j].firstChild.style.height = `${(1 - f.cd[id] / cd) * 100}%`;
      });
      const dc = h.cds[h.cds.length - 1];
      dc.classList.toggle('ready', f.dodgeCd <= 0);
      dc.firstChild.style.height = `${(1 - f.dodgeCd / DODGE_COOLDOWN) * 100}%`;
    });
  }

  // ---------- Result / pause / credits ----------
  buildResult() {
    const r = $('#result');
    r.innerHTML = `<div class="panel">
      <img class="win-portrait" alt="">
      <h2 class="win-title"></h2>
      <table class="win-stats"></table>
      <div class="btns">
        <button class="rematch" type="button">Rematch <span class="kb-only">(Space / Enter)</span></button>
        <button class="change" type="button">Change Pokémon <span class="kb-only">(Esc)</span></button>
      </div></div>`;
    $('.rematch', r).addEventListener('click', () => this.game.rematch());
    $('.change', r).addEventListener('click', () => this.game.toSelect());
  }

  showResult(winner, fighters, stats) {
    const r = $('#result');
    $('.win-portrait', r).src = winner.art.portraits.Joyous || winner.art.portraits.Happy || winner.art.portraits.Normal;
    $('.win-title', r).innerHTML = `Player ${winner.slot + 1} wins!<small>${winner.data.name} · ${Math.ceil(winner.hp)} HP left</small>`;
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
    r.classList.add('show');
  }

  hideResult() {
    $('#result').classList.remove('show');
  }

  buildPause() {
    const p = $('#pause');
    p.innerHTML = `<div class="panel"><h2>Paused</h2><div class="btns">
      <button class="resume" type="button">Resume</button>
      <button class="change" type="button">Change Pokémon</button>
      <button class="credits" type="button">Credits</button></div></div>`;
    $('.resume', p).addEventListener('click', () => this.game.togglePause());
    $('.change', p).addEventListener('click', () => this.game.toSelect());
    $('.credits', p).addEventListener('click', () => this.showCredits());
  }

  showCredits() {
    $('#credits').classList.add('show');
  }
}
