// Cümle çevirisi (İngilizce → Türkçe), tamamen cihazda:
//  1) Cümle hafızası: Tatoeba'daki insan çevirileri (≤ 8 kelimelik ~400 bin cümle). Birebir eşleşme varsa o gösterilir.
//  2) Yoksa Mozilla Bergamot modeli (mt/translator-worker.js). Model ilk kullanımda bir kez yüklenir (~25 MB).
// Hiçbir çeviri servisine ya da yapay zekâ servisine istek gitmez.
import { shardOf } from './dict.js';

// Motor dosyaları değişince artır: tarayıcı/servis çalışanı önbelleğindeki eski motor kullanılmasın
const MT_VERSION = '3';
const SENT_SHARDS = 128;

let worker = null;
let seq = 0;
const pending = new Map();
const cache = new Map();
let progressFn = null;
let lastProgress = null;

export const mtSupported = () => typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined';

// tools/build-sentences.mjs ile aynı anahtar
const sentKey = (s) => s.toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim();
const shardCache = new Map();
async function memoryLookup(text) {
  const k = sentKey(text);
  if (!k || k.split(' ').length > 8) return null;
  const i = shardOf(k, SENT_SHARDS);
  if (!shardCache.has(i)) shardCache.set(i, fetch(`data/sent/${i}.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
  return (await shardCache.get(i))[k] || null;
}

// Modeli şaşırtan yazımları düzelt: küçük harfle başlama, noktalama eksikliği, küçük "i"
const QUESTION = /^(what|where|when|why|how|who|whom|whose|which|do|does|did|is|are|am|was|were|can|could|will|would|shall|should|may|might|must|have|has|had|isn't|aren't|don't|doesn't|didn't|can't|won't)\b/i;
// Küçük harfle yazılınca modelin tanımadığı özel isimler (english → English → "İngilizce")
const PROPER = /\b(english|turkish|french|german|spanish|italian|russian|arabic|chinese|japanese|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|june|july|august|september|october|november|december|turkey|england|britain|america|europe|london|paris|istanbul|ankara|izmir)\b/g;
export function normalizeSentence(text) {
  let s = text.trim().replace(/\s+/g, ' ');
  s = s.replace(/\bi\b/g, 'I').replace(/\bi'(m|ve|ll|d)\b/g, "I'$1");
  s = s.replace(PROPER, (w) => w[0].toUpperCase() + w.slice(1));
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (!/[.?!…"')]$/.test(s)) s += QUESTION.test(s) ? '?' : '.';
  return s;
}

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(`mt/translator-worker.js?v=${MT_VERSION}`);
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') { lastProgress = data; progressFn?.(data); return; }
    const p = pending.get(data.id);
    if (!p) return;
    pending.delete(data.id);
    data.ok ? p.resolve(data) : p.reject(new Error(data.error));
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message || 'Çeviri motoru başlatılamadı'));
    pending.clear();
    resetWorker();
  };
  return worker;
}
function resetWorker() { try { worker?.terminate(); } catch {} worker = null; lastProgress = null; }

function runModel(text) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ensureWorker().postMessage({ id, text });
  });
}

/**
 * İngilizce metni Türkçeye çevirir. Dönen nesne: { text, source: 'memory' | 'model' }.
 * onProgress({loaded,total}) model ilk kez yüklenirken çağrılır.
 */
export async function translateSentence(text, onProgress) {
  const key = text.trim();
  if (cache.has(key)) return cache.get(key);
  const human = await memoryLookup(key);
  if (human) {
    const r = { text: human, source: 'memory' };
    cache.set(key, r);
    return r;
  }
  progressFn = onProgress || null;
  if (lastProgress && onProgress) onProgress(lastProgress);
  const input = normalizeSentence(key);
  let out;
  try {
    out = await runModel(input);
  } catch (e) {
    // Bir kez temiz bir motorla yeniden dene (yarım kalan indirme, eski önbellek vb.)
    resetWorker();
    out = await runModel(input);
  }
  const r = { text: out.text, source: 'model' };
  cache.set(key, r);
  return r;
}

// Arama kutusundaki metin bir cümle mi? (birden çok kelime ve cümle yapısı)
export function looksLikeSentence(q) {
  const words = q.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 4) return true;
  if (words.length >= 2 && /[.?!]$/.test(q.trim())) return true;
  if (words.length >= 2 && /^(i|you|he|she|it|we|they|this|that|there|what|where|when|why|how|who|do|does|did|is|are|was|were|can|could|will|would|should|my|your|his|her|our|their)$/i.test(words[0])) return true;
  return false;
}
