/**
 * Generates the sample media: abstract SVG art, one palette per creator.
 *
 *   node scripts/seed-art.mjs          → public/seed/{avatar,cover,art}-*.svg
 *
 * Deterministic (seeded PRNG), no dependency, no raster. Each creator in
 * src/lib/seed/personas.json gets an avatar, a cover and eight artworks in
 * their hue; each fan gets an avatar. The seed (src/lib/server/seed.ts)
 * references these files by name.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const personas = require("../src/lib/seed/personas.json");
const OUT = resolve(import.meta.dirname, "../public/seed");
mkdirSync(OUT, { recursive: true });

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hsl = (h, s, l, a = 1) => `hsl(${((h % 360) + 360) % 360} ${s}% ${l}%${a < 1 ? ` / ${a}` : ""})`;
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const between = (r, a, b) => a + r() * (b - a);

function grain(id, opacity = 0.18) {
  return `<filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" result="n"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="${opacity}"/></feComponentTransfer><feBlend in2="SourceGraphic" mode="soft-light"/></filter>`;
}

function blur(id, amount) {
  return `<filter id="${id}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="${amount}"/></filter>`;
}

/** A blob: a closed cubic path around a centre with jittered radius. */
function blob(r, cx, cy, radius, points = 7) {
  const pts = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const rad = radius * between(r, 0.72, 1.18);
    pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
  }
  let d = "";
  for (let i = 0; i < points; i++) {
    const p0 = pts[(i - 1 + points) % points];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % points];
    const p3 = pts[(i + 2) % points];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += i === 0 ? `M${p1[0].toFixed(1)},${p1[1].toFixed(1)}` : "";
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d + "Z";
}

function wave(r, w, h, y, amp, freq) {
  let d = `M0,${y}`;
  const steps = 24;
  for (let i = 1; i <= steps; i++) {
    const x = (i / steps) * w;
    const yy = y + Math.sin((i / steps) * Math.PI * freq + r() * 0.2) * amp;
    d += ` L${x.toFixed(1)},${yy.toFixed(1)}`;
  }
  return d + ` L${w},${h} L0,${h} Z`;
}

function svgOpen(w, h) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`;
}

function avatar(seed, hue) {
  const r = rng(seed);
  const w = 400;
  const h2 = hue + between(r, 30, 70) * (r() > 0.5 ? 1 : -1);
  let s = svgOpen(w, w);
  s += `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hsl(hue, 70, 62)}"/><stop offset="1" stop-color="${hsl(h2, 65, 45)}"/></linearGradient>${blur("b", 28)}${grain("n", 0.12)}</defs>`;
  s += `<rect width="${w}" height="${w}" fill="url(#g)"/>`;
  // two soft blobs and a crisp ring — abstract, never a face
  s += `<path d="${blob(r, between(r, 120, 280), between(r, 120, 280), between(r, 90, 150))}" fill="${hsl(hue + 20, 90, 82, 0.75)}" filter="url(#b)"/>`;
  s += `<path d="${blob(r, between(r, 100, 300), between(r, 140, 300), between(r, 70, 120))}" fill="${hsl(h2 - 20, 80, 30, 0.6)}" filter="url(#b)"/>`;
  const cx = between(r, 150, 250);
  const cy = between(r, 150, 250);
  s += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${between(r, 70, 110).toFixed(0)}" fill="none" stroke="${hsl(hue, 40, 96, 0.9)}" stroke-width="${between(r, 6, 14).toFixed(0)}"/>`;
  s += `<circle cx="${(cx + between(r, -60, 60)).toFixed(0)}" cy="${(cy + between(r, -60, 60)).toFixed(0)}" r="${between(r, 14, 30).toFixed(0)}" fill="${hsl(hue, 30, 98)}"/>`;
  s += `<rect width="${w}" height="${w}" fill="${hsl(hue, 50, 50)}" filter="url(#n)" opacity="0.5"/>`;
  return s + "</svg>";
}

function cover(seed, hue) {
  const r = rng(seed);
  const w = 1200;
  const h = 400;
  const h2 = hue + between(r, 40, 90);
  let s = svgOpen(w, h);
  s += `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0.6"><stop offset="0" stop-color="${hsl(hue - 15, 60, 22)}"/><stop offset="0.55" stop-color="${hsl(hue, 70, 48)}"/><stop offset="1" stop-color="${hsl(h2, 75, 62)}"/></linearGradient>${blur("b", 40)}${grain("n", 0.14)}</defs>`;
  s += `<rect width="${w}" height="${h}" fill="url(#g)"/>`;
  for (let i = 0; i < 4; i++) {
    s += `<path d="${blob(r, between(r, 0, w), between(r, 0, h), between(r, 120, 260))}" fill="${hsl(hue + between(r, -30, 40), 80, between(r, 55, 85), 0.5)}" filter="url(#b)"/>`;
  }
  s += `<path d="${wave(r, w, h, between(r, 220, 300), between(r, 20, 45), between(r, 2, 4))}" fill="${hsl(hue, 45, 18, 0.35)}"/>`;
  s += `<rect width="${w}" height="${h}" fill="${hsl(hue, 50, 50)}" filter="url(#n)" opacity="0.6"/>`;
  return s + "</svg>";
}

const RATIOS = [
  [1200, 900],
  [1200, 900],
  [1000, 1250],
  [1200, 1200],
  [1200, 800],
  [1000, 1250],
];

function art(seed, hue) {
  const r = rng(seed);
  const [w, h] = pick(r, RATIOS);
  const scheme = pick(r, ["duo", "mono", "split", "pop"]);
  const h2 = scheme === "pop" ? hue + 150 : hue + between(r, 25, 70) * (r() > 0.5 ? 1 : -1);
  const dark = r() > 0.55;
  const bgA = dark ? hsl(hue, 45, 14) : hsl(hue, 55, 92);
  const bgB = dark ? hsl(h2, 50, 26) : hsl(h2, 60, 84);
  let s = svgOpen(w, h);
  s += `<defs><linearGradient id="g" x1="0" y1="0" x2="${r() > 0.5 ? 1 : 0}" y2="1"><stop offset="0" stop-color="${bgA}"/><stop offset="1" stop-color="${bgB}"/></linearGradient>${blur("b", between(r, 30, 70))}${blur("b2", 8)}${grain("n", 0.16)}<clipPath id="c"><rect width="${w}" height="${h}"/></clipPath></defs>`;
  s += `<rect width="${w}" height="${h}" fill="url(#g)"/>`;
  s += `<g clip-path="url(#c)">`;
  const blobs = Math.floor(between(r, 2, 5));
  for (let i = 0; i < blobs; i++) {
    const hh = hue + between(r, -20, 60);
    s += `<path d="${blob(r, between(r, 0, w), between(r, 0, h), between(r, 180, 420))}" fill="${hsl(hh, 85, dark ? between(r, 45, 70) : between(r, 55, 75), 0.75)}" filter="url(#b)"/>`;
  }
  const motif = pick(r, ["rings", "bars", "dots", "arc", "grid"]);
  const ink = dark ? hsl(hue, 30, 96, 0.9) : hsl(hue, 60, 20, 0.85);
  if (motif === "rings") {
    const cx = between(r, w * 0.3, w * 0.7);
    const cy = between(r, h * 0.3, h * 0.7);
    for (let i = 0; i < 5; i++) s += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${(60 + i * between(r, 50, 90)).toFixed(0)}" fill="none" stroke="${ink}" stroke-width="${between(r, 2, 10).toFixed(0)}" opacity="${(1 - i * 0.15).toFixed(2)}"/>`;
  } else if (motif === "bars") {
    const n = Math.floor(between(r, 5, 11));
    const bw = w / n;
    for (let i = 0; i < n; i++) {
      const bh = between(r, h * 0.15, h * 0.8);
      s += `<rect x="${(i * bw + bw * 0.2).toFixed(0)}" y="${(h - bh).toFixed(0)}" width="${(bw * 0.6).toFixed(0)}" height="${bh.toFixed(0)}" rx="${(bw * 0.3).toFixed(0)}" fill="${hsl(hue + i * 6, 70, dark ? 70 : 40, 0.8)}"/>`;
    }
  } else if (motif === "dots") {
    const step = between(r, 70, 120);
    for (let y = step / 2; y < h; y += step)
      for (let x = step / 2; x < w; x += step) {
        const d = Math.hypot(x - w / 2, y - h / 2) / Math.hypot(w / 2, h / 2);
        s += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(4 + (1 - d) * step * 0.28).toFixed(1)}" fill="${ink}" opacity="${(0.25 + (1 - d) * 0.7).toFixed(2)}"/>`;
      }
  } else if (motif === "arc") {
    const cx = between(r, w * 0.2, w * 0.8);
    const cy = between(r, h * 0.6, h * 1.1);
    const R = between(r, h * 0.4, h * 0.9);
    s += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${R.toFixed(0)}" fill="${hsl(h2, 80, dark ? 62 : 55, 0.9)}"/>`;
    s += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${(R * 0.7).toFixed(0)}" fill="url(#g)"/>`;
    s += `<circle cx="${(cx + R * 0.5).toFixed(0)}" cy="${(cy - R * 0.9).toFixed(0)}" r="${between(r, 20, 60).toFixed(0)}" fill="${ink}"/>`;
  } else {
    const step = between(r, 90, 160);
    for (let x = step; x < w; x += step) s += `<line x1="${x.toFixed(0)}" y1="0" x2="${x.toFixed(0)}" y2="${h}" stroke="${ink}" stroke-width="1.5" opacity="0.35"/>`;
    for (let y = step; y < h; y += step) s += `<line x1="0" y1="${y.toFixed(0)}" x2="${w}" y2="${y.toFixed(0)}" stroke="${ink}" stroke-width="1.5" opacity="0.35"/>`;
    s += `<path d="${blob(r, w / 2, h / 2, Math.min(w, h) * 0.28)}" fill="${hsl(h2, 85, 60, 0.95)}" filter="url(#b2)"/>`;
  }
  s += `</g>`;
  s += `<rect width="${w}" height="${h}" fill="${hsl(hue, 50, 50)}" filter="url(#n)" opacity="0.55"/>`;
  return s + "</svg>";
}

let files = 0;
for (const c of personas.creators) {
  writeFileSync(resolve(OUT, `avatar-${c.account}.svg`), avatar(1000 + c.account, c.hue));
  writeFileSync(resolve(OUT, `cover-${c.account}.svg`), cover(2000 + c.account, c.hue));
  for (let i = 1; i <= 8; i++) writeFileSync(resolve(OUT, `art-${c.account}-${i}.svg`), art(3000 + c.account * 31 + i * 7, c.hue));
  files += 10;
}
for (const f of personas.fans) {
  writeFileSync(resolve(OUT, `avatar-${f.account}.svg`), avatar(1000 + f.account, (f.account * 47) % 360));
  files++;
}
console.log(`wrote ${files} files to ${OUT}`);
