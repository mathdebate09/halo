// GENERATED from halo-shared/src/brief-copy.ts by halo-shared/scripts/sync.mjs. Do not edit.

// Template wording for each brief: a short tagline, one line, and the action's label. These are
// what Today shows instantly and what any rephrasing falls back to. Plain words, real numbers,
// no exclamation marks: written the way a good assistant texts, not the way an app talks.

import type { InsightCopy, Signal } from './signals.js';

const MEAL_NAMES: Record<string, string> = {
  breakfast: 'breakfast',
  lunch: 'lunch',
  dinner: 'dinner',
  snack: 'a snack',
};
const meal = (key: string | number | undefined) => MEAL_NAMES[String(key)] ?? 'your next meal';
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function mealWindow({ facts: f }: Signal): InsightCopy {
  const name = meal(f.meal);
  if (f.status === 'missed') {
    return {
      tagline: `Had ${name}?`,
      line: f.next
        ? `If you did, log it now. ${cap(meal(f.next))} is usually around ${f.nextAt}.`
        : 'If you did, log it now so today adds up.',
      actionLabel: `Log ${name}`,
    };
  }
  let line = `You usually eat around ${f.at}. A photo is enough to log it.`;
  if (f.light) line = `${f.left} kcal left today, so keep ${name} on the lighter side.`;
  else if (f.proteinGap) line = `Protein is ${f.proteinGap} g behind, so make it a protein-heavy ${name}.`;
  else if (f.missed) line = `${cap(meal(f.missed))} isn't in yet either. Log both in one go.`;
  return { tagline: `${cap(name)} time`, line, actionLabel: `Log ${name}` };
}

function proteinPace({ facts: f, action }: Signal): InsightCopy {
  const note = action?.kind === 'log' ? action.note : 'A protein snack';
  return {
    tagline: 'Protein is behind',
    line: f.dinnerLogged
      ? `About ${f.gap} g short for ${f.at}. ${note} closes most of it.`
      : `About ${f.gap} g short for ${f.at}. ${note} now, and dinner covers the rest.`,
    actionLabel: 'Log a protein snack',
  };
}

const COPY: Record<Signal['type'], (s: Signal) => InsightCopy> = {
  meal_window: mealWindow,
  protein_pace: proteinPace,
  calorie_pace: ({ facts: f }) => ({
    tagline: 'Running light',
    line: `About ${f.gap} kcal under for ${f.at}. A proper ${meal(f.next)} makes it up.`,
    actionLabel: `Log ${meal(f.next)}`,
  }),
  calorie_over: ({ facts: f }) => ({
    tagline: 'Keep it light',
    line: f.left
      ? `${f.left} kcal left for today. A lighter ${meal(f.next)} keeps you on target.`
      : 'You’re past today’s target. Something light if you’re hungry, and tomorrow starts fresh.',
    actionLabel: 'Log something light',
  }),
  water_pace: ({ facts: f }) => ({
    tagline: 'Water break',
    line: `About ${f.gap} ml behind for ${f.at}. A glass now helps.`,
    actionLabel: 'Add 250 ml',
  }),
  weigh_in: () => ({
    tagline: 'Morning weigh-in',
    line: 'Before breakfast is the most consistent time.',
    actionLabel: 'Weigh in',
  }),
  sleep_debt: ({ facts: f }) => ({
    tagline: 'Early night tonight',
    line: `${f.slept} h last night. Aim to be in bed by ${f.at}.`,
    actionLabel: null,
  }),
  bedtime: ({ facts: f }) => ({
    tagline: `Bed by ${f.at}`,
    line: f.pulled
      ? `${f.slept} h last night. An earlier night evens it out.`
      : `Start winding down now to get your ${f.need} h.`,
    actionLabel: null,
  }),
  on_track: () => ({
    tagline: 'On track',
    line: 'Nothing needs you right now.',
    actionLabel: null,
  }),
};

export const briefCopy = (signal: Signal): InsightCopy => COPY[signal.type](signal);
