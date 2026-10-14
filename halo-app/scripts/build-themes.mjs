#!/usr/bin/env node
// Derives one calm, dark, Oura-style theme per hero image and writes src/theme/themes.generated.json.
//
//   npm run themes                      generate (fails if any image can't reach text contrast)
//   npm run themes -- --preview <dir>   also write a contact sheet PNG per image to <dir>
//
// Also rewrites the :root token block in src/global.css with the default theme, so the CSS
// defaults and the generated JSON can't drift.
// Pipeline per image: sample regions → derive tokens in OKLCH with clamped chroma → find the
// smallest text-zone veil that gives white text enough contrast over the real pixels → blurhash.
// Layout zones (fractions of screen height) are exported so the Today screen places text where
// the contrast was verified.

import { encode } from 'blurhash';
import { clampChroma, converter, formatHex, wcagContrast } from 'culori';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HERO_DIR = resolve(ROOT, '../references/hero');
const OUT = join(ROOT, 'src/theme/themes.generated.json');
const GLOBAL_CSS = join(ROOT, 'src/global.css');
// First run and onboarding (the intro's mountain); its tokens become the :root CSS defaults.
const DEFAULT_THEME = 'high-2';
const CDN = 'https://ik.imagekit.io/jayowiee/halo/bg';

const TIERS = ['high', 'mid', 'low'];
const VARIANTS = [1, 2, 3];

// Layout zones the Today screen must respect (fractions of screen height).
const ZONES = {
  veilMid: 0.3, // veil eases to its lightest here (arc + score sit around the focus object)
  tagline: [0.5, 0.57], // serif tagline: large text, needs 3:1
  body: [0.57, 0.7], // description + Learn more: needs 4.5:1
  fadeStart: 0.66, // hero starts fading into bg
  fadeEnd: 0.82, // fully bg below this (Learn more summary sits on bg)
};
const VEIL_TOP = 0.3;
const VEIL_MID = 0.15;
const VEIL_STEP = 0.05;
const VEIL_MAX = 0.45;
const TARGET = { tagline: 3, body: 4.5 };
const PERCENTILE = 0.95;

// Token constraints: dark tinted surfaces, muted accents (Oura uses color only for state).
const BG_L = { high: 0.18, mid: 0.18, low: 0.19 };
const BG_C_MAX = 0.03;
const ACCENT_C = [0.05, 0.09];
const STATE = { strength: 210, steady: 100, opportunity: 50 }; // base hues, nudged toward accent

const toOklch = converter('oklch');
const toRgb = converter('rgb');
const hex = (c) => formatHex(clampChroma({ mode: 'oklch', ...c }, 'oklch'));

function srgbLum([r, g, b]) {
  const f = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function mixHue(from, to, t) {
  const d = ((to - from + 540) % 360) - 180;
  return (from + d * t + 360) % 360;
}

async function loadPixels(file, width, height) {
  const { data, info } = await sharp(file)
    .resize(width, height, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function regionMean(px, y0, y1) {
  let L = 0,
    a = 0,
    b = 0,
    n = 0;
  const toLab = converter('oklab');
  for (let y = Math.floor(px.height * y0); y < Math.floor(px.height * y1); y++) {
    for (let x = 0; x < px.width; x += 2) {
      const i = (y * px.width + x) * 3;
      const lab = toLab({
        mode: 'rgb',
        r: px.data[i] / 255,
        g: px.data[i + 1] / 255,
        b: px.data[i + 2] / 255,
      });
      L += lab.l;
      a += lab.a;
      b += lab.b;
      n++;
    }
  }
  return toOklch({ mode: 'oklab', l: L / n, a: a / n, b: b / n });
}

// Dominant characterful hue: chroma-weighted hue histogram, lightly smoothed.
function accentHue(px) {
  const bins = new Float64Array(36);
  const chroma = new Float64Array(36);
  const counts = new Float64Array(36);
  for (let i = 0; i < px.data.length; i += 3 * 3) {
    const c = toOklch({
      mode: 'rgb',
      r: px.data[i] / 255,
      g: px.data[i + 1] / 255,
      b: px.data[i + 2] / 255,
    });
    if (!c.h || c.c < 0.03) continue;
    const bin = Math.floor(c.h / 10) % 36;
    bins[bin] += c.c;
    chroma[bin] += c.c;
    counts[bin]++;
  }
  let best = 0,
    bestScore = -1;
  for (let i = 0; i < 36; i++) {
    const score = bins[(i + 35) % 36] * 0.5 + bins[i] + bins[(i + 1) % 36] * 0.5;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return { h: best * 10 + 5, c: counts[best] ? chroma[best] / counts[best] : 0.06 };
}

function deriveTokens(tier, regions, accent) {
  const bottom = regions.bottom;
  let h = bottom.c > 0.012 ? bottom.h : (regions.all.h ?? 220);
  let c = Math.min(bottom.c * 0.6, BG_C_MAX);
  if (tier === 'low') {
    // Reassuring, not grim: a touch warmer and never fully grey.
    h = mixHue(h, 60, 0.2);
    c = Math.max(c, 0.014);
  }
  const L = BG_L[tier];
  const bg = { l: L, c, h };

  const accentC = Math.min(Math.max(accent.c * 0.6, ACCENT_C[0]), ACCENT_C[1]);
  let accentTok = { l: 0.78, c: accentC, h: accent.h };
  while (wcagContrast(hex(accentTok), hex(bg)) < 4.5 && accentTok.l < 0.95) accentTok.l += 0.01;

  const state = Object.fromEntries(
    Object.entries(STATE).map(([k, base]) => [
      k,
      hex({ l: 0.8, c: 0.085, h: mixHue(base, accent.h, 0.1) }),
    ]),
  );

  return {
    bg: hex(bg),
    surface: hex({ l: L + 0.04, c, h }),
    glass: hex({ l: 0.93, c: Math.min(c, 0.02), h }),
    hairline: hex({ l: 0.93, c: Math.min(c, 0.02), h }),
    text: hex({ l: 0.95, c: 0.008, h }),
    muted: hex({ l: 0.74, c: Math.min(c, 0.018), h }),
    accent: hex(accentTok),
    onAccent: hex(bg),
    arc: hex({ l: 0.94, c: 0.02, h: accent.h }),
    dock: hex({ l: L + 0.07, c, h }),
    veil: hex({ l: 0.13, c: Math.min(c, 0.03), h }),
    ...state,
  };
}

// Veil alpha and bg-fade alpha at height fraction y, for a given text-zone veil alpha.
function veilAlphaAt(y, zoneAlpha) {
  if (y <= ZONES.veilMid) return VEIL_TOP + (VEIL_MID - VEIL_TOP) * (y / ZONES.veilMid);
  const ramp0 = ZONES.tagline[0] - 0.06;
  if (y <= ramp0) return VEIL_MID;
  if (y <= ZONES.tagline[0]) return VEIL_MID + (zoneAlpha - VEIL_MID) * ((y - ramp0) / 0.06);
  return zoneAlpha;
}
function fadeAlphaAt(y) {
  if (y <= ZONES.fadeStart) return 0;
  if (y >= ZONES.fadeEnd) return 1;
  const t = (y - ZONES.fadeStart) / (ZONES.fadeEnd - ZONES.fadeStart);
  return t * t * (3 - 2 * t); // smoothstep, matches the eased stops rendered in the app
}

function zoneContrast(px, [y0, y1], zoneAlpha, tokens) {
  const veil = toRgb(tokens.veil);
  const bg = toRgb(tokens.bg);
  const text = srgbLum(Object.values(toRgb(tokens.text)).slice(1, 4));
  const lums = [];
  for (let y = Math.floor(px.height * y0); y < Math.floor(px.height * y1); y++) {
    const f = y / px.height;
    const va = veilAlphaAt(f, zoneAlpha);
    const fa = fadeAlphaAt(f);
    for (let x = 0; x < px.width; x++) {
      const i = (y * px.width + x) * 3;
      // sRGB-space compositing, the same way the GPU blends the gradient layers.
      const ch = [veil.r, veil.g, veil.b].map((v, k) => {
        const base = (px.data[i + k] / 255) * (1 - va) + v * va;
        return base * (1 - fa) + [bg.r, bg.g, bg.b][k] * fa;
      });
      lums.push(srgbLum(ch));
    }
  }
  lums.sort((a, b) => a - b);
  const p = lums[Math.floor(lums.length * PERCENTILE)];
  return (text + 0.05) / (p + 0.05);
}

function findVeil(px, tokens) {
  for (let a = VEIL_MID; a <= VEIL_MAX + 1e-9; a += VEIL_STEP) {
    const tagline = zoneContrast(px, ZONES.tagline, a, tokens);
    const body = zoneContrast(px, ZONES.body, a, tokens);
    if (tagline >= TARGET.tagline && body >= TARGET.body) {
      return { alpha: +a.toFixed(2), tagline: +tagline.toFixed(2), body: +body.toFixed(2) };
    }
  }
  return {
    alpha: null,
    tagline: +zoneContrast(px, ZONES.tagline, VEIL_MAX, tokens).toFixed(2),
    body: +zoneContrast(px, ZONES.body, VEIL_MAX, tokens).toFixed(2),
  };
}

async function blurhashFor(file) {
  const { data, info } = await sharp(file)
    .resize(32, 69, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return encode(new Uint8ClampedArray(data), info.width, info.height, 4, 7);
}

function tierGradient(themeRegions) {
  const avg = (key) => {
    const toLab = converter('oklab');
    const labs = themeRegions.map((r) => toLab({ mode: 'oklch', ...r[key] }));
    const m = labs.reduce((s, l) => ({ l: s.l + l.l, a: s.a + l.a, b: s.b + l.b }), {
      l: 0,
      a: 0,
      b: 0,
    });
    const c = toOklch({
      mode: 'oklab',
      l: m.l / labs.length,
      a: m.a / labs.length,
      b: m.b / labs.length,
    });
    return hex({
      l: Math.min(Math.max(c.l * 0.55, 0.24), 0.46),
      c: Math.min(c.c, 0.06),
      h: c.h ?? 220,
    });
  };
  return [avg('top'), avg('mid'), avg('bottom')];
}

function veilStops(zoneAlpha) {
  const ramp0 = ZONES.tagline[0] - 0.06;
  return [
    { at: 0, alpha: VEIL_TOP },
    { at: ZONES.veilMid, alpha: VEIL_MID },
    { at: +ramp0.toFixed(2), alpha: VEIL_MID },
    { at: ZONES.tagline[0], alpha: zoneAlpha },
    { at: 1, alpha: zoneAlpha },
  ];
}

async function contactSheet(dir, id, file, theme) {
  const W = 390,
    H = 844;
  const stops = theme.veil.stops
    .map(
      (s) => `<stop offset="${s.at}" stop-color="${theme.colors.veil}" stop-opacity="${s.alpha}"/>`,
    )
    .join('');
  const fade = [0, 0.25, 0.5, 0.75, 1]
    .map((t) => {
      const y = ZONES.fadeStart + (ZONES.fadeEnd - ZONES.fadeStart) * t;
      return `<stop offset="${y}" stop-color="${theme.colors.bg}" stop-opacity="${fadeAlphaAt(y)}"/>`;
    })
    .join('');
  const sw = Object.entries(theme.colors)
    .map(
      ([k, v], i) =>
        `<rect x="${12 + (i % 8) * 46}" y="${H - 96 + Math.floor(i / 8) * 46}" width="40" height="40" rx="8" fill="${v}" stroke="#ffffff33"/>`,
    )
    .join('');
  const y = (f) => Math.round(H * f);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="v" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient>
    <linearGradient id="f" x1="0" y1="0" x2="0" y2="1">${fade}</linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#v)"/><rect width="${W}" height="${H}" fill="url(#f)"/>
    <text x="${W / 2}" y="${y(0.43)}" font-family="serif" font-size="72" fill="${theme.colors.text}" text-anchor="middle">82</text>
    <text x="${W / 2}" y="${y(0.55)}" font-family="serif" font-size="40" fill="${theme.colors.text}" text-anchor="middle">Go get ’em</text>
    <text x="${W / 2}" y="${y(0.61)}" font-family="sans-serif" font-size="16" fill="${theme.colors.text}" text-anchor="middle">A protein-rich lunch keeps the momentum.</text>
    <text x="${W / 2}" y="${y(0.645)}" font-family="sans-serif" font-size="16" fill="${theme.colors.text}" text-anchor="middle">Steps are ahead of yesterday.</text>
    <text x="24" y="${y(0.75)}" font-family="sans-serif" font-size="14" fill="${theme.colors.accent}">STRENGTH ACCENT</text>
    <text x="24" y="${y(0.78)}" font-family="sans-serif" font-size="14" fill="${theme.colors.strength}">THRIVING</text>
    <text x="150" y="${y(0.78)}" font-family="sans-serif" font-size="14" fill="${theme.colors.steady}">STEADY</text>
    <text x="250" y="${y(0.78)}" font-family="sans-serif" font-size="14" fill="${theme.colors.opportunity}">OPPORTUNITY</text>
    ${sw}</svg>`;
  await sharp(file)
    .resize(W, H, { fit: 'cover' })
    .composite([{ input: Buffer.from(svg) }])
    .png()
    .toFile(join(dir, `${id}.png`));
}

// Space-separated RGB channels so Tailwind's /<alpha> modifiers work.
function channels(hexColor) {
  const n = parseInt(hexColor.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}
const kebab = (k) => k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

function writeCssDefaults(theme) {
  const begin = '/* themes:begin */';
  const end = '/* themes:end */';
  const css = readFileSync(GLOBAL_CSS, 'utf8');
  const a = css.indexOf(begin);
  const b = css.indexOf(end);
  if (a < 0 || b < 0) throw new Error(`${GLOBAL_CSS} is missing the ${begin} / ${end} markers`);
  const vars = Object.entries(theme.colors)
    .map(([k, v]) => `  --c-${kebab(k)}: ${channels(v)};`)
    .join('\n');
  const block = `${begin}\n/* Default theme (${theme.id}), generated by scripts/build-themes.mjs. */\n:root {\n${vars}\n}\n`;
  writeFileSync(GLOBAL_CSS, css.slice(0, a) + block + css.slice(b));
}

async function main() {
  const previewIdx = process.argv.indexOf('--preview');
  const previewDir = previewIdx > -1 ? resolve(process.argv[previewIdx + 1]) : null;
  if (previewDir) mkdirSync(previewDir, { recursive: true });

  const themes = {};
  const regionsByTier = { high: [], mid: [], low: [] };
  const failures = [];

  for (const tier of TIERS) {
    for (const n of VARIANTS) {
      const id = `${tier}-${n}`;
      const file = join(HERO_DIR, `hero-${id}.webp`);
      const px = await loadPixels(file, 117, 253);
      const regions = {
        top: regionMean(px, 0, 0.25),
        mid: regionMean(px, 0.25, 0.5),
        bottom: regionMean(px, 0.75, 1),
        all: regionMean(px, 0, 1),
      };
      regionsByTier[tier].push(regions);
      const colors = deriveTokens(tier, regions, accentHue(px));
      const veil = findVeil(px, colors);
      const result = `${id}: veil ${veil.alpha ?? `>${VEIL_MAX}`} · tagline ${veil.tagline}:1 · body ${veil.body}:1`;
      console.log(result);
      if (veil.alpha === null) failures.push(result);

      themes[id] = {
        id,
        tier,
        variant: n,
        image: `${CDN}/hero-${id}.webp`,
        blurhash: await blurhashFor(file),
        colors,
        veil: { alpha: veil.alpha ?? VEIL_MAX, stops: veilStops(veil.alpha ?? VEIL_MAX) },
        contrast: { tagline: veil.tagline, body: veil.body },
      };
      if (previewDir) await contactSheet(previewDir, id, file, themes[id]);
    }
  }

  if (failures.length) {
    console.error(
      `\nText contrast unreachable with veil ≤ ${VEIL_MAX}:\n  ${failures.join('\n  ')}`,
    );
    process.exit(1);
  }

  const output = {
    $comment: 'Generated by scripts/build-themes.mjs from references/hero. Do not edit by hand.',
    zones: ZONES,
    fade: { start: ZONES.fadeStart, end: ZONES.fadeEnd },
    tierGradients: Object.fromEntries(TIERS.map((t) => [t, tierGradient(regionsByTier[t])])),
    themes,
  };
  writeFileSync(OUT, JSON.stringify(output, null, 2) + '\n');
  writeCssDefaults(themes[DEFAULT_THEME]);
  console.log(`\nwrote ${OUT}${previewDir ? `\npreviews in ${previewDir}` : ''}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
