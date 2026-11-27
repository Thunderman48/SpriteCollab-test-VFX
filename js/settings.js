// Player settings (saved in this browser): language, double-tap zoom, sound.
import { I18N } from './i18n.js';

const KEY = 'pokemon-clash-settings';
export const SETTINGS = {
  lang: (navigator.language || '').toLowerCase().startsWith('ko') ? 'ko' : 'en',
  noZoom: true,
};

export function loadSettings() {
  try {
    Object.assign(SETTINGS, JSON.parse(localStorage.getItem(KEY) || '{}'));
  } catch {
    /* storage unavailable: keep defaults */
  }
  applySettings();
}

export function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify(SETTINGS));
  } catch {
    /* ignore */
  }
  applySettings();
}

// iOS Safari ignores user-scalable=no, so also block zoom gestures while the setting is on.
let lastTouchEnd = 0;
const blockers = {
  touchend: (e) => {
    const now = Date.now();
    // A second tap within 300 ms zooms on iOS; cancel it unless it's on a button/link.
    if (now - lastTouchEnd < 300 && !e.target.closest('button, a, .nav, .touch-zone')) e.preventDefault();
    lastTouchEnd = now;
  },
  dblclick: (e) => e.preventDefault(),
  gesturestart: (e) => e.preventDefault(), // pinch zoom (iOS)
  gesturechange: (e) => e.preventDefault(),
};
let blocking = false;
function setZoomBlock(on) {
  if (on === blocking) return;
  blocking = on;
  for (const [ev, fn] of Object.entries(blockers)) {
    if (on) document.addEventListener(ev, fn, { passive: false });
    else document.removeEventListener(ev, fn);
  }
}

export function applySettings() {
  setZoomBlock(SETTINGS.noZoom);
  I18N.lang = SETTINGS.lang;
  document.documentElement.lang = SETTINGS.lang;
  document.documentElement.classList.toggle('no-zoom', SETTINGS.noZoom);
  const vp = document.querySelector('meta[name="viewport"]');
  if (vp) {
    vp.content = SETTINGS.noZoom
      ? 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'
      : 'width=device-width, initial-scale=1, viewport-fit=cover';
  }
}
