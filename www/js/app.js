// Yönlendirici: yalnızca düz #ad biçimli adresler (#ana, #ceviri, #konu-present-simple, #kitap-gift-of-the-magi)
import * as home from './views/home.js';
import * as translate from './views/translate.js';
import * as topics from './views/topics.js';
import * as library from './views/library.js';
import * as profile from './views/profile.js';
import { cycleTheme, applyTheme, getTheme } from './theme.js';
import { toast } from './ui.js';

applyTheme(getTheme());
document.getElementById('theme-btn').addEventListener('click', () => toast('Görünüm: ' + cycleTheme()));

const view = document.getElementById('view');
let current = null;

function route() {
  const h = decodeURIComponent(location.hash.slice(1)) || 'ana';
  let mod = home, arg = null, sec = 'ana';
  if (h === 'ceviri') { mod = translate; sec = 'ceviri'; }
  else if (h === 'konular') { mod = topics; sec = 'konular'; }
  else if (h.startsWith('konu-')) { mod = topics; arg = h.slice(5); sec = 'konular'; }
  else if (h === 'kutuphane') { mod = library; sec = 'kutuphane'; }
  else if (h.startsWith('kitap-')) { mod = library; arg = h.slice(6); sec = 'kutuphane'; }
  else if (h === 'profil') { mod = profile; sec = 'profil'; }
  document.querySelectorAll('.nav-item').forEach((a) => a.classList.toggle('on', a.dataset.sec === sec));
  current?.destroy?.();
  current = mod;
  view.innerHTML = '';
  mod.render(view, arg);
  if (!arg || !mod.keepScroll) window.scrollTo(0, 0);
}

// Başka bir sayfadan kelime aratmak için: lookupWord('give up')
export function lookupWord(w) {
  translate.setQuery(w);
  if (location.hash === '#ceviri') route();
  else location.hash = 'ceviri';
}
window.lugat = { lookupWord };

window.addEventListener('hashchange', route);
route();

// Ana ekrana eklenen web sürümünde (PWA) internetsiz çalışma; claude.ai ve Android uygulamasında gerekmez
if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.Capacitor?.isNativePlatform?.() && !/claude/.test(location.hostname)) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
