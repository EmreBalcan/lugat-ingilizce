import { store } from '../store.js';
import { esc, ICON, speak, stopSpeaking, loading, toast } from '../ui.js';
import { openWordCard, closeWordCard } from './wordcard.js';

const cache = new Map();
const get = (url) => (cache.has(url) ? cache.get(url) : cache.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })).get(url));
export const bookIndex = () => get('data/books/index.json');

const CAT = { masal: 'Masal', hikaye: 'Öykü', roman: 'Roman', fabl: 'Fabl' };
const LEVELS = ['Tümü', 'A1', 'A2', 'B1', 'B2', 'C1'];
let lvl = 'Tümü';

const pref = (k, d) => { try { return localStorage.getItem('lugat.' + k) || d; } catch { return d; } };
const setPref = (k, v) => { try { localStorage.setItem('lugat.' + k, v); } catch {} };

let observer = null;
export function destroy() { observer?.disconnect(); observer = null; closeWordCard(); stopSpeaking(); }

export function render(root, id) {
  if (id) return reader(root, id);
  shelf(root);
}

export function coverHTML(b) {
  return `<div class="cover c-${esc(b.cat)}"><span class="badge">${esc(CAT[b.cat] || b.cat)} · ${esc(b.level)}</span><div><h3>${esc(b.title)}</h3><div class="by">${esc(b.author)}</div></div></div>`;
}

async function shelf(root) {
  root.innerHTML = `<div class="wrap">
    <div class="section"><span class="eyebrow">Cümle cümle, Türkçe karşılıklarıyla</span><h1>Kütüphane</h1>
      <p class="muted">Klasik masallar, öyküler ve romanlardan bölümler. Her cümlenin altında Türkçesi var; bilmediğin kelimeye dokunursan anlamı açılır.</p></div>
    <div class="tabs" id="lv">${LEVELS.map((l) => `<button class="${l === lvl ? 'on' : ''}" data-l="${l}">${l}</button>`).join('')}</div>
    <div id="books">${loading()}</div>
  </div>`;
  const idx = await bookIndex().catch(() => null);
  const box = root.querySelector('#books');
  if (!idx) { box.innerHTML = '<div class="empty">Kütüphane yüklenemedi.</div>'; return; }
  const draw = () => {
    const list = idx.books.filter((b) => lvl === 'Tümü' || b.level === lvl);
    box.innerHTML = list.length ? `<div class="shelf">${list.map((b) => {
      const p = store.book(b.id);
      const pct = p ? Math.round((100 * (p.seen || 0)) / b.sentences) : 0;
      return `<a class="card book" href="#kitap-${b.id}">${coverHTML(b)}<div class="book-meta">
        <span class="small muted">${esc(b.trTitle)} · ${b.sentences} cümle</span>
        <span class="small">${esc(b.desc)}</span>
        ${p ? `<div class="bar"><i style="width:${p.done ? 100 : pct}%"></i></div><span class="small muted">${p.done ? 'Bitirildi' : '%' + pct + ' okundu'}</span>` : ''}
      </div></a>`;
    }).join('')}</div>` : '<div class="empty">Bu seviyede henüz kitap yok.</div>';
  };
  draw();
  root.querySelector('#lv').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    lvl = b.dataset.l;
    root.querySelectorAll('#lv button').forEach((x) => x.classList.toggle('on', x === b));
    draw();
  });
}

// Metni kelimelere böler: kelimeler dokunulabilir <span>, geri kalanı kaçışlı metin
function tappable(text) {
  let out = '', last = 0;
  for (const m of text.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)?/g)) {
    out += esc(text.slice(last, m.index)) + `<span class="w">${esc(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  return out + esc(text.slice(last));
}

async function reader(root, id) {
  root.innerHTML = `<div class="wrap reader">${loading('Kitap açılıyor')}</div>`;
  let book, meta;
  try { [book, meta] = await Promise.all([get(`data/books/${id}.json`), bookIndex().then((x) => x.books.find((b) => b.id === id))]); }
  catch { root.innerHTML = `<div class="wrap"><a class="back" href="#kutuphane">${ICON.back}Kütüphane</a><div class="empty">Kitap bulunamadı.</div></div>`; return; }
  const offsets = [];
  let total = 0;
  for (const c of book.chapters) { offsets.push(total); total += c.s.length; }
  const prog = store.book(id);
  let ch = Math.min(prog?.ch || 0, book.chapters.length - 1);
  let trMode = pref('trMode', 'show');
  let size = +pref('readSize', '1.15');

  const draw = () => {
    destroy();
    const c = book.chapters[ch];
    const p = store.book(id);
    const seen = p?.seen || 0;
    root.innerHTML = `<div class="wrap reader ${trMode === 'off' ? 'tr-off' : ''}" style="--read-size:${size}rem">
      <a class="back" href="#kutuphane">${ICON.back}Kütüphane</a>
      <div class="section"><span class="eyebrow">${esc(meta?.author || '')} · ${esc(meta?.level || '')}</span><h1 style="font-family:var(--f-read);font-weight:600">${esc(book.title)}</h1><p class="muted">${esc(meta?.trTitle || '')}${meta?.note ? ' · ' + esc(meta.note) : ''}</p></div>
      <div class="reader-top">
        <select id="chs" aria-label="Bölüm" class="btn sm">${book.chapters.map((x, k) => `<option value="${k}" ${k === ch ? 'selected' : ''}>${k + 1}. ${esc(x.t)}</option>`).join('')}</select>
        <div class="bar" title="İlerleme"><i id="pbar" style="width:${Math.round((100 * seen) / total)}%"></i></div>
        <div class="row" style="gap:6px">
          <button class="btn sm primary" id="play">${ICON.play}Sesli oku</button>
          <select id="trm" class="btn sm" aria-label="Türkçe gösterimi"><option value="show" ${trMode === 'show' ? 'selected' : ''}>Türkçe açık</option><option value="tap" ${trMode === 'tap' ? 'selected' : ''}>Dokununca göster</option><option value="off" ${trMode === 'off' ? 'selected' : ''}>Türkçe kapalı</option></select>
          <button class="btn sm" id="fs-dec" aria-label="Yazıyı küçült">A−</button><button class="btn sm" id="fs-inc" aria-label="Yazıyı büyüt">A+</button>
        </div>
      </div>
      <h2 class="chapter-title">${esc(c.t)}</h2>
      <p class="muted small">İpucu: Bilmediğin bir kelimeye dokun, anlamı hemen yanında açılır.</p>
      <div id="sents">${c.s.map(([en, tr], i) => `<div class="sent" data-g="${offsets[ch] + i}">
        <div class="sent-row"><div class="sent-en">${tappable(en)}</div><button class="say" data-say aria-label="Cümleyi dinle">${ICON.speak}</button></div>
        <div class="sent-tr ${trMode === 'tap' ? 'hidden-tr' : ''}">${esc(tr)}</div>
      </div>`).join('')}</div>
      <div class="chapter-nav">
        ${ch > 0 ? `<button class="btn" id="prev">${ICON.back}Önceki bölüm</button>` : '<span></span>'}
        ${ch < book.chapters.length - 1 ? `<button class="btn primary" id="next">Sonraki bölüm${ICON.arrow}</button>` : `<a class="btn primary" href="#kutuphane">Kitabı bitirdin, kütüphaneye dön</a>`}
      </div>
      <p class="muted small">${esc(meta?.source || '')}</p>
    </div>`;

    const go = (k) => { ch = k; store.bookProgress(id, { ch, total }); draw(); window.scrollTo(0, 0); };
    root.querySelector('#chs').onchange = (e) => go(+e.target.value);
    root.querySelector('#prev')?.addEventListener('click', () => go(ch - 1));
    root.querySelector('#next')?.addEventListener('click', () => go(ch + 1));
    root.querySelector('#trm').onchange = (e) => { trMode = e.target.value; setPref('trMode', trMode); draw(); };
    root.querySelector('#fs-dec').onclick = () => { size = Math.max(0.95, size - 0.1); setPref('readSize', size.toFixed(2)); root.querySelector('.reader').style.setProperty('--read-size', size + 'rem'); };
    root.querySelector('#fs-inc').onclick = () => { size = Math.min(1.7, size + 0.1); setPref('readSize', size.toFixed(2)); root.querySelector('.reader').style.setProperty('--read-size', size + 'rem'); };
    root.querySelector('#sents').addEventListener('click', (e) => {
      const w = e.target.closest('.w');
      if (w) return openWordCard(w);
      const tr = e.target.closest('.hidden-tr');
      if (tr) return tr.classList.remove('hidden-tr');
      const sp = e.target.closest('[data-say]');
      if (sp) { stopReading(); speak(sp.closest('.sent').querySelector('.sent-en').textContent); }
    });

    // Bölümü baştan sona (ya da ekranda görünen cümleden itibaren) sırayla sesli okur
    const sents = [...root.querySelectorAll('.sent')];
    const playBtn = root.querySelector('#play');
    let playing = false;
    const setBtn = () => { playBtn.innerHTML = playing ? `${ICON.pause}Durdur` : `${ICON.play}Sesli oku`; };
    const clear = () => sents.forEach((s) => s.classList.remove('reading'));
    function stopReading() { if (!playing) return; playing = false; stopSpeaking(); clear(); setBtn(); }
    const readAt = (i) => {
      clear();
      if (!playing) return;
      if (i >= sents.length) { playing = false; setBtn(); toast(ch < book.chapters.length - 1 ? 'Bölüm bitti. Sonraki bölüme geçebilirsin.' : 'Kitabın sonuna geldin.'); return; }
      const s = sents[i];
      s.classList.add('reading');
      s.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      speak(s.querySelector('.sent-en').textContent, 'en-US', { onend: (failed) => { if (failed) stopReading(); else if (playing) readAt(i + 1); } });
    };
    playBtn.onclick = () => {
      if (playing) return stopReading();
      playing = true; setBtn();
      const first = sents.findIndex((s) => s.getBoundingClientRect().bottom > 120);
      readAt(Math.max(0, first));
    };

    // Okunan en ileri cümleyi izle (günlük hedef + ilerleme çubuğu)
    let pending = 0, timer;
    observer = new IntersectionObserver((ents) => {
      for (const en of ents) if (en.isIntersecting) pending = Math.max(pending, +en.target.dataset.g + 1);
      clearTimeout(timer);
      timer = setTimeout(() => {
        const cur = store.book(id)?.seen || 0;
        if (pending > cur) {
          store.bookProgress(id, { ch, seen: pending, total, done: pending >= total ? Date.now() : 0 });
          const bar = root.querySelector('#pbar');
          if (bar) bar.style.width = Math.round((100 * pending) / total) + '%';
        }
      }, 700);
    }, { rootMargin: '0px 0px -35% 0px' });
    root.querySelectorAll('.sent').forEach((s) => observer.observe(s));
  };
  if (!prog) store.bookProgress(id, { ch: 0, seen: 0, total });
  draw();
}
