// GENERATED from halo-shared/src/scoring.ts by halo-shared/scripts/sync.mjs. Do not edit.

// Time-aware scoring (SPEC §3 Today, §6). Every component is 0-100 or null ("not rated yet");
// nothing scores low just because the day isn't over.

import { clamp, round } from './units';

export type Tier = 'high' | 'mid' | 'low';

/** Data confidence per source (SPEC §6: measured → inferred → assumed). */
export const CONFIDENCE = { measured: 1, estimated: 0.6, assumed: 0.3 } as const;
export type Confidence = (typeof CONFIDENCE)[keyof typeof CONFIDENCE];

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

/** Below this expected fraction the day's own data is too thin to judge on its own. */
const RATE_FROM = 0.08;

/** 100 within ±10 % of pace, falling to 0 at ±70 %. */
function paceScore(actual: number, expected: number): number {
  const deviation = Math.abs(actual / expected - 1);
  return 100 * clamp(1 - Math.max(0, deviation - 0.1) / 0.6, 0, 1);
}

/** 100 at or above pace, linear below it (no penalty for being ahead). */
const atLeastScore = (actual: number, expected: number) => 100 * clamp(actual / expected, 0, 1);

/** Piecewise-linear lookup through sorted [x, score] points, flat beyond the ends. */
function curve(x: number, points: [number, number][]): number {
  if (x <= points[0]![0]) return points[0]![1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i]!;
    const [x0, y0] = points[i - 1]!;
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return points[points.length - 1]![1];
}

/**
 * A component score. Every component always has a value; `dataBacked` says whether real data
 * produced it, or it is the medium prior / a time-only estimate.
 */
export type Score = { value: number; dataBacked: boolean };

/** The "medium" read a component or the day starts from before there is any data. */
export const PROVISIONAL_PRIOR = 70;

type Signal = { score: number | null | undefined; weight: number };

/** Weighted mean of the signals that exist; null when none do. */
function blend(signals: Signal[]): number | null {
  let sum = 0;
  let weight = 0;
  for (const s of signals) {
    if (s.score == null || Number.isNaN(s.score)) continue;
    sum += s.score * s.weight;
    weight += s.weight;
  }
  return weight === 0 ? null : sum / weight;
}

const backed = (value: number | null): Score =>
  value == null
    ? { value: PROVISIONAL_PRIOR, dataBacked: false }
    : { value: round(value), dataBacked: true };

// ── Diet ────────────────────────────────────────────────────────────────────────

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type MealLog = {
  mealType: MealType;
  /** Local wall-clock hour it was eaten (13.5 = 13:30). */
  hour: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export type DietInput = {
  meals: MealLog[];
  targets: { kcal: number; proteinG: number; carbsG: number; fatG: number };
  hour: number;
  windows?: MealWindows;
};

/** A meal counts as on time within an hour either side of its window. */
const WINDOW_GRACE = 1;

/**
 * The meal type a log made at `hour` most likely is: a main meal within an hour of its window,
 * otherwise a snack. Editable wherever it is shown.
 */
export function mealTypeAt(hour: number, windows = DEFAULT_MEAL_WINDOWS): MealType {
  for (const type of ['breakfast', 'lunch', 'dinner'] as const) {
    const w = windows[type];
    if (hour >= w.start - WINDOW_GRACE && hour <= w.end + WINDOW_GRACE) return type;
  }
  return 'snack';
}

/**
 * Diet against where the day should be by now: calories (40), protein (25), carbs (10) and fat
 * (10) on the expected-by-now curve, plus meal timing (15). "By now" is at least the share of the
 * meals already logged, so an early breakfast isn't scored as overeating. With nothing logged it
 * is a time-only estimate: full marks before the first window, easing to 55 by the end of the
 * day (unlogged isn't uneaten).
 */
export function dietScore(input: DietInput): Score {
  const { meals, targets, hour } = input;
  const windows = input.windows ?? DEFAULT_MEAL_WINDOWS;
  const fraction = expectedIntakeFraction(hour, windows);
  if (meals.length === 0) return { value: round(100 - 45 * fraction), dataBacked: false };

  const loggedShare = [...new Set(meals.map((m) => m.mealType))].reduce(
    (a, t) => a + (t === 'snack' ? SNACK_SHARE : MEAL_SHARE[t]),
    0,
  );
  const due = Math.min(1, Math.max(fraction, loggedShare));
  const total = (key: 'kcal' | 'proteinG' | 'carbsG' | 'fatG') =>
    meals.reduce((a, m) => a + m[key], 0);

  const mains = meals.filter((m) => m.mealType !== 'snack');
  const onTime = mains.filter((m) => {
    const w = windows[m.mealType as keyof MealWindows];
    return m.hour >= w.start - WINDOW_GRACE && m.hour <= w.end + WINDOW_GRACE;
  }).length;

  return backed(
    blend([
      { score: paceScore(total('kcal'), targets.kcal * due), weight: 40 },
      { score: atLeastScore(total('proteinG'), targets.proteinG * due), weight: 25 },
      { score: targets.carbsG > 0 ? paceScore(total('carbsG'), targets.carbsG * due) : null, weight: 10 },
      { score: targets.fatG > 0 ? paceScore(total('fatG'), targets.fatG * due) : null, weight: 10 },
      { score: mains.length ? (100 * onTime) / mains.length : null, weight: 15 },
    ]),
  );
}

// ── Activity ────────────────────────────────────────────────────────────────────

export type ActivityDay = {
  steps?: number | null;
  activeKcal?: number | null;
  exerciseMin?: number | null;
};

export type ActivityGoals = { steps: number; activeKcal: number; exerciseMin: number };

const DEFAULT_STEP_GOAL = 8000;

/** Daily step goal: 8,000, or 10 % above the user's recent average when that is higher. */
export function stepGoalFor(averageSteps?: number | null): number {
  if (!averageSteps || averageSteps <= 0) return DEFAULT_STEP_GOAL;
  return Math.max(DEFAULT_STEP_GOAL, Math.round((averageSteps * 1.1) / 500) * 500);
}

/** Active-calorie goal from the plan: the burn above BMR + digestion, at least 250 kcal. */
export const activeKcalGoalFor = (bmr: number, tdee: number) =>
  Math.max(250, Math.round((tdee - bmr * 1.1) / 10) * 10);

export const EXERCISE_GOAL_MIN = 30;

/** Steps (50), active calories (25) and exercise minutes (25) against `fraction` of the goals. */
function activityDayScore(day: ActivityDay, goals: ActivityGoals, fraction: number) {
  return blend([
    { score: day.steps == null ? null : atLeastScore(day.steps, goals.steps * fraction), weight: 50 },
    {
      score: day.activeKcal == null ? null : atLeastScore(day.activeKcal, goals.activeKcal * fraction),
      weight: 25,
    },
    {
      score: day.exerciseMin == null ? null : atLeastScore(day.exerciseMin, goals.exerciseMin * fraction),
      weight: 25,
    },
  ]);
}

export type ActivityInput = {
  hour: number;
  today: ActivityDay;
  /** Previous days (most recent first, up to a week); days with no data are skipped. */
  recent: ActivityDay[];
  goals: ActivityGoals;
};

/**
 * Activity: today's movement against the expected-by-now pace, blended with the last week's
 * full-day achievement. The week carries the morning; today takes over as the day goes on
 * (all of it by 21:00).
 */
export function activityScore(input: ActivityInput): Score {
  const fraction = expectedDayFraction(input.hour);
  const today = fraction < RATE_FROM ? null : activityDayScore(input.today, input.goals, fraction);
  const days = input.recent
    .slice(0, 7)
    .map((d) => activityDayScore(d, input.goals, 1))
    .filter((v): v is number => v != null);
  const week = days.length ? days.reduce((a, b) => a + b, 0) / days.length : null;
  if (today == null) return backed(week);
  if (week == null) return backed(today);
  return backed(fraction * today + (1 - fraction) * week);
}

// ── Vitals (incl. last night's sleep) ───────────────────────────────────────────

/** Sleep: 100 at the need, 0 at four hours short; a small penalty for 2 h+ over. */
export function sleepScore(hours: number | null, needHours = 7.5): number | null {
  if (hours == null) return null;
  if (hours <= needHours) return round(100 * clamp(1 - (needHours - hours) / 4, 0, 1));
  const over = hours - needHours;
  return round(over <= 2 ? 100 : 100 - Math.min(20, (over - 2) * 10));
}

export type VitalsInput = {
  sleepHours?: number | null;
  sleepNeedHours?: number;
  restingHr?: number | null;
  hrvMs?: number | null;
  /** The user's own recent HRV average; HRV is only meaningful against it. */
  hrvBaselineMs?: number | null;
  spo2?: number | null;
  systolic?: number | null;
  diastolic?: number | null;
  glucoseMgDl?: number | null;
};

const restingHrScore = (bpm: number) =>
  curve(bpm, [[35, 80], [45, 100], [62, 100], [80, 75], [100, 40], [120, 0]]);
const hrvScore = (ms: number, baseline: number) =>
  curve(ms / baseline, [[0.6, 40], [0.95, 100]]);
const spo2Score = (pct: number) => curve(pct, [[85, 0], [90, 50], [95, 100]]);
const bloodPressureScore = (sys: number, dia: number) =>
  Math.min(
    curve(sys, [[80, 50], [90, 80], [100, 100], [120, 100], [140, 60], [160, 30], [180, 0]]),
    curve(dia, [[50, 60], [60, 100], [80, 100], [90, 60], [100, 30], [110, 0]]),
  );
const glucoseScore = (mgDl: number) =>
  curve(mgDl, [[54, 30], [70, 80], [80, 100], [140, 100], [200, 40], [250, 20]]);

/**
 * Vitals: last night's sleep (weight 2) and each recent reading that exists (weight 1 each):
 * resting heart rate, HRV against the user's baseline, SpO2, blood pressure, glucose. A score,
 * never a diagnosis.
 */
export function vitalsScore(input: VitalsInput): Score {
  const hrvOk = input.hrvMs != null && input.hrvBaselineMs != null && input.hrvBaselineMs > 0;
  return backed(
    blend([
      { score: sleepScore(input.sleepHours ?? null, input.sleepNeedHours), weight: 2 },
      { score: input.restingHr == null ? null : restingHrScore(input.restingHr), weight: 1 },
      { score: hrvOk ? hrvScore(input.hrvMs!, input.hrvBaselineMs!) : null, weight: 1 },
      { score: input.spo2 == null ? null : spo2Score(input.spo2), weight: 1 },
      {
        score:
          input.systolic == null || input.diastolic == null
            ? null
            : bloodPressureScore(input.systolic, input.diastolic),
        weight: 1,
      },
      { score: input.glucoseMgDl == null ? null : glucoseScore(input.glucoseMgDl), weight: 1 },
    ]),
  );
}

// ── Water and overall ───────────────────────────────────────────────────────────

/** Water isn't scored until the user has logged it at least once (SPEC §6). */
export function waterScore(ml: number, goalMl: number, hour: number, everLogged: boolean): number | null {
  const fraction = expectedDayFraction(hour);
  if (!everLogged || fraction < RATE_FROM || goalMl <= 0) return null;
  return round(atLeastScore(ml, goalMl * fraction));
}

export const OVERALL_WEIGHTS = { diet: 40, activity: 25, vitals: 25, water: 10 } as const;

export type OverallInput = { diet: Score; activity: Score; vitals: Score; water: number | null };

export type Overall = {
  value: number;
  /** Components backed by real data. */
  rated: number;
  /** Fewer than two data-backed components: shown, but it never moves the hero tier. */
  provisional: boolean;
};

/**
 * Weighted mean of the components, each weight scaled by its data confidence (data-backed:
 * measured, prior or time-only: assumed) and renormalized. Water joins once it is logged.
 */
export function overallScore(input: OverallInput): Overall {
  const parts: [number, number, boolean][] = [
    [input.diet.value, OVERALL_WEIGHTS.diet, input.diet.dataBacked],
    [input.activity.value, OVERALL_WEIGHTS.activity, input.activity.dataBacked],
    [input.vitals.value, OVERALL_WEIGHTS.vitals, input.vitals.dataBacked],
  ];
  if (input.water != null) parts.push([input.water, OVERALL_WEIGHTS.water, true]);
  let sum = 0;
  let weight = 0;
  let rated = 0;
  for (const [value, w, isBacked] of parts) {
    const scaled = w * (isBacked ? CONFIDENCE.measured : CONFIDENCE.assumed);
    sum += value * scaled;
    weight += scaled;
    if (isBacked) rated++;
  }
  return { value: round(sum / weight), rated, provisional: rated < 2 };
}

/** Hero tiers: high 80-100, mid 50-79 (the 70s count as mid), low under 50. */
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

export type HeroVariant = 1 | 2 | 3;

/**
 * A random hero variant (1-3) for a tier, never repeating the previous pick for that tier.
 * Called when a tier is chosen (onboarding, a tier change, a new day) and then persisted, so the
 * hero stays put between renders.
 */
export function pickHeroVariant(previous?: HeroVariant, random: () => number = Math.random): HeroVariant {
  const options = ([1, 2, 3] as const).filter((v) => v !== previous);
  return options[Math.min(options.length - 1, Math.floor(random() * options.length))]!;
}
