import { vars } from 'nativewind';

import data from './themes.generated.json';

export type Tier = 'high' | 'mid' | 'low';
export type ThemeId = `${Tier}-${1 | 2 | 3}`;
type GeneratedTheme = (typeof data.themes)['high-1'];
export type ThemeColors = GeneratedTheme['colors'];
export type ThemeColorKey = keyof ThemeColors;
export type Theme = Omit<GeneratedTheme, 'id' | 'tier'> & { id: ThemeId; tier: Tier };

export const themes = data.themes as Record<ThemeId, Theme>;
export const themeIds = Object.keys(themes) as ThemeId[];
/** Layout zones (fractions of screen height) where hero text contrast was verified. */
export const zones = data.zones;
/** Calm 3-stop gradient per tier (top, mid, bottom): launch sequence and CDN fallback. */
export const tierGradients = data.tierGradients as Record<Tier, [string, string, string]>;

/**
 * First run and onboarding: high-2, the mountain on the intro screen. Matches the :root defaults
 * the theme script writes into global.css.
 */
export const DEFAULT_THEME_ID: ThemeId = 'high-2';

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && value in themes;
}

function channels(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

export function withAlpha(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const kebab = (key: string) => key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/** NativeWind CSS variables for a full set of color tokens. */
export const colorVars = (colors: ThemeColors) =>
  vars(
    Object.fromEntries(
      Object.entries(colors).map(([key, hex]) => [`--c-${kebab(key)}`, channels(hex)]),
    ),
  );

export type Mode = 'light' | 'dark';
/** SPEC §3: calm light surfaces, not a dark default. Photos keep the dark tokens they were verified with. */
export const DEFAULT_MODE: Mode = 'light';
export const isMode = (value: unknown): value is Mode => value === 'light' || value === 'dark';

type Hsl = [h: number, s: number, l: number];

function toHsl(hex: string): Hsl {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r
      ? ((g - b) / d + (g < b ? 6 : 0)) / 6
      : max === g
        ? ((b - r) / d + 2) / 6
        : ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function fromHsl([h, s, l]: Hsl): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** The theme's hue at a set saturation (capped by its own) and lightness. */
const tone = (hex: string, s: number, l: number) => {
  const [h, own] = toHsl(hex);
  return fromHsl([h, Math.min(s, own), l]);
};

/**
 * Light tokens for a hero theme: warm paper tinted by the tier's accent, deep ink for text, and
 * the state colors darkened to read on paper. The veil stays dark (sheet scrims).
 */
function lightColors(c: ThemeColors): ThemeColors {
  const ink = tone(c.accent, 0.28, 0.14);
  return {
    bg: tone(c.accent, 0.22, 0.955),
    surface: tone(c.accent, 0.3, 0.99),
    glass: ink,
    hairline: ink,
    text: ink,
    muted: tone(c.accent, 0.1, 0.4),
    accent: tone(c.accent, 0.4, 0.3),
    onAccent: tone(c.accent, 0.22, 0.97),
    arc: ink,
    dock: tone(c.accent, 0.3, 0.99),
    veil: tone(c.veil, 0.3, 0.08),
    strength: tone(c.strength, 0.5, 0.34),
    steady: tone(c.steady, 0.45, 0.32),
    opportunity: tone(c.opportunity, 0.55, 0.42),
  };
}

const resolved = new Map<string, Theme>();
/** A hero theme in a mode: same id, image and veil; light mode swaps the color tokens. */
export function themeIn(id: ThemeId, mode: Mode): Theme {
  if (mode === 'dark') return themes[id];
  const key = `${id}:light`;
  let theme = resolved.get(key);
  if (!theme) {
    theme = { ...themes[id], colors: lightColors(themes[id].colors) };
    resolved.set(key, theme);
  }
  return theme;
}

// Built once per theme and mode: NativeWind CSS variables for every color token.
const varsCache = new Map<ThemeColors, ReturnType<typeof vars>>();
export function themeVars(theme: Theme) {
  let style = varsCache.get(theme.colors);
  if (!style) {
    style = colorVars(theme.colors);
    varsCache.set(theme.colors, style);
  }
  return style;
}
