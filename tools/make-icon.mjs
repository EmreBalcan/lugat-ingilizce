// Uygulama simgesini (1024x1024 PNG) bağımlılıksız çizer: leylak→sarı geçiş üstünde koyu "L".
// Çıktı: assets/icon.png (tam), assets/icon-foreground.png (saydam zemin), assets/icon-background.png
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets');
fs.mkdirSync(OUT, { recursive: true });
const N = 1024;

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
function png(pixels) {
  const raw = Buffer.alloc((N * 4 + 1) * N);
  for (let y = 0; y < N; y++) { raw[y * (N * 4 + 1)] = 0; pixels.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const C1 = [200, 178, 244], C2 = [230, 201, 227], C3 = [246, 220, 138], INK = [31, 29, 36];
function bg(x, y) {
  const t = Math.min(1, Math.max(0, (x * 0.35 + y) / (N * 1.35)));
  return t < 0.45 ? mix(C1, C2, t / 0.45) : mix(C2, C3, (t - 0.45) / 0.55);
}
// "L" harfi: dikey ve yatay yuvarlak uçlu çubuklar (simge güvenli alanının ortasında)
const S = 34; // çubuk yarı kalınlığı
const segs = [[430, 330, 430, 690], [430, 690, 640, 690]];
function distSeg(px, py, [x1, y1, x2, y2]) {
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
// Leylak noktası (vurgu)
const dot = [640, 400, 44];
function draw(withBg, withFg) {
  const px = Buffer.alloc(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let col = withBg ? bg(x, y) : [0, 0, 0];
    let a = withBg ? 255 : 0;
    if (withFg) {
      const d = Math.min(...segs.map((s) => distSeg(x + 0.5, y + 0.5, s))) - S;
      const cov = Math.max(0, Math.min(1, 0.5 - d));
      const dd = Math.hypot(x + 0.5 - dot[0], y + 0.5 - dot[1]) - dot[2];
      const covDot = Math.max(0, Math.min(1, 0.5 - dd));
      if (cov > 0) { col = withBg ? mix(col, INK, cov) : INK; a = withBg ? 255 : Math.round(255 * cov); }
      if (covDot > 0) { const c = [255, 255, 255]; col = withBg ? mix(col, c, covDot * 0.85) : c; a = withBg ? 255 : Math.round(230 * covDot); }
    }
    const i = (y * N + x) * 4;
    px[i] = col[0]; px[i + 1] = col[1]; px[i + 2] = col[2]; px[i + 3] = a;
  }
  return px;
}
fs.writeFileSync(path.join(OUT, 'icon-only.png'), png(draw(true, true)));
fs.writeFileSync(path.join(OUT, 'icon-foreground.png'), png(draw(false, true)));
fs.writeFileSync(path.join(OUT, 'icon-background.png'), png(draw(true, false)));
fs.writeFileSync(path.join(OUT, 'splash.png'), png(draw(true, true)));
fs.writeFileSync(path.join(OUT, 'splash-dark.png'), png(draw(true, true)));
console.log('Simgeler assets/ klasörüne yazıldı');
