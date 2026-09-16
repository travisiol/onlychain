/**
 * Brand assets from the owner's logo files, untouched except for cropping:
 *
 *   node scripts/brand.mjs "<lockup on black>.png" "<all-blue lockup, transparent>.png"
 *
 * Writes to public/brand/ (and app/icon.png):
 *   logo-dark.png   — the lockup on black, cropped to its bounds (+ margin): the landing panel
 *   mark-dark.png   — the rings on black, squared
 *   logo-light.png  — the all-blue lockup, transparent, cropped: the header on white pages
 *   mark-light.png  — the all-blue rings alone, transparent, squared: favicon, dialogs
 * and prints the dominant blue of the mark, which is the site's accent.
 *
 * Pure Node: a small PNG decoder/encoder (zlib is built in), nothing to install.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { inflateSync, deflateSync } from "node:zlib";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, "public/brand");
mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- PNG in
function decode(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let bitDepth = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error("interlaced PNG not supported");
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (bitDepth !== 8) throw new Error(`bit depth ${bitDepth} not supported`);
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`colour type ${colorType} not supported`);
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = channels;
  const stride = width * bpp;
  const px = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  let off = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[off++];
    const line = Buffer.from(raw.subarray(off, off + stride));
    off += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = v & 255;
    }
    for (let x = 0; x < width; x++) {
      const s = x * bpp;
      const d = (y * width + x) * 4;
      if (channels === 1) {
        px[d] = px[d + 1] = px[d + 2] = line[s];
        px[d + 3] = 255;
      } else if (channels === 2) {
        px[d] = px[d + 1] = px[d + 2] = line[s];
        px[d + 3] = line[s + 1];
      } else if (channels === 3) {
        px[d] = line[s];
        px[d + 1] = line[s + 1];
        px[d + 2] = line[s + 2];
        px[d + 3] = 255;
      } else {
        px.set(line.subarray(s, s + 4), d);
      }
    }
    prev = line;
  }
  return { width, height, px };
}

// ---------------------------------------------------------------- PNG out
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encode({ width, height, px }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    px.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// ---------------------------------------------------------------- helpers
function crop(img, x0, y0, w, h) {
  const px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) img.px.copy(px, y * w * 4, ((y0 + y) * img.width + x0) * 4, ((y0 + y) * img.width + x0 + w) * 4);
  return { width: w, height: h, px };
}

/** Bounding box of the content: pixels that differ from `bg` by more than `tol`, or (bg = null) pixels with alpha above `tol`. */
function bounds(img, bg, tol = 40) {
  let x0 = img.width;
  let y0 = img.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      const hit = bg === null ? img.px[i + 3] > tol : Math.abs(img.px[i] - bg[0]) + Math.abs(img.px[i + 1] - bg[1]) + Math.abs(img.px[i + 2] - bg[2]) > tol;
      if (hit) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  return { x0, y0, x1, y1 };
}

/** The most common strongly-blue colour, quantised to 4 levels per channel then averaged. */
function dominantBlue(img) {
  const buckets = new Map();
  for (let i = 0; i < img.px.length; i += 4) {
    const [r, g, b] = [img.px[i], img.px[i + 1], img.px[i + 2]];
    if (!(b > 180 && b - r > 120 && g > 100)) continue; // saturated blue only
    const key = `${r >> 4},${g >> 4},${b >> 4}`;
    const acc = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    acc.n++;
    acc.r += r;
    acc.g += g;
    acc.b += b;
    buckets.set(key, acc);
  }
  const best = [...buckets.values()].sort((a, b) => b.n - a.n)[0];
  if (!best) return null;
  const hex = (v) => Math.round(v / best.n).toString(16).padStart(2, "0");
  return { hex: `#${hex(best.r)}${hex(best.g)}${hex(best.b)}`, pixels: best.n };
}

// ---------------------------------------------------------------- run
const [darkPath, lightPath] = process.argv.slice(2);
if (!darkPath || !lightPath) {
  console.error('usage: node scripts/brand.mjs "<lockup on black>.png" "<all-blue lockup, transparent>.png"');
  process.exit(1);
}
const dark = decode(readFileSync(darkPath));
const light = decode(readFileSync(lightPath));

const blue = dominantBlue(dark);
console.log(`brand blue (from the logo): ${blue?.hex} over ${blue?.pixels} px`);

// the full lockup on black: crop to content + 6 % margin
{
  const b = bounds(dark, [0, 0, 0], 60);
  const m = Math.round((b.x1 - b.x0) * 0.06);
  const x0 = Math.max(0, b.x0 - m);
  const y0 = Math.max(0, b.y0 - m);
  const w = Math.min(dark.width - x0, b.x1 - b.x0 + 2 * m);
  const h = Math.min(dark.height - y0, b.y1 - b.y0 + 2 * m);
  writeFileSync(resolve(OUT, "logo-dark.png"), encode(crop(dark, x0, y0, w, h)));
  console.log(`logo-dark.png ${w}x${h} (content ${b.x0},${b.y0}–${b.x1},${b.y1})`);

  // the mark alone: the upper part of the lockup, above the wordmark gap; squared, on black
  const rows = [];
  for (let y = b.y0; y <= b.y1; y++) {
    let lit = 0;
    for (let x = b.x0; x <= b.x1; x++) {
      const i = (y * dark.width + x) * 4;
      if (dark.px[i] + dark.px[i + 1] + dark.px[i + 2] > 60) lit++;
    }
    rows.push(lit);
  }
  // the first empty band after the rings is the gap before the wordmark
  let gap = -1;
  for (let i = Math.round(rows.length * 0.3); i < rows.length; i++)
    if (rows[i] === 0) {
      gap = b.y0 + i;
      break;
    }
  const markBottom = gap > 0 ? gap : b.y0 + Math.round((b.y1 - b.y0) * 0.6);
  const mb = bounds(crop(dark, 0, 0, dark.width, markBottom), [0, 0, 0], 60);
  const side = Math.max(mb.x1 - mb.x0, mb.y1 - mb.y0);
  const pad = Math.round(side * 0.14);
  const size = side + 2 * pad;
  const cx = Math.round((mb.x0 + mb.x1) / 2);
  const cy = Math.round((mb.y0 + mb.y1) / 2);
  const sq = { width: size, height: size, px: Buffer.alloc(size * size * 4) };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const sx = cx - Math.floor(size / 2) + x;
      const sy = cy - Math.floor(size / 2) + y;
      const d = (y * size + x) * 4;
      // inside the source and above the wordmark gap: copy; otherwise black (the square is taller than the rings)
      if (sx >= 0 && sy >= 0 && sx < dark.width && sy < markBottom) dark.px.copy(sq.px, d, (sy * dark.width + sx) * 4, (sy * dark.width + sx) * 4 + 4);
      else sq.px.set([0, 0, 0, 255], d);
    }
  writeFileSync(resolve(OUT, "mark-dark.png"), encode(sq));
  console.log(`mark-dark.png ${size}x${size}`);
}

// the all-blue lockup: transparent background, so bounds come from alpha
{
  const b = bounds(light, null, 20);
  const m = Math.round((b.x1 - b.x0) * 0.03);
  const x0 = Math.max(0, b.x0 - m);
  const y0 = Math.max(0, b.y0 - m);
  const w = Math.min(light.width - x0, b.x1 - b.x0 + 2 * m);
  const h = Math.min(light.height - y0, b.y1 - b.y0 + 2 * m);
  writeFileSync(resolve(OUT, "logo-light.png"), encode(crop(light, x0, y0, w, h)));
  console.log(`logo-light.png ${w}x${h} (content ${b.x0},${b.y0}–${b.x1},${b.y1})`);

  // the rings alone: rows above the first transparent band after the rings
  let gap = -1;
  for (let y = b.y0 + Math.round((b.y1 - b.y0) * 0.3); y <= b.y1; y++) {
    let lit = 0;
    for (let x = b.x0; x <= b.x1; x++) if (light.px[(y * light.width + x) * 4 + 3] > 20) lit++;
    if (lit === 0) {
      gap = y;
      break;
    }
  }
  const markBottom = gap > 0 ? gap : b.y0 + Math.round((b.y1 - b.y0) * 0.6);
  const mb = bounds(crop(light, 0, 0, light.width, markBottom), null, 20);
  const side = Math.max(mb.x1 - mb.x0, mb.y1 - mb.y0);
  const pad = Math.round(side * 0.08);
  const size = side + 2 * pad;
  const cx = Math.round((mb.x0 + mb.x1) / 2);
  const cy = Math.round((mb.y0 + mb.y1) / 2);
  const sq = { width: size, height: size, px: Buffer.alloc(size * size * 4) };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const sx = cx - Math.floor(size / 2) + x;
      const sy = cy - Math.floor(size / 2) + y;
      const d = (y * size + x) * 4;
      if (sx >= 0 && sy >= 0 && sx < light.width && sy < markBottom) light.px.copy(sq.px, d, (sy * light.width + sx) * 4, (sy * light.width + sx) * 4 + 4);
      // else: stays transparent
    }
  writeFileSync(resolve(OUT, "mark-light.png"), encode(sq));
  writeFileSync(resolve(ROOT, "src/app/icon.png"), encode(sq));
  console.log(`mark-light.png ${size}x${size} (also src/app/icon.png)`);
}
