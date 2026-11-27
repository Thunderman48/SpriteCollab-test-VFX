// Tiny WebAudio synth for hit/dodge/boom blips (no audio files needed). Press M to mute.
let ctx = null;
let unlocked = false;
let muted = false;
try {
  muted = localStorage.getItem('arena-muted') === '1';
} catch {
  /* storage unavailable */
}

function ac() {
  if (!unlocked) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
const unlock = () => {
  unlocked = true;
  ac();
};
addEventListener('pointerdown', unlock, { once: true });
addEventListener('keydown', unlock, { once: true });

function tone({ f0, f1 = f0, time = 0.1, type = 'square', vol = 0.06, noise = false }) {
  const a = ac();
  if (!a || muted) return;
  const t = a.currentTime;
  const g = a.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + time);
  g.connect(a.destination);
  if (noise) {
    const buf = a.createBuffer(1, Math.ceil(a.sampleRate * time), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource();
    src.buffer = buf;
    const filt = a.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(f0, t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + time);
    src.connect(filt).connect(g);
    src.start(t);
    src.stop(t + time);
    return;
  }
  const o = a.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + time);
  o.connect(g);
  o.start(t);
  o.stop(t + time);
}

const SOUNDS = {
  hit: () => tone({ f0: 2400, f1: 300, time: 0.09, noise: true, vol: 0.12 }),
  hitBig: () => { tone({ f0: 3000, f1: 200, time: 0.18, noise: true, vol: 0.16 }); tone({ f0: 220, f1: 80, time: 0.15, vol: 0.06 }); },
  dodge: () => tone({ f0: 500, f1: 1400, time: 0.08, type: 'triangle', vol: 0.05 }),
  shoot: () => tone({ f0: 900, f1: 400, time: 0.08, type: 'square', vol: 0.025 }),
  beam: () => tone({ f0: 1800, f1: 200, time: 0.6, noise: true, vol: 0.1 }),
  melee: () => tone({ f0: 1200, f1: 200, time: 0.06, noise: true, vol: 0.06 }),
  dash: () => tone({ f0: 600, f1: 2000, time: 0.25, noise: true, vol: 0.07 }),
  charge: () => tone({ f0: 200, f1: 900, time: 0.35, type: 'sawtooth', vol: 0.025 }),
  boom: () => tone({ f0: 900, f1: 60, time: 0.35, noise: true, vol: 0.14 }),
  ko: () => { tone({ f0: 600, f1: 60, time: 0.8, type: 'square', vol: 0.06 }); tone({ f0: 1500, f1: 50, time: 0.6, noise: true, vol: 0.12 }); },
  tick: () => tone({ f0: 660, time: 0.08, type: 'square', vol: 0.04 }),
  go: () => tone({ f0: 990, f1: 1320, time: 0.25, type: 'square', vol: 0.05 }),
};

export const Sfx = {
  play(name) {
    SOUNDS[name]?.();
  },
  toggle() {
    muted = !muted;
    try {
      localStorage.setItem('arena-muted', muted ? '1' : '0');
    } catch {
      /* ignore */
    }
    return muted;
  },
  get muted() {
    return muted;
  },
};
