// Sözlük: tüm kelimelere harf, seviye, tür ve YDS listesine göre göz atma. Kelimeye dokununca çeviri ekranı açılır.
import { loadIndex, level, POS, meta } from '../dict.js';
import { store } from '../store.js';
import { esc, ICON, loading } from '../ui.js'; // ICON.filter: filtre düğmesi

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const PAGE = 60;
// Örnek cümle kaynağındaki (Tatoeba) yaygın kişi adları sıklığı şişirdiği için sözlük listesinde gösterilmez
const NAMES = new Set(['tom', 'mary', 'john', 'ken', 'jack', 'bill', 'jim', 'mike', 'bob', 'tony', 'alice', 'ann', 'jane', 'lucy', 'betty', 'kate', 'linda', 'judy', 'emily', 'jimmy', 'paul', 'sam', 'dan', 'pat', 'dick', 'george', 'harry', 'nancy', 'susan', 'lisa', 'sue', 'ted', 'meg', 'bess', 'mark', 'joe', 'kay', 'tim', 'peter', 'roger', 'ray', 'nick', 'rick', 'pete', 'mo', 'ali', 'kim']);
const listable = (r) => r[0].length > 1 && !NAMES.has(r[0]);

// Seçimler sayfalar arası korunur (kelimeye bakıp geri dönünce aynı yerden devam)
const st = { letter: '', lvl: '', pos: '', yds: false, sort: 'freq', q: '', shown: PAGE, list: '' };
let filtersOpen = false; // filtre paneli kapalı başlar

// Listede kısa anlam: parantezli notlar (kıs., edat…) ayıklanır
const cleanGloss = (s) => (s || '').replace(/\([^)]*\)?/g, ' ').replace(/^[\s,;.]+/, '').replace(/\s+/g, ' ').trim();

export function render(root) {
  root.innerHTML = `<div class="wrap narrow">
    <div class="section"><h1>Sözlük</h1></div>
    <div class="search"><input id="dq" type="search" placeholder="Sözlükte süz: ev, -tion, run…" aria-label="Sözlükte süz" value="${esc(st.q)}" autocapitalize="off" spellcheck="false"></div>
    <div class="dict-bar">
      <button class="btn sm" id="d-ftoggle" aria-expanded="false" aria-controls="d-filters">${ICON.filter}Filtrele<span class="badge lvl" id="d-fcount" hidden></span></button>
      <span class="muted small" id="dict-count"></span>
      <select id="d-sort" class="btn sm" aria-label="Sıralama"><option value="freq" ${st.sort === 'freq' ? 'selected' : ''}>En sık</option><option value="az" ${st.sort === 'az' ? 'selected' : ''}>A → Z</option></select>
    </div>
    <div class="dict-filters card" id="d-filters" hidden>
      <span class="eyebrow">Liste</span>
      <div class="tabs" id="d-list">
        ${[['', 'Tüm kelimeler'], ['yds', 'YDS’de sık'], ['later', 'Sonra öğren'], ['fav', 'Favoriler'], ['learned', 'Öğrendiklerim']].map(([k, l]) => `<button data-list="${k}" class="${st.list === k ? 'on' : ''}">${l}</button>`).join('')}
      </div>
      <span class="eyebrow">Seviye</span>
      <div class="tabs" id="d-lvl"><button data-lvl="" class="${!st.lvl ? 'on' : ''}">Tümü</button>${LEVELS.map((l) => `<button data-lvl="${l}" class="${st.lvl === l ? 'on' : ''}">${l}</button>`).join('')}</div>
      <span class="eyebrow">Tür</span>
      <div class="tabs" id="d-pos"><button data-pos="" class="${!st.pos ? 'on' : ''}">Tümü</button>${Object.entries(POS).map(([k, l]) => `<button data-pos="${k}" class="${st.pos === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <span class="eyebrow">Harf</span>
      <div class="letters" id="d-letters"><button data-l="" class="${!st.letter ? 'on' : ''}">Tümü</button>${LETTERS.map((l) => `<button data-l="${l}" class="${st.letter === l ? 'on' : ''}">${l}</button>`).join('')}</div>
    </div>
    <div id="d-list-box">${loading('Sözlük yükleniyor')}</div>
  </div>`;

  let rows = [];
  const box = root.querySelector('#d-list-box');
  const flags = (w) => {
    const s = store.word(w);
    return `${s.learned ? '<i class="dot ok"></i>' : ''}${s.fav ? '<i class="dot fav"></i>' : ''}${s.later ? '<i class="dot later"></i>' : ''}`;
  };

  const filtered = () => {
    const q = st.q.trim().toLowerCase();
    const words = store.state.words;
    let out = rows.filter((r) => {
      if (st.letter && r[0][0] !== st.letter.toLowerCase()) return false;
      if (st.lvl && level(r[1]) !== st.lvl && !(st.lvl === 'C2' && !r[1])) return false;
      if (st.pos && r[2][0] !== st.pos) return false;
      if (st.list === 'yds' && !r[4]) return false;
      if (['later', 'fav', 'learned'].includes(st.list) && !words[r[0]]?.[st.list]) return false;
      if (q) {
        if (q.startsWith('-')) { if (!r[0].endsWith(q.slice(1))) return false; }
        else if (!r[0].startsWith(q) && !r[3].toLocaleLowerCase('tr').includes(q)) return false;
      }
      return true;
    });
    if (st.sort === 'az') out = [...out].sort((a, b) => a[0].localeCompare(b[0], 'en'));
    return out;
  };

  const draw = () => {
    const list = filtered();
    root.querySelector('#dict-count').textContent = `${list.length.toLocaleString('tr')} kelime`;
    const active = [st.list, st.lvl, st.pos, st.letter].filter(Boolean).length;
    const fc = root.querySelector('#d-fcount');
    fc.hidden = !active;
    fc.textContent = active;
    if (!list.length) { box.innerHTML = '<div class="empty">Bu seçimlere uyan kelime yok.</div>'; return; }
    box.innerHTML = `<div class="card list dict-list">${list.slice(0, st.shown).map((r) => `
      <button class="dict-row" data-w="${esc(r[0])}">
        <span class="dw"><b lang="en">${esc(r[0])}</b><span class="muted small">${esc(cleanGloss(r[3]))}</span></span>
        <span class="dflags">${flags(r[0])}</span>
        ${r[4] ? '<span class="badge yds">YDS</span>' : ''}
        <span class="badge">${POS[r[2][0]] || '—'}</span>
        <span class="badge lvl">${level(r[1])}</span>
      </button>`).join('')}</div>
      ${list.length > st.shown ? `<button class="btn" id="d-more" style="align-self:center">Daha fazla göster (${(list.length - st.shown).toLocaleString('tr')} kaldı)</button>` : ''}`;
  };

  const group = (sel, key, attr) => root.querySelector(sel).addEventListener('click', (e) => {
    const b = e.target.closest(`[data-${attr}]`);
    if (!b) return;
    st[key] = b.dataset[attr];
    st.shown = PAGE;
    root.querySelectorAll(`${sel} [data-${attr}]`).forEach((x) => x.classList.toggle('on', x === b));
    draw();
  });
  group('#d-list', 'list', 'list');
  group('#d-lvl', 'lvl', 'lvl');
  group('#d-pos', 'pos', 'pos');
  group('#d-letters', 'letter', 'l');
  root.querySelector('#d-sort').onchange = (e) => { st.sort = e.target.value; st.shown = PAGE; draw(); };
  const ft = root.querySelector('#d-ftoggle'), fp = root.querySelector('#d-filters');
  const setFilters = (open) => { filtersOpen = open; fp.hidden = !open; ft.setAttribute('aria-expanded', open); ft.classList.toggle('on', open); };
  setFilters(filtersOpen);
  ft.onclick = () => setFilters(fp.hidden);
  let t;
  root.querySelector('#dq').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value; st.shown = PAGE; draw(); }, 150); });
  box.addEventListener('click', (e) => {
    if (e.target.closest('#d-more')) { st.shown += PAGE * 2; draw(); return; }
    const r = e.target.closest('.dict-row');
    if (r) window.lugat.lookupWord(r.dataset.w, { hash: 'sozluk', label: 'Sözlüğe dön' });
  });

  loadIndex().then(({ rows: all }) => {
    if (!root.isConnected || !root.querySelector('#d-list-box')) return;
    rows = all.filter(listable);
    draw();
  }).catch(() => { box.innerHTML = '<div class="empty">Sözlük yüklenemedi.</div>'; });
  meta().catch(() => {});
}
