// What every sticker shares: the three variants a tap cycles through, their colours, the fonts
// and the number formats. Stickers use StyleSheet, not className: their colours are per-variant
// values, and they are captured into the exported PNG exactly as drawn.

import { StyleSheet, type TextStyle } from 'react-native';

import { formatTime } from '@/lib/clock';

import type { ShareSnapshot } from '../snapshot';

export type Variant = 'light' | 'dark' | 'accent';
export const VARIANTS: Variant[] = ['light', 'dark', 'accent'];
export const nextVariant = (v: Variant) => VARIANTS[(VARIANTS.indexOf(v) + 1) % VARIANTS.length];

export type Ink = {
  fg: string;
  sub: string;
  /** Faint strokes: tracks, rules, unfilled bars. */
  faint: string;
  /** A soft halo of the opposite tone, so text stays legible over busy photos. */
  shadow: TextStyle;
  /** Solid fill for bubbles, plates and paper, and the text that sits on it. */
  fill: string;
  onFill: string;
};

const darkShadow: TextStyle = {
  textShadowColor: 'rgba(0,0,0,0.35)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 8,
};

/** Light: white over a photo. Dark: near-black, for bright photos. Accent: the day's theme. */
export function ink(variant: Variant, snapshot: ShareSnapshot): Ink {
  switch (variant) {
    case 'light':
      return {
        fg: '#FFFFFF',
        sub: 'rgba(255,255,255,0.82)',
        faint: 'rgba(255,255,255,0.28)',
        shadow: darkShadow,
        fill: '#FFFFFF',
        onFill: '#111111',
      };
    case 'dark':
      return {
        fg: '#111111',
        sub: 'rgba(17,17,17,0.78)',
        faint: 'rgba(17,17,17,0.22)',
        shadow: {
          textShadowColor: 'rgba(255,255,255,0.3)',
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 8,
        },
        fill: '#111111',
        onFill: '#FFFFFF',
      };
    case 'accent':
      return {
        fg: snapshot.theme.colors.accent,
        sub: snapshot.theme.colors.accent,
        faint: `${snapshot.theme.colors.accent}55`,
        shadow: darkShadow,
        fill: snapshot.theme.colors.accent,
        onFill: snapshot.theme.colors.onAccent,
      };
  }
}

export const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const pad2 = (n: number) => String(n).padStart(2, '0');
/** The card's time on the device's clock ("18:04" or "6:04 pm"). */
export const clock = (d: Date) => formatTime(d);
/** The share day (a dayKey, 4 am rollover) as its parts. */
export function dayParts(day: string) {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d, 12);
  return {
    dd: pad2(d),
    mm: pad2(m),
    yyyy: String(y),
    weekday: date.toLocaleDateString('en-US', { weekday: 'long' }),
  };
}
/** "EARLY READ" stands in for the score's label while the day is provisional. */
export const scoreLabel = (s: ShareSnapshot, label = 'SCORE') =>
  s.provisional ? 'EARLY READ' : label;

export const fonts = StyleSheet.create({
  serif: { fontFamily: 'InstrumentSerif_400Regular' },
  serifItalic: { fontFamily: 'InstrumentSerif_400Regular_Italic' },
  sans: { fontFamily: 'InclusiveSans_400Regular' },
  sansMedium: { fontFamily: 'InclusiveSans_500Medium' },
  anton: { fontFamily: 'Anton_400Regular' },
  mono: { fontFamily: 'SpaceMono_400Regular' },
  monoBold: { fontFamily: 'SpaceMono_700Bold' },
  hand: { fontFamily: 'Caveat_600SemiBold' },
  led: { fontFamily: 'VT323_400Regular' },
  label: { fontFamily: 'InclusiveSans_500Medium', fontSize: 12, letterSpacing: 2 },
});
