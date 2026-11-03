// Cümle çevirisi (İngilizce → Türkçe) için Web Worker.
// Mozilla'nın açık kaynak Bergamot çeviri motorunu ve en-tr modelini cihazda çalıştırır.
// Hiçbir dış sunucuya bağlanmaz: tüm dosyalar uygulamanın kendi klasöründen (mt/) okunur.
const FILES = {
  model: ['en-tr/model.entr.intgemm.alphas.bin.0', 'en-tr/model.entr.intgemm.alphas.bin.1'],
  shortlist: 'en-tr/lex.50.50.entr.s2t.bin',
  vocab: 'en-tr/vocab.entr.spm',
  wasm: 'runtime/bergamot-translator-worker.wasm',
};
const CONFIG = [
  'beam-size: 1', 'normalize: 1.0', 'word-penalty: 0', 'max-length-break: 128', 'mini-batch-words: 1024',
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
const progress = () => self.postMessage({ type: 'progress', loaded, total });

async function download(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(path + ' ' + r.status);
  const size = +r.headers.get('content-length') || 0;
  if (!r.body || !size) { const b = await r.arrayBuffer(); loaded += b.byteLength; progress(); return b; }
  const reader = r.body.getReader();
  const out = new Uint8Array(size);
  let at = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out.set(value, at); at += value.length; loaded += value.length;
    progress();
  }
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
    total = 0;
    // Toplam boyutu önceden bildir (ilerleme çubuğu için)
    const all = [...FILES.model, FILES.shortlist, FILES.vocab, FILES.wasm];
    const heads = await Promise.all(all.map((p) => fetch(p, { method: 'HEAD' }).then((r) => +r.headers.get('content-length') || 0).catch(() => 0)));
    total = heads.reduce((a, b) => a + b, 0) || 26443028; // sunucu boyut bildirmezse bilinen toplam
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
