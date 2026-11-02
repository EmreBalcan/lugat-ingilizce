// Görünüm seçimi: 'system' (cihaza uy), 'light' (açık), 'dark' (koyu). Cihazda hatırlanır.
const KEY = 'lugat.theme';
export const THEMES = [['system', 'Sistem'], ['light', 'Açık'], ['dark', 'Koyu']];

export function getTheme() {
  try { return localStorage.getItem(KEY) || 'system'; } catch { return 'system'; }
}

export function applyTheme(t) {
  const r = document.documentElement;
  if (t === 'light' || t === 'dark') r.setAttribute('data-theme', t);
  else r.removeAttribute('data-theme');
  document.querySelectorAll('[data-theme-icon]').forEach((el) => { el.innerHTML = themeIcon(t); el.title = 'Görünüm: ' + label(t); });
}

export function setTheme(t) {
  try { localStorage.setItem(KEY, t); } catch {}
  applyTheme(t);
}

export function cycleTheme() {
  const order = THEMES.map((x) => x[0]);
  const next = order[(order.indexOf(getTheme()) + 1) % order.length];
  setTheme(next);
  return label(next);
}

export const label = (t) => (THEMES.find((x) => x[0] === t) || THEMES[0])[1];

export function themeIcon(t) {
  if (t === 'light') return '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/></svg>';
  if (t === 'dark') return '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
  return '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17A8.5 8.5 0 0 0 12 3.5z" fill="currentColor"/></svg>';
}

applyTheme(getTheme());
