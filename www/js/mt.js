// Cümle çevirisi: cihazda çalışan Mozilla Bergamot modeliyle İngilizce → Türkçe (mt/translator-worker.js).
// Model ilk kullanımda yüklenir (~25 MB); sonrasında internetsiz çalışır. Hiçbir çeviri servisine istek gitmez.
let worker = null;
let seq = 0;
const pending = new Map();
const cache = new Map();
let progressFn = null;
let lastProgress = null;

export const mtSupported = () => typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined';

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker('mt/translator-worker.js');
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
    worker = null;
  };
  return worker;
}

/** İngilizce metni Türkçeye çevirir. onProgress({loaded,total}) model ilk yüklenirken çağrılır. */
export function translateSentence(text, onProgress) {
  const key = text.trim();
  if (cache.has(key)) return Promise.resolve({ text: cache.get(key), cached: true });
  progressFn = onProgress || null;
  if (lastProgress && onProgress) onProgress(lastProgress);
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ensureWorker().postMessage({ id, text: key });
  }).then((r) => { cache.set(key, r.text); return r; });
}

// Arama kutusundaki metin bir cümle mi? (birden çok kelime ve cümle yapısı)
export function looksLikeSentence(q) {
  const words = q.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 4) return true;
  if (words.length >= 2 && /[.?!]$/.test(q.trim())) return true;
  if (words.length >= 2 && /^(i|you|he|she|it|we|they|this|that|there|what|where|when|why|how|who|do|does|did|is|are|was|were|can|could|will|would|should|my|your|his|her|our|their)$/i.test(words[0])) return true;
  return false;
}
