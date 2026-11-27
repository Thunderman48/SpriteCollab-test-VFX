// Input for up to 4 players: keyboard layouts, gamepads (controller N = player N) and
// touch (screen split into halves for 1-2 humans, quarters for 3-4).

export const KEYMAP = [
  { name: 'WASD', up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], dodge: ['Space', 'KeyF'], swap: ['KeyE'], dodgeLabel: 'Space', swapLabel: 'E' },
  { name: '←↑→↓', up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], dodge: ['Enter', 'Slash'], swap: ['ShiftRight', 'Period'], dodgeLabel: 'Enter', swapLabel: 'Right Shift' },
  { name: 'IJKL', up: ['KeyI'], down: ['KeyK'], left: ['KeyJ'], right: ['KeyL'], dodge: ['KeyO'], swap: ['KeyU'], dodgeLabel: 'O', swapLabel: 'U' },
  { name: 'Num 8456', up: ['Numpad8'], down: ['Numpad5', 'Numpad2'], left: ['Numpad4'], right: ['Numpad6'], dodge: ['Numpad0'], swap: ['NumpadDecimal'], dodgeLabel: 'Num 0', swapLabel: 'Num .' },
];

const JOY_RADIUS = 46; // CSS px for full deflection
const DEAD = 0.25;

export class Input {
  constructor(root) {
    this.root = root;
    this.down = new Set();
    this.players = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, _dodge: false, _swap: false, touch: null, pad: null }));
    this.listeners = [];
    this.touchMode = matchMedia('(pointer: coarse)').matches;
    this.humans = [0, 1];
    this.padPrev = {};

    addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.listeners.forEach((fn) => fn(e.code));
      this.down.add(e.code);
      if (e.repeat) return;
      KEYMAP.forEach((m, i) => {
        if (m.dodge.includes(e.code)) this.players[i]._dodge = true;
        if (m.swap.includes(e.code)) this.players[i]._swap = true;
      });
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());

    this.setupTouch(root);
  }

  onKey(fn) {
    this.listeners.push(fn);
  }

  // ---------- touch ----------
  setupTouch(root) {
    this.zone = root.querySelector('.touch-zone');
    this.joyEls = [0, 1, 2, 3].map((i) => {
      const base = document.createElement('div');
      base.className = `joy joy-p${i + 1}`;
      base.innerHTML = '<div class="knob"></div>';
      root.appendChild(base);
      return base;
    });
    const mkBtn = (i, kind) => {
      const b = document.createElement('button');
      b.className = `touch-btn ${kind}-btn`;
      // Round button: pixel icon + small label (icons from tools/build-ui.py).
      b.innerHTML = `<img class="tb-ico" src="assets/ui/${kind === 'dodge' ? 'icon-dash' : 'icon-switch-blue'}.png" alt=""><span class="tb-label">${kind === 'dodge' ? 'Dodge' : 'Switch'}</span>`;
      b.setAttribute('aria-label', `Player ${i + 1} ${kind}`);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.players[i][kind === 'dodge' ? '_dodge' : '_swap'] = true;
        b.classList.add('pressed');
        setTimeout(() => b.classList.remove('pressed'), 120);
      });
      root.appendChild(b);
      return b;
    };
    this.btns = [0, 1, 2, 3].map((i) => ({ dodge: mkBtn(i, 'dodge'), swap: mkBtn(i, 'swap') }));

    const lastTap = [0, 0, 0, 0];
    this.zone.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      this.touchMode = true;
      document.body.classList.add('touch');
      const i = this.slotAt(e.clientX, e.clientY);
      if (i == null) return;
      const p = this.players[i];
      if (p.touch) return;
      const now = performance.now();
      if (now - lastTap[i] < 280) p._dodge = true; // double-tap = dodge
      lastTap[i] = now;
      p.touch = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
      this.zone.setPointerCapture?.(e.pointerId);
      this.showJoy(i, e.clientX, e.clientY, 0, 0);
      e.preventDefault();
    });
    this.zone.addEventListener('pointermove', (e) => {
      for (let i = 0; i < 4; i++) {
        const p = this.players[i];
        if (!p.touch || p.touch.id !== e.pointerId) continue;
        let dx = e.clientX - p.touch.ox;
        let dy = e.clientY - p.touch.oy;
        const len = Math.hypot(dx, dy);
        if (len > JOY_RADIUS) {
          // Floating joystick: drag the base along so direction changes stay responsive.
          p.touch.ox += (dx / len) * (len - JOY_RADIUS);
          p.touch.oy += (dy / len) * (len - JOY_RADIUS);
          dx = e.clientX - p.touch.ox;
          dy = e.clientY - p.touch.oy;
        }
        p.x = dx / JOY_RADIUS;
        p.y = dy / JOY_RADIUS;
        this.showJoy(i, p.touch.ox, p.touch.oy, dx, dy);
      }
      e.preventDefault();
    });
    const end = (e) => {
      for (let i = 0; i < 4; i++) {
        const p = this.players[i];
        if (p.touch && p.touch.id === e.pointerId) {
          p.touch = null;
          p.x = 0;
          p.y = 0;
          this.joyEls[i].classList.remove('active');
        }
      }
    };
    this.zone.addEventListener('pointerup', end);
    this.zone.addEventListener('pointercancel', end);
  }

  /**
   * Which human player owns a screen point: halves for 1-2 humans,
   * quarters for 3-4 (order: bottom-left, bottom-right, top-left, top-right).
   */
  slotAt(x, y) {
    const h = this.humans;
    const left = x < innerWidth / 2;
    if (h.length <= 2) return left ? h[0] : h[1] ?? null;
    const top = y < innerHeight / 2;
    return h[(top ? 2 : 0) + (left ? 0 : 1)] ?? null;
  }

  setLabels(dodge, swap) {
    this.btns.forEach((b) => {
      b.dodge.lastChild.textContent = dodge;
      b.swap.lastChild.textContent = swap;
    });
  }

  /** Called when a battle starts: which slots are humans, and whether Switch is used. */
  setHumans(slots, teams, canSwitch) {
    this.humans = slots;
    const quad = slots.length > 2;
    document.body.dataset.touchLayout = quad ? 'quad' : 'half';
    this.btns.forEach((b, i) => {
      const k = slots.indexOf(i);
      const on = k >= 0;
      const pos = quad ? ['bl', 'br', 'tl', 'tr'][k] : ['l', 'r'][k];
      for (const [kind, el] of Object.entries(b)) {
        el.hidden = !on || (kind === 'swap' && !canSwitch);
        el.dataset.pos = pos || '';
        el.classList.toggle('t0', teams[i] === 0);
        el.classList.toggle('t1', teams[i] === 1);
        if (kind === 'swap') el.firstChild.src = `assets/ui/icon-switch-${teams[i] === 1 ? 'pink' : 'blue'}.png`;
      }
    });
  }

  showJoy(i, x, y, dx, dy) {
    const el = this.joyEls[i];
    el.classList.add('active');
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.firstChild.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  // ---------- gamepads ----------
  /** Poll controllers every frame: menu keys for the UI, and movement/buttons for fights. */
  pollPads() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < 4; i++) {
      const gp = pads[i];
      const p = this.players[i];
      if (!gp) {
        p.pad = null;
        continue;
      }
      const btn = (n) => !!gp.buttons[n]?.pressed;
      let x = gp.axes[0] || 0;
      let y = gp.axes[1] || 0;
      if (Math.hypot(x, y) < DEAD) x = y = 0;
      if (btn(14)) x = -1;
      if (btn(15)) x = 1;
      if (btn(12)) y = -1;
      if (btn(13)) y = 1;
      p.pad = { x, y };
      const prev = this.padPrev[i] || {};
      const now = { a: btn(0), b: btn(1), x: btn(2), y: btn(3), lb: btn(4), rb: btn(5), start: btn(9), up: y < -0.6, down: y > 0.6, left: x < -0.6, right: x > 0.6 };
      const edge = (k) => now[k] && !prev[k];
      if (edge('a') || edge('rb')) p._dodge = true;
      if (edge('y') || edge('lb') || edge('x')) p._swap = true;
      // Menu navigation with any controller.
      const emit = (code) => this.listeners.forEach((fn) => fn(code));
      if (edge('up')) emit('ArrowUp');
      if (edge('down')) emit('ArrowDown');
      if (edge('left')) emit('ArrowLeft');
      if (edge('right')) emit('ArrowRight');
      if (edge('a')) emit('PadConfirm');
      if (edge('b')) emit('Escape');
      if (edge('start')) emit('KeyP');
      this.padPrev[i] = now;
    }
  }

  /** Snapshot of player i's controls for this frame. */
  read(i) {
    const p = this.players[i];
    const m = KEYMAP[i];
    let x = 0;
    let y = 0;
    if (p.touch) {
      x = p.x;
      y = p.y;
    } else {
      const k = (codes) => codes.some((c) => this.down.has(c));
      x = (k(m.right) ? 1 : 0) - (k(m.left) ? 1 : 0);
      y = (k(m.down) ? 1 : 0) - (k(m.up) ? 1 : 0);
      if (x && y) {
        x *= Math.SQRT1_2;
        y *= Math.SQRT1_2;
      }
      if (!x && !y && p.pad) {
        x = p.pad.x;
        y = p.pad.y;
      }
    }
    const out = { x, y, dodgePressed: p._dodge, switchPressed: p._swap };
    p._dodge = false;
    p._swap = false;
    return out;
  }

  clearPresses() {
    this.players.forEach((p) => {
      p._dodge = false;
      p._swap = false;
    });
  }
}
