// GENERATED from halo-shared/src/insights.ts by halo-shared/scripts/sync.mjs. Do not edit.

// Learn more (SPEC §3 Today): a one-paragraph summary of the day and, per tab, Done / Pace / Next
// / Why. Built from local facts as structured segments ({ t } text, { m, v } a tappable metric
// chip), the same shape the AI will return in chunk 16, so the UI doesn't care who wrote it.

import { formatClock } from './day.js';
import type { Goal } from './plan.js';
import { DEFAULT_MEAL_WINDOWS, type MealType } from './scoring.js';
import { round } from './units.js';

export const SUMMARY_TABS = [
  'meal',
  'calories',
  'protein',
  'carbs',
  'fat',
  'water',
  'activity',
  'sleep',
] as const;
export type SummaryTab = (typeof SUMMARY_TABS)[number];

export const TAB_LABELS: Record<SummaryTab, string> = {
  meal: 'Meal score',
  calories: 'Calories',
  protein: 'Protein',
  carbs: 'Carbs',
  fat: 'Fat',
  water: 'Water',
  activity: 'Activity',
  sleep: 'Sleep',
};

export type Segment = { t: string } | { m: SummaryTab; v: string };

/** What a panel's Next does: log water now, open the logger pre-filled, or connect a source. */
export type NextAction =
  | { kind: 'water'; ml: number }
  | { kind: 'log'; note: string }
  | { kind: 'connect' }
  | { kind: 'weigh' }
  | { kind: 'ask_wake' }
  | { kind: 'usage_access' }
  | { kind: 'blood_work' }
  | { kind: 'advisor' }
  | null;

export type Panel = {
  tab: SummaryTab;
  /** False when there's nothing to show yet (no sleep source): the panel offers its Next only. */
  hasData: boolean;
  done: { value: number; target: number | null; unit: string };
  pace: string;
  next: { text: string; action: NextAction };
  /** Behind pace (or missing its source): only then is the Next worth showing. */
  nudge: boolean;
  why: string;
};

export type DayFacts = {
  hour: number;
  goal: Goal;
  mealsLogged: number;
  /** Meal types already logged today. */
  loggedTypes: MealType[];
  intake: { kcal: number; proteinG: number; carbsG: number; fatG: number };
  targets: {
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    waterMl: number;
    steps: number;
  };
  /** Share of the day's food usually eaten by now (at least the logged meals' share). */
  due: number;
  /** Share of an all-day target (water, steps) usually done by now. */
  dayFraction: number;
  waterMl: number;
  steps: number | null;
  sleepHours: number | null;
  sleepNeedHours: number;
  dietScore: number;
  /** The device uses a 24-hour clock (default) rather than am/pm. */
  clock24?: boolean;
};

/** Below this share of the day there's no pace to speak of yet. */
export const EARLY = 0.08;
export const ON_PACE = 0.1;

const fmt = (n: number) => Math.round(n).toLocaleString('en-GB');
const grams = (n: number) => `${fmt(n)} g`;

/** Gaps read as people say them, and the same everywhere a gap is shown (brief and panel). */
export const GAP_STEP: Record<string, number> = { kcal: 10, g: 5, ml: 50, steps: 100 };
export const roundGap = (n: number, unit: string) => {
  const step = GAP_STEP[unit] ?? 1;
  return Math.max(step, Math.round(n / step) * step);
};

/** The hour, not the minute: text that changes every minute would replay its reveal. */
const clock = (hour: number, h24?: boolean) => formatClock(Math.floor(hour), h24);

/** "About 40 g behind where you'd usually be by 13:00", or on pace / ahead / too early. */
function paceLine(
  actual: number,
  target: number,
  share: number,
  unit: string,
  hour: number,
  h24?: boolean,
) {
  if (share < EARLY) return 'Too early to judge. The day has barely started.';
  const expected = target * share;
  const diff = actual - expected;
  const show = `${fmt(roundGap(Math.abs(diff), unit))} ${unit}`;
  if (Math.abs(diff) <= expected * ON_PACE) return `Right on pace for ${clock(hour, h24)}.`;
  return diff < 0
    ? `About ${show} behind where you'd usually be by ${clock(hour, h24)}.`
    : `About ${show} ahead of where you'd usually be by ${clock(hour, h24)}.`;
}

/**
 * The meal to suggest next: the first main meal not yet logged whose window (with an hour's
 * grace) hasn't closed, otherwise a snack.
 */
export function nextMeal(hour: number, logged: readonly MealType[]): MealType {
  for (const type of ['breakfast', 'lunch', 'dinner'] as const) {
    if (logged.includes(type)) continue;
    if (hour <= DEFAULT_MEAL_WINDOWS[type].end + 1) return type;
  }
  return 'snack';
}

/** Pre-filled logger notes, with the words the Next button uses for each. */
export const SUGGESTIONS = {
  protein: { note: 'Greek yogurt with berries', label: 'Log Greek yogurt with berries' },
  carbs: { note: 'Oats with banana', label: 'Log oats with banana' },
  fat: { note: 'A handful of almonds', label: 'Log a handful of almonds' },
  light: { note: 'Salad with grilled chicken', label: 'Keep the next meal light' },
  breakfast: { note: 'Eggs on toast', label: 'Log breakfast' },
  lunch: { note: 'Chicken rice bowl', label: 'Log lunch' },
  dinner: { note: 'Salmon with vegetables', label: 'Log dinner' },
  snack: { note: 'An apple with peanut butter', label: 'Log a snack' },
} as const;

export const behind = (actual: number, target: number, due: number) =>
  due >= EARLY && actual < target * due * (1 - ON_PACE);

function macroNext(f: DayFacts, key: 'proteinG' | 'carbsG' | 'fatG'): Panel['next'] {
  const name = key === 'proteinG' ? 'protein' : key === 'carbsG' ? 'carbs' : 'fat';
  if (f.intake[key] >= f.targets[key]) {
    return { text: `You've reached today's ${name}. Nothing more needed.`, action: null };
  }
  const { note, label } = SUGGESTIONS[name];
  return { text: label, action: { kind: 'log', note } };
}

function caloriesNext(f: DayFacts): Panel['next'] {
  if (f.intake.kcal > f.targets.kcal * Math.max(f.due, EARLY) * (1 + ON_PACE) && f.due >= EARLY) {
    return { text: SUGGESTIONS.light.label, action: { kind: 'log', note: SUGGESTIONS.light.note } };
  }
  const meal = nextMeal(f.hour, f.loggedTypes);
  const { note, label } = SUGGESTIONS[meal];
  return { text: label, action: { kind: 'log', note } };
}

const GOAL_WHY: Record<Goal, string> = {
  lose: 'Staying near your target keeps the weight coming off steadily.',
  maintain: 'Staying near your target keeps your weight steady.',
  gain: 'Reaching your target is what lets you build.',
};

function panelFor(tab: SummaryTab, f: DayFacts): Omit<Panel, 'nudge'> {
  const { intake, targets, due, hour } = f;
  switch (tab) {
    case 'calories':
      return {
        tab,
        hasData: true,
        done: { value: intake.kcal, target: targets.kcal, unit: 'kcal' },
        pace: paceLine(intake.kcal, targets.kcal, due, 'kcal', hour, f.clock24),
        next: caloriesNext(f),
        why: GOAL_WHY[f.goal],
      };
    case 'protein':
      return {
        tab,
        hasData: true,
        done: { value: intake.proteinG, target: targets.proteinG, unit: 'g' },
        pace: paceLine(intake.proteinG, targets.proteinG, due, 'g', hour, f.clock24),
        next: macroNext(f, 'proteinG'),
        why:
          f.goal === 'gain'
            ? 'Protein is what turns the extra food into muscle.'
            : 'Protein keeps you full and protects muscle.',
      };
    case 'carbs':
      return {
        tab,
        hasData: true,
        done: { value: intake.carbsG, target: targets.carbsG, unit: 'g' },
        pace: paceLine(intake.carbsG, targets.carbsG, due, 'g', hour, f.clock24),
        next: macroNext(f, 'carbsG'),
        why: 'Carbs fuel your steps and workouts.',
      };
    case 'fat':
      return {
        tab,
        hasData: true,
        done: { value: intake.fatG, target: targets.fatG, unit: 'g' },
        pace: paceLine(intake.fatG, targets.fatG, due, 'g', hour, f.clock24),
        next: macroNext(f, 'fatG'),
        why: 'Fat keeps meals satisfying and helps you absorb vitamins.',
      };
    case 'water': {
      const done = f.waterMl >= targets.waterMl;
      return {
        tab,
        hasData: true,
        done: { value: f.waterMl, target: targets.waterMl, unit: 'ml' },
        pace: paceLine(f.waterMl, targets.waterMl, f.dayFraction, 'ml', hour, f.clock24),
        next: done
          ? { text: "You've had your water for today.", action: null }
          : { text: 'Add a glass', action: { kind: 'water', ml: 250 } },
        why: 'Even mild dehydration can feel like hunger or tiredness.',
      };
    }
    case 'activity': {
      if (f.steps == null) {
        return {
          tab,
          hasData: false,
          done: { value: 0, target: targets.steps, unit: 'steps' },
          pace: 'No step data yet.',
          next: { text: 'Connect Health Connect', action: { kind: 'connect' } },
          why: 'Movement adds to your burn without eating less.',
        };
      }
      const left = Math.max(0, targets.steps * Math.max(f.dayFraction, EARLY) - f.steps);
      return {
        tab,
        hasData: true,
        done: { value: f.steps, target: targets.steps, unit: 'steps' },
        pace: paceLine(f.steps, targets.steps, f.dayFraction, 'steps', hour, f.clock24),
        next: {
          text:
            left > 300
              ? `A ${Math.max(5, Math.round(left / 100 / 5) * 5)}-minute walk closes the gap.`
              : 'Keep moving the way you are.',
          action: null,
        },
        why: 'Movement adds to your burn without eating less.',
      };
    }
    case 'sleep': {
      if (f.sleepHours == null) {
        return {
          tab,
          hasData: false,
          done: { value: 0, target: f.sleepNeedHours, unit: 'h' },
          pace: 'No sleep data for last night.',
          next: { text: 'Connect Health Connect', action: { kind: 'connect' } },
          why: 'Good sleep makes hunger easier to manage the next day.',
        };
      }
      const short = f.sleepNeedHours - f.sleepHours;
      return {
        tab,
        hasData: true,
        done: { value: round(f.sleepHours, 1), target: f.sleepNeedHours, unit: 'h' },
        pace:
          short > 0.25
            ? `About ${round(short, 1)} h short of your ${f.sleepNeedHours} h last night.`
            : 'You got the sleep you need last night.',
        next: {
          text:
            short > 0.25 ? 'An earlier night tonight evens it out.' : 'Same bedtime tonight.',
          action: null,
        },
        why: 'Good sleep makes hunger easier to manage the next day.',
      };
    }
    case 'meal': {
      // The weakest of calories and protein drives the suggestion.
      const proteinBehind = behind(intake.proteinG, targets.proteinG, due);
      const next = f.mealsLogged === 0 ? caloriesNext(f) : proteinBehind ? macroNext(f, 'proteinG') : caloriesNext(f);
      return {
        tab,
        hasData: true,
        done: { value: f.dietScore, target: 100, unit: '' },
        pace:
          f.mealsLogged === 0
            ? 'Nothing logged yet. Your first meal starts the score.'
            : f.dietScore >= 80
              ? 'Strong so far today.'
              : f.dietScore >= 50
                ? 'Some room to improve today.'
                : 'Behind today, with time to catch up.',
        next,
        why: 'It weighs calories, protein, balance and meal timing against the time of day.',
      };
    }
  }
}

/** Whether the day is behind on this tab, so its Next is worth showing. */
function needsNudge(tab: SummaryTab, f: DayFacts, panel: Omit<Panel, 'nudge'>): boolean {
  if (!panel.hasData) return true;
  if (!panel.next.action) return false;
  switch (tab) {
    case 'calories':
      return behind(f.intake.kcal, f.targets.kcal, f.due);
    case 'protein':
      return behind(f.intake.proteinG, f.targets.proteinG, f.due);
    case 'carbs':
      return behind(f.intake.carbsG, f.targets.carbsG, f.due);
    case 'fat':
      return behind(f.intake.fatG, f.targets.fatG, f.due);
    case 'water':
      return behind(f.waterMl, f.targets.waterMl, f.dayFraction);
    case 'meal':
      return f.mealsLogged === 0 || f.dietScore < 70;
    default:
      return false;
  }
}

export function summaryPanel(tab: SummaryTab, f: DayFacts): Panel {
  const panel = panelFor(tab, f);
  return { ...panel, nudge: needsNudge(tab, f, panel) };
}

/** The opening paragraph: what's in so far, with each number a chip that opens its tab. */
export function daySummary(f: DayFacts): Segment[] {
  if (f.mealsLogged === 0) {
    const water: Segment[] =
      f.waterMl > 0 ? [{ t: ' You’ve had ' }, { m: 'water', v: `${fmt(f.waterMl)} ml` }, { t: ' of water.' }] : [];
    return [{ t: 'Nothing logged yet today. Your first meal starts the picture.' }, ...water];
  }
  const water: Segment[] =
    f.waterMl > 0 ? [{ t: ' and ' }, { m: 'water', v: `${fmt(f.waterMl)} ml` }, { t: ' of water' }] : [];
  return [
    { t: 'You’ve had ' },
    { m: 'calories', v: `${fmt(f.intake.kcal)}` },
    { t: ' calories, ' },
    { m: 'protein', v: grams(f.intake.proteinG) },
    { t: ' of protein, ' },
    { m: 'fat', v: grams(f.intake.fatG) },
    { t: ' of fat, ' },
    { m: 'carbs', v: grams(f.intake.carbsG) },
    { t: ' of carbs' },
    ...water,
    { t: '. The quality of your food today so far is ' },
    { m: 'meal', v: `${Math.round(f.dietScore)}` },
    { t: ' out of 100.' },
  ];
}
