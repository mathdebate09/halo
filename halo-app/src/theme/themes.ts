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

/** Matches the :root defaults the theme script writes into global.css. */
export const DEFAULT_THEME_ID: ThemeId = 'mid-2';

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

// Built once per theme: NativeWind CSS variables for every color token.
const varsCache = new Map<ThemeId, ReturnType<typeof vars>>();
export function themeVars(theme: Theme) {
  let style = varsCache.get(theme.id);
  if (!style) {
    style = vars(
      Object.fromEntries(
        Object.entries(theme.colors).map(([key, hex]) => [`--c-${kebab(key)}`, channels(hex)]),
      ),
    );
    varsCache.set(theme.id, style);
  }
  return style;
}
