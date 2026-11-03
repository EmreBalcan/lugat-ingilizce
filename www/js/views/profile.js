import { store, today } from '../store.js';
import { esc, ICON, toast, openSheet, closeSheet, speak } from '../ui.js';
import { bookIndex } from './library.js';
import { THEMES, getTheme, setTheme, themeIcon } from '../theme.js';

let tab = 'words', sub = 'later';

export function render(root) {
  const draw = async () => {
    const s = store.state;
    const words = Object.entries(s.words);
    const topics = Object.entries(s.topics);
    const idx = await bookIndex().catch(() => ({ books: [] }));
    const bookMeta = new Map(idx.books.map((b) => [b.id, b]));
    const books = Object.entries(s.books).filter(([id]) => bookMeta.has(id));
    const d = store.day();
    const count = (arr, f) => arr.filter(([, v]) => v[f]).length;

    const days = [...Array(7)].map((_, i) => { const x = new Date(); x.setDate(x.getDate() - (6 - i)); return today(x); });
    const score = (k) => { const x = s.days[k]; return x ? x.lw.length + x.topics.length * 3 + x.quiz + Math.round(x.sentences / 10) : 0; };
    const max = Math.max(5, ...days.map(score));
    const dayName = (k) => new Date(k + 'T12:00').toLocaleDateString('tr', { weekday: 'short' });

    const flagLabel = { later: 'Sonra öğren', fav: 'Favoriler', learned: 'Öğrendiklerim' };
    let body = '';
    if (tab === 'words' || tab === 'topics') {
      const src = tab === 'words' ? words : topics;
      const rows = src.filter(([, v]) => v[sub]).sort((a, b) => b[1][sub] - a[1][sub]);
      body = `<div class="tabs" id="sub">${Object.entries(flagLabel).map(([k, l]) => `<button class="${k === sub ? 'on' : ''}" data-s="${k}">${l} (${count(src, k)})</button>`).join('')}</div>
        ${tab === 'words' && sub === 'later' && rows.length ? `<button class="btn primary" id="cards" style="align-self:flex-start">${ICON.cards}Kartlarla tekrar et</button>` : ''}
        ${rows.length ? `<div class="card list" style="padding:4px 14px">${rows.map(([k, v]) => tab === 'words'
          ? `<div class="item"><div class="t"><a href="#ceviri" data-word="${esc(k)}">${esc(k)}</a><span>${esc(v.tr || '')}</span></div><button class="btn sm ghost" data-rm="${esc(k)}" aria-label="Listeden çıkar">Çıkar</button></div>`
          : `<div class="item"><div class="t"><a href="#konu-${esc(k)}">${esc(v.title || k)}</a><span>${v.read ? 'Son açılış: ' + new Date(v.read).toLocaleDateString('tr') : ''}</span></div><button class="btn sm ghost" data-rmt="${esc(k)}">Çıkar</button></div>`).join('')}</div>`
          : `<div class="empty">Bu liste boş. ${tab === 'words' ? 'Çeviri ekranında ya da okurken bir kelimeyi işaretleyince burada görünür.' : 'Bir konu sayfasındaki düğmelerle ekleyebilirsin.'}</div>`}`;
    } else if (tab === 'books') {
      const reading = books.filter(([, v]) => !v.done), done = books.filter(([, v]) => v.done);
      const row = ([id, v]) => { const b = bookMeta.get(id); const pct = Math.round((100 * (v.seen || 0)) / b.sentences); return `<div class="item"><div class="t"><a href="#kitap-${id}">${esc(b.title)}</a><span>${esc(b.author)} · ${v.done ? 'Bitirildi ' + new Date(v.done).toLocaleDateString('tr') : '%' + pct}</span></div><span class="badge lvl">${esc(b.level)}</span></div>`; };
      body = `<h3>Okunuyor (${reading.length})</h3>${reading.length ? `<div class="card list" style="padding:4px 14px">${reading.map(row).join('')}</div>` : '<div class="empty">Şu an okuduğun kitap yok. <a href="#kutuphane">Kütüphaneye göz at</a>.</div>'}
        <h3>Bitirilen (${done.length})</h3>${done.length ? `<div class="card list" style="padding:4px 14px">${done.map(row).join('')}</div>` : '<div class="empty">Henüz bitirilen kitap yok.</div>'}`;
    } else if (tab === 'history') {
      body = s.history.length ? `<div class="card list" style="padding:4px 14px">${s.history.map((h) => `<div class="item"><div class="t"><a href="#ceviri" data-word="${esc(h.w)}">${esc(h.w)}</a><span>${esc(h.tr || '')}</span></div><span class="muted small">${new Date(h.at).toLocaleDateString('tr')}</span></div>`).join('')}</div>` : '<div class="empty">Henüz arama yapmadın.</div>';
    } else if (tab === 'goals') {
      const G = [['lookups', 'Günlük aranacak kelime'], ['topics', 'Günlük çalışılacak konu'], ['sentences', 'Günlük okunacak cümle'], ['quiz', 'Günlük çözülecek soru']];
      body = `<div class="card section"><h3>Görünüm</h3>
        <div class="theme-switch" id="theme-sw">${THEMES.map(([k, l]) => `<button class="${getTheme() === k ? 'on' : ''}" data-th="${k}">${themeIcon(k)}${l}</button>`).join('')}</div>
        <p class="muted small">Sistem seçiliyken cihazının açık/koyu ayarına uyar.</p></div>
        ${navigator.serviceWorker?.controller ? `<div class="card section"><h3>İnternetsiz kullanım</h3>
          <p class="muted small">Sözlüğü internetsiz kullanmak için (~35 MB).</p>
          <div class="row"><button class="btn primary" id="offline-dl">Sözlüğü indir</button><span class="muted small" id="offline-st"></span></div></div>` : ''}
        <div class="card section"><h3>Günlük hedefler</h3>${G.map(([k, l]) => `<label class="goal-edit" for="g-${k}"><span>${l}</span><input id="g-${k}" type="number" min="1" max="500" value="${s.goals[k]}" data-goal="${k}"></label>`).join('')}
        <p class="muted small">Hedefler ana sayfadaki renkli kartlarda görünür.</p></div>`;
    }

    root.innerHTML = `<div class="wrap narrow">
      <div class="section"><span class="eyebrow">Kişisel gelişim</span><h1>Profil</h1></div>
      <div class="stats">
        <div class="card stat"><b>${store.streak()}</b><span class="muted small">günlük seri</span></div>
        <div class="card stat"><b>${count(words, 'learned')}</b><span class="muted small">öğrenilen kelime</span></div>
        <div class="card stat"><b>${count(topics, 'learned')}</b><span class="muted small">öğrenilen konu</span></div>
        <div class="card stat"><b>${books.filter(([, v]) => v.done).length}</b><span class="muted small">bitirilen kitap</span></div>
      </div>
      <div class="card section">
        <div class="section-head"><h3>Son 7 gün</h3><span class="muted small">Bugün: ${d.lw.length} kelime · ${d.sentences} cümle · ${d.topics.length} konu · ${d.quiz} soru (${d.correct} doğru)</span></div>
        <div class="week">${days.map((k) => `<div class="col ${k === today() ? 'today' : ''}" title="${score(k)} puan"><i style="height:${Math.round((100 * score(k)) / max)}%"></i>${dayName(k)}</div>`).join('')}</div>

      </div>
      <div class="tabs" id="tabs">${[['words', 'Kelimeler'], ['topics', 'Konular'], ['books', 'Kitaplar'], ['history', 'Geçmiş'], ['goals', 'Ayarlar']].map(([k, l]) => `<button class="${k === tab ? 'on' : ''}" data-t="${k}">${l}</button>`).join('')}</div>
      <div class="section">${body}</div>
      <p class="muted small">${window.claude?.use ? 'İlerlemen claude.ai hesabına özel olarak kaydedilir.' : 'İlerlemen bu cihazda kaydedilir.'}</p>
    </div>`;

    root.querySelector('#tabs').onclick = (e) => { const b = e.target.closest('button'); if (b) { tab = b.dataset.t; draw(); } };
    root.querySelector('#sub')?.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { sub = b.dataset.s; draw(); } });
    root.querySelectorAll('[data-word]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); window.lugat.lookupWord(a.dataset.word); }));
    root.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => { store.setWordFlag(b.dataset.rm, sub, false); toast('Listeden çıkarıldı'); draw(); }));
    root.querySelectorAll('[data-rmt]').forEach((b) => b.addEventListener('click', () => { store.setTopicFlag(b.dataset.rmt, sub, false); toast('Listeden çıkarıldı'); draw(); }));
    root.querySelectorAll('[data-goal]').forEach((i) => i.addEventListener('change', () => { store.setGoal(i.dataset.goal, +i.value); toast('Hedef kaydedildi'); }));
    root.querySelector('#cards')?.addEventListener('click', () => flashcards(draw));
    root.querySelector('#offline-dl')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget, st = root.querySelector('#offline-st');
      btn.disabled = true;
      const urls = [...Array(128)].map((_, i) => `data/dict/en/${i}.json`).concat([...Array(32)].map((_, i) => `data/dict/tr/${i}.json`));
      let done = 0, failed = 0;
      for (let i = 0; i < urls.length; i += 6) {
        await Promise.all(urls.slice(i, i + 6).map((u) => fetch(u).then((r) => { if (!r.ok) failed++; }).catch(() => failed++)));
        done = Math.min(urls.length, i + 6);
        st.textContent = `%${Math.round((100 * done) / urls.length)}`;
      }
      st.textContent = failed ? `${failed} dosya inmedi, bağlantını kontrol edip tekrar dene.` : 'Tamam: sözlük artık internetsiz çalışır.';
      btn.disabled = false;
    });
    root.querySelector('#theme-sw')?.addEventListener('click', (e) => { const b = e.target.closest('[data-th]'); if (b) { setTheme(b.dataset.th); draw(); } });
  };
  draw();
}

// "Sonra öğren" listesindeki kelimeleri kartlarla tekrar ettirir
export function flashcards(after) {
  const list = Object.entries(store.state.words).filter(([, v]) => v.later).map(([w, v]) => ({ w, tr: v.tr })).sort(() => Math.random() - 0.5);
  if (!list.length) { toast('Sonra öğren listen boş'); return; }
  let i = 0, known = 0;
  const body = openSheet('');
  const show = (open) => {
    if (i >= list.length) {
      body.innerHTML = `<div class="flash"><span class="eyebrow">Tekrar bitti</span><div class="big">${known} / ${list.length}</div><p class="muted">${known} kelimeyi “öğrendim” olarak işaretledin.</p><button class="btn primary" data-close>Kapat</button></div>`;
      after?.();
      return;
    }
    const c = list[i];
    body.innerHTML = `<div class="flash"><span class="eyebrow">Kart ${i + 1} / ${list.length}</span>
      <div class="big">${esc(c.w)}</div><button class="icon-btn" id="fc-s" aria-label="Dinle">${ICON.speak}</button>
      ${open ? `<p style="font-size:1.15rem">${esc(c.tr || 'Anlam kaydı yok')}</p>
        <div class="row" style="justify-content:center"><button class="btn" id="fc-again">Tekrar sor</button><button class="btn primary" id="fc-know">${ICON.check}Biliyorum</button></div>`
      : `<button class="btn primary" id="fc-open">Anlamını göster</button>`}
    </div>`;
    body.querySelector('#fc-s').onclick = () => speak(c.w);
    body.querySelector('#fc-open')?.addEventListener('click', () => show(true));
    body.querySelector('#fc-again')?.addEventListener('click', () => { list.push(c); i++; show(false); });
    body.querySelector('#fc-know')?.addEventListener('click', () => { store.setWordFlag(c.w, 'learned', true); known++; i++; show(false); });
  };
  show(false);
}
