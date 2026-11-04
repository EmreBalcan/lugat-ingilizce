import { store } from '../store.js';
import { esc, ICON, ring, speak, toast } from '../ui.js';
import { loadIndex, getEn, level, formRegex } from '../dict.js';
import { bookIndex, coverHTML } from './library.js';
import { topicIndex } from './topics.js';
import { testStatus } from './test.js';
import { flashcards } from './profile.js';
import { cycleTheme, getTheme, themeIcon, label } from '../theme.js';

let off = null, offMenu = null;
let goalsOpen = null; // telefonda kapalı, masaüstünde açık başlar
const isPhone = () => matchMedia('(max-width: 820px)').matches;
export function destroy() { off?.(); off = null; if (offMenu) document.removeEventListener('click', offMenu); offMenu = null; }

function hello() {
  const h = new Date().getHours();
  return h < 6 ? 'İyi geceler' : h < 12 ? 'Günaydın' : h < 18 ? 'İyi günler' : 'İyi akşamlar';
}

// Kartta gösterilecek kısa, temiz anlamlar: parantezler, deyim artıkları ve uzun açıklamalar atılır (en çok 3)
function cleanMeanings(e) {
  const out = [];
  for (const s of e.t || []) {
    for (const part of s.replace(/\([^)]*\)/g, ' ').split(/[,;.]/)) {
      const p = part.replace(/\s+/g, ' ').trim();
      if (p.length >= 2 && p.length <= 24 && /^[\p{L} ']+$/u.test(p) && !/[a-z]'[a-z]/i.test(p) && !out.includes(p)) out.push(p);
      if (out.length >= 3) return out.join(', ');
    }
  }
  return out.join(', ');
}

// Tarihe göre her gün değişen, YDS'de sık geçen ya da orta sıklıkta bir kelime
async function wordOfDay() {
  const { rows } = await loadIndex();
  const pool = rows.filter((r) => !r[0].includes(' ') && (r[4] || (r[1] > 600 && r[1] < 5000)));
  const d = new Date();
  const n = (d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate()) * 2654435761 >>> 0;
  return getEn(pool[n % pool.length][0]);
}

export function render(root) {
  const draw = async () => {
    const s = store.state, d = store.day(), g = s.goals;
    const later = Object.values(s.words).filter((v) => v.later).length;
    const goals = [
      ['ceviri', 'Kelime ara', d.lw.length, g.lookups],
      ['konular', 'Konu çalış', d.topics.length, g.topics],
      ['kutuphane', 'Cümle oku', d.sentences, g.sentences],
      ['konular', 'Soru çöz', d.quiz, g.quiz],
    ];
    const done = goals.filter(([, , v, t]) => v >= t).length;
    if (goalsOpen === null) goalsOpen = !isPhone();
    const SHORTCUTS = [
      ['ceviri', ICON.translate, 'Çeviri', 'Anlam, örnek cümle, eş ve zıt anlam, YDS sorusu'],
      ['sozluk', ICON.dict, 'Sözlük', '40 binden fazla kelimeye harf, seviye ve türe göre göz at'],
      ['test', ICON.check, 'Günlük Test', 'Her gün yenilenen 25 soruluk YDS tarzı test'],
      ['konular', ICON.topic, 'Konu anlatımı', 'Gramer, bağlaçlar, edatlar ve çok örnek'],
      ['kutuphane', ICON.book, 'Kütüphane', 'Seviyeli klasikler, cümle cümle Türkçesiyle'],
      ['profil', ICON.user, 'Profil', 'Listelerin, okuduğun kitaplar, gelişimin'],
    ];
    root.innerHTML = `<div class="wrap">
      <div class="hello">
        <div class="hello-menu">
          <button class="icon-btn" id="sec-menu-btn" aria-expanded="false" aria-controls="sec-menu" aria-label="Bölümler menüsü">${ICON.grid}</button>
          <div class="sec-menu" id="sec-menu" hidden>
            <span class="eyebrow">Bölümler</span>
            ${SHORTCUTS.map(([h, ico, t, d]) => `<a class="sec-item" href="#${h}"><span class="ico">${ico}</span><span><b>${t}</b><span class="muted small">${d}</span></span></a>`).join('')}
          </div>
        </div>
        <div class="section" style="gap:6px"><span class="eyebrow">${new Date().toLocaleDateString('tr', { weekday: 'long', day: 'numeric', month: 'long' })}</span><h1>${hello()}!</h1></div>
        <div class="row"><div class="streak"><b>${store.streak()}</b>günlük seri</div><button class="icon-btn" id="theme-home" aria-label="Görünümü değiştir" title="Görünüm: ${label(getTheme())}">${themeIcon(getTheme())}</button></div>
      </div>

      <button class="goals-toggle" id="goals-toggle" aria-expanded="${goalsOpen}" aria-controls="goals">
        <span class="gt-head"><h2>Bugünkü hedefler</h2><span class="chip static" title="${done} / 4 hedef tamamlandı">${done} / 4 ✓</span><span class="chev">${ICON.chevron}</span></span>
        <span class="gt-bars" aria-hidden="true">${goals.map(([, , v, t], i) => `<i class="t${i + 1}"><b style="width:${Math.min(100, Math.round((100 * v) / t))}%"></b></i>`).join('')}</span>
      </button>
      <div class="goals" id="goals" ${goalsOpen ? '' : 'hidden'}>${goals.map(([h, l, v, t], i) => `<a class="goal t${i + 1} ${v >= t ? 'done' : ''}" href="#${h}"><span class="arrow-dot">${ICON.arrow}</span><div class="goal-label">${l}</div><div class="section" style="gap:10px"><div class="goal-num">${Math.min(v, 9999)}<small> / ${t}</small></div><div class="meter"><i style="width:${Math.min(100, Math.round((100 * v) / t))}%"></i></div></div></a>`).join('')}</div>

      ${(() => {
        const ts = testStatus();
        const sub = ts.done ? `Bugün ${ts.score} / ${ts.total} · yarın yenisi` : ts.started ? `${ts.answered} / ${ts.total} · ${ts.score} doğru` : '25 soru · her gün yeni';
        return `<a class="card test-card" href="#test"><span class="ico">${ICON.check}</span><span class="t"><b>Günlük Test</b><span class="muted small">${sub}</span></span><span class="btn sm primary">${ts.done ? 'Sonuçlar' : ts.started ? 'Devam et' : 'Başla'}</span></a>`;
      })()}

      <div class="card wotd" id="wotd"><div class="section" style="gap:6px"><span class="eyebrow muted">Günün kelimesi</span><div class="wotd-word"><span>…</span></div></div></div>

      <div id="cont"></div>

      <div class="section sections-bottom"><h2>Bölümler</h2>
        <div class="shortcuts">
          ${SHORTCUTS.map(([h, ico, t, d]) => `<a class="card shortcut" href="#${h}"><span class="ico">${ico}</span><span class="arrow-dot">${ICON.arrow}</span><h3>${t}</h3><span class="muted small">${d}</span></a>`).join('')}
        </div>
      </div>

      ${later ? `<div class="card row" style="justify-content:space-between"><div><h3>${later} kelime tekrar bekliyor</h3><span class="muted small">“Sonra öğren” listendeki kelimeler</span></div><button class="btn primary" id="cards">${ICON.cards}Kartlarla tekrar et</button></div>` : ''}
    </div>`;
    root.querySelector('#cards')?.addEventListener('click', () => flashcards());
    const gt = root.querySelector('#goals-toggle');
    gt.addEventListener('click', () => {
      goalsOpen = !goalsOpen;
      gt.setAttribute('aria-expanded', goalsOpen);
      root.querySelector('#goals').hidden = !goalsOpen;
    });
    const mb = root.querySelector('#sec-menu-btn'), menu = root.querySelector('#sec-menu');
    const setMenu = (open) => { menu.hidden = !open; mb.setAttribute('aria-expanded', open); mb.classList.toggle('on', open); };
    mb.addEventListener('click', (e) => { e.stopPropagation(); setMenu(menu.hidden); });
    if (offMenu) document.removeEventListener('click', offMenu);
    offMenu = (e) => { if (!menu.hidden && !menu.contains(e.target)) setMenu(false); };
    document.addEventListener('click', offMenu);
    root.querySelector('#theme-home').addEventListener('click', (e) => {
      toast('Görünüm: ' + cycleTheme());
      e.currentTarget.innerHTML = themeIcon(getTheme());
    });

    // Kaldığın yerden devam: son açılan kitap ve konu
    Promise.all([bookIndex().catch(() => null), topicIndex().catch(() => null)]).then(([bi, ti]) => {
      const box = root.querySelector('#cont');
      if (!box) return;
      const parts = [];
      const reading = Object.entries(s.books).filter(([id, v]) => !v.done && bi?.books.some((b) => b.id === id)).sort((a, b) => (b[1].at || 0) - (a[1].at || 0))[0];
      if (reading) {
        const b = bi.books.find((x) => x.id === reading[0]);
        const pct = Math.round((100 * (reading[1].seen || 0)) / b.sentences);
        parts.push(`<a class="card continue" href="#kitap-${b.id}"><div class="continue-cover">${coverHTML(b)}</div><div class="section" style="gap:6px;flex:1;min-width:0"><span class="eyebrow">Okumaya devam et</span><h3>${esc(b.title)}</h3><div class="bar"><i style="width:${pct}%"></i></div><span class="muted small">%${pct} okundu</span></div></a>`);
      }
      const lastTopic = Object.entries(s.topics).filter(([, v]) => v.read && !v.learned).sort((a, b) => b[1].read - a[1].read)[0];
      if (lastTopic) parts.push(`<a class="card continue" href="#konu-${esc(lastTopic[0])}"><span class="ico" style="width:44px;height:44px;border-radius:10px;display:grid;place-items:center;background:var(--cobalt-soft);color:var(--cobalt)">${ICON.topic}</span><div class="section" style="gap:4px"><span class="eyebrow">Son çalıştığın konu</span><h3>${esc(lastTopic[1].title)}</h3></div></a>`);
      if (!parts.length && bi?.books[0]) {
        const b = bi.books[0];
        parts.push(`<a class="card continue" href="#kitap-${b.id}"><div class="continue-cover">${coverHTML(b)}</div><div class="section" style="gap:6px"><span class="eyebrow">Okumaya başla</span><h3>${esc(b.title)}</h3><span class="muted small clamp1">${esc(b.desc)}</span></div></a>`);
      }
      box.outerHTML = `<div class="two">${parts.join('')}</div>`;
    });

    wordOfDay().then((e) => {
      const box = root.querySelector('#wotd');
      if (!box || !e) return;
      const ex = e.x?.[0];
      const m = ex && formRegex(e).exec(ex[0]);
      const exH = ex ? (m ? esc(ex[0].slice(0, m.index)) + '<b>' + esc(m[0]) + '</b>' + esc(ex[0].slice(m.index + m[0].length)) : esc(ex[0])) : '';
      const drawWotd = () => {
        const lat = store.word(e.w).later;
        box.innerHTML = `
          <div class="wotd-top"><span class="eyebrow">Günün kelimesi</span><span class="badge lvl">${level(e.r)}</span>${e.y ? '<span class="badge yds">YDS</span>' : ''}</div>
          <div class="wotd-main"><span class="wotd-word" lang="en">${esc(e.w)}</span><button class="icon-btn sm" id="w-s" aria-label="Dinle">${ICON.speak}</button></div>
          <p class="wotd-mean">${esc(cleanMeanings(e))}</p>
          ${ex ? `<p class="wotd-ex"><span lang="en">${exH}</span><span class="muted">${esc(ex[1])}</span></p>` : ''}
          <div class="wotd-actions"><button class="btn sm ghost ${lat ? 'on' : ''}" id="w-later">${ICON.clock}${lat ? 'Listede' : 'Sonra öğren'}</button><button class="btn sm" id="w-more">Ayrıntılar${ICON.arrow}</button></div>`;
        box.querySelector('#w-s').onclick = () => speak(e.w);
        box.querySelector('#w-more').onclick = () => window.lugat.lookupWord(e.w);
        box.querySelector('#w-later').onclick = () => { const on = !store.word(e.w).later; store.setWordFlag(e.w, 'later', on, e.t?.[0]); toast(on ? 'Sonra öğren listesine eklendi' : 'Listeden çıkarıldı'); drawWotd(); };
      };
      drawWotd();
    }).catch(() => {});
  };
  draw();
  // Profil hesaptan yüklenince (durum nesnesi değişir) ana sayfayı tazele
  let ref = store.state;
  off = store.on((st) => { if (st !== ref) { ref = st; draw(); } });
}
