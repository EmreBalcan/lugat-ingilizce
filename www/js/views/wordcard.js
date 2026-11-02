// Okurken dokunulan kelimenin yanında açılan küçük sözlük kartı (sayfadan ayrılmaz)
import { lookup, level, POS, formRegex } from '../dict.js';
import { store } from '../store.js';
import { esc, ICON, speak, toast } from '../ui.js';

let card = null, anchor = null;

export function closeWordCard() {
  card?.remove(); card = null;
  anchor?.classList.remove('w-on'); anchor = null;
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeWordCard(); });
document.addEventListener('pointerdown', (e) => { if (card && !card.contains(e.target) && !e.target.closest('.w')) closeWordCard(); });
window.addEventListener('hashchange', closeWordCard);

function place() {
  if (!card || !anchor) return;
  if (matchMedia('(max-width: 820px)').matches) { card.classList.add('docked'); card.style.left = card.style.top = ''; return; }
  card.classList.remove('docked');
  const r = anchor.getBoundingClientRect();
  const w = card.offsetWidth, h = card.offsetHeight;
  let left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), innerWidth - w - 12);
  let top = r.bottom + 10;
  if (top + h > innerHeight - 12) top = Math.max(12, r.top - h - 10);
  card.style.left = left + 'px';
  card.style.top = top + 'px';
}
window.addEventListener('resize', place);
window.addEventListener('scroll', () => { if (card && !card.classList.contains('docked')) closeWordCard(); }, { passive: true });

export async function openWordCard(el, sentence) {
  if (anchor === el) { closeWordCard(); return; }
  closeWordCard();
  anchor = el;
  el.classList.add('w-on');
  const word = el.textContent.replace('’', "'");
  card = document.createElement('div');
  card.className = 'wcard';
  card.setAttribute('role', 'dialog');
  card.innerHTML = `<div class="loading" style="padding:6px 0"><div class="spin"></div>${esc(word)}</div>`;
  document.body.appendChild(card);
  place();

  const myCard = card;
  const r = await lookup(word).catch(() => null);
  if (card !== myCard) return;
  if (!r || r.kind !== 'en') {
    card.innerHTML = `<div class="wcard-head"><b class="wcard-word">${esc(word)}</b></div><p class="muted small">Bu kelime sözlükte yok. Özel isim ya da eski bir kullanım olabilir.</p>`;
    place();
    return;
  }
  const e = r.entry;
  store.logLookup(e.w, e.t?.[0]);
  const draw = () => {
    const s = store.word(e.w);
    card.innerHTML = `
      <div class="wcard-head">
        <b class="wcard-word">${esc(e.w)}</b>
        <button class="icon-btn sm" data-a="speak" aria-label="Dinle">${ICON.speak}</button>
        <span class="badge lvl">${level(e.r)}</span>
        ${[...(e.p || '')].slice(0, 2).map((p) => `<span class="badge">${POS[p]}</span>`).join('')}
        <button class="wcard-x" data-a="close" aria-label="Kapat">×</button>
      </div>
      ${r.from ? `<p class="muted small">Metinde: <b>${esc(r.from)}</b>${e.i ? ` · ${esc(e.w)} – ${esc(e.i[0])} – ${esc(e.i[1])}` : ''}</p>` : (e.i ? `<p class="muted small">${esc(e.w)} – ${esc(e.i[0])} – ${esc(e.i[1])}</p>` : '')}
      ${e.t ? `<ol class="wcard-means">${e.t.slice(0, 3).map((t) => `<li>${esc(t)}</li>`).join('')}</ol>` : `<p>${esc(e.d?.[0]?.d || '')}</p>`}
      ${e.s?.length ? `<p class="small"><span class="muted">Eş anlamlı:</span> ${e.s.slice(0, 4).map(esc).join(', ')}</p>` : ''}
      <div class="wcard-actions">
        <button class="btn sm ${s.later ? 'on' : ''}" data-a="later">${ICON.clock}${s.later ? 'Listede' : 'Sonra öğren'}</button>
        <button class="btn sm ${s.fav ? 'on' : ''}" data-a="fav" aria-label="Favori">${ICON.star}</button>
        <button class="btn sm ghost" data-a="more">Sözlükte aç</button>
      </div>`;
    place();
  };
  draw();
  card.onclick = (ev) => {
    const a = ev.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    if (a === 'close') return closeWordCard();
    if (a === 'speak') return speak(e.w);
    if (a === 'more') { closeWordCard(); return window.lugat.lookupWord(e.w); }
    const on = !store.word(e.w)[a];
    store.setWordFlag(e.w, a, on, e.t?.[0]);
    toast(on ? (a === 'later' ? 'Sonra öğren listesine eklendi' : 'Favorilere eklendi') : 'Listeden çıkarıldı');
    draw();
  };
}
