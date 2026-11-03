// Kişisel ilerleme: cihazda (localStorage) tutulur; claude.ai'de açıldığında hesaba özel db belgesine de eşitlenir.
const KEY = 'lugat.v1';
const DAYS_KEEP = 180;

export const today = (d = new Date()) => d.toLocaleDateString('sv');

function blank() {
  return {
    v: 1, updatedAt: 0,
    words: {},   // kelime -> { tr, later, fav, learned, added }
    topics: {},  // konu id -> { title, later, fav, learned, read }
    books: {},   // kitap id -> { ch, i, seen, total, started, done }
    history: [], // son aranan kelimeler [{w, tr, at}]
    days: {},    // 'YYYY-MM-DD' -> { lw:[], topics:[], sentences, quiz, correct }
    goals: { lookups: 5, topics: 1, sentences: 30, quiz: 5 },
  };
}

function readLocal() {
  try { const s = localStorage.getItem(KEY); if (s) return { ...blank(), ...JSON.parse(s) }; } catch {}
  return blank();
}

let state = readLocal();
const listeners = new Set();
let remote = null;
let pushTimer = null;
let pushing = Promise.resolve();

function emit() { listeners.forEach((fn) => { try { fn(state); } catch (e) { console.error(e); } }); }

function prune() {
  const keys = Object.keys(state.days).sort();
  while (keys.length > DAYS_KEEP) delete state.days[keys.shift()];
  if (state.history.length > 60) state.history.length = 60;
}

function commit() {
  state.updatedAt = Date.now();
  prune();
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  emit();
  if (remote) { clearTimeout(pushTimer); pushTimer = setTimeout(push, 2500); }
}

function push() {
  const body = { updatedAt: state.updatedAt, json: JSON.stringify(state) };
  pushing = pushing.then(() => remote.set(body)).catch((e) => console.warn('profil eşitlenemedi', e?.code || e));
}

function day(d = today()) {
  return (state.days[d] ||= { lw: [], topics: [], sentences: 0, quiz: 0, correct: 0 });
}

export const store = {
  get state() { return state; },
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  day,

  word(w) { return state.words[w] || {}; },
  setWordFlag(w, flag, on, tr) {
    const cur = state.words[w] || { added: Date.now() };
    cur[flag] = on ? Date.now() : 0;
    if (tr) cur.tr = tr;
    if (flag === 'learned' && on) cur.later = 0;
    if (!cur.later && !cur.fav && !cur.learned) delete state.words[w];
    else state.words[w] = cur;
    commit();
  },

  topic(id) { return state.topics[id] || {}; },
  setTopicFlag(id, flag, on, title) {
    const cur = state.topics[id] || {};
    cur[flag] = on ? Date.now() : 0;
    if (title) cur.title = title;
    if (flag === 'learned' && on) cur.later = 0;
    state.topics[id] = cur;
    commit();
  },
  topicOpened(id, title) {
    const cur = state.topics[id] || {};
    cur.read = Date.now(); cur.title = title;
    state.topics[id] = cur;
    const d = day();
    if (!d.topics.includes(id)) d.topics.push(id);
    commit();
  },

  logLookup(w, tr) {
    state.history = [{ w, tr, at: Date.now() }, ...state.history.filter((h) => h.w !== w)];
    const d = day();
    if (!d.lw.includes(w)) { d.lw.push(w); if (d.lw.length > 200) d.lw.shift(); }
    commit();
  },

  book(id) { return state.books[id] || null; },
  bookProgress(id, patch) {
    const cur = state.books[id] || { started: Date.now(), seen: 0 };
    const added = Math.max(0, (patch.seen ?? cur.seen) - cur.seen);
    Object.assign(cur, patch);
    cur.at = Date.now();
    // Bölüm atlayınca okunmamış cümleler günlük hedefe sayılmasın
    if (added && added <= 40) day().sentences += added;
    state.books[id] = cur;
    commit();
  },

  quizAnswered(correct) {
    const d = day();
    d.quiz++; if (correct) d.correct++;
    commit();
  },

  // Günlük test: { answers: [şık indeksi | null], done, score, total }
  test(d = today()) { return state.days[d]?.test || null; },
  saveTest(patch, d = today()) {
    const day0 = day(d);
    day0.test = { ...(day0.test || {}), ...patch };
    commit();
  },

  setGoal(k, v) { state.goals[k] = Math.max(1, Math.min(500, v | 0)); commit(); },

  streak() {
    let n = 0;
    const d = new Date();
    const active = (k) => { const x = state.days[k]; return x && (x.lw.length || x.topics.length || x.sentences || x.quiz); };
    if (!active(today(d))) d.setDate(d.getDate() - 1);
    while (active(today(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  },
};

// claude.ai içinde çalışıyorsa hesaba özel belgeye bağlan (APK/yerelde sessizce atlanır)
(async () => {
  if (!window.claude?.use) return;
  try {
    const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    if (!db || !user) return;
    const id = await user.id();
    if (!id) return;
    const ref = db.doc('data/users/' + id + '/profile');
    const snap = await ref.get();
    remote = ref;
    const r = snap.exists ? snap.data() : null;
    if (r && r.updatedAt > state.updatedAt) {
      state = { ...blank(), ...JSON.parse(r.json) };
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
      emit();
    } else if (state.updatedAt && (!r || state.updatedAt > r.updatedAt)) push();
  } catch (e) { console.warn('db yok', e?.code || e); }
})();
