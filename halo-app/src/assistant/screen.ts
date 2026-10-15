// Sleep from the screen (chunk 17c): with Usage access, the overnight screen-off stretch is a
// night's estimate. Read on launch and return to the app (throttled), kept in MMKV for the PA and
// the wake-time learner. Without the native module (an older build) everything reads as unavailable.

import { useMMKVString } from 'react-native-mmkv';

import { kv } from '@/lib/kv';
import { type SleepNight, sleepFromScreen } from '@/shared';

import ScreenTime from '../../modules/screen-time/src/ScreenTimeModule';

const NIGHTS_KEY = 'screen.nights';
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
  } catch {
    // Keep the last nights; the next return to the app tries again.
  }
}

const parse = (raw: string | undefined): SleepNight[] => {
  try {
    return raw ? (JSON.parse(raw) as SleepNight[]) : [];
  } catch {
    return [];
  }
};

/** The screen's nights, newest first. */
export const readScreenNights = () => parse(kv.getString(NIGHTS_KEY));

export function useScreenNights(): SleepNight[] {
  const [raw] = useMMKVString(NIGHTS_KEY, kv);
  return parse(raw);
}
