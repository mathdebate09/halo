import { describe, expect, it } from 'vitest';

import { type DayFacts, daySummary, summaryPanel } from '../src/insights';

const facts = (over: Partial<DayFacts> = {}): DayFacts => ({
  hour: 13,
  goal: 'lose',
  mealsLogged: 1,
  loggedTypes: ['breakfast'],
  intake: { kcal: 600, proteinG: 20, carbsG: 70, fatG: 20 },
  targets: { kcal: 2000, proteinG: 120, carbsG: 250, fatG: 65, waterMl: 2500, steps: 8000 },
  due: 0.5,
  dayFraction: 0.43,
  waterMl: 500,
  steps: 4000,
  sleepHours: null,
  sleepNeedHours: 7.5,
  dietScore: 62,
  ...over,
});

describe('day summary', () => {
  it('makes every number a chip for its tab', () => {
    const chips = daySummary(facts()).filter((s) => 'm' in s);
    expect(chips.map((c) => ('m' in c ? c.m : ''))).toEqual([
      'calories',
      'protein',
      'fat',
      'carbs',
      'water',
      'meal',
    ]);
    expect(chips[0]).toEqual({ m: 'calories', v: '600' });
    expect(daySummary(facts()).at(-1)).toEqual({ t: ' out of 100.' });
  });
  it('says so plainly when nothing is logged', () => {
    expect(daySummary(facts({ mealsLogged: 0, waterMl: 0 }))).toEqual([
      { t: 'Nothing logged yet today. Your first meal starts the picture.' },
    ]);
  });
});

describe('panels', () => {
  it('reads pace against the expected-by-now share', () => {
    expect(summaryPanel('calories', facts()).pace).toBe(
      "About 400 kcal behind where you'd usually be by 13:00.",
    );
    expect(summaryPanel('calories', facts({ intake: { kcal: 1000, proteinG: 0, carbsG: 0, fatG: 0 } })).pace).toBe(
      'Right on pace for 13:00.',
    );
    expect(summaryPanel('calories', facts({ due: 0.02, hour: 6 })).pace).toMatch(/Too early/);
  });
  it('pre-fills a log for food tabs and adds water directly', () => {
    expect(summaryPanel('protein', facts()).next.action).toEqual({
      kind: 'log',
      note: 'Greek yogurt with berries',
    });
    expect(summaryPanel('water', facts()).next.action).toEqual({ kind: 'water', ml: 250 });
    expect(summaryPanel('water', facts({ waterMl: 2600 })).next.action).toBeNull();
  });
  it('asks to connect when a source is missing, and suggests (no action) for activity', () => {
    expect(summaryPanel('sleep', facts()).hasData).toBe(false);
    expect(summaryPanel('sleep', facts()).next.action).toEqual({ kind: 'connect' });
    expect(summaryPanel('activity', facts()).next.action).toBeNull();
    expect(summaryPanel('activity', facts({ steps: null })).next.action).toEqual({ kind: 'connect' });
  });
  it('suggests a lighter meal when ahead on calories', () => {
    const ahead = facts({ intake: { kcal: 1600, proteinG: 90, carbsG: 150, fatG: 50 } });
    expect(summaryPanel('calories', ahead).next.action).toEqual({
      kind: 'log',
      note: 'Salad with grilled chicken',
    });
  });
});

describe('next meal suggestion', () => {
  it('skips meals already logged', () => {
    const lunchDone = facts({ hour: 14, loggedTypes: ['breakfast', 'lunch'], intake: { kcal: 400, proteinG: 100, carbsG: 60, fatG: 20 } });
    expect(summaryPanel('calories', lunchDone).next.text).toBe('Log dinner');
    expect(summaryPanel('calories', facts({ hour: 13, loggedTypes: ['breakfast'], intake: { kcal: 300, proteinG: 100, carbsG: 60, fatG: 20 } })).next.text).toBe('Log lunch');
  });
});

describe('nudges only where needed', () => {
  it('shows Next when behind pace, not when on pace', () => {
    expect(summaryPanel('protein', facts()).nudge).toBe(true);
    const onPace = facts({ intake: { kcal: 1000, proteinG: 60, carbsG: 125, fatG: 32 } });
    expect(summaryPanel('protein', onPace).nudge).toBe(false);
    expect(summaryPanel('water', facts({ waterMl: 1200 })).nudge).toBe(false);
    expect(summaryPanel('sleep', facts()).nudge).toBe(true);
  });
});
