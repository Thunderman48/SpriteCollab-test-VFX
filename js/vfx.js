// Visual effects: animated particle sheets, beams, warning circles and floating text.
import { angleToDir } from './sprite.js';

/** Registry of loaded particle sheets / beams, filled by main.js. */
export const FX = { particles: {}, beams: {} };

/**
 * One playing particle animation.
 * def: { fx, fps, scale, loop, alpha, blend, rotate, rotOffset, dirRows, spin }
 */
export class Effect {
  constructor(def, x, y, opts = {}) {
    this.def = def;
    this.sheet = FX.particles[def.fx];
    this.x = x;
    this.y = y;
    this.vx = opts.vx || 0;
    this.vy = opts.vy || 0;
    this.follow = opts.follow || null; // entity with x,y
    this.ox = opts.ox || 0;
    this.oy = opts.oy || 0;
    this.layer = opts.layer || def.layer || 'over';
    this.scale = (opts.scale ?? 1) * (def.scale ?? 1);
    this.angle = opts.angle ?? 0;
    this.rot = 0;
    this.fps = def.fps || 20;
    this.loop = opts.loop ?? def.loop ?? false;
    this.life = opts.life ?? Infinity;
    this.alpha = opts.alpha ?? def.alpha ?? 1;
    this.fadeOut = opts.fadeOut || 0;
    this.blend = def.blend || opts.blend || null;
    this.flipX = !!opts.flipX;
    this.t = 0;
    this.dead = !this.sheet;
    if (!this.sheet) console.warn('Missing particle', def.fx);
  }

  get frameCount() {
    return this.sheet.frames;
  }

  update(dt) {
    this.t += dt;
    if (this.follow) {
      this.x = this.follow.x + this.ox;
      this.y = this.follow.y + this.oy;
    } else {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }
    if (this.def.spin) this.rot += this.def.spin * dt;
    if (this.t >= this.life) this.dead = true;
    if (!this.loop && this.t * this.fps >= this.sheet.frames) this.dead = true;
  }

  draw(ctx) {
    const s = this.sheet;
    let frame = Math.floor(this.t * this.fps);
    frame = this.loop ? frame % s.frames : Math.min(frame, s.frames - 1);
    let row = 0;
    let mirror = this.flipX;
    if (s.rows > 1 && this.def.dirRows !== false) {
      const dir = angleToDir(this.angle);
      if (s.rows >= 8) row = dir;
      else if (s.rows === 5) {
        // Dir5 sheets store Down..Up; the left-facing ones are mirrors.
        if (dir <= 4) row = dir;
        else {
          row = 8 - dir;
          mirror = !mirror;
        }
      }
    }
    let a = this.alpha;
    if (this.fadeOut && this.life !== Infinity) a *= Math.min(1, (this.life - this.t) / this.fadeOut);
    ctx.save();
    ctx.globalAlpha *= Math.max(0, a);
    if (this.blend) ctx.globalCompositeOperation = this.blend;
    ctx.translate(Math.round(this.x), Math.round(this.y));
    let r = this.rot;
    if (this.def.rotate) r += this.angle + ((this.def.rotOffset || 0) * Math.PI) / 180;
    if (r) ctx.rotate(r);
    if (mirror) ctx.scale(-1, 1);
    const w = s.fw * this.scale;
    const h = s.fh * this.scale;
    // anchor "bottom": the sheet's bottom edge sits on the effect's point (rising effects).
    const top = this.def.anchor === 'bottom' ? -h + (this.def.anchorPad || 0) * this.scale : -h / 2;
    ctx.drawImage(s.img, frame * s.fw, row * s.fh, s.fw, s.fh, -w / 2, top, w, h);
    ctx.restore();
  }
}

/**
 * Beam made of Tail (at the caster), stretched Body, and Head (far end).
 * RawAsset beam strips point down (+y), so we rotate by angle - 90deg.
 */
export class Beam {
  constructor(def, x, y, angle, opts = {}) {
    this.def = def;
    this.beam = FX.beams[def.set];
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.length = def.length;
    this.time = def.time;
    this.t = 0;
    this.layer = 'over';
    this.follow = opts.follow || null;
    this.ox = opts.ox || 0;
    this.oy = opts.oy || 0;
    this.dead = !this.beam;
  }

  update(dt) {
    this.t += dt;
    if (this.follow) {
      this.x = this.follow.x + this.ox;
      this.y = this.follow.y + this.oy;
    }
    if (this.t >= this.time) this.dead = true;
  }

  /** Current half-width in arena px, used for hit tests too. */
  get halfWidth() {
    const b = this.beam;
    return (b.body.fw * this.widthScale) / 2;
  }

  get widthScale() {
    const d = this.def;
    if (d.frameDriven) return d.width;
    const g = d.growTime || 0.1;
    const k = Math.min(1, this.t / g, (this.time - this.t) / g);
    return d.width * Math.max(0, k);
  }

  draw(ctx) {
    const b = this.beam;
    const d = this.def;
    const frame = d.frameDriven
      ? Math.min(b.frames - 1, Math.floor((this.t / this.time) * b.frames))
      : Math.floor(this.t * (d.fps || 20)) % b.frames;
    const ws = d.frameDriven ? d.width : this.widthScale;
    if (ws <= 0) return;
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y));
    ctx.rotate(this.angle - Math.PI / 2);
    const { head, body, tail } = b;
    const L = this.length;
    const bw = body.fw * ws;
    ctx.drawImage(body.img, frame * body.fw, 0, body.fw, body.fh, -bw / 2, 0, bw, L);
    if (tail.fw > 2) {
      const tw = tail.fw * ws;
      const th = tail.fh * ws;
      ctx.drawImage(tail.img, frame * tail.fw, 0, tail.fw, tail.fh, -tw / 2, -th / 2, tw, th);
    }
    const hw = head.fw * ws;
    const hh = head.fh * Math.max(0.6, ws);
    ctx.drawImage(head.img, frame * head.fw, 0, head.fw, head.fh, -hw / 2, L - 1, hw, hh);
    ctx.restore();
  }
}

/** Ground warning circle for area attacks. */
export class Telegraph {
  constructor(x, y, radius, time, color = '255,70,70') {
    Object.assign(this, { x, y, radius, time, color, t: 0, layer: 'ground', dead: false });
  }
  update(dt) {
    this.t += dt;
    if (this.t >= this.time) this.dead = true;
  }
  draw(ctx) {
    const k = Math.min(1, this.t / this.time);
    const pulse = 0.55 + 0.45 * Math.sin(this.t * 22);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(1, 0.6);
    ctx.fillStyle = `rgba(${this.color},${0.12 + 0.18 * k})`;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = `rgba(${this.color},${0.5 + 0.4 * pulse})`;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

export class FloatText {
  constructor(text, x, y, color = '#fff', size = 12) {
    Object.assign(this, { text, x, y, color, size, t: 0, time: 0.9, layer: 'text', dead: false });
  }
  update(dt) {
    this.t += dt;
    this.y -= 28 * dt;
    if (this.t >= this.time) this.dead = true;
  }
  draw(ctx) {
    const a = Math.min(1, (this.time - this.t) / 0.3);
    const pop = this.t < 0.08 ? 1.4 - this.t * 5 : 1;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = `bold ${Math.round(this.size * pop)}px "Press Start 2P", monospace`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(this.text, this.x, this.y);
    ctx.fillStyle = this.color;
    ctx.fillText(this.text, this.x, this.y);
    ctx.restore();
  }
}
