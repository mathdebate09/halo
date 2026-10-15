import { describe, expect, it } from 'vitest';

import { hourOfDay } from '../src/day';
import type { DayFacts } from '../src/insights';
import { learnMealWindows } from '../src/learning';
import { brief } from '../src/pa';
import { DEFAULT_MEAL_WINDOWS } from '../src/scoring';
import type { InsightRecord, PaContext } from '../src/signals';

const DAY = '2026-10-14';

const facts = (over: Partial<DayFacts> = {}): DayFacts => ({
  hour: 13,
  goal: 'lose',
  mealsLogged: 0,
  loggedTypes: [],
  intake: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  targets: { kcal: 2000, proteinG: 140, carbsG: 220, fatG: 65, waterMl: 2500, steps: 8000 },
  due: 0.5,
  dayFraction: 0.4,
  waterMl: 1200,
  steps: 4000,
  sleepHours: 7.5,
  sleepNeedHours: 7.5,
  dietScore: 70,
  ...over,
});

function ctx(hh: number, mm: number, over: Partial<PaContext> = {}, f: Partial<DayFacts> = {}): PaContext {
  const date = new Date(2026, 9, 14, hh, mm);
  const hour = hourOfDay(date);
  return {
    now: date.getTime(),
    day: DAY,
    hour,
    facts: facts({ hour, ...f }),
    windows: DEFAULT_MEAL_WINDOWS,
    wake: { value: 7, source: 'measured' },
    prevNightHours: null,
    usualMeals: {},
    weighedToday: true,
    lastWeighDay: DAY,
    lastLogAt: null,
    history: [],
    ...over,
  };
}

const record = (over: Partial<InsightRecord>): InsightRecord => ({
  id: `${DAY}:water_pace`,
  day: DAY,
  type: 'water_pace',
  state: 'shown',
  severity: 40,
  shownAt: 1,
  actedAt: null,
  resolvedAt: null,
  expiresAt: null,
  ...over,
});

// Learned from a user who has breakfast around 08:10 and lunch around 13:00.
const learned = learnMealWindows([
  ...[8, 8.25, 8.1].map((hour) => ({ mealType: 'breakfast' as const, hour, weekend: false })),
  ...[13, 13, 13].map((hour) => ({ mealType: 'lunch' as const, hour, weekend: false })),
]).weekday;

describe('self-check: the three moments', () => {
  it('11:00, no breakfast logged: asks once, with their usual breakfast pre-filled', () => {
    const b = brief(
      ctx(11, 0, { windows: learned, usualMeals: { breakfast: 'Oats with banana' } }, { due: 0.2, dayFraction: 0.29 }),
    );
    expect(b.insight.type).toBe('meal_window');
    expect(b.insight.facts).toMatchObject({ meal: 'breakfast', status: 'missed', next: 'lunch', nextAt: '13:00' });
    expect(b.insight.copy.tagline).toBe('Had breakfast?');
    expect(b.insight.copy.line).toBe('If you did, log it now. Lunch is usually around 13:00.');
    expect(b.insight.action).toEqual({ kind: 'log', note: 'Oats with banana' });
    // No calorie nag: nothing is logged, so there's nothing to judge pace on.
    expect(b.trace.signals.some((s) => s.type === 'calorie_pace')).toBe(false);
  });

  it('15:00, protein 25 g behind after lunch: one snack suggestion, dinner covers the rest', () => {
    const due = 0.5;
    const b = brief(
      ctx(
        15,
        0,
        { windows: learned, lastLogAt: new Date(2026, 9, 14, 13, 10).getTime() },
        {
          mealsLogged: 2,
          loggedTypes: ['breakfast', 'lunch'],
          due,
          dayFraction: 0.57,
          waterMl: 1500,
          intake: { kcal: 1000, proteinG: 140 * due - 25, carbsG: 110, fatG: 32 },
        },
      ),
    );
    expect(b.insight.type).toBe('protein_pace');
    expect(b.insight.facts.gap).toBe(25);
    expect(b.insight.tab).toBe('protein');
    expect(b.insight.copy.line).toBe(
      'About 25 g short for 15:00. Greek yogurt with berries now, and dinner covers the rest.',
    );
    expect(b.insight.action).toEqual({ kind: 'log', note: 'Greek yogurt with berries' });
  });

  it('22:30 after a 5.6 h night: bedtime only, no food advice', () => {
    const b = brief(
      ctx(
        22,
        30,
        {},
        {
          sleepHours: 5.6,
          mealsLogged: 2,
          loggedTypes: ['breakfast', 'lunch'],
          due: 0.95,
          dayFraction: 1,
          waterMl: 1000,
          intake: { kcal: 1100, proteinG: 60, carbsG: 120, fatG: 35 },
        },
      ),
    );
    expect(b.insight.type).toBe('bedtime');
    expect(b.insight.copy.tagline).toBe('Bed by 22:30');
    expect(b.insight.copy.line).toBe('5.6 h last night. An earlier night evens it out.');
    const droppedTypes = b.trace.dropped.map((d) => d.type);
    expect(droppedTypes).toEqual(expect.arrayContaining(['protein_pace', 'water_pace']));
    expect(b.trace.dropped.every((d) => d.type !== 'bedtime')).toBe(true);
  });
});

describe('vetting and bundling', () => {
  it('folds a protein gap into an open meal window', () => {
    const b = brief(
      ctx(12, 30, {}, {
        mealsLogged: 1,
        loggedTypes: ['breakfast'],
        due: 0.4,
        intake: { kcal: 700, proteinG: 20, carbsG: 80, fatG: 25 },
      }),
    );
    expect(b.insight.type).toBe('meal_window');
    expect(b.insight.facts.meal).toBe('lunch');
    expect(b.insight.facts.proteinGap).toBeGreaterThan(0);
    expect(b.insight.copy.line).toMatch(/^Protein is \d+ g behind, so make it a protein-heavy lunch\.$/);
    expect(b.trace.dropped.find((d) => d.type === 'protein_pace')?.reason).toBe('folded into the lunch reminder');
  });

  it('turns an open meal into a lighter one when over on calories', () => {
    const b = brief(
      ctx(19, 30, {}, {
        mealsLogged: 2,
        loggedTypes: ['breakfast', 'lunch'],
        due: 0.7,
        intake: { kcal: 1900, proteinG: 120, carbsG: 200, fatG: 60 },
      }),
    );
    expect(b.insight.type).toBe('meal_window');
    expect(b.insight.copy.line).toBe('100 kcal left today, so keep dinner on the lighter side.');
  });

  it('asks for the morning weigh-in after waking, not after a weigh-in', () => {
    const morning = ctx(7, 30, { weighedToday: false, lastWeighDay: '2026-10-13' }, { due: 0.05, dayFraction: 0.04 });
    expect(brief(morning).insight.type).toBe('weigh_in');
    expect(brief({ ...morning, weighedToday: true }).insight.type).not.toBe('weigh_in');
  });

  it('demotes a kind ignored three times in a row', () => {
    const history = [1, 2, 3].map((n) =>
      record({ id: `2026-10-1${n}:water_pace`, day: `2026-10-1${n}`, state: 'ignored', shownAt: n }),
    );
    const b = brief(ctx(16, 0, { history }, { mealsLogged: 1, loggedTypes: ['lunch'], waterMl: 300, dayFraction: 0.64 }));
    expect(b.trace.ranked.find((r) => r.type === 'water_pace')?.note).toBe('ignored 3+ times, demoted');
  });

  it('falls back to on track when nothing passes', () => {
    const b = brief(
      ctx(16, 0, {}, {
        mealsLogged: 2,
        loggedTypes: ['breakfast', 'lunch'],
        due: 0.6,
        dayFraction: 0.64,
        waterMl: 1800,
        intake: { kcal: 1200, proteinG: 90, carbsG: 130, fatG: 40 },
      }),
    );
    expect(b.insight.type).toBe('on_track');
  });

  it('says nothing about food while asleep', () => {
    const b = brief(ctx(5, 0, {}, { due: 0, dayFraction: 0, waterMl: 0 }));
    expect(b.insight.type).toBe('on_track');
  });
});

describe('device clock', () => {
  it('writes times in am/pm when the device uses a 12-hour clock', () => {
    const b = brief(
      ctx(22, 30, {}, {
        clock24: false,
        sleepHours: 5.6,
        mealsLogged: 2,
        loggedTypes: ['breakfast', 'lunch'],
        due: 0.95,
        dayFraction: 1,
      }),
    );
    expect(b.insight.copy.tagline).toBe('Bed by 10:30 pm');
    const missed = brief(
      ctx(11, 0, { windows: learned }, { clock24: false, due: 0.2, dayFraction: 0.29 }),
    );
    expect(missed.insight.copy.line).toBe('If you did, log it now. Lunch is usually around 1 pm.');
  });
});

describe('next meal', () => {
  it('suggests the meal still ahead, not one whose time has passed', () => {
    const b = brief(
      ctx(17, 45, {}, {
        mealsLogged: 1,
        loggedTypes: ['lunch'],
        due: 0.6,
        dayFraction: 0.77,
        waterMl: 2000,
        intake: { kcal: 650, proteinG: 80, carbsG: 80, fatG: 25 },
      }),
    );
    expect(b.insight.type).toBe('calorie_pace');
    expect(b.insight.copy.line).toMatch(/A proper dinner makes it up\.$/);
  });
});

describe('hold', () => {
  const base = () =>
    ctx(16, 0, {}, {
      mealsLogged: 2,
      loggedTypes: ['breakfast', 'lunch'],
      due: 0.6,
      dayFraction: 0.64,
      waterMl: 300,
      intake: { kcal: 1200, proteinG: 70, carbsG: 130, fatG: 40 },
    });

  it('keeps the brief on screen unless a challenger clearly beats it', () => {
    const fresh = brief(base());
    expect(fresh.insight.type).toBe('protein_pace');
    const water = fresh.trace.ranked.find((r) => r.type === 'water_pace')!;
    expect(fresh.score - water.score).toBeLessThan(15);
    const held = brief(base(), { id: water.id });
    expect(held.insight.type).toBe('water_pace');
    expect(held.trace.held).toBe(true);
  });

  it('lets go once the held brief no longer applies', () => {
    const b = brief(base(), { id: `${DAY}:calorie_over` });
    expect(b.insight.type).toBe('protein_pace');
    expect(b.trace.held).toBe(false);
  });
});

describe('outcome lead', () => {
  it('leads the morning with yesterday’s closed gap', () => {
    const history = [record({ id: '2026-10-13:protein_pace', day: '2026-10-13', type: 'protein_pace', state: 'resolved' })];
    const b = brief(ctx(8, 0, { history }, { due: 0.1, dayFraction: 0.07 }));
    expect(b.lead).toBe('You closed the protein gap yesterday.');
    expect(brief(ctx(12, 0, { history })).lead).toBeNull();
  });
});
