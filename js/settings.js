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

export function applySettings() {
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
