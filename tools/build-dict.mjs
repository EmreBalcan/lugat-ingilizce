// Sözlük derleyici: FreeDict (EN→TR) + Wiktionary/kaikki (TR→EN) + WordNet + Tatoeba
// Çıktı: www/data/dict/{index.json, en/NN.json, tr/NN.json}
// Çalıştırma: node tools/build-dict.mjs
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'tools', 'raw');
const OUT = path.join(ROOT, 'www', 'data', 'dict');
const EN_SHARDS = 128;
const TR_SHARDS = 32;

// İstemcideki js/dict.js ile aynı olmalı
function shardOf(key, n) {
  let h = 2166136261;
  for (const ch of key) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h % n;
}
const trLower = (s) => s.toLocaleLowerCase('tr');
const clean = (s) => s.replace(/\s+/g, ' ').trim();
const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const entries = new Map(); // en headword -> entry
function E(w) {
  let e = entries.get(w);
  if (!e) { e = { w, tr: [], trx: new Set(), defs: [], syn: new Set(), ant: new Set(), frames: new Set(), pos: new Set(), ph: [] }; entries.set(w, e); }
  return e;
}

const ABBR = ['k', 'bak', 'müz', 'tic', 'zool', 'kıs', 'çoğ', 'huk', 'tıb', 'bot', 'coğr', 'ask', 'mat', 'fiz', 'kim', 'gram', 'şair', 'eski', 'argo', 'bşk', 'vb', 'b', 'den', 'ing', 'İng', 'A.B.D', 'ABD', 's.th', 's.o', 'th', 'o', 'mec', 'esk', 'anat', 'biyol', 'jeol', 'mak', 'mim', 'tiy', 'fot', 'sin', 'spor', 'ekon', 'pol', 'psik', 'fel', 'dilb', 'edeb', 'hav', 'den', 'oto', 'elek', 'kat', 'İsk', 'iskambil', 'briç', 'lat', 'fr', 'alm', 'yun', 'ital', 'isp', 'arap', 'fars', 'Rom', 'Yun', 'v.b', 'vs', 'Mr', 'Mrs', 'Dr', 'St'];
const ABBR_SAFE_SPLIT = new RegExp(`(?<!(?:^|[\\s(])(?:${ABBR.map((a) => a.replace(/\./g, '\\.')).join('|')}))\\.\\s+`, 'u');

// ---------- 1. FreeDict ----------
log('FreeDict');
{
  const tei = fs.readFileSync(path.join(RAW, 'eng-tur', 'eng-tur.tei'), 'utf8');
  const body = tei.slice(tei.indexOf('<body>'));
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = entryRe.exec(body))) {
    const orth = /<orth>([\s\S]*?)<\/orth>/.exec(m[1]);
    if (!orth) continue;
    const w = clean(decode(orth[1])).toLowerCase();
    if (!w || w.length > 40) continue;
    const e = E(w);
    for (const s of m[1].matchAll(/<sense[^>]*>([\s\S]*?)<\/sense>/g)) {
      const qs = [...s[1].matchAll(/<quote>([\s\S]*?)<\/quote>/g)].map((q) => clean(decode(q[1])).replace(/\.$/, '')).filter((q) => q && !/^\(bak\.\)/.test(q));
      if (!qs.length) continue;
      let sense = qs.join(', ');
      // Bazı anlamların sonuna deyimler eklenmiş: "anlam. deyim karşılık. deyim karşılık."
      if (sense.length > 70 && sense.includes('. ')) {
        // Kısaltmalardaki noktalarda bölme: (k. dili), (bak.), (müz.), s.th., A.B.D. ...
        const parts = sense.split(ABBR_SAFE_SPLIT).map(clean).filter(Boolean);
        sense = parts.shift();
        for (const p of parts) if (e.ph.length < 20) e.ph.push(p);
      }
      if (sense && !e.tr.includes(sense)) e.tr.push(sense);
    }
  }
  log('  madde:', entries.size);
}

// ---------- 2. Wiktionary (kaikki Turkish) ----------
log('Wiktionary');
const trIndex = new Map(); // tr key -> Map(en -> score)
function addTr(tr, en, score) {
  tr = trLower(clean(tr));
  if (!tr || tr.length > 40) return;
  let m = trIndex.get(tr);
  if (!m) { m = new Map(); trIndex.set(tr, m); }
  m.set(en, Math.max(m.get(en) || 0, score));
}
const trGloss = new Map(); // tr key -> [full english glosses]
const kaikkiPairs = []; // [tr, en, skor] — WordNet'ten sonra, yalnızca var olan başlıklara uygulanır
{
  const rl = readline.createInterface({ input: fs.createReadStream(path.join(RAW, 'kaikki-tr.jsonl'), 'utf8'), crlfDelay: Infinity });
  let n = 0;
  for await (const line of rl) {
    if (!line) continue;
    let j;
    try { j = JSON.parse(line); } catch { continue; }
    if (j.lang_code !== 'tr' || !j.word || !j.senses) continue;
    const trw = j.word;
    for (const s of j.senses) {
      if (!s.glosses || !s.glosses.length) continue;
      if (s.form_of || s.alt_of || (s.tags && (s.tags.includes('form-of') || s.tags.includes('alt-of')))) continue;
      const g = s.glosses[s.glosses.length - 1];
      if (!g || g.length > 160) continue;
      const key = trLower(trw);
      const list = trGloss.get(key) || [];
      if (list.length < 5 && !list.includes(g)) list.push(g);
      trGloss.set(key, list);
      const parts = g.replace(/\([^)]*\)/g, '').split(/[;,]/).map((p) => clean(p).replace(/\.$/, '')).filter(Boolean);
      parts.forEach((p, i) => {
        let en = p.toLowerCase();
        if (j.pos === 'verb') en = en.replace(/^to /, '');
        en = en.replace(/^(a|an|the) /, '');
        if (!/^[a-z][a-z' -]*$/.test(en) || en.split(' ').length > 3) return;
        kaikkiPairs.push([trw, en, 3 - Math.min(i, 2)]);
      });
    }
    if (++n % 200000 === 0) log('  satır', n);
  }
}

// FreeDict'ten ters yön
for (const e of entries.values()) {
  for (const sense of e.tr) {
    for (const p of sense.replace(/\([^)]*\)/g, '').split(/[,;]/)) {
      const t = clean(p);
      if (t && t.split(' ').length <= 3) addTr(t, e.w, 2);
    }
  }
}

// ---------- 3. WordNet ----------
log('WordNet');
const FILES = { n: 'noun', v: 'verb', a: 'adj', r: 'adv' };
const synsets = new Map(); // "pos:offset" -> {words, ptrs, frames, gloss}
const wnPos = (p) => (p === 's' ? 'a' : p);
for (const [p, name] of Object.entries(FILES)) {
  const txt = fs.readFileSync(path.join(RAW, 'package', 'dict', 'data.' + name), 'utf8');
  for (const line of txt.split('\n')) {
    if (!line || line.startsWith('  ')) continue;
    const bar = line.indexOf(' | ');
    const t = line.slice(0, bar).split(' ');
    const gloss = line.slice(bar + 3).trim();
    let i = 0;
    const off = t[i++]; i++; const ss = t[i++];
    const wc = parseInt(t[i++], 16);
    const words = [];
    for (let k = 0; k < wc; k++) { words.push(t[i++].replace(/\(.*\)$/, '').replace(/_/g, ' ').toLowerCase()); i++; }
    const pc = parseInt(t[i++], 10);
    const ptrs = [];
    for (let k = 0; k < pc; k++) { ptrs.push({ sym: t[i], off: t[i + 1], pos: wnPos(t[i + 2]), st: t[i + 3] }); i += 4; }
    const frames = [];
    if (p === 'v' && t[i]) { const fc = parseInt(t[i++], 10); for (let k = 0; k < fc; k++) { i++; frames.push(+t[i++]); i++; } }
    synsets.set(p + ':' + off, { words, ptrs, frames, gloss, ss });
  }
  // index: lemma -> sıklık sırasına göre synset'ler
  const idx = fs.readFileSync(path.join(RAW, 'package', 'dict', 'index.' + name), 'utf8');
  for (const line of idx.split('\n')) {
    if (!line || line.startsWith('  ')) continue;
    const t = line.trim().split(' ');
    const lemma = t[0].replace(/_/g, ' ').toLowerCase();
    const n = +t[2], pc = +t[3];
    const offs = t.slice(4 + pc + 2, 4 + pc + 2 + n);
    const e = E(lemma);
    e.pos.add(p);
    (e.posN ||= {})[p] = n;
    offs.forEach((off, si) => {
      const s = synsets.get(p + ':' + off);
      if (!s) return;
      if (si < 3 && e.defs.length < 7) {
        const quotes = [...s.gloss.matchAll(/"([^"]+)"/g)].map((q) => q[1].trim()).slice(0, 2);
        const def = s.gloss.split(/;\s*"/)[0].replace(/;\s*$/, '').trim();
        e.defs.push({ p, d: def, e: quotes });
      }
      if (si < 4) {
        for (const w of s.words) if (w !== lemma && e.syn.size < 12) e.syn.add(w);
        for (const f of s.frames) e.frames.add(f);
      }
      const wi = s.words.indexOf(lemma) + 1;
      for (const ptr of s.ptrs) {
        if (ptr.sym === '!') {
          const src = parseInt(ptr.st.slice(0, 2), 16), tgt = parseInt(ptr.st.slice(2), 16);
          if (src && src !== wi) continue;
          const ts = synsets.get(ptr.pos + ':' + ptr.off);
          if (ts) e.ant.add(ts.words[(tgt || 1) - 1]);
        } else if (ptr.sym === '&' && si < 2 && e.syn.size < 12) {
          const ts = synsets.get(ptr.pos + ':' + ptr.off);
          if (ts) e.syn.add(ts.words[0]);
        }
      }
    });
  }
}

for (const [trw, en, score] of kaikkiPairs) {
  if (!entries.has(en)) continue;
  E(en).trx.add(trw);
  addTr(trw, en, score);
}

// Türleri anlam sayısına göre sırala: ilk harf kelimenin asıl türü olsun
for (const e of entries.values()) if (e.posN) e.pos = new Set([...e.pos].sort((a, b) => (e.posN[b] || 0) - (e.posN[a] || 0)));

// ---------- 4. Çekim biçimleri ----------
log('Biçimler');
const IRREG = `arise arose arisen;awake awoke awoken;be was,were been;bear bore born,borne;beat beat beaten;become became become;begin began begun;bend bent bent;bet bet bet;bid bid bid;bind bound bound;bite bit bitten;bleed bled bled;blow blew blown;break broke broken;breed bred bred;bring brought brought;broadcast broadcast broadcast;build built built;burn burnt,burned burnt,burned;burst burst burst;buy bought bought;catch caught caught;choose chose chosen;cling clung clung;come came come;cost cost cost;creep crept crept;cut cut cut;deal dealt dealt;dig dug dug;do did done;draw drew drawn;dream dreamt,dreamed dreamt,dreamed;drink drank drunk;drive drove driven;eat ate eaten;fall fell fallen;feed fed fed;feel felt felt;fight fought fought;find found found;flee fled fled;fly flew flown;forbid forbade forbidden;forget forgot forgotten;forgive forgave forgiven;freeze froze frozen;get got got,gotten;give gave given;go went gone;grind ground ground;grow grew grown;hang hung hung;have had had;hear heard heard;hide hid hidden;hit hit hit;hold held held;hurt hurt hurt;keep kept kept;kneel knelt knelt;know knew known;lay laid laid;lead led led;lean leant,leaned leant,leaned;leap leapt,leaped leapt,leaped;learn learnt,learned learnt,learned;leave left left;lend lent lent;let let let;lie lay lain;light lit lit;lose lost lost;make made made;mean meant meant;meet met met;mislead misled misled;mistake mistook mistaken;overcome overcame overcome;pay paid paid;prove proved proven,proved;put put put;quit quit quit;read read read;ride rode ridden;ring rang rung;rise rose risen;run ran run;say said said;see saw seen;seek sought sought;sell sold sold;send sent sent;set set set;sew sewed sewn;shake shook shaken;shine shone shone;shoot shot shot;show showed shown;shrink shrank shrunk;shut shut shut;sing sang sung;sink sank sunk;sit sat sat;sleep slept slept;slide slid slid;speak spoke spoken;speed sped sped;spell spelt,spelled spelt,spelled;spend spent spent;spill spilt,spilled spilt,spilled;spin spun spun;spit spat spat;split split split;spread spread spread;spring sprang sprung;stand stood stood;steal stole stolen;stick stuck stuck;sting stung stung;stink stank stunk;strike struck struck;strive strove striven;swear swore sworn;sweep swept swept;swim swam swum;swing swung swung;take took taken;teach taught taught;tear tore torn;tell told told;think thought thought;throw threw thrown;understand understood understood;undertake undertook undertaken;upset upset upset;wake woke woken;wear wore worn;weave wove woven;weep wept wept;win won won;wind wound wound;withdraw withdrew withdrawn;write wrote written;forecast forecast forecast;undergo underwent undergone;withstand withstood withstood;overtake overtook overtaken;oversee oversaw overseen;foresee foresaw foreseen;arise arose arisen`;
const irregular = new Map();
for (const row of IRREG.split(';')) {
  const [b, p, pp] = row.split(' ');
  irregular.set(b, { past: p.split(','), pp: pp.split(',') });
}
const IRREG_PL = { man: 'men', woman: 'women', child: 'children', person: 'people', foot: 'feet', tooth: 'teeth', mouse: 'mice', goose: 'geese', ox: 'oxen', criterion: 'criteria', phenomenon: 'phenomena', analysis: 'analyses', crisis: 'crises', thesis: 'theses', hypothesis: 'hypotheses', datum: 'data', medium: 'media', life: 'lives', knife: 'knives', wife: 'wives', leaf: 'leaves', half: 'halves', wolf: 'wolves', shelf: 'shelves', thief: 'thieves' };
const IRREG_ADJ = { good: ['better', 'best'], bad: ['worse', 'worst'], far: ['farther', 'further', 'farthest', 'furthest'], little: ['less', 'least'], many: ['more', 'most'], much: ['more', 'most'], well: ['better', 'best'] };
const V = 'aeiou';
const sForm = (w) => (/(s|x|z|ch|sh|o)$/.test(w) ? [w + 'es', w + 's'] : /[^aeiou]y$/.test(w) ? [w.slice(0, -1) + 'ies'] : [w + 's']);
const dbl = (w) => (w.length >= 3 && !V.includes(w.at(-1)) && !'wxy'.includes(w.at(-1)) && V.includes(w.at(-2)) && !V.includes(w.at(-3)) ? w + w.at(-1) : null);
function forms(w, pos) {
  const out = new Set([w]);
  if (w.includes(' ')) return out;
  if (pos.has('n')) { sForm(w).forEach((f) => out.add(f)); if (IRREG_PL[w]) out.add(IRREG_PL[w]); }
  if (pos.has('v')) {
    sForm(w).forEach((f) => out.add(f));
    const ir = irregular.get(w);
    if (ir) { ir.past.forEach((f) => out.add(f)); ir.pp.forEach((f) => out.add(f)); }
    else if (w.endsWith('e')) out.add(w + 'd');
    else if (/[^aeiou]y$/.test(w)) out.add(w.slice(0, -1) + 'ied');
    else { out.add(w + 'ed'); const d = dbl(w); if (d) out.add(d + 'ed'); }
    if (w.endsWith('ie')) out.add(w.slice(0, -2) + 'ying');
    else if (/[^e]e$/.test(w)) out.add(w.slice(0, -1) + 'ing');
    else { out.add(w + 'ing'); const d = dbl(w); if (d) out.add(d + 'ing'); }
    if (w === 'be') ['am', 'is', 'are', 'being'].forEach((f) => out.add(f));
    if (w === 'have') out.add('has');
    if (w === 'do') out.add('does');
  }
  if (pos.has('a')) {
    if (IRREG_ADJ[w]) IRREG_ADJ[w].forEach((f) => out.add(f));
    else if (w.length <= 7) {
      const b = /[^aeiou]y$/.test(w) ? w.slice(0, -1) + 'i' : w.endsWith('e') ? w.slice(0, -1) : dbl(w) || w;
      out.add(b + 'er'); out.add(b + 'est');
    }
  }
  return out;
}

// Başlık seçimi: Türkçe anlamı olan veya WordNet'teki tek kelimeler
for (const [w, e] of entries) {
  if (!/^[a-z]/.test(w)) { entries.delete(w); continue; }
  if (!e.tr.length && !e.trx.size && (w.includes(' ') || !e.defs.length)) entries.delete(w);
}
const formMap = new Map();
for (const [w, e] of entries) {
  if (w.includes(' ')) continue;
  for (const f of forms(w, e.pos)) {
    const l = formMap.get(f);
    if (l) { if (!l.includes(w)) l.push(w); } else formMap.set(f, [w]);
  }
}
const multi = new Set([...entries.keys()].filter((w) => w.includes(' ') && w.split(' ').length <= 3));
log('  başlık:', entries.size, 'çok kelimeli:', multi.size);

// ---------- 5. Tatoeba ----------
log('Tatoeba');
const PREPS = new Set(['in', 'on', 'at', 'to', 'for', 'with', 'about', 'of', 'from', 'up', 'down', 'out', 'off', 'into', 'by', 'over', 'away', 'back', 'after', 'through', 'against', 'like']);
const sentences = [];
const seenEn = new Set();
const freq = new Map();
const cand = new Map(); // lemma -> {n, ids}
const colloc = new Map(); // lemma -> Map(prep -> n)
let seed = 12345;
const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
const MAXC = 40;
function pushCand(lemma, sid) {
  let c = cand.get(lemma);
  if (!c) { c = { n: 0, ids: [] }; cand.set(lemma, c); }
  if (c.ids.at(-1) === sid) return;
  c.n++;
  if (c.ids.length < MAXC) c.ids.push(sid);
  else { const j = Math.floor(rnd() * c.n); if (j < MAXC) c.ids[j] = sid; }
}
{
  const lines = fs.readFileSync(path.join(RAW, 'tatoeba', 'tur.txt'), 'utf8').split('\n');
  for (const line of lines) {
    const [en, tr] = line.split('\t');
    if (!en || !tr || seenEn.has(en)) continue;
    seenEn.add(en);
    const toks = en.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g);
    if (!toks) continue;
    const sid = sentences.length;
    sentences.push([en, tr, toks.length]);
    const good = toks.length >= 4 && toks.length <= 16;
    for (let i = 0; i < toks.length; i++) {
      const lemmas = formMap.get(toks[i]);
      if (!lemmas) continue;
      for (const L of lemmas) {
        freq.set(L, (freq.get(L) || 0) + 1);
        if (good) pushCand(L, sid);
        const nx = toks[i + 1];
        if (nx && PREPS.has(nx)) {
          let cm = colloc.get(L); if (!cm) colloc.set(L, (cm = new Map()));
          cm.set(nx, (cm.get(nx) || 0) + 1);
        }
        for (let k = 2; k <= 3 && i + k <= toks.length; k++) {
          const mw = [L, ...toks.slice(i + 1, i + k)].join(' ');
          if (multi.has(mw)) { freq.set(mw, (freq.get(mw) || 0) + 1); if (good) pushCand(mw, sid); }
        }
      }
    }
  }
  log('  cümle:', sentences.length);
}

// Deyim satırını İngilizce kalıp + Türkçe anlam olarak ayırır: "not to say hem de" -> ["not to say", "hem de"]
// İngilizce kısım, sözlükte bulunan İngilizce kelimelerden oluşan en uzun baştaki dizidir; ayrılamayan parçalar atılır.
const EN_EXTRA = new Set(["one's", "someone's", "somebody's", 'oneself', 'yourself', 'himself', 'herself', 'sb', 'sth', 's.o.', 's.th.', 'o.s.', "i'm", "it's", "don't", "can't", "won't", "isn't", "you're", "that's", 'a', 'an', 'i']);
const TR_HINT = /[çğıöşüÇĞİÖŞÜ]/;
function splitPhrase(p) {
  p = p.replace(/\s+/g, ' ').trim();
  if (p.length < 4 || /^[a-zçğıöşü]*\)/i.test(p) || (p.match(/\(/g) || []).length !== (p.match(/\)/g) || []).length) return null;
  const toks = p.split(' ');
  let i = 0;
  for (; i < toks.length; i++) {
    const raw = toks[i];
    const w = raw.toLowerCase().replace(/^["'(]+|[)"',.!?;:]+$/g, '');
    if (!w || TR_HINT.test(raw) || raw.startsWith('(')) break;
    if (!/^[a-z'’.-]+$/.test(w)) break;
    if (!(formMap.has(w) || entries.has(w) || EN_EXTRA.has(w))) break;
  }
  // Sondaki nadir "İngilizce" kelime aslında Türkçe olabilir (defter, emir...): Türkçe tarafa geçir
  const wfreq = (raw) => {
    const w = raw.toLowerCase().replace(/[^a-z']/g, '');
    return Math.max(freq.get(w) || 0, ...(formMap.get(w) || []).map((l) => freq.get(l) || 0)); // "dollars" → dollar
  };
  while (i > 1 && wfreq(toks[i - 1]) < 3 && !EN_EXTRA.has(toks[i - 1].toLowerCase())) i--;
  if (i === 0 || i === toks.length) return null;
  const en = toks.slice(0, i).join(' ').replace(/[,;:]$/, '');
  const tr = toks.slice(i).join(' ').trim();
  if (!tr || tr.length < 2 || en.split(' ').length < 2) return null;
  return [en, tr];
}

// ---------- 6. YDS / akademik liste ----------
const ydsFile = path.join(ROOT, 'tools', 'yds-words.txt');
const yds = new Set(fs.existsSync(ydsFile) ? fs.readFileSync(ydsFile, 'utf8').split(/\s+/).map((s) => s.trim().toLowerCase()).filter((s) => s && !s.startsWith('#')) : []);

// ---------- 7. Yazma ----------
log('Yazılıyor');
const ranked = [...entries.keys()].sort((a, b) => (freq.get(b) || 0) - (freq.get(a) || 0));
const rank = new Map(ranked.map((w, i) => [w, (freq.get(w) || 0) > 0 ? i + 1 : 0]));
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'en'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'tr'), { recursive: true });

const enShards = Array.from({ length: EN_SHARDS }, () => ({}));
const index = [];
let exampleTotal = 0;
for (const w of ranked) {
  const e = entries.get(w);
  const tr = [...e.tr];
  for (const t of e.trx) if (tr.length < 10 && !tr.some((s) => s.split(/, /).includes(t))) tr.push(t);
  const c = cand.get(w);
  let x = [], qx = [];
  if (c) {
    const ids = [...new Set(c.ids)].sort((a, b) => sentences[a][2] - sentences[b][2]);
    const want = Math.min(8, ids.length);
    for (let k = 0; k < want; k++) x.push(ids[Math.floor((k * ids.length) / want)]);
    x = [...new Set(x)];
    // Soru üretimi için ekranda gösterilmeyen ek cümleler (örnek cümleler soruya dönüşmesin)
    const rest = ids.filter((id) => !x.includes(id));
    const qn = Math.min(4, rest.length);
    for (let k = 0; k < qn; k++) qx.push(rest[Math.floor((k * rest.length) / qn)]);
    qx = [...new Set(qx)].map((id) => [sentences[id][0], sentences[id][1]]);
    x = x.map((id) => [sentences[id][0], sentences[id][1]]);
  }
  exampleTotal += x.length;
  const cm = colloc.get(w);
  const col = cm ? [...cm].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([p, n]) => [w + ' ' + p, n]) : [];
  const ir = irregular.get(w);
  const r = rank.get(w);
  const out = { w, r };
  if (tr.length) out.t = tr;
  if (e.pos.size) out.p = [...e.pos].join('');
  if (e.defs.length) out.d = e.defs;
  if (e.syn.size) out.s = [...e.syn].slice(0, 10);
  if (e.ant.size) out.a = [...e.ant].slice(0, 6);
  if (e.frames.size) out.f = [...e.frames].sort((a, b) => a - b).slice(0, 6);
  if (x.length) out.x = x;
  if (qx.length) out.q = qx;
  if (col.length) out.c = col;
  if (ir) out.i = [ir.past.join('/'), ir.pp.join('/')];
  const head = w.split(' ')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ph = e.ph
    .map((p) => p.replace(/\bone' /g, "one's "))
    .flatMap((p) => p.split(/(?<=[!?])\s+(?=[a-z])|\s\.(?=[a-z])/))
    .flatMap((p) => {
      // Virgülle bitişik iki deyimi ayır; ama yalnızca virgülün solunda Türkçe bir anlam bitiyorsa
      const parts = p.split(new RegExp(`[,;]\\s+(?=(?:[a-z]+ )?${head}\\b)`));
      const out = [parts[0]];
      for (const x of parts.slice(1)) {
        if (TR_HINT.test(out[out.length - 1]) || /[a-zçğıöşü]{3,}\s+[a-zçğıöşü]+$/i.test(out[out.length - 1]) && !/^[a-z' ]+$/i.test(out[out.length - 1])) out.push(x);
        else out[out.length - 1] += ', ' + x;
      }
      return out;
    })
    .map(splitPhrase).filter(Boolean).slice(0, 15);
  if (ph.length) out.h = ph;
  if (yds.has(w)) out.y = 1;
  enShards[shardOf(w, EN_SHARDS)][w] = out;
  if (tr.length) index.push([w, r, [...e.pos].join(''), tr[0].slice(0, 40), yds.has(w) ? 1 : 0]);
}
enShards.forEach((s, i) => fs.writeFileSync(path.join(OUT, 'en', i + '.json'), JSON.stringify(s)));
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index));
// Çekimli biçim -> kök (istemci "went" yazılınca "go" bulsun)
const lemmaOf = {};
for (const [b, ir] of irregular) for (const f of [...ir.past, ...ir.pp]) if (f !== b && !entries.has(f)) lemmaOf[f] = b;
for (const [s, p] of Object.entries(IRREG_PL)) lemmaOf[p] = s;
for (const [a, fs2] of Object.entries(IRREG_ADJ)) for (const f of fs2) if (!lemmaOf[f]) lemmaOf[f] = a;
Object.assign(lemmaOf, { am: 'be', is: 'be', are: 'be', was: 'be', were: 'be', been: 'be', has: 'have', does: 'do', did: 'do' });
fs.writeFileSync(path.join(OUT, 'irregular.json'), JSON.stringify(lemmaOf));

const trShards = Array.from({ length: TR_SHARDS }, () => ({}));
let trCount = 0;
for (const [k, m] of trIndex) {
  const en = [...m].filter(([w]) => entries.has(w)).sort((a, b) => b[1] - a[1] || (rank.get(a[0]) || 1e9) - (rank.get(b[0]) || 1e9)).slice(0, 12).map(([w]) => w);
  if (!en.length) continue;
  const rec = { e: en };
  const g = trGloss.get(k);
  if (g) rec.g = g;
  trShards[shardOf(k, TR_SHARDS)][k] = rec;
  trCount++;
}
trShards.forEach((s, i) => fs.writeFileSync(path.join(OUT, 'tr', i + '.json'), JSON.stringify(s)));
fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify({ en: entries.size, indexed: index.length, tr: trCount, sentences: sentences.length, examples: exampleTotal, built: new Date().toISOString().slice(0, 10) }));
log('Bitti. EN:', entries.size, 'index:', index.length, 'TR:', trCount, 'örnek:', exampleTotal);
