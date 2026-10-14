// Time-aware scoring (SPEC §3 Today, §6). Every component is 0-100 or null ("not rated yet");
// nothing scores low just because the day isn't over.

import { clamp, round } from './units';

export type Tier = 'high' | 'mid' | 'low';

/** Data confidence per source (SPEC §6: measured → inferred → assumed). */
export const CONFIDENCE = { measured: 1, estimated: 0.6, assumed: 0.3 } as const;
export type Confidence = (typeof CONFIDENCE)[keyof typeof CONFIDENCE];

export type Component = { value: number | null; confidence: Confidence };

/** Meal window in local hours, e.g. lunch 12-14.5. */
export type Window = { start: number; end: number };
export type MealWindows = { breakfast: Window; lunch: Window; dinner: Window };

export const DEFAULT_MEAL_WINDOWS: MealWindows = {
  breakfast: { start: 7, end: 10 },
  lunch: { start: 12, end: 14.5 },
  dinner: { start: 19, end: 22 },
};

// Share of the day's food per meal; snacks spread from breakfast to the end of dinner.
const MEAL_SHARE = { breakfast: 0.25, lunch: 0.35, dinner: 0.3 } as const;
const SNACK_SHARE = 0.1;

const ramp = (h: number, w: Window) => clamp((h - w.start) / (w.end - w.start), 0, 1);

/** Fraction of the day's calories a person would usually have eaten by `hour`. */
export function expectedIntakeFraction(hour: number, windows = DEFAULT_MEAL_WINDOWS): number {
  const meals =
    MEAL_SHARE.breakfast * ramp(hour, windows.breakfast) +
    MEAL_SHARE.lunch * ramp(hour, windows.lunch) +
    MEAL_SHARE.dinner * ramp(hour, windows.dinner);
  const snacks = SNACK_SHARE * ramp(hour, { start: windows.breakfast.start, end: windows.dinner.end });
  // Rounded so float noise in the shares can't leave a finished day at 0.9999.
  return clamp(round(meals + snacks, 4), 0, 1);
}

/** Fraction of an all-day target (steps, water) usually done by `hour`: linear 07:00-21:00. */
export const expectedDayFraction = (hour: number, start = 7, end = 21) =>
  clamp((hour - start) / (end - start), 0, 1);

/** Below this expected fraction a component is "not rated yet". */
const RATE_FROM = 0.08;

/** 100 within ±10 % of pace, falling to 0 at ±70 %. */
function paceScore(actual: number, expected: number): number {
  const deviation = Math.abs(actual / expected - 1);
  return 100 * clamp(1 - Math.max(0, deviation - 0.1) / 0.6, 0, 1);
}

/** 100 at or above pace, linear below it (no penalty for being ahead). */
const atLeastScore = (actual: number, expected: number) => 100 * clamp(actual / expected, 0, 1);

export type DietInput = {
  kcal: number;
  targetKcal: number;
  proteinG: number;
  targetProteinG: number;
  hour: number;
  windows?: MealWindows;
};

/** Diet: calories against the expected-by-now curve (60 %) and protein pace (40 %). */
export function dietScore(input: DietInput): number | null {
  const fraction = expectedIntakeFraction(input.hour, input.windows);
  if (fraction < RATE_FROM) return null;
  const calories = paceScore(input.kcal, input.targetKcal * fraction);
  const protein = atLeastScore(input.proteinG, input.targetProteinG * fraction);
  return round(0.6 * calories + 0.4 * protein);
}

export function activityScore(steps: number, stepGoal: number, hour: number): number | null {
  const fraction = expectedDayFraction(hour);
  if (fraction < RATE_FROM || stepGoal <= 0) return null;
  return round(atLeastScore(steps, stepGoal * fraction));
}

/** Water isn't scored until the user has logged it at least once (SPEC §6). */
export function waterScore(ml: number, goalMl: number, hour: number, everLogged: boolean): number | null {
  const fraction = expectedDayFraction(hour);
  if (!everLogged || fraction < RATE_FROM || goalMl <= 0) return null;
  return round(atLeastScore(ml, goalMl * fraction));
}

/** Sleep: 100 at the need, 0 at four hours short; a small penalty for 2 h+ over. */
export function sleepScore(hours: number | null, needHours = 7.5): number | null {
  if (hours == null) return null;
  if (hours <= needHours) return round(100 * clamp(1 - (needHours - hours) / 4, 0, 1));
  const over = hours - needHours;
  return round(over <= 2 ? 100 : 100 - Math.min(20, (over - 2) * 10));
}

/** Vitals: mean of the per-reading scores that exist. */
export function vitalsScore(readingScores: number[]): number | null {
  if (readingScores.length === 0) return null;
  return round(readingScores.reduce((a, b) => a + b, 0) / readingScores.length);
}

export const OVERALL_WEIGHTS = { diet: 40, activity: 25, sleepVitals: 25, water: 10 } as const;
export type OverallComponents = Partial<Record<keyof typeof OVERALL_WEIGHTS, Component>>;

export type Overall =
  | { status: 'getting-started'; rated: number }
  | { status: 'rated'; value: number; rated: number };

/**
 * Weighted mean over the components that have a value, each weight scaled by its data
 * confidence and renormalized. Fewer than two rated components reads "Getting started".
 */
export function overallScore(components: OverallComponents): Overall {
  let sum = 0;
  let weight = 0;
  let rated = 0;
  for (const key of Object.keys(OVERALL_WEIGHTS) as (keyof typeof OVERALL_WEIGHTS)[]) {
    const c = components[key];
    if (!c || c.value == null) continue;
    const w = OVERALL_WEIGHTS[key] * c.confidence;
    sum += c.value * w;
    weight += w;
    rated++;
  }
  if (rated < 2 || weight === 0) return { status: 'getting-started', rated };
  return { status: 'rated', value: round(sum / weight), rated };
}

/** The circle chips show a 0-100 component on a scale of 10, one decimal. */
export const chipValue = (score: number) => round(score / 10, 1);

/** Hero tiers: high 80-100, mid 50-79, low under 50. */
export function tierFor(score: number): Tier {
  if (score >= 80) return 'high';
  if (score >= 50) return 'mid';
  return 'low';
}

const TIER_BOUNDARY = { lowMid: 50, midHigh: 80 } as const;
const HYSTERESIS_POINTS = 3;
const MIN_TIER_MINUTES = 30;

/**
 * Tier with hysteresis: only change when the score is 3+ points past the boundary and the last
 * change was 30+ minutes ago, so the hero doesn't flicker as a meal is logged and edited.
 */
export function nextTier(current: Tier, score: number, lastChangeAt: Date | null, now: Date): Tier {
  const candidate = tierFor(score);
  if (candidate === current) return current;
  if (lastChangeAt && now.getTime() - lastChangeAt.getTime() < MIN_TIER_MINUTES * 60_000) {
    return current;
  }
  const order: Tier[] = ['low', 'mid', 'high'];
  const up = order.indexOf(candidate) > order.indexOf(current);
  const boundary = up
    ? candidate === 'high'
      ? TIER_BOUNDARY.midHigh
      : TIER_BOUNDARY.lowMid
    : current === 'high'
      ? TIER_BOUNDARY.midHigh
      : TIER_BOUNDARY.lowMid;
  const clear = up ? score >= boundary + HYSTERESIS_POINTS : score < boundary - HYSTERESIS_POINTS;
  return clear ? candidate : current;
}

/** FNV-1a: small, stable string hash. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Hero variant 1-3, fixed for a given day and tier (not random per render). */
export const heroVariant = (dayKey: string, tier: Tier): 1 | 2 | 3 =>
  ((hash(`${dayKey}:${tier}`) % 3) + 1) as 1 | 2 | 3;
