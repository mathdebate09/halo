// What the assistant learns about the user (SPEC §4 "Learning"): their meal times, their usual
// meals, when they wake and so when they should go to bed. Pure functions over local history;
// the app recomputes them on foreground and after logs.

import { DEFAULT_MEAL_WINDOWS, type MealType, type MealWindows } from './scoring';
import { clamp } from './units';

/** Where a learned value came from, best first (SPEC §6 labels). */
export type Source = 'measured' | 'asked' | 'estimated' | 'assumed';
export type Learned<T> = { value: T; source: Source };

/** One logged meal, as the learner needs it. `hour` is wall-clock (13.5 = 13:30). */
export type MealSample = {
  mealType: MealType;
  hour: number;
  weekend: boolean;
  title?: string | null;
};

const MAIN_MEALS = ['breakfast', 'lunch', 'dinner'] as const;
type MainMeal = (typeof MAIN_MEALS)[number];

/** How many recent logs of a meal type feed its window. */
export const RECENT_LOGS = 14;
/** Fewer samples than this and the default window stands. */
export const MIN_SAMPLES = 3;
/** A learned window spans the median ± this many hours. */
const HALF_WINDOW = 1;
/** Learned windows never drift outside these (a 3 am "dinner" is a snack, not a habit). */
const BOUNDS: Record<MainMeal, [number, number]> = {
  breakfast: [5, 12],
  lunch: [11, 16],
  dinner: [17, 23],
};

export const SLEEP_NEED_HOURS = 7.5;
export const WIND_DOWN_HOURS = 0.5;
export const ASSUMED_WAKE_HOUR = 7;
/** A night this much under need pulls tonight's bedtime earlier. */
const SHORT_NIGHT_HOURS = 0.75;
const PULL_EARLIER_HOURS = 0.5;

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Same-kind samples (weekday or weekend) when there are enough, otherwise all of them. */
function sameKind<T extends { weekend: boolean }>(samples: readonly T[], weekend: boolean): readonly T[] {
  const own = samples.filter((s) => s.weekend === weekend);
  return own.length >= MIN_SAMPLES ? own : samples;
}

function windowsFor(samples: readonly MealSample[], weekend: boolean): MealWindows {
  const windows = { ...DEFAULT_MEAL_WINDOWS };
  for (const type of MAIN_MEALS) {
    const recent = sameKind(
      samples.filter((s) => s.mealType === type),
      weekend,
    ).slice(0, RECENT_LOGS);
    if (recent.length < MIN_SAMPLES) continue;
    const [lo, hi] = BOUNDS[type];
    // Quarter hours: a habit, not a timestamp, and steady from one log to the next.
    const mid = clamp(
      Math.round(median(recent.map((s) => s.hour))! * 4) / 4,
      lo + HALF_WINDOW,
      hi - HALF_WINDOW,
    );
    windows[type] = { start: mid - HALF_WINDOW, end: mid + HALF_WINDOW };
  }
  return windows;
}

export type LearnedWindows = { weekday: MealWindows; weekend: MealWindows };

/**
 * Meal windows from the rolling median of the last 14 logs per meal type, weekdays and weekends
 * apart (a side with too few logs borrows from both). Samples newest first.
 */
export function learnMealWindows(samples: readonly MealSample[]): LearnedWindows {
  return { weekday: windowsFor(samples, false), weekend: windowsFor(samples, true) };
}

/** The usual time of a meal: the middle of its window. */
export const usualHour = (windows: MealWindows, type: MainMeal) =>
  (windows[type].start + windows[type].end) / 2;

/**
 * What the user usually has for a meal: the title logged most often in its last 14 logs, if it
 * came up at least twice. This is what a pre-filled log suggests.
 */
export function usualMeals(samples: readonly MealSample[]): Partial<Record<MealType, string>> {
  const out: Partial<Record<MealType, string>> = {};
  for (const type of ['breakfast', 'lunch', 'dinner', 'snack'] as const) {
    const counts = new Map<string, { title: string; n: number }>();
    for (const s of samples.filter((m) => m.mealType === type).slice(0, RECENT_LOGS)) {
      const title = s.title?.trim();
      if (!title) continue;
      const key = title.toLowerCase();
      const entry = counts.get(key) ?? { title, n: 0 };
      entry.n += 1;
      counts.set(key, entry);
    }
    const best = [...counts.values()].sort((a, b) => b.n - a.n)[0];
    if (best && best.n >= 2) out[type] = best.title;
  }
  return out;
}

export type WakeSample = { hour: number; weekend: boolean };

export type WakeInput = {
  /** Health Connect sleep ends (last 14 nights). */
  measured: readonly WakeSample[];
  /** The user's answer to the day-3 ask. */
  asked?: number | null;
  /** First app open of each recent day, between 04:00 and 12:00. */
  firstOpens: readonly WakeSample[];
};

/**
 * Typical wake time through the chain (SPEC §6): Health Connect → the user's own answer → first
 * app open of the day → assumed 07:00. Weekdays and weekends are learned apart where possible.
 */
export function learnWake(input: WakeInput, weekend: boolean): Learned<number> {
  const measured = sameKind(input.measured, weekend).slice(0, 7);
  if (measured.length >= MIN_SAMPLES) {
    return { value: median(measured.map((s) => s.hour))!, source: 'measured' };
  }
  if (input.asked != null) return { value: input.asked, source: 'asked' };
  const opens = sameKind(
    input.firstOpens.filter((s) => s.hour >= 4 && s.hour < 12),
    weekend,
  ).slice(0, 7);
  if (opens.length >= MIN_SAMPLES) {
    return { value: median(opens.map((s) => s.hour))!, source: 'estimated' };
  }
  return { value: ASSUMED_WAKE_HOUR, source: 'assumed' };
}

/** A clock hour folded into 0-24 (23.5 for half eleven, never -0.5). */
export const wrapHour = (hour: number) => ((hour % 24) + 24) % 24;

export type Bedtime = { hour: number; pulled: boolean };

/**
 * Tonight's bedtime: tomorrow's wake time minus sleep need and a 30-minute wind-down, pulled 30
 * minutes earlier after a short night.
 */
export function bedtimeFor(
  wakeHour: number,
  needHours = SLEEP_NEED_HOURS,
  lastNightHours: number | null = null,
): Bedtime {
  const pulled = lastNightHours != null && needHours - lastNightHours > SHORT_NIGHT_HOURS;
  const hour = wakeHour - needHours - WIND_DOWN_HOURS - (pulled ? PULL_EARLIER_HOURS : 0);
  return { hour: wrapHour(hour), pulled };
}

/** Whether `hour` falls inside [start, end), where the span may cross midnight. */
export function inSpan(hour: number, start: number, end: number): boolean {
  const [h, s, e] = [wrapHour(hour), wrapHour(start), wrapHour(end)];
  return s <= e ? h >= s && h < e : h >= s || h < e;
}

/** Quiet hours follow the user: from tonight's bedtime until they usually wake. */
export const inQuietHours = (hour: number, bedtime: Bedtime, wakeHour: number) =>
  inSpan(hour, bedtime.hour, wakeHour);

/** "13:00", "08:30": a learned time, rounded to the half hour so it reads like a habit. */
export function clockLabel(hour: number): string {
  const half = Math.round(wrapHour(hour) * 2) / 2;
  const h = Math.floor(half) % 24;
  return `${String(h).padStart(2, '0')}:${half % 1 ? '30' : '00'}`;
}
