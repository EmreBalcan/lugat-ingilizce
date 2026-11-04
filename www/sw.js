// Otomatik üretildi: tools/build-content.mjs
const SHELL = 'lugat-shell-9fxjgz';
const DATA = 'lugat-dict-v3'; // ad değişince eski önbellek silinir
const PRECACHE = ["./","index.html","css/app.css","data/books/aesop-fables.json","data/books/after-twenty-years.json","data/books/aladdin.json","data/books/ali-baba.json","data/books/alice-rabbit-hole.json","data/books/canterville-ghost.json","data/books/cask-of-amontillado.json","data/books/cinderella.json","data/books/elves-shoemaker.json","data/books/emperors-new-clothes.json","data/books/gift-of-the-magi.json","data/books/gingerbread-man.json","data/books/goldilocks.json","data/books/hansel-and-gretel.json","data/books/happy-prince.json","data/books/index.json","data/books/jack-beanstalk.json","data/books/jekyll-hyde.json","data/books/last-leaf.json","data/books/little-match-girl.json","data/books/little-red-hen.json","data/books/little-red-riding-hood.json","data/books/monkeys-paw.json","data/books/more-aesop-fables.json","data/books/nightingale-rose.json","data/books/open-window.json","data/books/puss-in-boots.json","data/books/ransom-red-chief.json","data/books/rapunzel.json","data/books/red-headed-league.json","data/books/rip-van-winkle.json","data/books/selfish-giant.json","data/books/sleeping-beauty.json","data/books/snow-white.json","data/books/steadfast-tin-soldier.json","data/books/tell-tale-heart.json","data/books/the-necklace.json","data/books/three-little-pigs.json","data/books/treasure-island.json","data/books/ugly-duckling.json","data/books/wizard-of-oz.json","data/dict/index.json","data/dict/irregular.json","data/dict/meta.json","data/topics/conditionals.json","data/topics/conj-addition-correlative.json","data/topics/conj-cause-effect.json","data/topics/conj-contrast.json","data/topics/conj-purpose.json","data/topics/conj-time.json","data/topics/future-forms.json","data/topics/future-perfect-continuous.json","data/topics/gerunds-infinitives.json","data/topics/index.json","data/topics/modals-basic.json","data/topics/modals-deduction.json","data/topics/noun-clauses.json","data/topics/passive-voice.json","data/topics/past-continuous.json","data/topics/past-perfect.json","data/topics/past-simple.json","data/topics/phrasal-verbs.json","data/topics/prepositions.json","data/topics/present-continuous.json","data/topics/present-perfect-continuous.json","data/topics/present-perfect.json","data/topics/present-simple.json","data/topics/relative-clauses.json","data/topics/reported-speech.json","data/topics/used-to.json","data/topics/wish-if-only.json","icons/apple-touch-icon.png","icons/icon-192.webp","icons/icon-512.webp","js/app.js","js/dict.js","js/mt.js","js/store.js","js/theme.js","js/ui.js","js/views/dictionary.js","js/views/home.js","js/views/library.js","js/views/profile.js","js/views/test.js","js/views/topics.js","js/views/translate.js","js/views/wordcard.js","manifest.webmanifest"];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL && k !== DATA).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (/\/data\/(dict\/(en|tr)|sent)\/|\/mt\/(en-tr\/|runtime\/.+\.wasm)/.test(url.pathname)) {
    // Sözlük parçaları: önce önbellek, yoksa indirip sakla
    e.respondWith(caches.open(DATA).then((c) => c.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; }))));
    return;
  }
  // Diğer her şey: önce ağ (güncel sürüm), bağlantı yoksa önbellek
  // Tarayıcının HTTP önbelleğine takılma (GitHub Pages 10 dk önbellekletir): sunucuya her seferinde güncellik sor
  const req = e.request.mode === 'navigate' ? e.request : new Request(e.request, { cache: 'no-cache' });
  e.respondWith(fetch(req).then((r) => { if (r.ok) caches.open(SHELL).then((c) => c.put(e.request, r.clone())); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))));
});
