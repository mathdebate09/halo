// GENERATED from halo-shared/src/vitals.ts by halo-shared/scripts/sync.mjs. Do not edit.

// The Vitals model (chunk 19): every body signal Halo has, grouped into areas, each signal weighted
// by how much it can be trusted (SPEC §6: measured 1.0, estimated 0.6, assumed 0.3). The score is
// never empty and never a diagnosis: states are Thriving / Steady / Needs care for areas and
// Strong / In range / Outside the usual range for single readings.

import type { Source } from './learning.js';
import {
  type ActivityDay,
  activityDayScore,
  type ActivityGoals,
  atLeastScore,
  bloodPressureScore,
  CONFIDENCE,
  curve,
  glucoseScore,
  hrvScore,
  PROVISIONAL_PRIOR,
  restingHrScore,
  type Score,
  sleepScore,
  spo2Score,
} from './scoring.js';
import { round } from './units.js';

export type VitalsSource = Exclude<Source, 'asked'>;

/** One day of everything the model reads (4 am day). Readings are the day's latest. */
export type VitalsDay = ActivityDay & {
  day: string;
  /** Asleep minutes for the night that ended this day, from Health Connect (measured). */
  sleepMin?: number | null;
  sleepStart?: number | null;
  sleepEnd?: number | null;
  /** The night's hours were entered by the user (a correction of the estimate); counts as measured. */
  sleepManual?: boolean | null;
  /** The screen's estimate of the same night, used when Health Connect has none. */
  screenNight?: { start: number; end: number; hours: number } | null;
  /** Screen-on minutes this day, and from 23:00 until the rollover. */
  screenOnMin?: number | null;
  screenLateMin?: number | null;
  restingHr?: number | null;
  hrvMs?: number | null;
  spo2?: number | null;
  systolic?: number | null;
  diastolic?: number | null;
  glucoseMgDl?: number | null;
  respRate?: number | null;
  bodyTempC?: number | null;
  bodyFatPct?: number | null;
  vo2max?: number | null;
  weightKg?: number | null;
};

export type VitalsInput = {
  /** Today's day key; `days` may or may not include it. */
  today: string;
  /** Newest first, up to 14 days. */
  days: readonly VitalsDay[];
  sleepNeedHours?: number;
  goals: ActivityGoals;
  profile?: {
    age?: number | null;
    sex?: 'male' | 'female' | null;
    goal?: 'lose' | 'maintain' | 'gain' | null;
    /** Planned signed kg/week (negative = loss). */
    rateKgPerWeek?: number | null;
  };
};

export type AreaKey = 'sleep' | 'heart' | 'movement' | 'screen' | 'body';
export type AreaState = 'thriving' | 'steady' | 'needs_care';

/** Hero order when nothing needs care: the first three areas with data. */
export const AREA_PRIORITY: readonly AreaKey[] = ['sleep', 'heart', 'movement', 'screen', 'body'];
/** How much each area counts toward the Vitals score. */
export const AREA_WEIGHTS: Record<AreaKey, number> = { sleep: 3, heart: 2, movement: 2, screen: 1, body: 1 };
export const AREA_LABELS: Record<AreaKey, string> = {
  sleep: 'Sleep',
  heart: 'Heart',
  movement: 'Movement',
  screen: 'Screen time',
  body: 'Body',
};

export type MetricKey =
  | 'sleep'
  | 'sleep_avg'
  | 'sleep_regularity'
  | 'resting_hr'
  | 'hrv'
  | 'spo2'
  | 'blood_pressure'
  | 'glucose'
  | 'resp_rate'
  | 'body_temp'
  | 'vo2max'
  | 'week_activity'
  | 'exercise_week'
  | 'steps_trend'
  | 'screen_late'
  | 'screen_daily'
  | 'weight_trend';

export type VitalSignal = { key: MetricKey; score: number; weight: number; source: VitalsSource };

export type Area = {
  key: AreaKey;
  /** 0-100, always present. */
  score: number;
  state: AreaState;
  /** Weighted mean confidence of its signals (0.3 when only assumed). */
  confidence: number;
  /** The best source behind it. */
  source: VitalsSource;
  signals: VitalSignal[];
};

export type VitalsReport = {
  score: Score;
  confidence: number;
  /** Every area that has something to say, in priority order. */
  areas: Area[];
};

const confidenceOf = (s: VitalsSource) => CONFIDENCE[s];
const SOURCE_RANK: Record<VitalsSource, number> = { measured: 2, estimated: 1, assumed: 0 };
const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const present = <T>(x: T | null | undefined): x is T => x != null && !Number.isNaN(x as number);

/** Readings older than this don't speak for today. */
const READING_MAX_DAYS = 7;
/** A personal baseline needs this many other days. */
export const MIN_BASELINE_DAYS = 4;

export function areaState(score: number): AreaState {
  if (score >= 80) return 'thriving';
  if (score >= 60) return 'steady';
  return 'needs_care';
}

function area(key: AreaKey, signals: VitalSignal[]): Area | null {
  if (signals.length === 0) return null;
  let sum = 0;
  let weight = 0;
  let conf = 0;
  let plain = 0;
  for (const s of signals) {
    const c = confidenceOf(s.source);
    sum += s.score * s.weight * c;
    weight += s.weight * c;
    conf += c * s.weight;
    plain += s.weight;
  }
  const score = round(sum / weight);
  const source = signals.reduce<VitalsSource>(
    (best, s) => (SOURCE_RANK[s.source] > SOURCE_RANK[best] ? s.source : best),
    'assumed',
  );
  return { key, score, state: areaState(score), confidence: round(conf / plain, 2), source, signals };
}

/** An area with nothing behind it but the medium prior (sleep, movement and body only). */
const assumedArea = (key: AreaKey): Area => ({
  key,
  score: PROVISIONAL_PRIOR,
  state: areaState(PROVISIONAL_PRIOR),
  confidence: CONFIDENCE.assumed,
  source: 'assumed',
  signals: [],
});

// ── Helpers over the days ───────────────────────────────────────────────────────

type NumKey = {
  [K in keyof VitalsDay]-?: NonNullable<VitalsDay[K]> extends number ? K : never;
}[keyof VitalsDay];

/** The newest value of a reading within the last week, with its day. */
export function latestReading(input: VitalsInput, key: NumKey): { value: number; day: string } | null {
  for (const d of input.days.slice(0, READING_MAX_DAYS + 1)) {
    const v = d[key];
    if (present(v)) return { value: v as number, day: d.day };
  }
  return null;
}

/** The user's own values of a reading over the window, excluding the newest one used. */
export function baselineValues(input: VitalsInput, key: NumKey, exceptDay?: string): number[] {
  return input.days
    .filter((d) => d.day !== exceptDay)
    .map((d) => d[key])
    .filter(present) as number[];
}

export type Night = {
  day: string;
  hours: number;
  start: number | null;
  end: number | null;
  source: VitalsSource;
  /** Entered by the user rather than read from a source. */
  manual: boolean;
};

/** Each day's night: Health Connect when it has one, otherwise the screen's estimate. */
export function nightsOf(input: VitalsInput): Night[] {
  const nights: Night[] = [];
  for (const d of input.days) {
    if (present(d.sleepMin) && d.sleepMin > 0) {
      nights.push({
        day: d.day,
        hours: d.sleepMin / 60,
        start: d.sleepStart ?? null,
        end: d.sleepEnd ?? null,
        source: 'measured',
        manual: !!d.sleepManual,
      });
    } else if (d.screenNight) {
      nights.push({
        day: d.day,
        hours: d.screenNight.hours,
        start: d.screenNight.start,
        end: d.screenNight.end,
        source: 'estimated',
        manual: false,
      });
    }
  }
  return nights;
}

/** Bed or wake as a clock hour, bedtimes after midnight past 24 so they average sensibly. */
const clockHour = (at: number, bed: boolean) => {
  const d = new Date(at);
  const h = d.getHours() + d.getMinutes() / 60;
  return bed && h < 12 ? h + 24 : h;
};

const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

/** Average spread (standard deviation, hours) of bed and wake times, or null with < 4 nights. */
export function sleepSpread(nights: readonly Night[]): number | null {
  const timed = nights.filter((n) => n.start != null && n.end != null).slice(0, 7);
  if (timed.length < MIN_BASELINE_DAYS) return null;
  return (sd(timed.map((n) => clockHour(n.start!, true))) + sd(timed.map((n) => clockHour(n.end!, false)))) / 2;
}

/** Weakest source of a set (a blend is only as sure as its least sure part, by majority). */
function majoritySource(sources: readonly VitalsSource[]): VitalsSource {
  const measured = sources.filter((s) => s === 'measured').length;
  return measured * 2 >= sources.length ? 'measured' : 'estimated';
}

/** Linear-regression slope, units per day, over (day index, value). */
function slopePerDay(points: readonly { x: number; y: number }[]): number {
  const mx = mean(points.map((p) => p.x));
  const my = mean(points.map((p) => p.y));
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

const dayIndex = (day: string) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / 86_400_000;

// ── Per-metric scores (exported for rows and tests) ─────────────────────────────

/** Resting HR: the absolute curve, averaged with how it sits against the user's own baseline. */
export function restingHrSignal(bpm: number, baseline: readonly number[]): number {
  const absolute = restingHrScore(bpm);
  if (baseline.length < MIN_BASELINE_DAYS) return absolute;
  const ratio = bpm / mean(baseline);
  return (absolute + curve(ratio, [[1.05, 100], [1.15, 60], [1.3, 30]])) / 2;
}

export const respRateScore = (bpm: number) =>
  curve(bpm, [[8, 40], [12, 100], [20, 100], [25, 50], [30, 20]]);
export const bodyTempScore = (c: number) =>
  curve(c, [[34.5, 30], [35.5, 70], [36.1, 100], [37.2, 100], [38, 60], [39, 30]]);

/** VO2 max against a typical value for age and sex (ml/kg/min). */
export function vo2maxScore(value: number, age?: number | null, sex?: 'male' | 'female' | null): number {
  const years = Math.max(0, (age ?? 35) - 25);
  const typical = (sex === 'female' ? 38 : sex === 'male' ? 44 : 41) - 0.3 * years;
  return curve(value / typical, [[0.6, 30], [0.8, 60], [1, 85], [1.15, 100]]);
}

export const screenLateScore = (minutes: number) =>
  curve(minutes, [[0, 100], [15, 95], [30, 80], [60, 60], [120, 30], [180, 15]]);
export const screenDailyScore = (minutes: number) =>
  curve(minutes, [[120, 100], [240, 80], [360, 60], [480, 40], [600, 25]]);

/** Weight trend (kg/week) against the goal: losing, keeping or gaining at a sensible pace. */
export function weightTrendScore(kgPerWeek: number, goal: 'lose' | 'maintain' | 'gain' | null | undefined): number {
  if (goal === 'lose') return curve(kgPerWeek, [[-2, 50], [-1.2, 100], [-0.2, 100], [0.1, 75], [0.5, 45], [1, 30]]);
  if (goal === 'gain') return curve(kgPerWeek, [[-1, 30], [-0.5, 45], [-0.1, 75], [0.2, 100], [0.8, 100], [1.5, 60]]);
  return curve(Math.abs(kgPerWeek), [[0.2, 100], [0.5, 65], [1, 35]]);
}

// ── Areas ───────────────────────────────────────────────────────────────────────

function sleepArea(input: VitalsInput): Area {
  const need = input.sleepNeedHours ?? 7.5;
  const nights = nightsOf(input);
  const signals: VitalSignal[] = [];
  const last = nights.find((n) => n.day === input.today);
  if (last) signals.push({ key: 'sleep', score: sleepScore(last.hours, need)!, weight: 2, source: last.source });
  const week = nights.slice(0, 7);
  if (week.length >= 3) {
    signals.push({
      key: 'sleep_avg',
      score: sleepScore(mean(week.map((n) => n.hours)), need)!,
      weight: 1,
      source: majoritySource(week.map((n) => n.source)),
    });
  }
  const spread = sleepSpread(nights);
  if (spread != null) {
    signals.push({
      key: 'sleep_regularity',
      score: curve(spread, [[0.5, 100], [1.5, 40], [3, 20]]),
      weight: 1,
      source: majoritySource(week.map((n) => n.source)),
    });
  }
  return area('sleep', signals) ?? assumedArea('sleep');
}

function heartArea(input: VitalsInput): Area | null {
  const signals: VitalSignal[] = [];
  const push = (key: MetricKey, score: number, weight = 1) =>
    signals.push({ key, score, weight, source: 'measured' });

  const rhr = latestReading(input, 'restingHr');
  if (rhr) push('resting_hr', restingHrSignal(rhr.value, baselineValues(input, 'restingHr', rhr.day)));
  const hrv = latestReading(input, 'hrvMs');
  const hrvBase = hrv ? baselineValues(input, 'hrvMs', hrv.day) : [];
  if (hrv && hrvBase.length >= MIN_BASELINE_DAYS) push('hrv', hrvScore(hrv.value, mean(hrvBase)));
  const spo2 = latestReading(input, 'spo2');
  if (spo2) push('spo2', spo2Score(spo2.value));
  const sys = latestReading(input, 'systolic');
  const dia = latestReading(input, 'diastolic');
  if (sys && dia) push('blood_pressure', bloodPressureScore(sys.value, dia.value));
  const glucose = latestReading(input, 'glucoseMgDl');
  if (glucose) push('glucose', glucoseScore(glucose.value));
  const resp = latestReading(input, 'respRate');
  if (resp) push('resp_rate', respRateScore(resp.value), 0.5);
  const temp = latestReading(input, 'bodyTempC');
  if (temp) push('body_temp', bodyTempScore(temp.value), 0.5);
  const vo2 = latestReading(input, 'vo2max');
  if (vo2) push('vo2max', vo2maxScore(vo2.value, input.profile?.age, input.profile?.sex));
  // Never estimated (SPEC §6): no readings, no heart area.
  return area('heart', signals);
}

function movementArea(input: VitalsInput): Area {
  const past = input.days.filter((d) => d.day < input.today);
  const week = past.slice(0, 7);
  const signals: VitalSignal[] = [];
  const dayScores = week
    .map((d) => activityDayScore(d, input.goals, 1))
    .filter((v): v is number => v != null);
  if (dayScores.length >= 3) {
    signals.push({ key: 'week_activity', score: mean(dayScores), weight: 2, source: 'measured' });
  }
  const exercise = week.map((d) => d.exerciseMin).filter(present) as number[];
  if (exercise.length >= 3) {
    const total = exercise.reduce((a, b) => a + b, 0) * (7 / exercise.length);
    signals.push({ key: 'exercise_week', score: atLeastScore(total, 150), weight: 1, source: 'measured' });
  }
  const steps = (days: readonly VitalsDay[]) => days.map((d) => d.steps).filter(present) as number[];
  const recent = steps(week);
  const before = steps(past.slice(7, 14));
  if (recent.length >= 3 && before.length >= 3 && mean(before) > 0) {
    signals.push({
      key: 'steps_trend',
      score: curve(mean(recent) / mean(before), [[0.7, 50], [0.9, 80], [1, 100]]),
      weight: 0.5,
      source: 'measured',
    });
  }
  return area('movement', signals) ?? assumedArea('movement');
}

function screenArea(input: VitalsInput): Area | null {
  const past = input.days.filter((d) => d.day < input.today);
  const signals: VitalSignal[] = [];
  // Last night's late use belongs to yesterday's day (23:00 → 4 am).
  const lastEvening = past[0];
  if (lastEvening && present(lastEvening.screenLateMin)) {
    signals.push({ key: 'screen_late', score: screenLateScore(lastEvening.screenLateMin), weight: 2, source: 'measured' });
  }
  const daily = past.slice(0, 7).map((d) => d.screenOnMin).filter(present) as number[];
  if (daily.length >= 3) {
    signals.push({ key: 'screen_daily', score: screenDailyScore(mean(daily)), weight: 1, source: 'measured' });
  }
  return area('screen', signals);
}

/** Weight trend in kg/week from the window's weights (≥3 days spanning ≥5 days), or null. */
export function weightTrend(input: VitalsInput): number | null {
  const points = input.days
    .filter((d) => present(d.weightKg))
    .map((d) => ({ x: dayIndex(d.day), y: d.weightKg as number }));
  if (points.length < 3) return null;
  const span = Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x));
  if (span < 5) return null;
  return slopePerDay(points) * 7;
}

function bodyArea(input: VitalsInput): Area {
  const trend = weightTrend(input);
  if (trend == null) return assumedArea('body');
  return area('body', [
    { key: 'weight_trend', score: weightTrendScore(trend, input.profile?.goal), weight: 1, source: 'measured' },
  ])!;
}

// ── The report ──────────────────────────────────────────────────────────────────

/**
 * Vitals from every area that has something to say, each weighted by its importance and its
 * confidence and renormalized. Never empty: with nothing measured it is the medium prior.
 */
export function vitalsReport(input: VitalsInput): VitalsReport {
  const areas = [sleepArea(input), heartArea(input), movementArea(input), screenArea(input), bodyArea(input)].filter(
    (a): a is Area => a != null,
  );
  let sum = 0;
  let weight = 0;
  for (const a of areas) {
    const w = AREA_WEIGHTS[a.key] * a.confidence;
    sum += a.score * w;
    weight += w;
  }
  const backed = areas.some((a) => a.source !== 'assumed');
  const value = weight === 0 ? PROVISIONAL_PRIOR : round(sum / weight);
  const totalWeight = areas.reduce((acc, a) => acc + AREA_WEIGHTS[a.key], 0);
  return {
    score: { value: backed ? value : PROVISIONAL_PRIOR, dataBacked: backed },
    confidence: round(areas.reduce((acc, a) => acc + a.confidence * AREA_WEIGHTS[a.key], 0) / totalWeight, 2),
    areas,
  };
}

/**
 * The hero's three bands. Areas with measured or estimated data come first, in priority order;
 * the weakest of them always gets a place when it needs care; assumed areas fill what's left.
 * A pick held from earlier in the day stays while all its areas still exist.
 */
export function pickBands(areas: readonly Area[], held?: readonly AreaKey[] | null): AreaKey[] {
  const keys = new Set(areas.map((a) => a.key));
  const byPriority = [...areas].sort((a, b) => AREA_PRIORITY.indexOf(a.key) - AREA_PRIORITY.indexOf(b.key));
  const real = byPriority.filter((a) => a.source !== 'assumed');
  const weakest = real.reduce<Area | null>((w, a) => (w == null || a.score < w.score ? a : w), null);
  const mustShow = weakest?.state === 'needs_care' ? weakest.key : null;
  // The hold gives way when an area that needs care (with data) isn't on it: the hero never hides it.
  const holds =
    held &&
    held.length === Math.min(3, areas.length) &&
    held.every((k) => keys.has(k)) &&
    (mustShow == null || held.includes(mustShow));
  if (holds) return [...held];
  const picked: AreaKey[] = [];
  if (mustShow) picked.push(mustShow);
  for (const a of [...real, ...byPriority.filter((x) => x.source === 'assumed')]) {
    if (picked.length === 3) break;
    if (!picked.includes(a.key)) picked.push(a.key);
  }
  return picked.sort((a, b) => AREA_PRIORITY.indexOf(a) - AREA_PRIORITY.indexOf(b));
}

// ── Words ───────────────────────────────────────────────────────────────────────

export const AREA_STATE_LABELS: Record<AreaState, string> = {
  thriving: 'Thriving',
  steady: 'Steady',
  needs_care: 'Needs care',
};

const NOUN: Record<AreaKey, string> = {
  sleep: 'sleep',
  heart: 'heart',
  movement: 'movement',
  screen: 'evenings',
  body: 'weight trend',
};
const ADJECTIVE: Record<Exclude<AreaState, 'needs_care'>, string> = { thriving: 'Strong', steady: 'Steady' };

/** The one prepared step under the headline, per area that most needs it. */
export const AREA_STEPS: Record<AreaKey, string> = {
  sleep: 'A night near your usual bedtime moves this most.',
  heart: 'An easy walk and an early night help your heart recover.',
  movement: 'A brisk walk today starts to turn the week.',
  screen: 'Phone away an hour before bed helps the night.',
  body: 'Steady meals on plan keep the trend moving your way.',
};
export const ON_TRACK_STEP = 'The same routine tomorrow keeps it here.';

export type VitalsHeadline = { headline: string; line: string; focus: AreaKey | null };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Headline for the bands shown: the strongest area, then the one with room (when one needs care),
 * and one prepared step. Only areas with data speak. Templates only; numbers never appear.
 */
export function vitalsHeadline(areas: readonly Area[]): VitalsHeadline {
  // A guessed area never leads the words; with nothing measured or estimated, all of them speak.
  const real = areas.filter((a) => a.source !== 'assumed');
  const speaking = real.length > 0 ? real : areas;
  if (speaking.length === 0) return { headline: 'Settling in', line: ON_TRACK_STEP, focus: null };
  const sorted = [...speaking].sort((a, b) => b.score - a.score);
  const best = sorted[0]!;
  const weakest = sorted.at(-1)!;
  if (weakest.state === 'needs_care' && best.key !== weakest.key && best.state !== 'needs_care') {
    return {
      headline: `${ADJECTIVE[best.state as 'thriving' | 'steady']} ${NOUN[best.key]}, with room in ${NOUN[weakest.key]}`,
      line: AREA_STEPS[weakest.key],
      focus: weakest.key,
    };
  }
  if (weakest.state === 'needs_care') {
    return { headline: `${cap(NOUN[weakest.key])} needs care first`, line: AREA_STEPS[weakest.key], focus: weakest.key };
  }
  if (best.key === weakest.key || best.state === weakest.state) {
    return {
      headline: best.state === 'thriving' ? 'Thriving across the board' : 'Steady across the board',
      line: best.state === 'thriving' ? ON_TRACK_STEP : AREA_STEPS[weakest.key],
      focus: best.state === 'thriving' ? null : weakest.key,
    };
  }
  return {
    headline: `Strong ${NOUN[best.key]}, steady ${NOUN[weakest.key]}`,
    line: AREA_STEPS[weakest.key],
    focus: weakest.key,
  };
}

// ── Rows (the detail under the hero) ────────────────────────────────────────────

export type RowState = 'strong' | 'in_range' | 'outside';

export type VitalRow = {
  key: MetricKey | 'body_fat';
  area: AreaKey;
  /** Main value and, for blood pressure, the diastolic. */
  value: number;
  value2?: number;
  unit: string;
  state: RowState;
  source: VitalsSource;
  /** The usual band (own p25-p75, or a typical range) for the slider, or null. */
  band: { lo: number; hi: number; own: boolean } | null;
  day: string | null;
  /** Entered by the user (e.g. a corrected night), not read from a source. */
  manual?: boolean;
};

/** A measured-only metric with no reading yet: shown as an ask, never estimated. */
export type VitalStub = { key: MetricKey; area: AreaKey; action: 'add' | 'connect' | 'usage_access' };

/**
 * A row's state word. "Outside your usual range" only when the value really is past the user's own
 * band; a low score inside it is outside the typical range instead.
 */
export function rowStateLabel(row: Pick<VitalRow, 'state' | 'value' | 'band'>): string {
  if (row.state === 'strong') return 'Strong';
  if (row.state === 'in_range') return 'In range';
  const b = row.band;
  const pastOwn = b != null && b.own && (row.value < b.lo || row.value > b.hi);
  return pastOwn ? 'Outside your usual range' : 'Outside the typical range';
}

/** Which way is better for a reading; the rest are best inside their band. */
const HIGHER_BETTER = new Set<VitalRow['key']>(['hrv', 'spo2', 'week_activity', 'exercise_week', 'vo2max']);
const LOWER_BETTER = new Set<VitalRow['key']>(['resting_hr', 'screen_late', 'screen_daily']);
/** Their state comes from the trend toward the goal, not from the band. */
const TREND_ROWS = new Set<VitalRow['key']>(['weight_trend', 'body_fat']);

/**
 * A row past its band on the worse side reads as outside, whatever its score: the state word
 * and the slider must never disagree. Past the band on the better side keeps its score's word.
 */
export function bandedState(row: Pick<VitalRow, 'key' | 'value' | 'state' | 'band'>): RowState {
  if (!row.band || TREND_ROWS.has(row.key)) return row.state;
  const below = row.value < row.band.lo;
  const above = row.value > row.band.hi;
  const worse = HIGHER_BETTER.has(row.key) ? below : LOWER_BETTER.has(row.key) ? above : below || above;
  return worse ? 'outside' : row.state;
}

export function rowState(score: number): RowState {
  if (score >= 85) return 'strong';
  if (score >= 60) return 'in_range';
  return 'outside';
}

function quantile(sorted: readonly number[], q: number): number {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (i - lo);
}

/** Own p25-p75 with enough days, otherwise the typical range (or null when there isn't one). */
export function bandFor(values: readonly number[], typical: [number, number] | null): VitalRow['band'] {
  if (values.length >= MIN_BASELINE_DAYS) {
    const sorted = [...values].sort((a, b) => a - b);
    return { lo: round(quantile(sorted, 0.25), 1), hi: round(quantile(sorted, 0.75), 1), own: true };
  }
  return typical ? { lo: typical[0], hi: typical[1], own: false } : null;
}

export type VitalsDetail = { rows: VitalRow[]; stubs: VitalStub[] };

/** Every reading with a value as a row, and the measured-only ones without a value as asks. */
export function vitalsDetail(input: VitalsInput, report: VitalsReport): VitalsDetail {
  const rows: VitalRow[] = [];
  const stubs: VitalStub[] = [];
  const signal = (key: MetricKey) => report.areas.flatMap((a) => a.signals).find((s) => s.key === key);
  const need = input.sleepNeedHours ?? 7.5;

  const nights = nightsOf(input);
  const last = nights.find((n) => n.day === input.today) ?? null;
  if (last) {
    rows.push({
      key: 'sleep',
      area: 'sleep',
      value: round(last.hours, 1),
      unit: 'h',
      state: rowState(signal('sleep')?.score ?? 0),
      source: last.source,
      band: bandFor(nights.filter((n) => n !== last).map((n) => n.hours), [need - 0.5, need + 1]),
      day: last.day,
      manual: last.manual,
    });
  }

  const reading = (
    key: MetricKey,
    area: AreaKey,
    field: NumKey,
    unit: string,
    typical: [number, number] | null,
    score: (v: number) => number,
  ) => {
    const r = latestReading(input, field);
    if (!r) return false;
    rows.push({
      key,
      area,
      value: round(r.value, 1),
      unit,
      state: rowState(signal(key)?.score ?? score(r.value)),
      source: 'measured',
      band: bandFor(baselineValues(input, field, r.day), typical),
      day: r.day,
    });
    return true;
  };

  if (!reading('resting_hr', 'heart', 'restingHr', 'bpm', [50, 80], restingHrScore)) {
    stubs.push({ key: 'resting_hr', area: 'heart', action: 'add' });
  }
  if (!reading('hrv', 'heart', 'hrvMs', 'ms', null, () => 70)) {
    stubs.push({ key: 'hrv', area: 'heart', action: 'connect' });
  }
  if (!reading('spo2', 'heart', 'spo2', '%', [95, 100], spo2Score)) {
    stubs.push({ key: 'spo2', area: 'heart', action: 'add' });
  }
  const sys = latestReading(input, 'systolic');
  const dia = latestReading(input, 'diastolic');
  if (sys && dia) {
    rows.push({
      key: 'blood_pressure',
      area: 'heart',
      value: round(sys.value),
      value2: round(dia.value),
      unit: 'mmHg',
      state: rowState(bloodPressureScore(sys.value, dia.value)),
      source: 'measured',
      band: bandFor(baselineValues(input, 'systolic', sys.day), [90, 120]),
      day: sys.day,
    });
  } else {
    stubs.push({ key: 'blood_pressure', area: 'heart', action: 'add' });
  }
  if (!reading('glucose', 'heart', 'glucoseMgDl', 'mg/dL', [70, 140], glucoseScore)) {
    stubs.push({ key: 'glucose', area: 'heart', action: 'add' });
  }
  reading('resp_rate', 'heart', 'respRate', '/min', [12, 20], respRateScore);
  reading('body_temp', 'heart', 'bodyTempC', '°C', [36.1, 37.2], bodyTempScore);
  reading('vo2max', 'heart', 'vo2max', 'ml/kg/min', null, (v) =>
    vo2maxScore(v, input.profile?.age, input.profile?.sex),
  );

  const past = input.days.filter((d) => d.day < input.today);
  const stepDays = past.slice(0, 7).map((d) => d.steps).filter(present) as number[];
  if (stepDays.length >= 3) {
    rows.push({
      key: 'week_activity',
      area: 'movement',
      value: Math.round(mean(stepDays)),
      unit: 'steps',
      state: rowState(signal('week_activity')?.score ?? atLeastScore(mean(stepDays), input.goals.steps)),
      source: 'measured',
      band: bandFor(past.map((d) => d.steps).filter(present) as number[], [input.goals.steps * 0.8, input.goals.steps * 1.2]),
      day: null,
    });
  }
  const exercise = signal('exercise_week');
  if (exercise) {
    const mins = past.slice(0, 7).map((d) => d.exerciseMin).filter(present) as number[];
    rows.push({
      key: 'exercise_week',
      area: 'movement',
      value: Math.round(mins.reduce((a, b) => a + b, 0) * (7 / mins.length)),
      unit: 'min',
      state: rowState(exercise.score),
      source: 'measured',
      band: { lo: 150, hi: 300, own: false },
      day: null,
    });
  }

  const late = signal('screen_late');
  const daily = signal('screen_daily');
  if (late || daily) {
    if (daily) {
      const mins = past.slice(0, 7).map((d) => d.screenOnMin).filter(present) as number[];
      rows.push({
        key: 'screen_daily',
        area: 'screen',
        value: Math.round(mean(mins)),
        unit: 'min',
        state: rowState(daily.score),
        source: 'measured',
        band: bandFor(past.map((d) => d.screenOnMin).filter(present) as number[], null),
        day: null,
      });
    }
    if (late) {
      rows.push({
        key: 'screen_late',
        area: 'screen',
        value: past[0]!.screenLateMin!,
        unit: 'min',
        state: rowState(late.score),
        source: 'measured',
        band: { lo: 0, hi: 30, own: false },
        day: past[0]!.day,
      });
    }
  } else {
    stubs.push({ key: 'screen_late', area: 'screen', action: 'usage_access' });
  }

  // Weight moves slowly, so the newest weigh-in in the whole window counts.
  const weightDay = input.days.find((d) => present(d.weightKg));
  const weight = weightDay ? { value: weightDay.weightKg as number, day: weightDay.day } : null;
  const trend = weightTrend(input);
  if (weight) {
    rows.push({
      key: 'weight_trend',
      area: 'body',
      value: round(weight.value, 1),
      unit: 'kg',
      state: rowState(trend == null ? 70 : weightTrendScore(trend, input.profile?.goal)),
      source: 'measured',
      band: bandFor(baselineValues(input, 'weightKg', weight.day), null),
      day: weight.day,
    });
  }
  const fat = latestReading(input, 'bodyFatPct');
  if (fat) {
    rows.push({
      key: 'body_fat',
      area: 'body',
      value: round(fat.value, 1),
      unit: '%',
      state: 'in_range',
      source: 'measured',
      band: bandFor(baselineValues(input, 'bodyFatPct', fat.day), null),
      day: fat.day,
    });
  }
  return { rows: rows.map((r) => ({ ...r, state: bandedState(r) })), stubs };
}
