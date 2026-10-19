// GENERATED from halo-shared/src/sleep.ts by halo-shared/scripts/sync.mjs. Do not edit.

// Sleep without a tracker (SPEC §6 sleep chain, chunk 17c), and whether the pattern needs a nudge.
// A night is the longest overnight stretch of screen-off time, with short checks of the phone
// folded in. It is an estimate (the screen goes dark before sleep comes), labelled as such.

import { dayHour, dayKey } from './day';
import { median } from './learning';

export type ScreenEvent = { at: number; on: boolean };

export type SleepNight = {
  /** Calendar day the night ended on (like Health Connect's wake day). */
  day: string;
  start: number;
  end: number;
  hours: number;
};

const HOUR_MS = 3_600_000;
/** Shorter than this, a screen-off stretch is a pause, not a night. */
const MIN_NIGHT_HOURS = 3;
/** Checking the phone for less than this in the night doesn't end it. */
const MAX_CHECK_MS = 15 * 60_000;
/** A night must cover part of 01:00-05:00. */
const CORE: [number, number] = [1, 5];

const clockOf = (at: number) => {
  const d = new Date(at);
  return d.getHours() + d.getMinutes() / 60;
};

/** True when [start, end] covers some of the 01:00-05:00 core of the night. */
function coversCore(start: number, end: number) {
  for (let t = start; t <= end; t += 0.25 * HOUR_MS) {
    const h = clockOf(t);
    if (h >= CORE[0] && h < CORE[1]) return true;
  }
  return false;
}

/** Nights from screen on/off events (oldest first), one per wake day, longest stretch wins. */
export function sleepFromScreen(events: readonly ScreenEvent[]): SleepNight[] {
  // Screen-off intervals: from an "off" to the next "on".
  const off: { start: number; end: number }[] = [];
  let since: number | null = null;
  for (const e of [...events].sort((a, b) => a.at - b.at)) {
    if (!e.on && since == null) since = e.at;
    else if (e.on && since != null) {
      off.push({ start: since, end: e.at });
      since = null;
    }
  }
  // Fold quick checks of the phone into one stretch; count only the dark time.
  const stretches: { start: number; end: number; dark: number }[] = [];
  for (const o of off) {
    const last = stretches.at(-1);
    if (last && o.start - last.end <= MAX_CHECK_MS) {
      last.end = o.end;
      last.dark += o.end - o.start;
    } else {
      stretches.push({ ...o, dark: o.end - o.start });
    }
  }
  const byDay = new Map<string, SleepNight>();
  for (const s of stretches) {
    const hours = s.dark / HOUR_MS;
    if (hours < MIN_NIGHT_HOURS || !coversCore(s.start, s.end)) continue;
    const day = dayKey(new Date(s.end), 0);
    const best = byDay.get(day);
    if (!best || hours > best.hours) byDay.set(day, { day, start: s.start, end: s.end, hours });
  }
  return [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day));
}

/** A night as the pattern check needs it. Hours are clock hours; bedtimes after midnight pass 24. */
export type NightShape = { bed: number; wake: number; hours: number; weekend: boolean };

export function nightShape(night: { start: number; end: number; hours: number }, weekend: boolean): NightShape {
  const bed = clockOf(night.start);
  return { bed: bed < 12 ? bed + 24 : bed, wake: clockOf(night.end), hours: night.hours, weekend };
}

export type SleepPattern = {
  flag: 'short' | 'late' | 'drift';
  /** Usual lights-out (clock hour, may pass 24). */
  usualBed: number;
  /** Tonight's step: 15 minutes earlier than usual, never earlier than the healthy target. */
  tonight: number;
  hours: number;
  drift: number;
};

const SHORT_HOURS = 6.5;
const LATE_BED = 24.5;
const MAX_DRIFT = 2;
const STEP = 0.25;
const MIN_NIGHTS = 4;

/**
 * Whether the last week or two of nights is far enough from healthy to say so: short (median
 * under 6.5 h), late (lights out after 00:30) or drifting (weekends 2 h+ off weekdays). Never a
 * diagnosis; the advice is always one small step toward `targetBed`.
 */
export function sleepPattern(nights: readonly NightShape[], targetBed: number): SleepPattern | null {
  if (nights.length < MIN_NIGHTS) return null;
  const hours = median(nights.map((n) => n.hours))!;
  const usualBed = median(nights.map((n) => n.bed))!;
  const mid = (n: NightShape) => (n.bed + n.wake + 24) / 2;
  const ends = nights.filter((n) => n.weekend).map(mid);
  const days = nights.filter((n) => !n.weekend).map(mid);
  const drift = ends.length >= 2 && days.length >= 2 ? Math.abs(median(ends)! - median(days)!) : 0;
  const target = targetBed < 12 ? targetBed + 24 : targetBed;
  // A step back toward the target, never later than the usual bedtime (a late riser's target can
  // sit after it).
  const tonight = target < usualBed ? Math.max(target, usualBed - STEP) : usualBed - STEP;
  // Late only when it's past both 00:30 and their own target: a late riser's 1 am isn't late.
  const late = usualBed > LATE_BED && usualBed > target;
  const flag: SleepPattern['flag'] | null =
    late ? 'late' : hours < SHORT_HOURS ? 'short' : drift > MAX_DRIFT ? 'drift' : null;
  if (!flag) return null;
  return { flag, usualBed, tonight, hours, drift };
}

/** A day's screen use (4 am day): minutes on, and minutes on from 23:00 until the rollover. */
export type ScreenDay = { day: string; onMin: number; lateMin: number };

/** Hour of the 4 am day from which screen time counts as late (23:00). */
const LATE_FROM = 23;

/**
 * Screen-on minutes per 4 am day from on/off events (oldest or newest first). Only whole days
 * are returned: the first day the events reach into is partial, so it is left out; today is kept
 * (it is still running).
 */
export function screenDays(events: readonly ScreenEvent[]): ScreenDay[] {
  const sorted = [...events].sort((a, b) => a.at - b.at);
  if (sorted.length === 0) return [];
  const days = new Map<string, ScreenDay>();
  const add = (at: number, minutes: number) => {
    const date = new Date(at);
    const day = dayKey(date);
    const d = days.get(day) ?? { day, onMin: 0, lateMin: 0 };
    d.onMin += minutes;
    if (dayHour(date) >= LATE_FROM) d.lateMin += minutes;
    days.set(day, d);
  };
  let since: number | null = null;
  for (const e of sorted) {
    if (e.on && since == null) since = e.at;
    else if (!e.on && since != null) {
      // Minute steps keep the day and late boundaries exact enough without slicing intervals.
      for (let t = since; t < e.at; t += 60_000) add(t, Math.min(1, (e.at - t) / 60_000));
      since = null;
    }
  }
  const first = dayKey(new Date(sorted[0]!.at));
  return [...days.values()]
    .filter((d) => d.day !== first)
    .map((d) => ({ ...d, onMin: Math.round(d.onMin), lateMin: Math.round(d.lateMin) }))
    .sort((a, b) => b.day.localeCompare(a.day));
}
