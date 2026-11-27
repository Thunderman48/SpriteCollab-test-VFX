// Keyboard (P1: WASD + Space/LeftShift, P2: arrows + Enter/RightShift/Slash/Numpad0)
// and touch (left-half joystick = P1, right-half joystick = P2, dodge buttons / double-tap).

const KEYMAP = [
  { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], dodge: ['Space', 'ShiftLeft', 'KeyF'] },
  { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], dodge: ['Enter', 'NumpadEnter', 'ShiftRight', 'Slash', 'Numpad0', 'Period'] },
];

const JOY_RADIUS = 46; // CSS px for full deflection

export class Input {
  constructor(root) {
    this.down = new Set();
    this.pressedQueue = [];
    this.players = [0, 1].map(() => ({ x: 0, y: 0, dodgePressed: false, _dodge: false, touch: null }));
    this.listeners = [];
    this.touchMode = matchMedia('(pointer: coarse)').matches;

    addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.listeners.forEach((fn) => fn(e.code));
      this.down.add(e.code);
      KEYMAP.forEach((m, i) => {
        if (m.dodge.includes(e.code) && !e.repeat) this.players[i]._dodge = true;
      });
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());

    this.setupTouch(root);
  }

  onKey(fn) {
    this.listeners.push(fn);
  }

  setupTouch(root) {
    this.joyEls = [0, 1].map((i) => {
      const base = document.createElement('div');
      base.className = `joy joy-p${i + 1}`;
      base.innerHTML = '<div class="knob"></div>';
      root.appendChild(base);
      return base;
    });
    this.dodgeBtns = [0, 1].map((i) => {
      const b = document.createElement('button');
      b.className = `dodge-btn dodge-p${i + 1}`;
      b.textContent = 'DODGE';
      b.setAttribute('aria-label', `Player ${i + 1} dodge`);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.players[i]._dodge = true;
        b.classList.add('pressed');
        setTimeout(() => b.classList.remove('pressed'), 120);
      });
      root.appendChild(b);
      return b;
    });

    const zone = root.querySelector('.touch-zone');
    const lastTap = [0, 0];
    zone.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      this.touchMode = true;
      document.body.classList.add('touch');
      const rect = zone.getBoundingClientRect();
      const i = e.clientX < rect.left + rect.width / 2 ? 0 : 1;
      const p = this.players[i];
      if (p.touch) return;
      const now = performance.now();
      if (now - lastTap[i] < 280) p._dodge = true; // double-tap = dodge
      lastTap[i] = now;
      p.touch = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
      zone.setPointerCapture?.(e.pointerId);
      this.showJoy(i, e.clientX, e.clientY, 0, 0);
      e.preventDefault();
    });
    zone.addEventListener('pointermove', (e) => {
      for (let i = 0; i < 2; i++) {
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
      for (let i = 0; i < 2; i++) {
        const p = this.players[i];
        if (p.touch && p.touch.id === e.pointerId) {
          p.touch = null;
          p.x = 0;
          p.y = 0;
          this.joyEls[i].classList.remove('active');
        }
      }
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  showJoy(i, x, y, dx, dy) {
    const el = this.joyEls[i];
    el.classList.add('active');
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.firstChild.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  /** Snapshot for this frame. */
  read(i) {
    const p = this.players[i];
    const m = KEYMAP[i];
    let x = p.x;
    let y = p.y;
    if (!p.touch) {
      const k = (codes) => codes.some((c) => this.down.has(c));
      x = (k(m.right) ? 1 : 0) - (k(m.left) ? 1 : 0);
      y = (k(m.down) ? 1 : 0) - (k(m.up) ? 1 : 0);
      if (x && y) {
        x *= Math.SQRT1_2;
        y *= Math.SQRT1_2;
      }
    }
    const dodgePressed = p._dodge;
    p._dodge = false;
    return { x, y, dodgePressed };
  }

  clearPresses() {
    this.players.forEach((p) => (p._dodge = false));
  }
}
