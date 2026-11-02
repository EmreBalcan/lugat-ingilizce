// Çevrimdışı sözlük motoru: tools/build-dict.mjs'in ürettiği parçalı JSON dosyalarını okur.
const EN_SHARDS = 128;
const TR_SHARDS = 32;
const BASE = 'data/dict/';

export function shardOf(key, n) {
  let h = 2166136261;
  for (const ch of key) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h % n;
}

const cache = new Map();
function getJSON(url) {
  if (!cache.has(url)) cache.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); }).catch((e) => { cache.delete(url); throw e; }));
  return cache.get(url);
}

export const trLower = (s) => s.toLocaleLowerCase('tr');
export const norm = (s) => s.trim().replace(/\s+/g, ' ').replace(/[’`]/g, "'").replace(/^[^\p{L}]+|[^\p{L}']+$/gu, '');

export async function getEn(w) { return (await getJSON(`${BASE}en/${shardOf(w, EN_SHARDS)}.json`))[w] || null; }
export async function getTr(w) { return (await getJSON(`${BASE}tr/${shardOf(w, TR_SHARDS)}.json`))[w] || null; }
export const meta = () => getJSON(BASE + 'meta.json');

// index satırı: [kelime, sıklık sırası (0 = bilinmiyor), tür, ilk Türkçe anlam, yds]
let indexP = null;
export function loadIndex() {
  return (indexP ||= getJSON(BASE + 'index.json').then((rows) => ({ rows, map: new Map(rows.map((r) => [r[0], r])) })));
}

function deinflect(w) {
  const out = [];
  const add = (x) => x && x.length > 1 && !out.includes(x) && out.push(x);
  if (w.endsWith('ies')) add(w.slice(0, -3) + 'y');
  if (w.endsWith('es')) add(w.slice(0, -2));
  if (w.endsWith('s') && !w.endsWith('ss')) add(w.slice(0, -1));
  if (w.endsWith('ied')) add(w.slice(0, -3) + 'y');
  if (w.endsWith('ed')) { add(w.slice(0, -2)); add(w.slice(0, -1)); if (w.at(-3) === w.at(-4)) add(w.slice(0, -3)); }
  if (w.endsWith('ing')) { const b = w.slice(0, -3); add(b); add(b + 'e'); if (b.at(-1) === b.at(-2)) add(b.slice(0, -1)); if (b.endsWith('y')) add(b.slice(0, -1) + 'ie'); }
  if (w.endsWith('ier')) add(w.slice(0, -3) + 'y');
  if (w.endsWith('iest')) add(w.slice(0, -4) + 'y');
  if (w.endsWith('er')) { add(w.slice(0, -2)); add(w.slice(0, -1)); }
  if (w.endsWith('est')) { add(w.slice(0, -3)); add(w.slice(0, -2)); }
  if (w.endsWith('ly')) add(w.slice(0, -2));
  if (w.endsWith("'s")) add(w.slice(0, -2));
  return out;
}

const isTurkishish = (s) => /[çğıöşüÇĞİÖŞÜ]/.test(s);

/** Bir sorguyu çözer: { kind: 'en'|'tr'|'none', entry, tr, from, alsoTr, alsoEn } */
export async function lookup(raw) {
  const q = norm(raw);
  if (!q) return { kind: 'none', q };
  const lower = q.toLowerCase();
  const trKey = trLower(q);
  const [irregular] = await Promise.all([getJSON(BASE + 'irregular.json')]);
  const trRec = await getTr(trKey).catch(() => null);

  let entry = null, from = null;
  if (!isTurkishish(q)) {
    entry = await getEn(lower);
    // "children" gibi düzensiz biçimlerin kendi maddesi zayıfsa kök maddeyi göster
    if (entry && irregular[lower] && (entry.t?.length || 0) <= 1) {
      const base = await getEn(irregular[lower]);
      if (base?.t) { entry = base; from = q; }
    }
    if (!entry || (!entry.t && !entry.d)) {
      const cands = [irregular[lower], ...deinflect(lower)].filter(Boolean);
      for (const c of cands) {
        const e = await getEn(c);
        if (e && (e.t || e.d)) { entry = e; from = q; break; }
      }
    }
    if (entry && !entry.t && !entry.d) entry = null;
  }
  // Hem İngilizce hem Türkçe kelime olabiliyorsa (ör. "set" / "kim") Türkçe sonucu da öner
  if (entry) return { kind: 'en', q, entry, from, alsoTr: trRec ? trKey : null };
  if (trRec) return { kind: 'tr', q, tr: trRec, key: trKey };
  return { kind: 'none', q };
}

export async function suggest(raw, n = 8) {
  const q = norm(raw).toLowerCase();
  if (!q) return [];
  const { rows } = await loadIndex();
  const out = [];
  for (const r of rows) { if (r[0].startsWith(q)) { out.push(r); if (out.length >= n) break; } }
  return out;
}

export const POS = { n: 'isim', v: 'fiil', a: 'sıfat', r: 'zarf' };

export function level(r) {
  if (!r) return 'C1+';
  if (r <= 1000) return 'A1';
  if (r <= 2000) return 'A2';
  if (r <= 4000) return 'B1';
  if (r <= 8000) return 'B2';
  if (r <= 15000) return 'C1';
  return 'C2';
}

const sForm = (w) => (/(s|x|z|ch|sh|o)$/.test(w) ? w + 'es' : /[^aeiou]y$/.test(w) ? w.slice(0, -1) + 'ies' : w + 's');
const ingForm = (w) => (w.endsWith('ie') ? w.slice(0, -2) + 'ying' : /[^e]e$/.test(w) ? w.slice(0, -1) + 'ing' : w + 'ing');
const edForm = (w) => (w.endsWith('e') ? w + 'd' : /[^aeiou]y$/.test(w) ? w.slice(0, -1) + 'ied' : w + 'ed');

// WordNet fiil çerçeveleri -> kalıp şablonları
const FRAMES = {
  1: ['Something ~s', 'Bir şey ~'], 2: ['Somebody ~s', 'Biri ~'], 3: ['It is ~ing', 'Durum bildirir'], 4: ['Something is ~ing PP', 'Bir şey bir yerde ~'],
  5: ['Something ~s something Adjective/Noun', ''], 6: ['Something ~s Adjective/Noun', ''], 7: ['Somebody ~s Adjective', 'Biri bir hâle ~'],
  8: ['Somebody ~s something', 'Biri bir şeyi ~'], 9: ['Somebody ~s somebody', 'Biri birini ~'], 10: ['Something ~s somebody', 'Bir şey birini ~'],
  11: ['Something ~s something', 'Bir şey bir şeyi ~'], 12: ['Something ~s to somebody', ''], 13: ['Somebody ~s on something', ''],
  14: ['Somebody ~s somebody something', 'Birine bir şey ~'], 15: ['Somebody ~s something to somebody', 'Birine bir şey ~'],
  16: ['Somebody ~s something from somebody', ''], 17: ['Somebody ~s somebody with something', ''], 18: ['Somebody ~s somebody of something', ''],
  19: ['Somebody ~s something on somebody', ''], 20: ['Somebody ~s somebody PP', ''], 21: ['Somebody ~s something PP', ''], 22: ['Somebody ~s PP', 'Edatlı kullanım'],
  23: ["Somebody's (body part) ~s", ''], 24: ['Somebody ~s somebody to INFINITIVE', 'Birinin bir şey yapmasını ~'], 25: ['Somebody ~s somebody INFINITIVE', ''],
  26: ['Somebody ~s that CLAUSE', 'that + cümle alır'], 27: ['Somebody ~s to somebody', ''], 28: ['Somebody ~s to INFINITIVE', 'to + fiil alır'],
  29: ['Somebody ~s whether INFINITIVE', ''], 30: ['Somebody ~s somebody into V-ing something', ''], 31: ['Somebody ~s something with something', ''],
  32: ['Somebody ~s INFINITIVE', ''], 33: ['Somebody ~s VERB-ing', 'V-ing (gerund) alır'], 34: ['It ~s that CLAUSE', ''], 35: ['Something ~s INFINITIVE', ''],
};
export function framePatterns(entry) {
  const w = entry.w;
  const [head, ...rest] = w.split(' ');
  const tail = rest.length ? ' ' + rest.join(' ') : '';
  return (entry.f || []).map((f) => {
    const [en, tr] = FRAMES[f] || ['', ''];
    const s = en.replace('~ing', ingForm(head) + tail).replace('~s', sForm(head) + tail);
    return { en: s, tr };
  }).filter((p) => p.en);
}

// Bir örnek cümlede kelimenin geçtiği biçimi bulur
export function formRegex(entry) {
  const w = entry.w;
  const [head, ...rest] = w.split(' ');
  const alts = new Set([head, sForm(head), ingForm(head), edForm(head)]);
  if (entry.i) entry.i.join('/').split('/').forEach((f) => alts.add(f));
  if (head.length >= 3 && /[^aeiou][aeiou][^aeiouwxy]$/.test(head)) { alts.add(head + head.at(-1) + 'ed'); alts.add(head + head.at(-1) + 'ing'); }
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headAlt = [...alts].sort((a, b) => b.length - a.length).map(esc).join('|');
  const tail = rest.length ? '\\s+' + rest.map(esc).join('\\s+') : '';
  return new RegExp(`\\b(${headAlt})${tail}\\b`, 'i');
}

function seeded(str) {
  let s = shardOf(str, 2 ** 31) || 1;
  return () => ((s = (Math.imul(s, 48271) % 2147483647 + 2147483647) % 2147483647) / 2147483647);
}

function inflectLike(base, surface, target) {
  const s = surface.toLowerCase(), b = base.toLowerCase();
  if (s === b) return target;
  if (s.endsWith('ing')) return ingForm(target);
  if (s.endsWith('ed') || s.endsWith('d')) return edForm(target);
  if (s.endsWith('s')) return sForm(target);
  return target;
}

/** Kelimenin kendi örneklerinden YDS tarzı boşluk doldurma soruları üretir (5 seçenek). */
export async function makeQuestions(entry, count = 2) {
  if (!entry.x || entry.w.includes(' ')) return [];
  const { rows } = await loadIndex();
  const rand = seeded(entry.w);
  const re = formRegex(entry);
  const r0 = entry.r || 5000;
  const avoid = new Set([entry.w, ...(entry.s || []), ...(entry.a || [])]);
  const near = rows.filter((r) => r[1] && !r[0].includes(' ') && !avoid.has(r[0]) && Math.abs(r[1] - r0) < Math.max(1500, r0 * 0.6) && r[0].length > 2);
  const qs = [];
  const sents = [...entry.x].sort(() => rand() - 0.5);
  for (const [en, tr] of sents) {
    if (qs.length >= count) break;
    const m = re.exec(en);
    if (!m) continue;
    const surface = m[0].split(/\s+/)[0];
    // Çekimli fiil biçimiyse yanlış şıklar da fiil olsun; değilse kelimenin asıl türüyle aynı olsun
    const inflectedVerb = (entry.p || '').includes('v') && surface.toLowerCase() !== entry.w && /(ing|ed|s)$/i.test(surface);
    const pos = inflectedVerb ? 'v' : (entry.p || '')[0];
    const pool = near.filter((r) => r[2][0] === pos);
    const opts = new Set();
    let guard = 0;
    while (opts.size < 4 && pool.length && guard++ < 200) opts.add(pool[Math.floor(rand() * pool.length)][0]);
    if (opts.size < 4) break;
    const correct = surface.toLowerCase() === entry.w ? entry.w : surface.toLowerCase();
    const options = [...opts].map((o) => inflectLike(entry.w, surface, o));
    const a = Math.floor(rand() * 5);
    options.splice(a, 0, correct);
    const stem = en.slice(0, m.index) + '----' + en.slice(m.index + surface.length);
    qs.push({ stem, options, a, tr, full: en });
  }
  return qs;
}
