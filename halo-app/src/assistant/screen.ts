// Sleep from the screen (chunk 17c): with Usage access, the overnight screen-off stretch is a
// night's estimate. Read on launch and return to the app (throttled), kept in MMKV for the PA,
// the wake-time learner and the Vitals model (with each day's screen-on and late minutes). Without the native module (an older build) everything reads as unavailable.

import { useMMKVString } from 'react-native-mmkv';

import { kv } from '@/lib/kv';
import { type ScreenDay, screenDays, type SleepNight, sleepFromScreen } from '@/shared';

import ScreenTime from '../../modules/screen-time/src/ScreenTimeModule';

const NIGHTS_KEY = 'screen.nights';
const DAYS_KEY = 'screen.days';
const READ_AT_KEY = 'screen.readAt';
const LOOKBACK_MS = 10 * 24 * 3_600_000;
const THROTTLE_MS = 30 * 60_000;

export type UsageAccess = 'granted' | 'denied' | 'unavailable';

export function usageAccess(): UsageAccess {
  if (!ScreenTime) return 'unavailable';
  try {
    return ScreenTime.hasAccess() ? 'granted' : 'denied';
  } catch {
    return 'unavailable';
  }
}

export function openUsageAccess() {
  ScreenTime?.openSettings();
}

/** Re-reads the screen's nights (at most every 30 minutes unless forced). */
export async function refreshScreenNights(force = false) {
  if (usageAccess() !== 'granted') return;
  const now = Date.now();
  if (!force && now - (kv.getNumber(READ_AT_KEY) ?? 0) < THROTTLE_MS) return;
  kv.set(READ_AT_KEY, now);
  try {
    const events = await ScreenTime!.screenEvents(now - LOOKBACK_MS, now);
    kv.set(NIGHTS_KEY, JSON.stringify(sleepFromScreen(events)));
    kv.set(DAYS_KEY, JSON.stringify(screenDays(events)));
  } catch {
    // Keep the last nights; the next return to the app tries again.
  }
}

const parse = <T>(raw: string | undefined): T[] => {
  try {
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
};

/** The screen's nights, newest first. */
export const readScreenNights = () => parse<SleepNight>(kv.getString(NIGHTS_KEY));

export function useScreenNights(): SleepNight[] {
  const [raw] = useMMKVString(NIGHTS_KEY, kv);
  return parse<SleepNight>(raw);
}

/** Screen-on and late minutes per day, newest first (whole days only, plus today so far). */
export function useScreenDays(): ScreenDay[] {
  const [raw] = useMMKVString(DAYS_KEY, kv);
  return parse<ScreenDay>(raw);
}
