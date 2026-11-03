// Cümle çevirisi (İngilizce → Türkçe) için Web Worker.
// Mozilla'nın açık kaynak Bergamot çeviri motorunu ve en-tr modelini cihazda çalıştırır.
// Hiçbir dış sunucuya bağlanmaz: tüm dosyalar uygulamanın kendi klasöründen (mt/) okunur.
const FILES = {
  model: ['en-tr/model.entr.intgemm.alphas.bin.0', 'en-tr/model.entr.intgemm.alphas.bin.1'],
  shortlist: 'en-tr/lex.50.50.entr.s2t.bin',
  vocab: 'en-tr/vocab.entr.spm',
  wasm: 'runtime/bergamot-translator-worker.wasm',
};
// beam-size 4: tek aday yerine dört aday; zaman ve koşul yapıları belirgin biçimde daha doğru (karşılaştırmalı test)
const CONFIG = [
  'beam-size: 4', 'normalize: 1.0', 'word-penalty: 0', 'max-length-break: 128', 'mini-batch-words: 1024',
  'workspace: 128', 'max-length-factor: 2.0', 'skip-cost: true', 'cpu-threads: 0', 'quiet: true',
  'quiet-translation: true', 'gemm-precision: int8shiftAlphaAll', 'alignment: soft',
].join('\n');

// Motorun beklediği int8 matris fonksiyonları: Firefox'ta yerleşik, burada motorun kendi yedek uygulamaları
const GEMM = {
  int8_prepare_a: 'int8PrepareAFallback',
  int8_prepare_b: 'int8PrepareBFallback',
  int8_prepare_b_from_transposed: 'int8PrepareBFromTransposedFallback',
  int8_prepare_b_from_quantized_transposed: 'int8PrepareBFromQuantizedTransposedFallback',
  int8_prepare_bias: 'int8PrepareBiasFallback',
  int8_multiply_and_add_bias: 'int8MultiplyAndAddBiasFallback',
  int8_select_columns_of_b: 'int8SelectColumnsOfBFallback',
};

let loaded = 0, total = 0;
const progress = () => self.postMessage({ type: 'progress', loaded: Math.min(loaded, total), total });

// Bazı barındırma ortamları (claude.ai) ikili model dosyası sunmaz; orada aynı dosyanın base64 metin kopyası okunur
async function downloadB64(path) {
  const r = await fetch(path + '.b64.txt');
  if (!r.ok) throw new Error(path + ' ' + r.status);
  const bin = atob((await r.text()).trim());
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  loaded += out.length;
  progress();
  return out.buffer;
}

async function download(path) {
  const r = await fetch(path).catch(() => null);
  if (!r || !r.ok) return downloadB64(path);
  if (!r.body) { const b = await r.arrayBuffer(); loaded += b.byteLength; progress(); return b; }
  // content-length'e güvenme: sunucu sıkıştırarak gönderirse (GitHub Pages gzip) gelen veri ondan büyük olur
  const reader = r.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); size += value.length; loaded += value.length;
    progress();
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out.buffer;
}

let runtimeReady;
const runtime = new Promise((resolve) => { runtimeReady = resolve; });
let wasmBytes;

self.Module = {
  locateFile: (p) => 'runtime/' + p,
  instantiateWasm(info, receive) {
    const exportsRef = {};
    info.wasm_gemm = Object.fromEntries(Object.entries(GEMM).map(([k, v]) => [k, (...a) => exportsRef.e[v](...a)]));
    WebAssembly.instantiate(wasmBytes, info).then(({ instance, module }) => {
      exportsRef.e = instance.exports;
      receive(instance, module);
    });
    return {};
  },
  onRuntimeInitialized: () => runtimeReady(),
  print: () => {}, printErr: () => {},
};

let service = null, model = null, loading = null;

function aligned(buffer, alignment) {
  const bytes = new Int8Array(buffer);
  const mem = new self.Module.AlignedMemory(bytes.byteLength, alignment);
  mem.getByteArrayView().set(bytes);
  return mem;
}

function load() {
  if (loading) return loading;
  loading = (async () => {
    // İlerleme çubuğu için açılmış dosyaların bilinen toplam boyutu (sunucunun sıkıştırmasından bağımsız)
    total = 26443028;
    loaded = 0;
    progress();
    wasmBytes = await download(FILES.wasm);
    self.importScripts('runtime/bergamot-translator-worker.js');
    const [m0, m1, shortlist, vocab] = await Promise.all([download(FILES.model[0]), download(FILES.model[1]), download(FILES.shortlist), download(FILES.vocab)]);
    const modelBytes = new Uint8Array(m0.byteLength + m1.byteLength);
    modelBytes.set(new Uint8Array(m0), 0);
    modelBytes.set(new Uint8Array(m1), m0.byteLength);
    await runtime;
    const M = self.Module;
    const vocabs = new M.AlignedMemoryList();
    vocabs.push_back(aligned(vocab, 64));
    model = new M.TranslationModel(CONFIG, aligned(modelBytes.buffer, 256), aligned(shortlist, 64), vocabs, null);
    service = new M.BlockingService({ cacheSize: 0 });
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

function translate(text) {
  const M = self.Module;
  const input = new M.VectorString();
  input.push_back(text);
  const opts = new M.VectorResponseOptions();
  opts.push_back({ qualityScores: false, alignment: false, html: false });
  const res = service.translate(model, input, opts);
  const out = res.get(0).getTranslatedText().replace(/^\s*[-–—]\s*/, ''); // modelin bazen eklediği baştaki tire
  input.delete(); opts.delete(); res.delete();
  return out;
}

self.onmessage = async ({ data }) => {
  const { id, text } = data;
  try {
    await load();
    const t0 = performance.now();
    const out = translate(text);
    self.postMessage({ type: 'result', id, ok: true, text: out, ms: Math.round(performance.now() - t0) });
  } catch (e) {
    self.postMessage({ type: 'result', id, ok: false, error: String(e && e.message || e) });
  }
};
