// How each Vitals area looks, and the hero's band pick held for the day so it doesn't move under
// the user as readings arrive.

import { useEffect } from 'react';
import { useMMKVString } from 'react-native-mmkv';

import {
  ExerciseIcon,
  HeartIcon,
  MoonIcon,
  PhoneIcon,
  ReportIcon,
  ScaleIcon,
} from '@/components/icons';
import { kv } from '@/lib/kv';
import { type Area, type AreaKey, type AreaState, pickBands } from '@/shared';
import type { ThemeColors } from '@/theme/themes';

export const AREA_ICONS: Record<AreaKey, typeof MoonIcon> = {
  sleep: MoonIcon,
  heart: HeartIcon,
  movement: ExerciseIcon,
  screen: PhoneIcon,
  body: ScaleIcon,
  blood: ReportIcon,
};

/** The theme's tint for a state: Thriving = strength, Steady = steady, Needs care = opportunity. */
export function stateColor(colors: ThemeColors, state: AreaState): string {
  if (state === 'thriving') return colors.strength;
  if (state === 'steady') return colors.steady;
  return colors.opportunity;
}

const BANDS_KEY = 'vitals.bands';

/** The three areas on the hero: picked once a day (see `pickBands`), then held. */
export function useHeldBands(day: string, areas: readonly Area[]): Area[] {
  const [raw, setRaw] = useMMKVString(BANDS_KEY, kv);
  let held: AreaKey[] | null = null;
  try {
    const parsed = raw ? (JSON.parse(raw) as { day: string; keys: AreaKey[] }) : null;
    if (parsed?.day === day) held = parsed.keys;
  } catch {
    held = null;
  }
  const keys = pickBands(areas, held);
  const next = JSON.stringify({ day, keys });
  useEffect(() => {
    if (next !== raw) setRaw(next);
  }, [next, raw, setRaw]);
  return keys.map((k) => areas.find((a) => a.key === k)!);
}
