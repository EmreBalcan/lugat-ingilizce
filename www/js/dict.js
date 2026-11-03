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

const firstSense = (s) => (s || '').replace(/\([^)]*\)/g, '').split(/[,;]/).map((x) => x.trim()).filter(Boolean)[0] || '';
const cleanSense = (t) => !!t && t.length >= 2 && t.length <= 28 && /^[\p{L} ]+$/u.test(t);

// Sorularda kullanılacak en doğal Türkçe karşılık: örnek cümlelerin çevirilerinde en çok geçen anlam
function bestSense(entry) {
  const parts = (entry.t || []).slice(0, 4)
    .flatMap((s) => s.replace(/\([^)]*\)/g, '').split(/[,;]/).map((x) => x.trim()))
    .filter((p) => cleanSense(p) && p.length >= 3 && p.split(' ').length <= 3);
  if (!parts.length) return firstSense(entry.t?.[0]);
  const trs = [...(entry.x || []), ...(entry.q || [])].map((p) => p[1].toLocaleLowerCase('tr')).join(' ');
  let best = parts[0], score = -Infinity;
  parts.forEach((p, i) => {
    const stem = p.toLocaleLowerCase('tr').split(' ')[0].slice(0, 5);
    const hits = stem.length >= 3 ? trs.split(stem).length - 1 : 0;
    const sc = hits * 10 - i;
    if (sc > score) { score = sc; best = p; }
  });
  return best;
}

/**
 * Kelime için farklı türde YDS tarzı sorular üretir (her biri 5 seçenekli). Türler:
 *  blank       — ekranda GÖSTERİLMEYEN bir cümlede boşluk doldurma
 *  meaning     — kelimenin Türkçe karşılığı
 *  reverse     — Türkçe anlamdan İngilizce kelimeyi bulma
 *  synonym / antonym — anlamca en yakın / zıt kelime (YDS kelime sorusu)
 *  translation — cümlenin doğru Türkçe çevirisi
 * Sorular her gün değişir (tohum: kelime + tarih).
 */
export async function makeQuestions(entry, count = 4) {
  if (entry.w.includes(' ')) return [];
  const { rows, map } = await loadIndex();
  const rand = seeded(entry.w + new Date().toDateString());
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const shuffle = (arr) => arr.map((v) => [rand(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const re = formRegex(entry);
  const r0 = entry.r || 5000;
  const avoid = new Set([entry.w, ...(entry.s || []), ...(entry.a || [])]);
  const near = rows.filter((r) => r[1] && !r[0].includes(' ') && !avoid.has(r[0]) && Math.abs(r[1] - r0) < Math.max(1500, r0 * 0.6) && r[0].length > 2);
  const mainPos = (entry.p || '')[0];
  const samePos = near.filter((r) => r[2][0] === mainPos);
  const distractWords = (n, pool = samePos) => {
    const out = new Set();
    for (let g = 0; out.size < n && pool.length && g < 300; g++) out.add(pick(pool)[0]);
    return out.size === n ? [...out] : null;
  };
  const build = (kind, label, stem, correct, wrong, extra = {}) => {
    if (!wrong || new Set([correct, ...wrong]).size < 5) return null;
    const options = shuffle(wrong);
    const a = Math.floor(rand() * 5);
    options.splice(a, 0, correct);
    return { kind, label, stem, options, a, ...extra };
  };
  const trMain = bestSense(entry);
  const byFreq = (list) => {
    const ok = list.filter((s) => !s.includes(' ') && map.has(s) && !s.startsWith(entry.w.slice(0, 4)));
    const same = ok.filter((s) => map.get(s)[2][0] === (entry.p || '')[0]); // önce aynı türden olanlar
    return (same.length ? same : ok).sort((a, b) => (map.get(a)[1] || 1e9) - (map.get(b)[1] || 1e9));
  };
  const makers = {
    blank() {
      const pool = entry.q?.length ? entry.q : null; // yalnızca gösterilmeyen cümleler
      if (!pool) return null;
      for (const [en, tr] of shuffle(pool)) {
        const m = re.exec(en);
        if (!m) continue;
        const surface = m[0].split(/\s+/)[0];
        // -ing/-ed fiil çekimidir; -s ise kelime asıl olarak fiilse fiil, değilse çoğul isim sayılır
        const sl = surface.toLowerCase();
        const inflectedVerb = (entry.p || '').includes('v') && sl !== entry.w && (/(ing|ed)$/.test(sl) || (/s$/.test(sl) && mainPos === 'v'));
        const pos = inflectedVerb ? 'v' : mainPos;
        const wrong = distractWords(4, near.filter((r) => r[2][0] === pos));
        if (!wrong) return null;
        const correct = surface.toLowerCase();
        return build('blank', 'Boşluk doldurma', en.slice(0, m.index) + '----' + en.slice(m.index + surface.length), correct, wrong.map((o) => inflectLike(entry.w, surface, o)), { full: en, tr });
      }
      return null;
    },
    meaning() {
      if (!trMain) return null;
      const used = new Set(trMain.toLocaleLowerCase('tr').split(/\s+/));
      const wrong = [];
      for (let g = 0; wrong.length < 4 && g < 300; g++) {
        const r = pick(samePos.length > 20 ? samePos : near);
        const t = firstSense(r[3]);
        if (cleanSense(t) && t !== trMain && !wrong.includes(t) && !t.toLocaleLowerCase('tr').split(/\s+/).some((x) => used.has(x))) wrong.push(t);
      }
      return build('meaning', 'Anlam', `“${entry.w}” kelimesinin Türkçe karşılığı hangisidir?`, trMain, wrong.length === 4 ? wrong : null,
        { e: `**${entry.w}**: ${(entry.t || []).slice(0, 3).join('; ')}` });
    },
    reverse() {
      if (!trMain) return null;
      return build('reverse', 'Türkçeden İngilizceye', `“${trMain}” anlamına gelen kelime hangisidir?`, entry.w, distractWords(4),
        { e: `**${entry.w}**: ${(entry.t || []).slice(0, 3).join('; ')}` });
    },
    synonym() {
      const syn = byFreq(entry.s || []);
      if (!syn.length) return null;
      const s = syn[0]; // en bilinen eş anlamlı
      const sm = map.get(s);
      return build('synonym', 'Eş anlam', `“${entry.w}” kelimesine anlamca en yakın kelime hangisidir?`, s, distractWords(4),
        { e: `**${entry.w}** ≈ **${s}**${sm?.[3] ? ` (${sm[3]})` : ''}` });
    },
    antonym() {
      const ant = byFreq(entry.a || []);
      if (!ant.length) return null;
      const s = ant[0];
      const sm = map.get(s);
      return build('antonym', 'Zıt anlam', `“${entry.w}” kelimesinin zıt anlamlısı hangisidir?`, s, distractWords(4),
        { e: `**${entry.w}** ↔ **${s}**${sm?.[3] ? ` (${sm[3]})` : ''}` });
    },
    translation() {
      const all = [...(entry.q || []), ...(entry.x || [])];
      if (all.length < 5 || !entry.q?.length) return null;
      const [en, tr] = pick(entry.q);
      const wrong = shuffle(all.filter(([e2, t2]) => e2 !== en && t2 !== tr).map((p) => p[1])).filter((t, i, a) => a.indexOf(t) === i).slice(0, 4);
      return build('translation', 'Çeviri', `Aşağıdaki cümlenin en uygun Türkçe karşılığı hangisidir?\n“${en}”`, tr, wrong.length === 4 ? wrong : null,
        { e: `**${en}**\n${tr}` });
    },
  };
  // Her türden en fazla bir soru; eş/zıt anlamdan biri ve anlam/ters anlamdan biri seçilir
  const order = ['blank', rand() < 0.5 ? 'meaning' : 'reverse', (entry.a?.length && rand() < 0.4) ? 'antonym' : 'synonym', 'translation', 'meaning', 'reverse', 'antonym', 'synonym'];
  const qs = [], seen = new Set();
  for (const k of order) {
    if (qs.length >= count || seen.has(k)) continue;
    seen.add(k);
    const q = makers[k]();
    if (q) qs.push(q);
  }
  return qs;
}
