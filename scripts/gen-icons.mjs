// Gera os ícones PNG do PWA a partir das mesmas formas geométricas do icon.svg.
// Rasterização pura em Node (sem dependências), com supersampling 4× para bordas suaves.
// Uso: node scripts/gen-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const SS = 4; // supersampling
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

const BG = hex("#0E1626");
const RING = hex("#27395B");
const BLUE = hex("#4D9FFF");
const RED = hex("#FF4D5E");
const GREEN = hex("#2DD4A7");
const WHITE = hex("#E8EEF7");

// distância de um ponto P ao segmento AB
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function inTriangle(px, py, x1, y1, x2, y2, x3, y3) {
  const d1 = (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
  const d2 = (px - x3) * (y2 - y3) - (x2 - x3) * (py - y3);
  const d3 = (px - x1) * (y3 - y1) - (x3 - x1) * (py - y1);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

// Cor do ícone num ponto (x,y) no espaço 512×512. Retorna [r,g,b].
function sample(x, y) {
  let c = BG;
  // fundo: retângulo arredondado r=112 (fora => transparente-ish, mas mantemos BG p/ maskable)
  // círculo guia (stroke #27395B w=10)
  if (Math.abs(Math.hypot(x - 256, y - 256) - 150) <= 5) c = RING;
  // seta azul: linha + cabeça
  if (distSeg(x, y, 256, 256, 372, 140) <= 13) c = BLUE;
  if (inTriangle(x, y, 372, 140, 322, 150, 362, 190)) c = BLUE;
  // seta vermelha
  if (distSeg(x, y, 256, 256, 140, 372) <= 13) c = RED;
  if (inTriangle(x, y, 140, 372, 190, 362, 150, 322)) c = RED;
  // seta verde (mais fina, w=20)
  if (distSeg(x, y, 180, 300, 180, 200) <= 10) c = GREEN;
  if (inTriangle(x, y, 180, 200, 165, 232, 195, 232)) c = GREEN;
  // ponto central branco
  if (Math.hypot(x - 256, y - 256) <= 20) c = WHITE;
  return c;
}

// raster com supersampling para um tamanho alvo
function render(size) {
  const px = new Uint8Array(size * size * 4);
  const scale = 512 / size;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const X = (i + (sx + 0.5) / SS) * scale;
          const Y = (j + (sy + 0.5) / SS) * scale;
          const c = sample(X, Y);
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const n = SS * SS;
      const o = (j * size + i) * 4;
      px[o] = Math.round(r / n);
      px[o + 1] = Math.round(g / n);
      px[o + 2] = Math.round(b / n);
      px[o + 3] = 255;
    }
  }
  return px;
}

// codifica RGBA cru em PNG
function toPng(px, size) {
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const body = Buffer.concat([typeBuf, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([len, body, crc]);
  };
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // filtro 0 por scanline
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let j = 0; j < size; j++) {
    raw[j * (size * 4 + 1)] = 0;
    Buffer.from(px.buffer, j * size * 4, size * 4).copy(raw, j * (size * 4 + 1) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

const here = dirname(fileURLToPath(import.meta.url));
const pub = resolve(here, "..", "public");
for (const size of [180, 192, 512]) {
  const png = toPng(render(size), size);
  writeFileSync(resolve(pub, `icon-${size}.png`), png);
  console.log(`icon-${size}.png  (${png.length} bytes)`);
}
console.log("done");
