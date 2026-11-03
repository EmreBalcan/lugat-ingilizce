import { lookup, getTr, suggest, loadIndex, level, POS, framePatterns, formRegex, makeQuestions, meta } from '../dict.js';
import { store } from '../store.js';
import { esc, ICON, speak, toast, loading, questionHTML, wireQuestions } from '../ui.js';

let query = '';
let backTo = null; // kelimeye sözlükten gelindiyse geri dönüş bağlantısı
export function setQuery(q, back = null) { query = q; backTo = back; }

export function render(root) {
  const back = backTo;
  backTo = null;
  root.innerHTML = `<div class="wrap narrow">
    ${back ? `<a class="back" href="#${back.hash}">${ICON.back}${esc(back.label)}</a>` : ''}
    <div class="section"><span class="eyebrow">İngilizce ⇄ Türkçe sözlük</span><h1>Çeviri</h1></div>
    <form class="search" id="sform" autocomplete="off">
      <input id="q" type="search" placeholder="Kelime yaz: evidence, give up, vazgeçmek…" aria-label="Aranacak kelime" value="${esc(query)}" enterkeyhint="search" spellcheck="false" autocapitalize="off">
      <button class="go" aria-label="Ara">${ICON.search}</button>
      <div class="suggest" id="sug" hidden></div>
    </form>
    <div id="res"></div>
  </div>`;
  const input = root.querySelector('#q');
  const sug = root.querySelector('#sug');
  const res = root.querySelector('#res');
  let act = -1, items = [], timer;

  const run = (q) => { query = q; input.value = q; sug.hidden = true; show(res, q); };
  root.querySelector('#sform').addEventListener('submit', (e) => {
    e.preventDefault();
    if (act >= 0 && items[act]) run(items[act][0]); else if (input.value.trim()) run(input.value);
    input.blur();
  });
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      items = await suggest(input.value, 7);
      act = -1;
      sug.innerHTML = items.map((r, i) => `<button type="button" data-i="${i}"><b>${esc(r[0])}</b><span>${esc(r[3])}</span></button>`).join('');
      sug.hidden = !items.length || document.activeElement !== input;
    }, 110);
  });
  input.addEventListener('keydown', (e) => {
    if (sug.hidden || !items.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      act = (act + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      sug.querySelectorAll('button').forEach((b, i) => b.classList.toggle('act', i === act));
    }
  });
  input.addEventListener('blur', () => setTimeout(() => (sug.hidden = true), 150));
  sug.addEventListener('mousedown', (e) => e.preventDefault());
  sug.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) run(items[+b.dataset.i][0]); });
  res.addEventListener('click', (e) => {
    const s = e.target.closest('[data-search]');
    if (s) { e.preventDefault(); run(s.dataset.search); window.scrollTo(0, 0); }
  });

  if (query) show(res, query);
  else { home(res); if (matchMedia('(min-width: 821px)').matches) input.focus(); }
  loadIndex();
}

async function home(res) {
  const h = store.state.history.slice(0, 14);
  const m = await meta().catch(() => null);
  res.innerHTML = `<div class="section">
    ${h.length ? `<div class="section-head"><h2>Son aramalar</h2></div><div class="chips">${h.map((x) => `<button class="chip" data-search="${esc(x.w)}">${esc(x.w)}</button>`).join('')}</div>` : ''}
    <div class="card section">
      <h3>Neler var?</h3>
      <p class="muted">Her kelime için Türkçe anlamlar, örnek cümleler ve çevirileri, eş ve zıt anlamlılar, sık kullanılan kalıplar, İngilizce tanımlar ve YDS tarzı sorular. Hepsi uygulamanın içindeki sözlükten gelir, internete ya da yapay zekâya sorulmaz.</p>
      ${m ? `<div class="chips"><span class="chip static">${m.indexed.toLocaleString('tr')} İngilizce kelime</span><span class="chip static">${m.tr.toLocaleString('tr')} Türkçe arama</span><span class="chip static">${m.sentences.toLocaleString('tr')} örnek cümle</span></div>` : ''}
      <div class="chips"><span class="muted small">Dene:</span>${['evidence', 'give up', 'although', 'went', 'vazgeçmek', 'sürdürülebilir'].map((w) => `<button class="chip" data-search="${w}">${w}</button>`).join('')}</div>
    </div>
  </div>`;
}

async function show(res, q) {
  res.innerHTML = loading('Sözlükte aranıyor');
  let r;
  try { r = await lookup(q); } catch (e) { res.innerHTML = `<div class="empty">Sözlük dosyası okunamadı. Bağlantını kontrol edip tekrar dene.</div>`; return; }
  if (r.kind === 'en') return showEntry(res, r);
  if (r.kind === 'tr') return showTr(res, r);
  const near = await suggest(q.slice(0, Math.max(2, q.length - 2)), 8);
  res.innerHTML = `<div class="empty"><b>“${esc(q)}”</b> sözlükte bulunamadı.${near.length ? `<div class="chips" style="justify-content:center;margin-top:12px">${near.map((n) => `<button class="chip" data-search="${esc(n[0])}">${esc(n[0])}</button>`).join('')}</div>` : ''}</div>`;
}

function flagButtons(w, tr) {
  const s = store.word(w);
  return `<div class="word-actions" data-w="${esc(w)}" data-tr="${esc(tr || '')}">
    <button class="btn sm ${s.later ? 'on' : ''}" data-flag="later">${ICON.clock}${s.later ? 'Listede' : 'Sonra öğren'}</button>
    <button class="btn sm ${s.fav ? 'on' : ''}" data-flag="fav">${ICON.star}Favori</button>
    <button class="btn sm ${s.learned ? 'ok-on' : ''}" data-flag="learned">${ICON.check}${s.learned ? 'Öğrendim' : 'Öğrendim olarak işaretle'}</button>
  </div>`;
}
export function wireFlags(root) {
  root.querySelectorAll('.word-actions').forEach((box) => box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-flag]');
    if (!b) return;
    const w = box.dataset.w, f = b.dataset.flag;
    const on = !store.word(w)[f];
    store.setWordFlag(w, f, on, box.dataset.tr);
    toast(on ? { later: 'Sonra öğren listesine eklendi', fav: 'Favorilere eklendi', learned: 'Öğrendiklerine eklendi' }[f] : 'Listeden çıkarıldı');
    box.outerHTML = flagButtons(w, box.dataset.tr);
    wireFlags(root);
  }, { once: true }));
}

function highlight(en, re) {
  const m = re.exec(en);
  if (!m) return esc(en);
  return esc(en.slice(0, m.index)) + '<mark>' + esc(m[0]) + '</mark>' + esc(en.slice(m.index + m[0].length));
}

async function showEntry(res, { entry: e, from, alsoTr }) {
  store.logLookup(e.w, e.t?.[0]);
  const re = formRegex(e);
  const lv = level(e.r);
  const pos = [...(e.p || '')].map((p) => POS[p]).filter(Boolean);
  const ex = (e.x || []).map(([en, tr]) => ({ en, tr }));
  // Tatoeba'da 5'ten az örnek varsa WordNet'in İngilizce örnekleriyle tamamla
  if (ex.length < 5) for (const d of e.d || []) for (const s of d.e) if (ex.length < 8) ex.push({ en: s, tr: null });
  const pats = framePatterns(e);
  const forms = [];
  if (!e.w.includes(' ')) {
    if (e.p?.includes('v')) forms.push(['Fiil halleri', e.i ? `${e.w} – ${e.i[0]} – ${e.i[1]}` : null]);
  }
  const defs = e.d || [];

  res.innerHTML = `<div class="section" style="gap:26px">
    <div class="word-head">
      ${from ? `<p class="muted small">“${esc(from)}” kelimesinin kökü gösteriliyor</p>` : ''}
      <div class="word-title"><h1>${esc(e.w)}</h1><button class="icon-btn" data-speak="${esc(e.w)}" aria-label="Telaffuzu dinle">${ICON.speak}</button></div>
      <div class="row">
        <span class="badge lvl" title="Kelimenin örnek cümlelerdeki sıklığına göre tahmin">${lv}</span>
        ${pos.map((p) => `<span class="badge">${p}</span>`).join('')}
        ${e.y ? '<span class="badge yds">YDS’de sık</span>' : ''}
        ${e.r ? `<span class="muted small">Sıklık sırası: ${e.r.toLocaleString('tr')}</span>` : ''}
      </div>
      ${flagButtons(e.w, e.t?.[0])}
      ${alsoTr ? `<p class="small"><button class="chip" data-search-tr="${esc(alsoTr)}">“${esc(alsoTr)}” Türkçe kelime olarak da var: karşılıklarını gör</button></p>` : ''}
    </div>

    ${e.t ? `<div class="section"><h2>Türkçe anlamları</h2><ol class="meanings">${e.t.slice(0, 12).map((t) => `<li>${esc(t)}</li>`).join('')}</ol></div>` : ''}

    ${forms.filter((f) => f[1]).map((f) => `<div class="note"><b>${f[0]}:</b> ${esc(f[1])} <span class="muted small">(düzensiz fiil)</span></div>`).join('')}

    <div class="section">
      <div class="section-head"><h2>Örnek cümleler</h2><span class="muted small">${ex.length} örnek</span></div>
      ${ex.length ? `<div class="card ex-list">${ex.map((x) => `<div class="ex"><div class="ex-en">${highlight(x.en, re)}</div><div class="ex-tr">${x.tr ? esc(x.tr) : '<i>İngilizce örnek (WordNet), çevirisi yok</i>'}</div><button class="icon-btn" data-speak="${esc(x.en)}" aria-label="Cümleyi dinle">${ICON.speak}</button></div>`).join('')}</div>` : '<div class="empty">Bu kelime için örnek cümle bulunamadı.</div>'}
    </div>

    ${(e.c?.length || pats.length) ? `<div class="section"><h2>Kullanım biçimi</h2>
      <div class="two">
        ${e.c?.length ? `<div class="card"><h3>Sık birlikte kullanıldığı edatlar</h3><div class="list">${e.c.map(([p, n]) => `<div class="pattern"><code>${esc(p)} …</code><span class="muted small">${n} örnekte</span></div>`).join('')}</div></div>` : ''}
        ${pats.length ? `<div class="card"><h3>Cümle kalıpları</h3><div class="list">${pats.map((p) => `<div class="pattern"><code>${esc(p.en)}</code>${p.tr ? `<span class="muted small">${esc(p.tr)}</span>` : ''}</div>`).join('')}</div></div>` : ''}
      </div></div>` : ''}

    ${defs.length ? `<div class="section"><h2>İngilizce tanımlar</h2><div class="card defs">${defs.map((d) => `<div class="def"><span class="badge">${POS[d.p] || ''}</span><div>${esc(d.d)}${d.e.length ? `<em>“${esc(d.e[0])}”</em>` : ''}</div></div>`).join('')}</div></div>` : ''}

    ${(e.s?.length || e.a?.length) ? `<div class="two">
      ${e.s?.length ? `<div class="section"><h2>Eş anlamlılar</h2><div class="chips">${e.s.map((s) => `<button class="chip" data-search="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>` : ''}
      ${e.a?.length ? `<div class="section"><h2>Zıt anlamlılar</h2><div class="chips">${e.a.map((s) => `<button class="chip" data-search="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>` : ''}
    </div>` : ''}

    ${e.h?.length ? `<div class="section"><h2>Deyimler ve kalıplar</h2><div class="card list">${e.h.map((h) => `<div class="pattern"><span>${esc(h)}</span></div>`).join('')}</div></div>` : ''}

    <div class="section" id="yds"><div class="section-head"><h2>YDS / YÖKDİL</h2>${e.y ? '<span class="badge yds">Okuma parçalarında sık geçer</span>' : ''}</div><div id="yds-body">${loading('Sorular hazırlanıyor')}</div></div>

    <p class="muted small">Kaynaklar: FreeDict (Türkçe anlamlar), Wiktionary, Princeton WordNet (tanım, eş/zıt anlam, kalıp), Tatoeba (örnek cümleler, CC-BY 2.0).</p>
  </div>`;

  res.querySelectorAll('[data-speak]').forEach((b) => b.addEventListener('click', () => speak(b.dataset.speak)));
  res.querySelector('[data-search-tr]')?.addEventListener('click', async (ev) => {
    const key = ev.currentTarget.dataset.searchTr;
    const tr = await getTr(key).catch(() => null);
    if (tr) showTr(res, { tr, key });
  });
  wireFlags(res);

  const qs = await makeQuestions(e, 4);
  const body = res.querySelector('#yds-body');
  if (!body) return;
  body.innerHTML = qs.length
    ? `<div class="card section"><p class="muted small">Sorular sözlük verisinden YDS biçiminde otomatik üretilir ve her gün değişir. Boşluk doldurma ve çeviri sorularında yukarıdaki örneklerde olmayan cümleler kullanılır. Gerçek ÖSYM sorusu değildir.</p>${qs.map(questionHTML).join('')}</div>`
    : `<div class="empty">Bu kelime için soru üretilecek kadar örnek cümle yok.</div>`;
  wireQuestions(body, qs, (ok) => store.quizAnswered(ok));
}

async function showTr(res, { tr, key }) {
  const { map } = await loadIndex();
  store.logLookup(key, tr.e.slice(0, 3).join(', '));
  res.innerHTML = `<div class="section" style="gap:26px">
    <div class="word-head"><span class="eyebrow">Türkçe → İngilizce</span><div class="word-title"><h1>${esc(key)}</h1><button class="icon-btn" data-speak="${esc(key)}" aria-label="Dinle">${ICON.speak}</button></div></div>
    <div class="section"><h2>İngilizce karşılıkları</h2>
      <div class="card list">${tr.e.map((w) => { const r = map.get(w); return `<div class="item"><div class="t"><a data-search="${esc(w)}" href="#ceviri">${esc(w)}</a><span>${esc(r ? r[3] : '')}</span></div>${r ? `<span class="badge lvl">${level(r[1])}</span>` : ''}</div>`; }).join('')}</div>
      <p class="muted small">Bir karşılığa dokunarak anlamlarını, örnek cümlelerini ve kullanımını gör.</p>
    </div>
    ${tr.g?.length ? `<div class="section"><h2>Wiktionary tanımı</h2><div class="card"><ol class="meanings">${tr.g.map((g) => `<li>${esc(g)}</li>`).join('')}</ol></div></div>` : ''}
  </div>`;
  res.querySelector('[data-speak]').addEventListener('click', (ev) => speak(ev.currentTarget.dataset.speak, 'tr-TR'));
}
