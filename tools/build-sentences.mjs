// Cümle hafızası: Tatoeba'daki insan çevirisi kısa İngilizce cümleler (≤ 8 kelime) → Türkçe.
// Cümle çevirisinde birebir eşleşme varsa model yerine bu insan çevirisi gösterilir.
// Çıktı: www/data/sent/NN.json (anahtar: küçük harf, noktalamasız İngilizce cümle)
// Çalıştırma: node tools/build-sentences.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'www', 'data', 'sent');
const SHARDS = 128;
const MAX_WORDS = 8;

// İstemcideki js/mt.js ile aynı olmalı
export const sentKey = (s) => s.toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim();
function shardOf(key, n) {
  let h = 2166136261;
  for (const ch of key) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h % n;
}

const shards = Array.from({ length: SHARDS }, () => ({}));
let n = 0;
for (const line of fs.readFileSync(path.join(ROOT, 'tools', 'raw', 'tatoeba', 'tur.txt'), 'utf8').split('\n')) {
  const [en, tr] = line.split('\t');
  if (!en || !tr) continue;
  const k = sentKey(en);
  if (!k || k.split(' ').length > MAX_WORDS) continue;
  const s = shards[shardOf(k, SHARDS)];
  if (s[k]) continue; // ilk (en yaygın) çeviri kalsın
  s[k] = tr.trim();
  n++;
}
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
shards.forEach((s, i) => fs.writeFileSync(path.join(OUT, i + '.json'), JSON.stringify(s)));
console.log(`Cümle hafızası: ${n} cümle, ${SHARDS} parça`);
