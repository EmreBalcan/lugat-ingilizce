import { store } from '../store.js';
import { esc, ICON, ring, speak, toast } from '../ui.js';
import { loadIndex, getEn, level, formRegex } from '../dict.js';
import { bookIndex, coverHTML } from './library.js';
import { topicIndex } from './topics.js';
import { flashcards } from './profile.js';
import { cycleTheme, getTheme, themeIcon, label } from '../theme.js';

let off = null;
export function destroy() { off?.(); off = null; }

function hello() {
  const h = new Date().getHours();
  return h < 6 ? 'İyi geceler' : h < 12 ? 'Günaydın' : h < 18 ? 'İyi günler' : 'İyi akşamlar';
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
    root.innerHTML = `<div class="wrap">
      <div class="hello">
        <div class="section" style="gap:6px"><span class="eyebrow">${new Date().toLocaleDateString('tr', { weekday: 'long', day: 'numeric', month: 'long' })}</span><h1>${hello()}!</h1></div>
        <div class="row"><div class="streak"><b>${store.streak()}</b>günlük seri</div><button class="icon-btn" id="theme-home" aria-label="Görünümü değiştir" title="Görünüm: ${label(getTheme())}">${themeIcon(getTheme())}</button></div>
      </div>

      <div class="section-head"><h2>Bugünkü hedefler</h2><span class="chip static">${done} / 4 tamamlandı</span>
      </div>
      <div class="goals">${goals.map(([h, l, v, t], i) => `<a class="goal t${i + 1} ${v >= t ? 'done' : ''}" href="#${h}"><span class="arrow-dot">${ICON.arrow}</span><div class="goal-label">${l}</div><div class="section" style="gap:10px"><div class="goal-num">${Math.min(v, 9999)}<small> / ${t}</small></div><div class="meter"><i style="width:${Math.min(100, Math.round((100 * v) / t))}%"></i></div></div></a>`).join('')}</div>

      <div class="card wotd" id="wotd"><div class="section" style="gap:6px"><span class="eyebrow muted">Günün kelimesi</span><div class="wotd-word"><span>…</span></div></div></div>

      <div id="cont"></div>

      <div class="section"><h2>Bölümler</h2>
        <div class="shortcuts">
          <a class="card shortcut" href="#ceviri"><span class="ico">${ICON.translate}</span><span class="arrow-dot">${ICON.arrow}</span><h3>Çeviri</h3><span class="muted small">Anlam, örnek cümle, eş ve zıt anlam, YDS sorusu</span></a>
          <a class="card shortcut" href="#konular"><span class="ico">${ICON.topic}</span><span class="arrow-dot">${ICON.arrow}</span><h3>Konu anlatımı</h3><span class="muted small">Gramer, bağlaçlar, edatlar ve çok örnek</span></a>
          <a class="card shortcut" href="#kutuphane"><span class="ico">${ICON.book}</span><span class="arrow-dot">${ICON.arrow}</span><h3>Kütüphane</h3><span class="muted small">Seviyeli klasikler, cümle cümle Türkçesiyle</span></a>
          <a class="card shortcut" href="#profil"><span class="ico">${ICON.user}</span><span class="arrow-dot">${ICON.arrow}</span><h3>Profil</h3><span class="muted small">Listelerin, okuduğun kitaplar, gelişimin</span></a>
        </div>
      </div>

      ${later ? `<div class="card row" style="justify-content:space-between"><div><h3>${later} kelime tekrar bekliyor</h3><span class="muted small">“Sonra öğren” listendeki kelimeler</span></div><button class="btn primary" id="cards">${ICON.cards}Kartlarla tekrar et</button></div>` : ''}
    </div>`;
    root.querySelector('#cards')?.addEventListener('click', () => flashcards());
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
        parts.push(`<a class="card continue" href="#kitap-${b.id}"><div style="width:96px;flex:none;border-radius:10px;overflow:hidden">${coverHTML(b).replace('class="cover"', 'class="cover" style="aspect-ratio:3/4;padding:8px;font-size:.7rem"')}</div><div class="section" style="gap:6px;flex:1;min-width:0"><span class="eyebrow">Okumaya devam et</span><h3>${esc(b.title)}</h3><div class="bar"><i style="width:${pct}%"></i></div><span class="muted small">%${pct} okundu</span></div></a>`);
      }
      const lastTopic = Object.entries(s.topics).filter(([, v]) => v.read && !v.learned).sort((a, b) => b[1].read - a[1].read)[0];
      if (lastTopic) parts.push(`<a class="card continue" href="#konu-${esc(lastTopic[0])}"><span class="ico" style="width:44px;height:44px;border-radius:10px;display:grid;place-items:center;background:var(--cobalt-soft);color:var(--cobalt)">${ICON.topic}</span><div class="section" style="gap:4px"><span class="eyebrow">Son çalıştığın konu</span><h3>${esc(lastTopic[1].title)}</h3></div></a>`);
      if (!parts.length && bi?.books[0]) {
        const b = bi.books[0];
        parts.push(`<a class="card continue" href="#kitap-${b.id}"><div style="width:96px;flex:none;border-radius:10px;overflow:hidden">${coverHTML(b).replace('class="cover"', 'class="cover" style="aspect-ratio:3/4;padding:8px;font-size:.7rem"')}</div><div class="section" style="gap:6px"><span class="eyebrow">Okumaya başla</span><h3>${esc(b.title)}</h3><span class="muted small">${esc(b.desc)}</span></div></a>`);
      }
      box.outerHTML = `<div class="two">${parts.join('')}</div>`;
    });

    wordOfDay().then((e) => {
      const box = root.querySelector('#wotd');
      if (!box || !e) return;
      const ex = e.x?.[0];
      const m = ex && formRegex(e).exec(ex[0]);
      const exH = ex ? (m ? esc(ex[0].slice(0, m.index)) + '<b>' + esc(m[0]) + '</b>' + esc(ex[0].slice(m.index + m[0].length)) : esc(ex[0])) : '';
      const lat = store.word(e.w).later;
      box.innerHTML = `<div class="section" style="gap:8px;min-width:0"><span class="eyebrow muted">Günün kelimesi · ${level(e.r)}${e.y ? ' · YDS’de sık' : ''}</span><div class="wotd-word"><span>${esc(e.w)}</span></div><p style="font-size:1.1rem">${esc((e.t || []).slice(0, 2).join('; '))}</p></div>
        <div class="row" style="align-self:start"><button class="icon-btn" id="w-s" aria-label="Dinle" style="background:transparent;color:inherit">${ICON.speak}</button></div>
        ${ex ? `<div class="wotd-ex">${exH}<div class="muted" style="font-style:normal;font-family:var(--f-body)">${esc(ex[1])}</div></div>` : ''}
        <div class="row" style="grid-column:1/-1"><button class="btn sm" id="w-more">Ayrıntılar${ICON.arrow}</button><button class="btn sm" id="w-later">${ICON.clock}${lat ? 'Listede' : 'Sonra öğren'}</button></div>`;
      box.querySelector('#w-s').onclick = () => speak(e.w);
      box.querySelector('#w-more').onclick = () => window.lugat.lookupWord(e.w);
      box.querySelector('#w-later').onclick = (ev) => { const on = !store.word(e.w).later; store.setWordFlag(e.w, 'later', on, e.t?.[0]); toast(on ? 'Sonra öğren listesine eklendi' : 'Listeden çıkarıldı'); };
    }).catch(() => {});
  };
  draw();
  // Profil hesaptan yüklenince (durum nesnesi değişir) ana sayfayı tazele
  let ref = store.state;
  off = store.on((st) => { if (st !== ref) { ref = st; draw(); } });
}
