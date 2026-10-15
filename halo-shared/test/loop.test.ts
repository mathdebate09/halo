import { describe, expect, it } from 'vitest';

import type { DayFacts } from '../src/insights';
import { ignoredStreak, outcomeLine, transitions, weighInDue } from '../src/loop';
import { DEFAULT_MEAL_WINDOWS } from '../src/scoring';
import type { InsightRecord, PaContext } from '../src/signals';

const DAY = '2026-10-14';
const NOW = new Date(2026, 9, 14, 15, 0).getTime();

const facts = (over: Partial<DayFacts> = {}): DayFacts => ({
  hour: 15,
  goal: 'lose',
  mealsLogged: 2,
  loggedTypes: ['breakfast', 'lunch'],
  intake: { kcal: 1000, proteinG: 70, carbsG: 110, fatG: 32 },
  targets: { kcal: 2000, proteinG: 140, carbsG: 220, fatG: 65, waterMl: 2500, steps: 8000 },
  due: 0.5,
  dayFraction: 0.57,
  waterMl: 1500,
  steps: 4000,
  sleepHours: 7.5,
  sleepNeedHours: 7.5,
  dietScore: 70,
  ...over,
});

const ctx = (over: Partial<PaContext> = {}, f: Partial<DayFacts> = {}): PaContext => ({
  now: NOW,
  day: DAY,
  hour: 15,
  facts: facts(f),
  windows: DEFAULT_MEAL_WINDOWS,
  wake: { value: 7, source: 'measured' },
  prevNightHours: null,
  usualMeals: {},
  weighedToday: false,
  lastWeighDay: null,
  lastLogAt: null,
  history: [],
  ...over,
});

const record = (over: Partial<InsightRecord>): InsightRecord => ({
  id: `${DAY}:protein_pace`,
  day: DAY,
  type: 'protein_pace',
  state: 'shown',
  severity: 50,
  shownAt: 1,
  actedAt: null,
  resolvedAt: null,
  expiresAt: NOW + 3_600_000,
  ...over,
});

describe('transitions', () => {
  it('resolves a gap once it closes', () => {
    expect(transitions([record({})], ctx())).toEqual([{ id: `${DAY}:protein_pace`, state: 'resolved', at: NOW }]);
  });
  it('leaves an open gap alone until it expires, then marks it ignored', () => {
    const open = record({});
    const behind = { intake: { kcal: 1000, proteinG: 30, carbsG: 110, fatG: 32 } };
    expect(transitions([open], ctx({}, behind))).toEqual([]);
    expect(transitions([{ ...open, expiresAt: NOW - 1 }], ctx({}, behind))[0]?.state).toBe('ignored');
  });
  it('resolves a meal window when that meal is logged', () => {
    const r = record({ id: `${DAY}:meal_window:lunch`, type: 'meal_window' });
    expect(transitions([r], ctx())[0]?.state).toBe('resolved');
  });
  it('closes out earlier days, judging yesterday’s bedtime by last night', () => {
    const old = record({ id: '2026-10-12:water_pace', day: '2026-10-12', type: 'water_pace' });
    const bed = record({ id: '2026-10-13:bedtime', day: '2026-10-13', type: 'bedtime' });
    expect(transitions([old, bed], ctx()).map((t) => t.state)).toEqual(['ignored', 'resolved']);
    expect(transitions([bed], ctx({}, { sleepHours: 6 }))[0]?.state).toBe('ignored');
  });
});

describe('missed notifications', () => {
  it('can resolve but are never counted as ignored', () => {
    const missed = record({ state: 'pending', expiresAt: NOW - 1 });
    const behind = { intake: { kcal: 1000, proteinG: 30, carbsG: 110, fatG: 32 } };
    expect(transitions([missed], ctx({}, behind))).toEqual([]);
    expect(transitions([missed], ctx())[0]?.state).toBe('resolved');
    const old = record({ id: '2026-10-12:water_pace', day: '2026-10-12', type: 'water_pace', state: 'pending' });
    expect(transitions([old], ctx())).toEqual([]);
  });
});

describe('back-off', () => {
  it('counts ignores in a row, newest first, broken by an acted one', () => {
    const history = [
      record({ state: 'ignored', shownAt: 4 }),
      record({ state: 'ignored', shownAt: 3 }),
      record({ state: 'acted', shownAt: 2 }),
      record({ state: 'ignored', shownAt: 1 }),
    ];
    expect(ignoredStreak(history, 'protein_pace')).toBe(2);
  });
  it('drops the weigh-in to every third day after two ignores, daily again after a weigh-in', () => {
    const w = (day: string, state: InsightRecord['state'] = 'ignored') =>
      record({ id: `${day}:weigh_in`, day, type: 'weigh_in', state, shownAt: Number(day.slice(-2)) });
    expect(weighInDue([w('2026-10-13')], DAY, null)).toBe(true);
    const two = [w('2026-10-12'), w('2026-10-13')];
    expect(weighInDue(two, DAY, null)).toBe(false);
    expect(weighInDue(two, '2026-10-16', null)).toBe(true);
    expect(weighInDue(two, DAY, '2026-10-13')).toBe(true);
  });
});

describe('outcome line', () => {
  const y = (over: Partial<InsightRecord>) => record({ day: '2026-10-13', id: '2026-10-13:x', ...over });
  it('reports a closed gap, or one that got closer', () => {
    expect(outcomeLine(ctx({ history: [y({ state: 'resolved' })] }))).toBe('You closed the protein gap yesterday.');
    expect(outcomeLine(ctx({ history: [y({ type: 'water_pace', state: 'acted' })] }))).toBe(
      'You got closer on water yesterday.',
    );
  });
  it('stays quiet about ignored ones', () => {
    expect(outcomeLine(ctx({ history: [y({ state: 'ignored' })] }))).toBeNull();
  });
  it('reports a better night after a bedtime brief', () => {
    const history = [y({ type: 'bedtime', state: 'resolved' })];
    expect(outcomeLine(ctx({ history, prevNightHours: 5.6 }, { sleepHours: 7.2 }))).toBe(
      '7.2 h last night, better than the night before.',
    );
  });
});
