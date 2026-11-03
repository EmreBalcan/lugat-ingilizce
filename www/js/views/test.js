// Günlük Test: her gün 25 soru (10 dilbilgisi + 15 kelime). Sorular tarihe göre seçilir; gün içinde sabit, ertesi gün yenilenir.
import { loadIndex, getEn, makeQuestions } from '../dict.js';
import { store, today } from '../store.js';
import { esc, rich, ICON, loading, toast } from '../ui.js';
import { topicIndex } from './topics.js';

const TOTAL = 25, GRAMMAR = 10;
const NAMES = new Set(['tom', 'mary', 'john', 'ken', 'jack', 'bill', 'jim', 'mike', 'bob', 'tony', 'alice', 'jane', 'paul', 'sam', 'dan', 'george', 'harry', 'peter', 'mark', 'joe', 'tim']);

function rng(seedStr) {
  let s = 0;
  for (const ch of seedStr) s = (Math.imul(s, 31) + ch.codePointAt(0)) >>> 0;
  s = s || 1;
  return () => ((s = (Math.imul(s, 48271) % 2147483647 + 2147483647) % 2147483647) / 2147483647);
}
const shuffle = (arr, r) => arr.map((v) => [r(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);

let cache = { key: null, qs: null };
export async function dailyTest(key = today()) {
  if (cache.key === key) return cache.qs;
  const r = rng('lugat-test-' + key);
  // 1) Dilbilgisi: konu anlatımlarındaki soru havuzundan
  const idx = await topicIndex();
  const metas = idx.cats.flatMap((c) => c.topics);
  const topics = await Promise.all(metas.map((t) => fetch(`data/topics/${t.id}.json`).then((x) => x.json())));
  const grammarPool = topics.flatMap((t) => t.exam.q.map((q) => ({ label: 'Dilbilgisi · ' + t.title, stem: q.q, options: q.o, a: q.a, e: q.e, topic: t.id })));
  const grammar = shuffle(grammarPool, r).slice(0, GRAMMAR);
  // 2) Kelime: sık kullanılan / YDS kelimelerinden, her kelimeden farklı türde bir soru
  const { rows } = await loadIndex();
  const pool = shuffle(rows.filter((x) => x[1] >= 150 && x[1] <= 9000 && /^[a-z]{3,}$/.test(x[0]) && !NAMES.has(x[0])), r);
  const vocab = [];
  const kinds = ['blank', 'meaning', 'reverse', 'synonym', 'translation', 'antonym'];
  for (let i = 0; i < pool.length && vocab.length < TOTAL - GRAMMAR && i < 80; i++) {
    const e = await getEn(pool[i][0]);
    if (!e) continue;
    const qs = await makeQuestions(e, 6);
    if (!qs.length) continue;
    const want = kinds[vocab.length % kinds.length];
    const q = qs.find((x) => x.kind === want) || qs[Math.floor(r() * qs.length)];
    vocab.push({ ...q, word: e.w });
  }
  const qs = shuffle([...grammar, ...vocab], r).slice(0, TOTAL);
  cache = { key, qs };
  return qs;
}

export function render(root) {
  root.innerHTML = `<div class="wrap narrow">${loading('Günün testi hazırlanıyor')}</div>`;
  const key = today();
  dailyTest(key).then((qs) => {
    if (!root.isConnected) return;
    const saved = store.test(key);
    const answers = saved?.answers?.length === qs.length ? [...saved.answers] : Array(qs.length).fill(null);
    let i = answers.findIndex((x) => x === null);
    if (i < 0) i = qs.length;
    draw(root, qs, answers, i, key);
  }).catch(() => { root.innerHTML = '<div class="wrap narrow"><div class="empty">Test hazırlanamadı. Bağlantını kontrol edip tekrar dene.</div></div>'; });
}

const dateLabel = (key) => new Date(key + 'T12:00').toLocaleDateString('tr', { day: 'numeric', month: 'long', weekday: 'long' });
const scoreOf = (qs, answers) => answers.reduce((n, a, k) => n + (a === qs[k].a ? 1 : 0), 0);

function draw(root, qs, answers, i, key) {
  const answered = answers.filter((a) => a !== null).length;
  if (i >= qs.length) return results(root, qs, answers, key);
  const q = qs[i];
  const mine = answers[i];
  root.innerHTML = `<div class="wrap narrow test">
    <div class="section" style="gap:6px"><span class="eyebrow">${esc(dateLabel(key))}</span><h1>Günlük Test</h1></div>
    <div class="test-progress">
      <span class="goal-num">${i + 1}<small> / ${qs.length}</small></span>
      <div class="bar"><i style="width:${Math.round((100 * answered) / qs.length)}%"></i></div>
      <span class="chip static">${scoreOf(qs, answers)} doğru</span>
    </div>
    <div class="card section q" data-q="0">
      <span class="badge q-kind">${esc(q.label)}</span>
      <div class="q-stem">${esc(q.stem).replace(/----/g, '<b class="blank">----</b>').replace(/\n/g, '<br>')}</div>
      <div class="q-opts">${q.options.map((o, k) => `<button class="q-opt ${mine !== null && k === q.a ? 'right' : ''} ${mine === k && k !== q.a ? 'wrong' : ''}" data-k="${k}" ${mine !== null ? 'disabled' : ''}><b>${'ABCDE'[k]})</b> ${esc(o)}</button>`).join('')}</div>
      <div class="q-exp ${mine === null ? '' : mine === q.a ? 'right-txt' : 'wrong-txt'}" ${mine === null ? 'hidden' : ''}>${mine === null ? '' : explain(q, mine)}</div>
    </div>
    <div class="chapter-nav">
      ${i > 0 ? `<button class="btn" id="t-prev">${ICON.back}Önceki</button>` : '<span></span>'}
      <button class="btn primary" id="t-next" ${mine === null ? 'hidden' : ''}>${i === qs.length - 1 ? 'Sonuçları gör' : 'Sonraki soru'}${ICON.arrow}</button>
    </div>
  </div>`;
  root.querySelectorAll('.q-opt').forEach((b) => b.addEventListener('click', () => {
    const k = +b.dataset.k;
    answers[i] = k;
    store.quizAnswered(k === q.a);
    const done = answers.every((a) => a !== null);
    store.saveTest({ answers: [...answers], done, score: scoreOf(qs, answers), total: qs.length });
    draw(root, qs, answers, i, key);
  }));
  root.querySelectorAll('[data-word]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); window.lugat.lookupWord(a.dataset.word, { hash: 'test', label: 'Teste dön' }); }));
  root.querySelector('#t-prev')?.addEventListener('click', () => draw(root, qs, answers, i - 1, key));
  root.querySelector('#t-next').addEventListener('click', () => {
    const next = answers.findIndex((a, k) => a === null && k > i);
    const first = answers.findIndex((a) => a === null);
    draw(root, qs, answers, next >= 0 ? next : first >= 0 ? first : qs.length, key);
    window.scrollTo(0, 0);
  });
}

function explain(q, mine) {
  const ok = mine === q.a;
  return `<b>${ok ? 'Doğru!' : 'Yanlış.'}</b> Doğru cevap: <b>${'ABCDE'[q.a]}) ${esc(q.options[q.a])}</b>` +
    (q.e ? `<div>${rich(q.e).replace(/\n/g, '<br>')}</div>` : '') +
    (q.tr ? `<div class="muted">${esc(q.full || '')}<br>${esc(q.tr)}</div>` : '') +
    (q.word ? `<div><a href="#ceviri" data-word="${esc(q.word)}">“${esc(q.word)}” kelimesini sözlükte aç</a></div>` : '') +
    (q.topic ? `<div><a href="#konu-${esc(q.topic)}">Konu anlatımına git</a></div>` : '');
}

function results(root, qs, answers, key) {
  const score = scoreOf(qs, answers);
  const byKind = {};
  qs.forEach((q, k) => {
    const g = q.label.startsWith('Dilbilgisi') ? 'Dilbilgisi' : q.label;
    byKind[g] ||= [0, 0];
    byKind[g][1]++;
    if (answers[k] === q.a) byKind[g][0]++;
  });
  const wrong = qs.map((q, k) => ({ q, k })).filter(({ q, k }) => answers[k] !== q.a);
  const pct = Math.round((100 * score) / qs.length);
  root.innerHTML = `<div class="wrap narrow test">
    <div class="section" style="gap:6px"><span class="eyebrow">${esc(dateLabel(key))}</span><h1>Günlük Test</h1></div>
    <div class="card wotd test-score">
      <div class="section" style="gap:6px"><span class="eyebrow muted">Bugünkü sonucun</span>
        <div class="wotd-word">${score}<small style="font-size:.45em"> / ${qs.length}</small></div>
        <p style="font-size:1.05rem">${pct >= 80 ? 'Harika! YDS formundasın.' : pct >= 60 ? 'İyi gidiyorsun, yanlışlarına bir göz at.' : 'Yanlışlarını gözden geçir; yarın yeni bir test seni bekliyor.'}</p>
      </div>
    </div>
    <div class="card list" style="padding:4px 18px">${Object.entries(byKind).map(([k, [ok, n]]) => `<div class="item"><div class="t"><b>${esc(k)}</b></div><span class="muted small">${ok} / ${n}</span><div class="bar" style="width:90px"><i style="width:${Math.round((100 * ok) / n)}%"></i></div></div>`).join('')}</div>
    <div class="section"><div class="section-head"><h2>Yanlışların</h2><span class="muted small">${wrong.length} soru</span></div>
      ${wrong.length ? wrong.map(({ q, k }) => `<div class="card section q">
        <span class="badge q-kind">${k + 1}. soru · ${esc(q.label)}</span>
        <div class="q-stem">${esc(q.stem).replace(/----/g, '<b class="blank">----</b>').replace(/\n/g, '<br>')}</div>
        <div class="q-exp wrong-txt">Senin cevabın: <b>${'ABCDE'[answers[k]]}) ${esc(q.options[answers[k]])}</b><br>${explain(q, answers[k])}</div>
      </div>`).join('') : '<div class="empty">Hiç yanlışın yok. Tebrikler!</div>'}
    </div>
    <p class="muted small">Yeni test yarın.</p>
  </div>`;
  root.querySelectorAll('[data-word]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); window.lugat.lookupWord(a.dataset.word, { hash: 'test', label: 'Teste dön' }); }));
}

// Ana sayfa kartı için kısa durum
export function testStatus(key = today()) {
  const t = store.test(key);
  if (!t?.answers) return { started: false, answered: 0, total: TOTAL, score: 0, done: false };
  return { started: true, answered: t.answers.filter((a) => a !== null).length, total: t.total || TOTAL, score: t.score || 0, done: !!t.done };
}
