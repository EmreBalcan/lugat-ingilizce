// Küçük arayüz yardımcıları
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// **kalın** işaretli metni vurgulu <mark> olarak basar
export const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<mark>$1</mark>').replace(/~~(.+?)~~/g, '<s class="muted">$1</s>');

export const ICON = {
  speak: '<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="m12 3.8 2.5 5.1 5.6.8-4 3.9 1 5.6-5.1-2.7-5 2.7 1-5.6-4.1-3.9 5.6-.8z"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 5 8 12l7 7"/></svg>',
  arrow: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  book: '<svg viewBox="0 0 24 24"><path d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5V19c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5z"/><path d="M12 6v13.5"/></svg>',
  translate: '<svg viewBox="0 0 24 24"><path d="M4 5h9M8.5 3v2M6 5c.6 3.5 3 6.5 6 8M11 5c-.8 3.6-3.3 6.8-6.5 8.5M13 21l4-10 4 10M14.4 17.5h5.2"/></svg>',
  dict: '<svg viewBox="0 0 24 24"><path d="M5 4.5h11a3 3 0 0 1 3 3v12H8a3 3 0 0 1-3-3z"/><path d="M5 16.5a3 3 0 0 1 3-3h11M9 10.5l1.8-4.5 1.8 4.5M9.6 9h2.4"/></svg>',
  topic: '<svg viewBox="0 0 24 24"><path d="M5 4h10l4 4v12H5zM14 4v5h5M8 13h8M8 17h6"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.2-4 4.3-6 8-6s6.8 2 8 6"/></svg>',
  cards: '<svg viewBox="0 0 24 24"><rect x="3.5" y="6" width="13" height="14" rx="2"/><path d="M8 3.5h10.5a2 2 0 0 1 2 2V17"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z"/></svg>',
  grid: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2"/></svg>',
  chevron: '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
};

// Sesli okuma: tarayıcının kendi ses motoru (internete/yapay zekâya gitmez). Her yerde aynı İngilizce ses kullanılır.
const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
let voices = [];
let current = null; // konuşma bitmeden çöp toplayıcıya gitmesin diye referans
function loadVoices() { try { voices = synth.getVoices(); } catch {} }
if (synth) { loadVoices(); synth.addEventListener?.('voiceschanged', loadVoices); }
const PREFERRED = [/Google US English/i, /Microsoft (Aria|Jenny|Guy|Ava|Andrew|Emma)/i, /Samantha/i, /Google UK English Female/i];
function pickVoice(lang) {
  const same = voices.filter((v) => v.lang?.replace('_', '-').toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
  if (lang.startsWith('en')) for (const re of PREFERRED) { const v = same.find((x) => re.test(x.name)); if (v) return v; }
  return same.find((v) => v.lang.replace('_', '-') === lang) || same[0] || null;
}
export const canSpeak = () => !!synth && typeof SpeechSynthesisUtterance !== 'undefined';

// Android/iOS uygulamasında cihazın yerel ses motoru (Capacitor TextToSpeech eklentisi)
const cap = typeof window !== 'undefined' ? window.Capacitor : null;
const isNative = () => !!cap?.isNativePlatform?.();
function tts(method, opts = {}) {
  const p = cap.Plugins?.TextToSpeech;
  return p?.[method] ? p[method](opts) : cap.nativePromise('TextToSpeech', method, opts);
}
let nativeToken = 0;

export function stopSpeaking() {
  nativeToken++;
  if (isNative()) { tts('stop').catch(() => {}); return; }
  try { current = null; synth?.cancel(); } catch {}
}
export function speak(text, lang = 'en-US', { rate = 0.92, onend } = {}) {
  if (isNative()) {
    const my = ++nativeToken;
    tts('stop').catch(() => {}).then(() => tts('speak', { text, lang, rate: rate + 0.03, pitch: 1, volume: 1, category: 'playback' }))
      .then(() => { if (my === nativeToken) onend?.(false); })
      .catch(() => { if (my === nativeToken) { toast('Sesli okuma çalışmadı. Telefonunda İngilizce ses paketi yüklü olmayabilir.'); onend?.(true); } });
    return true;
  }
  if (!canSpeak()) { toast('Bu cihazda sesli okuma desteklenmiyor'); onend?.(true); return false; }
  try {
    if (!voices.length) loadVoices();
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = rate;
    const v = pickVoice(lang);
    if (v) u.voice = v;
    u.onend = () => { if (current === u) { current = null; onend?.(false); } };
    u.onerror = (e) => {
      if (current !== u) return;
      current = null;
      if (e.error !== 'interrupted' && e.error !== 'canceled') toast('Sesli okuma çalışmadı. Cihazında İngilizce ses yüklü olmayabilir.');
      onend?.(true);
    };
    current = u;
    // Chrome: cancel()'dan hemen sonra speak() bazen sessiz kalıyor; kısa bir ara ver
    setTimeout(() => { if (current === u) { synth.resume(); synth.speak(u); } }, 80);
    return true;
  } catch { toast('Sesli okuma başlatılamadı'); onend?.(true); return false; }
}

let toastTimer;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2200);
}

const sheet = () => document.getElementById('sheet');
export function openSheet(html) {
  document.getElementById('sheet-body').innerHTML = html;
  sheet().hidden = false;
  return document.getElementById('sheet-body');
}
export function closeSheet() { sheet().hidden = true; }
document.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeSheet(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

export const loading = (msg = 'Yükleniyor') => `<div class="loading"><div class="spin"></div>${esc(msg)}</div>`;

export function ring(value, goal) {
  const p = Math.min(1, goal ? value / goal : 0);
  const c = 2 * Math.PI * 22;
  return `<svg class="ring${p >= 1 ? ' done' : ''}" viewBox="0 0 54 54" aria-hidden="true"><circle class="bg" cx="27" cy="27" r="22"/><circle class="fg" cx="27" cy="27" r="22" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}" transform="rotate(-90 27 27)"/></svg>`;
}

// Bir YDS tarzı soruyu çizer ve cevaplanınca callback çağırır
export function questionHTML(q, i) {
  return `<div class="q" data-q="${i}">
    ${q.label ? `<span class="badge q-kind">${esc(q.label)}</span>` : ''}
    <div class="q-stem"><span class="muted">${i + 1}.</span> ${esc(q.stem).replace(/----/g, '<b class="blank">----</b>').replace(/\n/g, '<br>')}</div>
    <div class="q-opts">${q.options.map((o, k) => `<button class="q-opt" data-k="${k}"><b>${'ABCDE'[k]})</b> ${esc(o)}</button>`).join('')}</div>
    <div class="q-exp" hidden></div>
  </div>`;
}
export function wireQuestions(root, qs, onAnswer) {
  root.querySelectorAll('.q').forEach((el) => {
    const q = qs[+el.dataset.q];
    el.querySelectorAll('.q-opt').forEach((b) => b.addEventListener('click', () => {
      const k = +b.dataset.k;
      const ok = k === q.a;
      el.querySelectorAll('.q-opt').forEach((x) => { x.disabled = true; });
      el.querySelector(`[data-k="${q.a}"]`).classList.add('right');
      if (!ok) b.classList.add('wrong');
      const exp = el.querySelector('.q-exp');
      exp.className = 'q-exp ' + (ok ? 'right-txt' : 'wrong-txt');
      exp.innerHTML = `<b>${ok ? 'Doğru!' : 'Yanlış.'}</b> Doğru cevap: <b>${'ABCDE'[q.a]}) ${esc(q.options[q.a])}</b>` +
        (q.e ? `<div>${rich(q.e).replace(/\n/g, '<br>')}</div>` : '') + (q.tr ? `<div class="muted">${esc(q.full || '')}<br>${esc(q.tr)}</div>` : '');
      exp.hidden = false;
      onAnswer?.(ok);
    }));
  });
}
