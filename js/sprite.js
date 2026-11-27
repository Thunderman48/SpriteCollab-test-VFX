// Plays SpriteCollab animations: 8 direction rows, per-frame durations in 1/60 s ticks.

// PMD row order: Down, DownRight, Right, UpRight, Up, UpLeft, Left, DownLeft.
export function angleToDir(angle) {
  const deg = (angle * 180) / Math.PI;
  return (((Math.round((90 - deg) / 45) % 8) + 8) % 8);
}
export function dirToAngle(dir) {
  return ((90 - dir * 45) * Math.PI) / 180;
}

const FALLBACKS = {
  Faint: ['Hurt'],
  Hop: ['Walk'],
  Pose: ['Idle'],
  Charge: ['Idle'],
  Walk: ['Idle'],
  Hurt: ['Idle'],
  SpAttack: ['Shoot', 'Attack'],
  Shoot: ['Attack'],
  Strike: ['Attack'],
  QuickStrike: ['Attack'],
  Twirl: ['Attack'],
  Lick: ['Attack'],
  RearUp: ['SpAttack', 'Attack'],
};

let scratch = null;
function scratchCanvas(w, h) {
  if (!scratch) scratch = document.createElement('canvas');
  if (scratch.width < w) scratch.width = w;
  if (scratch.height < h) scratch.height = h;
  return scratch;
}

export class SpriteAnimator {
  constructor(art) {
    this.art = art;
    this.name = null;
    this.anim = null;
    this.frame = 0;
    this.tick = 0;
    this.loop = true;
    this.done = false;
    this.cb = {};
    this.speed = 1;
    this.play('Idle');
  }

  resolve(name) {
    const anims = this.art.animData.anims;
    if (anims[name]) return name;
    for (const alt of FALLBACKS[name] || []) {
      const r = this.resolve(alt);
      if (r) return r;
    }
    return anims.Idle ? 'Idle' : Object.keys(anims)[0];
  }

  has(name) {
    return !!this.art.animData.anims[name];
  }

  /** Total duration of an anim in seconds. */
  duration(name) {
    const a = this.art.animData.anims[this.resolve(name)];
    return a.durations.reduce((s, d) => s + d, 0) / 60;
  }

  play(name, { loop = true, restart = false, speed = 1, onHit, onEnd, onRush, onReturn } = {}) {
    const resolved = this.resolve(name);
    if (!restart && resolved === this.name && loop && this.loop) return;
    this.name = resolved;
    this.anim = this.art.animData.anims[resolved];
    this.frame = 0;
    this.tick = 0;
    this.loop = loop;
    this.done = false;
    this.speed = speed;
    this.cb = { onHit, onEnd, onRush, onReturn };
    this.fired = {};
    this.fireFrameCallbacks();
  }

  fireFrameCallbacks() {
    const a = this.anim;
    const f = this.frame;
    const fire = (key, frame) => {
      if (frame !== undefined && f >= frame && !this.fired[key] && this.cb[key]) {
        this.fired[key] = true;
        this.cb[key]();
      }
    };
    fire('onRush', a.rush);
    fire('onHit', a.hit);
    fire('onReturn', a.ret);
  }

  update(dt) {
    if (this.done) return;
    this.tick += dt * 60 * this.speed;
    const d = this.anim.durations;
    while (this.tick >= d[this.frame]) {
      this.tick -= d[this.frame];
      this.frame++;
      if (this.frame >= d.length) {
        if (this.loop) this.frame = 0;
        else {
          this.frame = d.length - 1;
          this.done = true;
          // Anims without a HitFrame still trigger their hit at the end.
          if (this.cb.onHit && !this.fired.onHit) {
            this.fired.onHit = true;
            this.cb.onHit();
          }
          const end = this.cb.onEnd;
          this.cb.onEnd = null;
          if (end) end();
          return;
        }
      }
      this.fireFrameCallbacks();
    }
  }

  draw(ctx, x, y, dir, { flash = 0, alpha = 1, scale = 1, tint = null, tintAmt = 0 } = {}) {
    const a = this.anim;
    const img = this.art.sheets[a.file];
    if (!img) return;
    const rows = Math.round(img.height / a.fh);
    const row = rows >= 8 ? dir : 0;
    const sx = this.frame * a.fw;
    const sy = row * a.fh;
    const w = a.fw * scale;
    const h = a.fh * scale;
    const dx = Math.round(x - w / 2);
    const dy = Math.round(y - h / 2);
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.drawImage(img, sx, sy, a.fw, a.fh, dx, dy, w, h);
    // White hit flash, or a colour tint (status conditions: frozen, burned...).
    const color = flash > 0 ? '#fff' : tint;
    const amount = flash > 0 ? flash : tintAmt;
    if (color && amount > 0) {
      const c = scratchCanvas(a.fw, a.fh);
      const sctx = c.getContext('2d');
      sctx.clearRect(0, 0, a.fw, a.fh);
      sctx.globalCompositeOperation = 'source-over';
      sctx.drawImage(img, sx, sy, a.fw, a.fh, 0, 0, a.fw, a.fh);
      sctx.globalCompositeOperation = 'source-atop';
      sctx.fillStyle = color;
      sctx.fillRect(0, 0, a.fw, a.fh);
      sctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha *= Math.min(1, amount);
      ctx.drawImage(c, 0, 0, a.fw, a.fh, dx, dy, w, h);
    }
    ctx.restore();
  }
}
