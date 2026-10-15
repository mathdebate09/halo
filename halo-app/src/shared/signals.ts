// GENERATED from halo-shared/src/signals.ts by halo-shared/scripts/sync.mjs. Do not edit.

// The directors (SPEC §4 "Insight engine"): raw signals computed from the day's facts and what
// Halo has learned about the user. Each rule only says what it sees; none of them decides what
// reaches the user. That is the PA's job (pa.ts).

import { dayStart, formatClock } from './day';
import {
  behind,
  type DayFacts,
  EARLY,
  type NextAction,
  roundGap,
  SUGGESTIONS,
  type SummaryTab,
} from './insights';
import {
  type Bedtime,
  bedtimeFor,
  clockLabel,
  inSpan,
  type Learned,
  usualHour,
  wrapHour,
} from './learning';
import type { MealType, MealWindows } from './scoring';
import { clamp, round } from './units';

export const INSIGHT_KINDS = [
  'meal_window',
  'protein_pace',
  'calorie_pace',
  'calorie_over',
  'water_pace',
  'weigh_in',
  'sleep_debt',
  'bedtime',
  'wake_ask',
  'weekly_review',
  'quiet_days',
  'on_track',
] as const;
export type InsightKind = (typeof INSIGHT_KINDS)[number];

export type InsightState = 'pending' | 'shown' | 'acted' | 'ignored' | 'resolved';
export type InsightChannel = 'today' | 'learn' | 'notification';

/** Facts are short numbers and words only: they fill templates and, later, the phrase request. */
export type InsightFacts = Record<string, number | string>;

/** One thing worth saying, before the PA has vetted or worded it. */
export type Signal = {
  /** `${day}:${type}`, plus the meal for meal windows. One row per id per day. */
  id: string;
  type: InsightKind;
  /** 0-100: how much it matters right now. */
  severity: number;
  /** The Why, in one line. */
  reason: string;
  /** The step already prepared for the user. */
  action: NextAction;
  /** Epoch ms after which it no longer applies. */
  expiresAt: number;
  /** The Learn more chip it opens on. */
  tab: SummaryTab | null;
  facts: InsightFacts;
};

export type InsightCopy = { tagline: string; line: string; actionLabel: string | null };

/** A vetted, ranked signal with its words. */
export type Insight = Signal & { copy: InsightCopy };

/** A stored insight (the `insights` table), as the loop needs it. */
export type InsightRecord = {
  id: string;
  day: string;
  type: InsightKind;
  state: InsightState;
  severity: number;
  shownAt: number | null;
  actedAt: number | null;
  resolvedAt: number | null;
  expiresAt: number | null;
};

/** Everything the PA knows about the user at this moment. */
export type PaContext = {
  /** Epoch ms. */
  now: number;
  day: string;
  /** Wall-clock hour (13.5 = 13:30). */
  hour: number;
  facts: DayFacts;
  /** Today's meal windows (learned, weekday or weekend). */
  windows: MealWindows;
  wake: Learned<number>;
  /** The night before last, for "better than the night before". */
  prevNightHours: number | null;
  usualMeals: Partial<Record<MealType, string>>;
  weighedToday: boolean;
  /** Day key of the latest weigh-in, if any. */
  lastWeighDay: string | null;
  /** Epoch ms of the latest meal or water log today. */
  lastLogAt: number | null;
  /** Stored insights from the last two weeks. */
  history: readonly InsightRecord[];
  /** Whole days since the first open (0 on day one). */
  daysSinceInstall?: number | null;
  /** The user answered (or waved off) the wake-time ask. */
  wakeAsked?: boolean;
  /** Overall scores of the last seven days (today included) and the seven before. */
  week?: WeekStats | null;
};

export type WeekStats = { days: number; avg: number; prevAvg: number | null };

const HOUR_MS = 3_600_000;
const MAIN_MEALS = ['breakfast', 'lunch', 'dinner'] as const;
/** A meal window counts as near from half an hour before it opens until half an hour after it ends. */
const LEAD = 0.5;
const TAIL = 0.5;
/** A missed meal is only worth asking about for a few hours. */
const MISSED_FOR = 5;


/** This hour on the device's clock ("15:00" or "3 pm"): the hour, so the words hold all hour. */
const hourLabel = (ctx: PaContext) => formatClock(Math.floor(ctx.hour), ctx.facts.clock24);

/** Epoch ms of the next time the wall clock reads `hour` (today, or after midnight). */
export function atHour(ctx: Pick<PaContext, 'now' | 'hour'>, hour: number): number {
  return ctx.now + wrapHour(hour - ctx.hour) * HOUR_MS;
}

export const bedtimeOf = (ctx: PaContext): Bedtime =>
  bedtimeFor(ctx.wake.value, ctx.facts.sleepNeedHours, ctx.facts.sleepHours);

/** From half an hour before bedtime until the usual wake time: no food, water or scale talk. */
export const isLate = (ctx: PaContext) =>
  inSpan(ctx.hour, bedtimeOf(ctx).hour - 0.5, ctx.wake.value);

function mealNote(ctx: PaContext, type: MealType) {
  return ctx.usualMeals[type] ?? SUGGESTIONS[type].note;
}

/** The next main meal still ahead (unlogged, window not yet closed), otherwise a snack. */
function nextMain(ctx: PaContext): MealType {
  return (
    MAIN_MEALS.find(
      (t) => !ctx.facts.loggedTypes.includes(t) && ctx.hour <= ctx.windows[t].end + TAIL,
    ) ?? 'snack'
  );
}

function mealWindow(ctx: PaContext): Signal | null {
  const { facts, hour, windows, day } = ctx;
  const missed: (typeof MAIN_MEALS)[number][] = [];
  for (const type of MAIN_MEALS) {
    if (facts.loggedTypes.includes(type)) continue;
    const w = windows[type];
    if (hour < w.start - LEAD) break;
    if (hour > w.end + TAIL) {
      if (hour - (w.end + TAIL) <= MISSED_FOR) missed.push(type);
      continue;
    }
    const progress = clamp((hour - (w.start - LEAD)) / (w.end + TAIL - (w.start - LEAD)), 0, 1);
    return {
      id: `${day}:meal_window:${type}`,
      type: 'meal_window',
      severity: round(35 + 40 * progress),
      reason: 'Your score reads the day from what you log.',
      action: { kind: 'log', note: mealNote(ctx, type) },
      expiresAt: atHour(ctx, w.end + TAIL),
      tab: 'calories',
      facts: {
        meal: type,
        status: 'open',
        at: clockLabel(usualHour(windows, type), ctx.facts.clock24),
        missed: missed.at(-1) ?? '',
      },
    };
  }
  const last = missed.at(-1);
  if (!last) return null;
  const following = MAIN_MEALS[MAIN_MEALS.indexOf(last) + 1];
  return {
    id: `${day}:meal_window:${last}`,
    type: 'meal_window',
    severity: 30,
    reason: 'Your score reads the day from what you log.',
    action: { kind: 'log', note: mealNote(ctx, last) },
    expiresAt: following
      ? atHour(ctx, windows[following].start - LEAD)
      : atHour(ctx, windows[last].end + TAIL + MISSED_FOR),
    tab: 'calories',
    facts: {
      meal: last,
      status: 'missed',
      next: following ?? '',
      nextAt: following ? clockLabel(usualHour(windows, following), ctx.facts.clock24) : '',
    },
  };
}

function proteinPace(ctx: PaContext): Signal | null {
  const { facts: f } = ctx;
  if (f.mealsLogged === 0 || !behind(f.intake.proteinG, f.targets.proteinG, f.due)) return null;
  const gap = f.targets.proteinG * f.due - f.intake.proteinG;
  if (gap < 10) return null;
  return {
    id: `${ctx.day}:protein_pace`,
    type: 'protein_pace',
    severity: round(clamp(30 + (50 * gap) / (f.targets.proteinG * 0.35), 30, 85)),
    reason:
      f.goal === 'gain'
        ? 'Protein is what turns the extra food into muscle.'
        : 'Protein keeps you full and protects muscle.',
    action: { kind: 'log', note: SUGGESTIONS.protein.note },
    expiresAt: atHour(ctx, bedtimeOf(ctx).hour - 0.5),
    tab: 'protein',
    facts: {
      gap: roundGap(gap, 'g'),
      at: hourLabel(ctx),
      dinnerLogged: f.loggedTypes.includes('dinner') ? 1 : 0,
    },
  };
}

function caloriePace(ctx: PaContext): Signal | null {
  const { facts: f } = ctx;
  if (f.mealsLogged === 0 || f.due < 0.3 || !behind(f.intake.kcal, f.targets.kcal, f.due)) return null;
  const gap = f.targets.kcal * f.due - f.intake.kcal;
  if (gap < 150) return null;
  const next = nextMain(ctx);
  return {
    id: `${ctx.day}:calorie_pace`,
    type: 'calorie_pace',
    severity: round(clamp(25 + (40 * gap) / (f.targets.kcal * 0.3), 25, 70)),
    reason: 'Eating too little now usually means overeating later.',
    action: { kind: 'log', note: mealNote(ctx, next) },
    expiresAt: atHour(ctx, bedtimeOf(ctx).hour - 0.5),
    tab: 'calories',
    facts: { gap: roundGap(gap, 'kcal'), at: hourLabel(ctx), next },
  };
}

function calorieOver(ctx: PaContext): Signal | null {
  const { facts: f } = ctx;
  const expected = f.targets.kcal * Math.max(f.due, EARLY);
  if (f.due < EARLY || f.intake.kcal <= expected * 1.15 || f.intake.kcal - expected < 150) return null;
  const left = f.targets.kcal - f.intake.kcal;
  const next = nextMain(ctx);
  return {
    id: `${ctx.day}:calorie_over`,
    type: 'calorie_over',
    severity: left < 0 ? 55 : 40,
    reason: 'A lighter rest of the day keeps the week on target.',
    action: { kind: 'log', note: SUGGESTIONS.light.note },
    expiresAt: atHour(ctx, bedtimeOf(ctx).hour - 0.5),
    tab: 'calories',
    facts: { left: left > 0 ? roundGap(left, 'kcal') : 0, next },
  };
}

function waterPace(ctx: PaContext): Signal | null {
  const { facts: f } = ctx;
  if (f.dayFraction < 0.15 || !behind(f.waterMl, f.targets.waterMl, f.dayFraction)) return null;
  const gap = f.targets.waterMl * f.dayFraction - f.waterMl;
  if (gap < 250) return null;
  return {
    id: `${ctx.day}:water_pace`,
    type: 'water_pace',
    severity: round(clamp(20 + (40 * gap) / f.targets.waterMl, 20, 60)),
    reason: 'Even mild dehydration can feel like hunger or tiredness.',
    action: { kind: 'water', ml: 250 },
    expiresAt: atHour(ctx, bedtimeOf(ctx).hour - 0.5),
    tab: 'water',
    facts: { gap: roundGap(gap, 'ml'), at: hourLabel(ctx) },
  };
}

function weighIn(ctx: PaContext, due: boolean): Signal | null {
  const wake = ctx.wake.value;
  if (!due || ctx.weighedToday || !inSpan(ctx.hour, wake, wake + 4)) return null;
  return {
    id: `${ctx.day}:weigh_in`,
    type: 'weigh_in',
    severity: 50,
    reason: 'Same time each morning makes the trend readable.',
    action: { kind: 'weigh' },
    expiresAt: atHour(ctx, wake + 4),
    tab: null,
    facts: {},
  };
}

function sleep(ctx: PaContext): Signal | null {
  const { facts: f, hour } = ctx;
  const bed = bedtimeOf(ctx);
  const at = clockLabel(bed.hour, f.clock24);
  const slept = f.sleepHours == null ? '' : round(f.sleepHours, 1);
  if (inSpan(hour, bed.hour - 1.5, bed.hour + 2)) {
    return {
      id: `${ctx.day}:bedtime`,
      type: 'bedtime',
      severity: bed.pulled ? 70 : 55,
      reason: 'Good sleep makes hunger easier to manage the next day.',
      action: null,
      expiresAt: atHour(ctx, bed.hour + 2),
      tab: 'sleep',
      facts: { at, slept, need: f.sleepNeedHours, pulled: bed.pulled ? 1 : 0 },
    };
  }
  if (f.sleepHours == null || f.sleepNeedHours - f.sleepHours <= 0.75) return null;
  const debt = f.sleepNeedHours - f.sleepHours;
  return {
    id: `${ctx.day}:sleep_debt`,
    type: 'sleep_debt',
    severity: hour >= 17 ? round(clamp(20 + 15 * debt, 20, 45)) : 15,
    reason: 'Good sleep makes hunger easier to manage the next day.',
    action: null,
    expiresAt: atHour(ctx, bed.hour + 2),
    tab: 'sleep',
    facts: { at, slept, need: f.sleepNeedHours },
  };
}

/** Day 3 and still guessing the wake time: ask once (SPEC §4 "Learning"). */
function wakeAsk(ctx: PaContext): Signal | null {
  if (ctx.wakeAsked || (ctx.daysSinceInstall ?? 0) < 2) return null;
  if (ctx.wake.source === 'measured' || ctx.wake.source === 'asked') return null;
  return {
    id: `${ctx.day}:wake_ask`,
    type: 'wake_ask',
    severity: 40,
    reason: 'Your weigh-in and bedtime are set from it.',
    action: { kind: 'ask_wake' },
    expiresAt: atHour(ctx, bedtimeOf(ctx).hour - 0.5),
    tab: null,
    facts: {},
  };
}

const REVIEW_FROM = 18;
const TREND = 3;

/** Sunday evening: the week in one line, against the week before. */
function weeklyReview(ctx: PaContext): Signal | null {
  const w = ctx.week;
  if (!w || w.days < 3 || dayStart(ctx.day).getDay() !== 0 || ctx.hour < REVIEW_FROM) return null;
  const delta = w.prevAvg == null ? 0 : round(w.avg - w.prevAvg);
  return {
    id: `${ctx.day}:weekly_review`,
    type: 'weekly_review',
    severity: 30,
    reason: 'A week shows the trend a single day can’t.',
    action: null,
    expiresAt: atHour(ctx, bedtimeOf(ctx).hour),
    tab: 'meal',
    facts: {
      avg: round(w.avg),
      days: w.days,
      delta: Math.abs(delta),
      trend: w.prevAvg == null ? 'first' : delta >= TREND ? 'up' : delta <= -TREND ? 'down' : 'level',
    },
  };
}

/** Two quiet days in a row (scheduled ahead, and pushed back every time the app opens). */
export function quietDays(ctx: PaContext, day: string, at: number): Signal {
  return {
    id: `${day}:quiet_days`,
    type: 'quiet_days',
    severity: 30,
    reason: 'A single log restarts the picture.',
    action: { kind: 'log', note: '' },
    expiresAt: at + 6 * HOUR_MS,
    tab: null,
    facts: {},
  };
}

/** The brief when nothing else passes: the day is fine, nothing needs the user. */
export function onTrack(ctx: PaContext): Signal {
  return {
    id: `${ctx.day}:on_track`,
    type: 'on_track',
    severity: 10,
    reason: '',
    action: null,
    expiresAt: atHour(ctx, ctx.hour + 1),
    tab: 'meal',
    facts: {},
  };
}

/** Every rule that fires right now, unvetted. `weighDue` comes from the loop's back-off. */
export function detectSignals(ctx: PaContext, weighDue: boolean): Signal[] {
  return [
    mealWindow(ctx),
    proteinPace(ctx),
    caloriePace(ctx),
    calorieOver(ctx),
    waterPace(ctx),
    weighIn(ctx, weighDue),
    sleep(ctx),
    wakeAsk(ctx),
    weeklyReview(ctx),
  ].filter((s): s is Signal => s != null);
}
