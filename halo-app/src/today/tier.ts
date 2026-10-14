// The day's hero tier and variant, persisted in MMKV `tier` (first written at onboarding). Only
// real decisions change it: a new day, or a rated score clearing the hysteresis.

import { kv } from '@/lib/kv';
import { dayKey, type HeroVariant, nextTier, pickHeroVariant, type Tier } from '@/shared';
import type { ThemeId } from '@/theme/themes';

const KEY = 'tier';

export type DayTier = {
  tier: Tier;
  variant: HeroVariant;
  day: string;
  /** Last tier change (epoch ms); null at the start of a day so the first rating can move it. */
  changedAt: number | null;
};

export function readDayTier(): DayTier | null {
  const raw = kv.getString(KEY);
  return raw ? (JSON.parse(raw) as DayTier) : null;
}

export function writeDayTier(record: DayTier) {
  kv.set(KEY, JSON.stringify(record));
}

export const themeIdFor = (record: DayTier): ThemeId => `${record.tier}-${record.variant}`;

/**
 * The record that should replace `stored`, or null when nothing changes. A new day starts high
 * with a fresh variant; within a day only a rated score (never a provisional one) can move it.
 */
export function decideDayTier(
  stored: DayTier | null,
  rated: number | null,
  now: Date,
): DayTier | null {
  const day = dayKey(now);
  if (!stored || stored.day !== day) {
    const previous = stored?.tier === 'high' ? stored.variant : undefined;
    return { tier: 'high', variant: pickHeroVariant(previous), day, changedAt: null };
  }
  if (rated == null) return null;
  const lastChange = stored.changedAt == null ? null : new Date(stored.changedAt);
  const tier = nextTier(stored.tier, rated, lastChange, now);
  if (tier === stored.tier) return null;
  return { tier, variant: pickHeroVariant(), day, changedAt: now.getTime() };
}
