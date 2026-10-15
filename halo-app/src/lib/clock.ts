// Clock times the way the device shows them: the Android 24-hour setting decides between "17:00"
// and "5 pm". Every clock time in the app goes through here or halo-shared's formatClock.

import { getCalendars, useCalendars } from 'expo-localization';

import { formatClock, hourOfDay } from '@/shared';

/** Whether the device uses a 24-hour clock right now (defaults to 24-hour if unknown). */
export const uses24h = () => getCalendars()[0]?.uses24hourClock ?? true;

/** The device's clock setting, re-rendering if the user changes it. */
export function useClock24(): boolean {
  return useCalendars()[0]?.uses24hourClock ?? true;
}

/** A moment's time on the device's clock: "18:04" or "6:04 pm". */
export const formatTime = (date: Date, h24 = uses24h()) =>
  formatClock(Math.floor(hourOfDay(date) * 60) / 60, h24);
