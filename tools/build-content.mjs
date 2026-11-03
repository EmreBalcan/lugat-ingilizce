// Konu ve kitap listelerini (index.json) dosyalardan üretir, içerik kurallarını denetler,
// ve claude.ai yayını için dist/index.html (yalnızca sayfa gövdesi) hazırlar.
// Çalıştırma: node tools/build-content.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WWW = path.join(ROOT, 'www');
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const problems = [];

// ---------- Konular ----------
const CATS = [
  { id: 'zamanlar', title: 'Zamanlar (Tenses)', desc: 'Geniş zamandan gelecekte tamamlanmış zamana kadar tüm zamanlar.' },
  { id: 'modals', title: 'Modal Fiiller', desc: 'Yetenek, zorunluluk, tavsiye, olasılık ve geçmişe yönelik çıkarım.' },
  { id: 'yapilar', title: 'Cümle Yapıları', desc: 'Edilgen, koşul, sıfat ve isim cümlecikleri, fiilimsiler, dolaylı anlatım.' },
  { id: 'baglaclar', title: 'Bağlaçlar', desc: 'YDS’nin en çok puan getiren konusu: zıtlık, sebep-sonuç, amaç, ekleme, zaman.' },
  { id: 'edatlar', title: 'Edatlar', desc: 'in/on/at ve kelimelerle kalıplaşmış edatlar.' },
  { id: 'kelime', title: 'Kelime Bilgisi', desc: 'Öbek fiiller ve kelime türetme.' },
];
const tdir = path.join(WWW, 'data', 'topics');
const topics = fs.readdirSync(tdir).filter((f) => f.endsWith('.json') && f !== 'index.json').map((f) => {
  const t = read(path.join(tdir, f));
  if (t.id + '.json' !== f) problems.push(`${f}: id uyuşmuyor (${t.id})`);
  if (!CATS.some((c) => c.id === t.cat)) problems.push(`${f}: bilinmeyen kategori ${t.cat}`);
  if (t.examples.length < 10) problems.push(`${f}: yalnızca ${t.examples.length} örnek (en az 10)`);
  for (const q of t.exam.q) if (q.o.length !== 5 || q.a < 0 || q.a > 4) problems.push(`${f}: hatalı soru: ${q.q.slice(0, 40)}`);
  return t;
});
const topicIndex = {
  cats: CATS.map((c) => ({ ...c, topics: topics.filter((t) => t.cat === c.id).sort((a, b) => a.order - b.order).map(({ id, title, tr, level }) => ({ id, title, tr, level })) })).filter((c) => c.topics.length),
};
fs.writeFileSync(path.join(tdir, 'index.json'), JSON.stringify(topicIndex, null, 1));

// ---------- Kitaplar ----------
const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const bdir = path.join(WWW, 'data', 'books');
const books = fs.readdirSync(bdir).filter((f) => f.endsWith('.json') && f !== 'index.json').map((f) => {
  const b = read(path.join(bdir, f));
  if (b.id + '.json' !== f) problems.push(`${f}: id uyuşmuyor`);
  const sentences = b.chapters.reduce((n, c) => n + c.s.length, 0);
  b.chapters.forEach((c, i) => c.s.forEach((s, j) => { if (!Array.isArray(s) || s.length !== 2 || !s[0] || !s[1]) problems.push(`${f}: bölüm ${i + 1}, cümle ${j + 1} eksik`); }));
  const { chapters, ...meta } = b;
  return { ...meta, chapters: chapters.length, sentences };
}).sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level) || a.title.localeCompare(b.title));
fs.writeFileSync(path.join(bdir, 'index.json'), JSON.stringify({ books }, null, 1));

// ---------- claude.ai sayfası ----------
// Yayın aracı sayfayı kendi <html><head><body> iskeletine sarar; bu yüzden yalnızca head içeriği (charset/viewport hariç) + body içeriği.
const html = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1].replace(/<meta charset[^>]*>\s*/i, '').replace(/<meta name="viewport"[^>]*>\s*/i, '').trim();
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1].trim();
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist', 'index.html'), head + '\n' + body + '\n');

// Yayınlanacak dosya listesi (www köküne göre)
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name !== 'index.html' || d !== WWW) files.push(path.relative(WWW, p).replace(/\\/g, '/'));
  }
})(WWW);
fs.writeFileSync(path.join(ROOT, 'dist', 'files.json'), JSON.stringify(files));

// ---------- PWA servis çalışanı ----------
// Uygulama kabuğu ve içerik baştan önbelleğe alınır; sözlük parçaları kullanıldıkça (ya da "çevrimdışı indir" ile).
const shell = ['./', 'index.html', ...files.filter((f) => f !== 'sw.js' && !/^data\/dict\/(en|tr)\//.test(f) && !/^mt\//.test(f) && !/^icons\/icon-(48|72|96|128|256)/.test(f))];
const hash = (s) => { let h = 2166136261; for (const ch of s) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36); };
const version = hash(shell.map((f) => { const p = path.join(WWW, f === './' ? 'index.html' : f); return f + fs.statSync(p).size + fs.statSync(p).mtimeMs; }).join('|'));
fs.writeFileSync(path.join(WWW, 'sw.js'), `// Otomatik üretildi: tools/build-content.mjs
const SHELL = 'lugat-shell-${version}';
const DATA = 'lugat-dict-v1';
const PRECACHE = ${JSON.stringify(shell)};
self.addEventListener('install', (e) => { e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL && k !== DATA).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (/\\/data\\/dict\\/(en|tr)\\/|\\/mt\\//.test(url.pathname)) {
    // Sözlük parçaları: önce önbellek, yoksa indirip sakla
    e.respondWith(caches.open(DATA).then((c) => c.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; }))));
    return;
  }
  // Diğer her şey: önce ağ (güncel sürüm), bağlantı yoksa önbellek
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) caches.open(SHELL).then((c) => c.put(e.request, r.clone())); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))));
});
`);

console.log(`Konu: ${topics.length}, kitap: ${books.length} (${books.reduce((n, b) => n + b.sentences, 0)} cümle), yayın dosyası: ${files.length}`);
if (problems.length) { console.log('SORUNLAR:\n' + problems.join('\n')); process.exitCode = 1; }
