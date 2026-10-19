// GENERATED from halo-shared/src/signals.ts by halo-shared/scripts/sync.mjs. Do not edit.

// The directors (SPEC §4 "Insight engine"): raw signals computed from the day's facts and what
// Halo has learned about the user. Each rule only says what it sees; none of them decides what
// reaches the user. That is the PA's job (pa.ts).

import type { Factor, FactorKey } from './blood-work';
import { addDays, dayStart, formatClock } from './day';
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
import { type NightShape, sleepPattern } from './sleep';
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
  'usage_ask',
  'sleep_pattern',
  'weekly_review',
  'quiet_days',
  'on_track',
  'blood_work',
  'vital_alert',
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
  /** Recent nights (Health Connect, else the screen), newest first. */
  nights?: readonly NightShape[];
  /** Where nights come from: Health Connect, the screen (Usage access), or nowhere yet. */
  sleepSource?: 'health' | 'screen' | 'none';
  /** Usage access: granted, not granted, or not in this build. */
  usageAccess?: 'granted' | 'denied' | 'unavailable';
  /** The latest report added and the familiar factors of all reports. */
  bloodWork?: { reportId: string; addedDay: string; factors: readonly Factor[] } | null;
  /** Today's latest measured readings: Health Connect or the user's own entry, never a report. */
  readings?: VitalReadings | null;
};

export type VitalReadings = {
  restingHr?: number | null;
  spo2?: number | null;
  systolic?: number | null;
  diastolic?: number | null;
  glucoseMgDl?: number | null;
  bodyTempC?: number | null;
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

/**
 * Tonight's bedtime. Normally the healthy one (wake − need − wind-down). When nights have been
 * running late, it's one 15-minute step earlier than usual instead: a target that can be met.
 */
export function bedtimeOf(ctx: PaContext): Bedtime {
  const ideal = bedtimeFor(ctx.wake.value, ctx.facts.sleepNeedHours, ctx.facts.sleepHours);
  const pattern = ctx.nights ? sleepPattern(ctx.nights, ideal.hour) : null;
  if (pattern?.flag !== 'late') return ideal;
  return { hour: wrapHour(pattern.tonight), pulled: ideal.pulled };
}

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
  if (ctx.wake.source === 'measured' || ctx.wake.source === 'asked' || ctx.wake.via === 'screen') {
    return null;
  }
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

/** Asked on at most this many days, then dropped for good. */
const USAGE_ASK_DAYS = 3;

/** No Health Connect sleep: offer the screen as a sleep source, in context, a few times at most. */
function usageAsk(ctx: PaContext): Signal | null {
  if (ctx.sleepSource !== 'none' || ctx.usageAccess !== 'denied') return null;
  const askedDays = new Set(ctx.history.filter((r) => r.type === 'usage_ask').map((r) => r.day));
  if (askedDays.size >= USAGE_ASK_DAYS && !askedDays.has(ctx.day)) return null;
  return {
    id: `${ctx.day}:usage_ask`,
    type: 'usage_ask',
    severity: 32,
    reason: 'Bedtime and quiet hours follow your real nights.',
    action: { kind: 'usage_access' },
    expiresAt: atHour(ctx, bedtimeOf(ctx).hour - 0.5),
    tab: null,
    facts: {},
  };
}

/** Every three days at most: say so when nights run short, late or drift on weekends. */
function sleepPatternBrief(ctx: PaContext): Signal | null {
  if (!ctx.nights) return null;
  const ideal = bedtimeFor(ctx.wake.value, ctx.facts.sleepNeedHours, null);
  const pattern = sleepPattern(ctx.nights, ideal.hour);
  if (!pattern) return null;
  const bed = bedtimeOf(ctx);
  if (ctx.hour < 19 || !inSpan(ctx.hour, 19, bed.hour - 1.5)) return null;
  const recent = ctx.history.some(
    (r) => r.type === 'sleep_pattern' && r.day > addDays(ctx.day, -3) && r.day !== ctx.day,
  );
  if (recent) return null;
  return {
    id: `${ctx.day}:sleep_pattern`,
    type: 'sleep_pattern',
    severity: 35,
    reason: 'Steady, long enough nights make hunger and energy easier to manage.',
    action: null,
    expiresAt: atHour(ctx, bed.hour - 1.5),
    tab: 'sleep',
    facts: {
      flag: pattern.flag,
      hours: round(pattern.hours, 1),
      // Quarter hours: the step is 15 minutes, so half-hour rounding would hide it.
      usual: formatClock(Math.round(pattern.usualBed * 4) / 4, ctx.facts.clock24),
      tonight: formatClock(Math.round(pattern.tonight * 4) / 4, ctx.facts.clock24),
      drift: round(pattern.drift, 1),
    },
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

/** A new report is worth one brief for this many days (the day it's added and the two after). */
const REPORT_BRIEF_DAYS = 3;
/**
 * Which factors move with each plan goal: the PA speaks about these first. The goal stays one
 * goal (the user's plan); this only orders what a report says.
 */
export const GOAL_FIRST: Record<'lose' | 'maintain' | 'gain', readonly FactorKey[]> = {
  lose: ['blood_sugar', 'cholesterol'],
  maintain: [],
  gain: ['haemoglobin', 'b12', 'vitamin_d'],
};

/**
 * The factor outside its range that speaks first: far outside (a doctor), then what moves with
 * the plan's goal, then the usual order. Null when every factor is in range.
 */
export function leadFactor(
  factors: readonly Factor[],
  goal: 'lose' | 'maintain' | 'gain' | null | undefined,
): Factor | null {
  const first = GOAL_FIRST[goal ?? 'maintain'];
  const rank = (f: Factor) => (f.lead.far ? 0 : first.includes(f.key) ? 1 : 2);
  const outside = factors
    .filter((f) => f.lead.state && f.lead.state !== 'inside')
    .sort((a, b) => rank(a) - rank(b));
  return outside[0] ?? null;
}

/**
 * After a report is added: one thing from it, ready to act on. Far outside a range comes first
 * (a doctor), then what moves with the plan's goal, then the usual order; all in range says so.
 * Once seen and acted on or passed over, that report says nothing more.
 */
function bloodWorkBrief(ctx: PaContext): Signal | null {
  const bw = ctx.bloodWork;
  if (!bw || dayGap(bw.addedDay, ctx.day) >= REPORT_BRIEF_DAYS) return null;
  const tag = bw.reportId.slice(0, 8);
  const done = ctx.history.some(
    (r) => r.type === 'blood_work' && r.id.endsWith(tag) && (r.state === 'acted' || r.state === 'ignored'),
  );
  if (done) return null;
  if (!bw.factors.some((f) => f.lead.state)) return null;
  const focus = leadFactor(bw.factors, ctx.facts.goal);
  return {
    id: `${ctx.day}:blood_work:${tag}`,
    type: 'blood_work',
    severity: !focus ? 25 : focus.lead.far ? 60 : 45,
    reason: 'A report says the most once, while it is new.',
    action: { kind: 'blood_work' },
    expiresAt: atHour(ctx, 27.5),
    tab: null,
    facts: focus
      ? {
          focus: focus.lead.far ? 'far' : 'care',
          name: focus.label,
          step: focus.advice ?? '',
        }
      : { focus: 'in_range' },
  };
}

/** A reading this far out is worth saying now, ahead of anything else. Never a diagnosis. */
type AlertRule = {
  metric: string;
  label: string;
  /** The reading as said, or null when it isn't critical. */
  check: (r: VitalReadings) => { reading: string; side: 'above' | 'below' } | null;
  /** The same typical band the Vitals row is drawn against. */
  typical: string;
};

const fmtReading = (v: number, digits = 0) => String(round(v, digits));

/** In order of urgency: the first that fires is the one said. */
const ALERTS: readonly AlertRule[] = [
  {
    metric: 'spo2',
    label: 'Blood oxygen',
    typical: '95–100%',
    check: ({ spo2 }) => (spo2 != null && spo2 < 92 ? { reading: `${fmtReading(spo2)}%`, side: 'below' } : null),
  },
  {
    metric: 'blood_pressure',
    label: 'Blood pressure',
    typical: '90/60–120/80',
    check: ({ systolic: s, diastolic: d }) =>
      s != null && d != null && (s >= 160 || d >= 100) ? { reading: `${fmtReading(s)}/${fmtReading(d)}`, side: 'above' } : null,
  },
  {
    metric: 'glucose',
    label: 'Glucose',
    typical: '70–140 mg/dL',
    check: ({ glucoseMgDl: g }) =>
      g == null ? null : g < 70 ? { reading: `${fmtReading(g)} mg/dL`, side: 'below' } : g >= 200 ? { reading: `${fmtReading(g)} mg/dL`, side: 'above' } : null,
  },
  {
    metric: 'resting_hr',
    label: 'Resting heart rate',
    typical: '50–80 bpm',
    check: ({ restingHr: hr }) =>
      hr == null ? null : hr > 100 ? { reading: `${fmtReading(hr)} bpm`, side: 'above' } : hr < 40 ? { reading: `${fmtReading(hr)} bpm`, side: 'below' } : null,
  },
  {
    metric: 'body_temp',
    label: 'Body temperature',
    typical: '36.1–37.2 °C',
    check: ({ bodyTempC: t }) => (t != null && t >= 38 ? { reading: `${fmtReading(t, 1)} °C`, side: 'above' } : null),
  },
];

/**
 * A measured reading today far outside its typical range: said first, everywhere, with the
 * reading and the range it's compared with. Estimates and report values never raise it.
 */
/** The most urgent critical reading, if any. */
export function criticalReading(readings: VitalReadings | null | undefined) {
  if (!readings) return null;
  for (const rule of ALERTS) {
    const hit = rule.check(readings);
    if (hit) return { ...hit, metric: rule.metric, label: rule.label, typical: rule.typical };
  }
  return null;
}

function vitalAlert(ctx: PaContext): Signal | null {
  const alert = criticalReading(ctx.readings);
  if (!alert) return null;
  return {
    id: `${ctx.day}:vital_alert:${alert.metric}`,
    type: 'vital_alert',
    severity: 95,
    reason: 'A reading this far from its usual range is worth a second look today.',
    action: { kind: 'advisor' },
    expiresAt: atHour(ctx, 27.5),
    tab: null,
    facts: { metric: alert.metric, label: alert.label, reading: alert.reading, side: alert.side, typical: alert.typical },
  };
}

const dayGap = (from: string, to: string) =>
  Math.round((dayStart(to).getTime() - dayStart(from).getTime()) / 86_400_000);

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
    usageAsk(ctx),
    sleepPatternBrief(ctx),
    weeklyReview(ctx),
    bloodWorkBrief(ctx),
    vitalAlert(ctx),
  ].filter((s): s is Signal => s != null);
}
