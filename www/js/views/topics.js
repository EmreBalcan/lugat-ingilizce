import { store } from '../store.js';
import { esc, rich, ICON, speak, toast, loading, questionHTML, wireQuestions } from '../ui.js';

const cache = new Map();
const get = (url) => (cache.has(url) ? cache.get(url) : cache.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })).get(url));
export const topicIndex = () => get('data/topics/index.json');

let filter = '';
let openCats = null; // açık kategoriler: telefonda hepsi kapalı, masaüstünde açık başlar

export function render(root, id) {
  if (id) return detail(root, id);
  list(root);
}

function dots(id) {
  const s = store.topic(id);
  return `<span class="topic-state" aria-hidden="true">${s.learned ? '<i class="dot ok"></i>' : ''}${s.fav ? '<i class="dot fav"></i>' : ''}${s.later ? '<i class="dot later"></i>' : ''}${!s.learned && !s.fav && !s.later && s.read ? '<i class="dot"></i>' : ''}</span>`;
}

async function list(root) {
  root.innerHTML = `<div class="wrap narrow">
    <div class="section"><span class="eyebrow">Konu anlatımı</span><h1>Konular</h1>
    <p class="muted">Her konuda kısa anlatım, yapı tablosu, kullanım yerleri, en az 10 çevirili örnek ve YDS/YÖKDİL tarzı sorular var.</p></div>
    <div class="search"><input id="tf" type="search" placeholder="Konu ara: perfect, although, passive…" aria-label="Konu ara" value="${esc(filter)}"></div>
    <div id="cats">${loading()}</div>
    <p class="muted small"><i class="dot ok" style="display:inline-block"></i> öğrenildi &nbsp; <i class="dot fav" style="display:inline-block"></i> favori &nbsp; <i class="dot later" style="display:inline-block"></i> sonra çalışılacak</p>
  </div>`;
  const idx = await topicIndex().catch(() => null);
  const box = root.querySelector('#cats');
  if (!box) return; // yüklenirken başka sayfaya geçildi
  if (!idx) { box.innerHTML = '<div class="empty">Konu listesi yüklenemedi.</div>'; return; }
  if (!openCats) openCats = new Set(matchMedia('(max-width: 820px)').matches ? [] : idx.cats.map((c) => c.id));
  const draw = () => {
    const f = filter.toLocaleLowerCase('tr');
    const cats = idx.cats.map((c) => ({ ...c, topics: c.topics.filter((t) => !f || (t.title + ' ' + t.tr).toLocaleLowerCase('tr').includes(f)) })).filter((c) => c.topics.length);
    box.innerHTML = cats.length ? cats.map((c) => {
      const open = f || openCats.has(c.id);
      const learned = c.topics.filter((t) => store.topic(t.id).learned).length;
      return `<div class="cat">
      <button class="cat-toggle" data-cat="${c.id}" aria-expanded="${!!open}">
        <span class="t"><b>${esc(c.title)}</b><span class="muted small">${c.topics.length} konu${learned ? ` · ${learned} öğrenildi` : ''}</span></span>
        <span class="chev">${ICON.chevron}</span>
      </button>
      <div class="cat-body" ${open ? '' : 'hidden'}>
        ${c.desc ? `<p class="muted small">${esc(c.desc)}</p>` : ''}
        <div class="card list" style="padding:0">${c.topics.map((t) => `<a class="topic-link" href="#konu-${t.id}"><div class="t"><b>${esc(t.title)}</b><span class="muted small">${esc(t.tr)}</span></div>${dots(t.id)}<span class="badge">${esc(t.level)}</span></a>`).join('')}</div>
      </div>
    </div>`;
    }).join('') : '<div class="empty">Bu aramaya uyan konu yok.</div>';
  };
  draw();
  root.querySelector('#tf').addEventListener('input', (e) => { filter = e.target.value; draw(); });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('.cat-toggle');
    if (!b || filter) return;
    const id = b.dataset.cat;
    if (openCats.has(id)) openCats.delete(id); else openCats.add(id);
    b.setAttribute('aria-expanded', openCats.has(id));
    b.nextElementSibling.hidden = !openCats.has(id);
  });
}

function flagBar(id, title) {
  const s = store.topic(id);
  return `<div class="word-actions" id="tflags">
    <button class="btn sm ${s.later ? 'on' : ''}" data-flag="later">${ICON.clock}${s.later ? 'Listede' : 'Sonra çalış'}</button>
    <button class="btn sm ${s.fav ? 'on' : ''}" data-flag="fav">${ICON.star}Favori</button>
    <button class="btn sm ${s.learned ? 'ok-on' : ''}" data-flag="learned">${ICON.check}${s.learned ? 'Öğrendim' : 'Öğrendim olarak işaretle'}</button>
  </div>`;
}

async function detail(root, id) {
  root.innerHTML = `<div class="wrap narrow">${loading('Konu yükleniyor')}</div>`;
  let t, idx;
  try { [t, idx] = await Promise.all([get(`data/topics/${id}.json`), topicIndex()]); }
  catch { root.innerHTML = `<div class="wrap narrow"><a class="back" href="#konular">${ICON.back}Konular</a><div class="empty">Bu konu bulunamadı.</div></div>`; return; }
  store.topicOpened(id, t.title);
  const qs = t.exam.q.map((q) => ({ stem: q.q, options: q.o, a: q.a, e: q.e }));
  const cat = idx.cats.find((c) => c.topics.some((x) => x.id === id));
  const all = idx.cats.flatMap((c) => c.topics);
  const i = all.findIndex((x) => x.id === id);
  const prev = all[i - 1], next = all[i + 1];

  root.innerHTML = `<div class="wrap narrow">
    <a class="back" href="#konular">${ICON.back}Konular</a>
    <div class="section">
      <span class="eyebrow">${esc(cat?.title || '')}</span>
      <h1>${esc(t.title)}</h1>
      <div class="row"><span class="badge lvl">${esc(t.level)}</span><span class="muted">${esc(t.tr)}</span></div>
      <div id="flagbox">${flagBar(id, t.title)}</div>
    </div>

    <div class="section"><h2>Kısaca</h2>${t.summary.map((p) => `<p>${rich(p)}</p>`).join('')}</div>

    ${t.form?.length ? `<div class="section"><h2>Yapı</h2><div class="card formula"><table><thead><tr><th>Biçim</th><th>Kalıp</th><th>Örnek</th></tr></thead><tbody>${t.form.map((r) => `<tr><td>${esc(r[0])}</td><td>${rich(r[1])}</td><td>${rich(r[2] || '')}</td></tr>`).join('')}</tbody></table></div></div>` : ''}

    <div class="section"><h2>Nerede kullanılır?</h2><div class="card">${t.uses.map((u, k) => `<div class="use"><span class="use-n">${k + 1}</span><div><b>${esc(u.t)}</b><p class="muted">${rich(u.d)}</p></div>${u.ex ? `<div class="ex-en">${rich(u.ex[0])}</div><div class="ex-tr">${esc(u.ex[1])}</div>` : ''}</div>`).join('')}</div></div>

    <div class="section"><div class="section-head"><h2>Örnekler</h2><span class="muted small">${t.examples.length} örnek</span></div>
      <div class="card ex-list">${t.examples.map(([en, tr]) => `<div class="ex"><div class="ex-en">${rich(en)}</div><div class="ex-tr">${esc(tr)}</div><button class="icon-btn" data-speak="${esc(en.replace(/\*\*/g, ''))}" aria-label="Dinle">${ICON.speak}</button></div>`).join('')}</div>
    </div>

    ${t.signals?.length ? `<div class="section"><h2>İpucu kelimeler</h2><div class="chips">${t.signals.map((s) => `<button class="chip" data-word="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>` : ''}

    ${t.notes?.length ? `<div class="section"><h2>Dikkat</h2><div class="note"><ul class="note-list">${t.notes.map((n) => `<li>${rich(n)}</li>`).join('')}</ul></div></div>` : ''}

    <div class="section"><h2>YDS / YÖKDİL’de bu konu</h2>
      <p>${rich(t.exam.how)}</p>
      <div class="card section" id="tq"><p class="muted small">Aşağıdakiler YDS/YÖKDİL soru biçiminde hazırlanmış alıştırma sorularıdır, gerçek ÖSYM soruları değildir.</p>${qs.map(questionHTML).join('')}</div>
    </div>

    <div class="chapter-nav">
      ${prev ? `<a class="btn" href="#konu-${prev.id}">${ICON.back}${esc(prev.title)}</a>` : '<span></span>'}
      ${next ? `<a class="btn" href="#konu-${next.id}">${esc(next.title)}${ICON.arrow}</a>` : ''}
    </div>
  </div>`;

  root.querySelectorAll('[data-speak]').forEach((b) => b.addEventListener('click', () => speak(b.dataset.speak)));
  root.querySelectorAll('[data-word]').forEach((b) => b.addEventListener('click', () => window.lugat.lookupWord(b.dataset.word)));
  wireQuestions(root.querySelector('#tq'), qs, (ok) => store.quizAnswered(ok));
  const fb = root.querySelector('#flagbox');
  fb.addEventListener('click', (e) => {
    const b = e.target.closest('[data-flag]');
    if (!b) return;
    const on = !store.topic(id)[b.dataset.flag];
    store.setTopicFlag(id, b.dataset.flag, on, t.title);
    toast(on ? { later: 'Sonra çalışılacaklara eklendi', fav: 'Favorilere eklendi', learned: 'Öğrendiklerine eklendi' }[b.dataset.flag] : 'Listeden çıkarıldı');
    fb.innerHTML = flagBar(id, t.title);
  });
}
