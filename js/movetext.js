// A short description of a move's original effect, generated from data/moves.json.
import { t } from './i18n.js';

const stats = (b) =>
  Object.entries(b)
    .map(([k, v]) => `${t('sh_' + k)} ${v > 0 ? '+' : ''}${v}`)
    .join(', ');

const what = (s) => {
  const out = [];
  if (s.status) out.push(t('e_' + s.status));
  if (s.volatile === 'flinch' || s.volatile === 'confusion') out.push(t('e_' + s.volatile));
  if (s.boosts) out.push(t('e_foe', { stats: stats(s.boosts), n: '' }).trim());
  if (s.selfBoosts) out.push(t('e_self', { stats: stats(s.selfBoosts), n: '' }).trim());
  return out.join(', ');
};

export function moveEffectText(m) {
  const parts = [];
  if (m.category === 'Status') {
    if (m.target === 'self' && m.boosts) parts.push(t('e_buff', { stats: stats(m.boosts) }));
    if (m.volatile === 'focusenergy') parts.push(t('e_buff', { stats: stats({ crit: 2 }) }));
    if (m.heal && m.id !== 'moonlight' && m.id !== 'synthesis') parts.push(t('e_heal', { n: Math.round(m.heal * 100) }));
    if (m.weather) {
      const d = { raindance: 'rain_d', sunnyday: 'sun_d', sandstorm: 'sand_d', snowscape: 'snow_d' }[m.weather];
      parts.push(`${t('e_weather', { w: t('wn_' + m.weather) })} (${t(d)})`);
    }
    if (m.target !== 'self' && m.status) parts.push(t('e_inflict', { what: t('e_' + m.status) }));
    if (m.target !== 'self' && m.volatile === 'confusion') parts.push(t('e_inflict', { what: t('e_confusion') }));
  }
  for (const s of m.secondary || []) parts.push(t('e_chance', { n: s.chance, what: what(s) }));
  if (m.selfBoosts) parts.push(t('e_self', { stats: stats(m.selfBoosts), n: '' }).trim());
  if (m.drain) parts.push(t('e_drain', { n: Math.round(m.drain * 100) }));
  if (m.recoil) parts.push(t('e_recoil', { n: Math.round(m.recoil * 100) }));
  if (m.critRatio > 1) parts.push(t('e_crit'));
  if (m.priority > 0) parts.push(t('e_priority'));
  if (m.recharge) parts.push(t('e_recharge'));
  if (m.locked) parts.push(t('e_locked'));
  if (m.selfSwitch) parts.push(t('e_switch'));
  return parts.join(' · ');
}
