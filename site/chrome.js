// Shared by the app and the guide: theme switch, All tools menu and offline support.
const THEME = 'stackctrl.theme';
const load = () => { try { return localStorage.getItem(THEME); } catch { return null; } };

function setTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else { t = 'auto'; delete document.documentElement.dataset.theme; }
  try { localStorage.setItem(THEME, t); } catch { /* storage unavailable */ }
  document.querySelectorAll('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === t)));
}
document.querySelectorAll('[data-theme-set]').forEach((b) => { b.onclick = () => setTheme(b.dataset.themeSet); });
setTheme(load() || 'auto');

// The menu works with no script; this only closes it 
const menu = document.getElementById('toolkit');
document.addEventListener('click', (e) => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.open) { menu.open = false; menu.querySelector('summary').focus(); } });

if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});
