import { describe, expect, it } from 'vitest';

import { hourOfDay } from '../src/day';
import type { DayFacts } from '../src/insights';
import { learnWake } from '../src/learning';
import { brief } from '../src/pa';
import { DEFAULT_MEAL_WINDOWS } from '../src/scoring';
import { bedtimeOf, type PaContext } from '../src/signals';
import { type NightShape, type ScreenEvent, sleepFromScreen, sleepPattern } from '../src/sleep';

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();
const off = (t: number): ScreenEvent => ({ at: t, on: false });
const on = (t: number): ScreenEvent => ({ at: t, on: true });

describe('sleepFromScreen', () => {
  it('takes the longest overnight screen-off stretch per wake day', () => {
    const nights = sleepFromScreen([
      off(at(13, 23, 30)),
      on(at(14, 7, 0)),
      // an afternoon nap-length gap doesn't count as a night
      off(at(14, 14, 0)),
      on(at(14, 18, 0)),
    ]);
    expect(nights).toHaveLength(1);
    expect(nights[0]!.day).toBe('2026-10-14');
    expect(nights[0]!.hours).toBe(7.5);
  });
  it('folds a quick check of the phone into the night, counting only dark time', () => {
    const nights = sleepFromScreen([off(at(13, 23)), on(at(14, 3)), off(at(14, 3, 10)), on(at(14, 7))]);
    expect(nights).toHaveLength(1);
    expect(nights[0]!.start).toBe(at(13, 23));
    expect(nights[0]!.end).toBe(at(14, 7));
    expect(nights[0]!.hours).toBeCloseTo(7 + 50 / 60);
  });
  it('ignores stretches that are too short or miss the small hours', () => {
    expect(sleepFromScreen([off(at(14, 1)), on(at(14, 3))])).toEqual([]);
    expect(sleepFromScreen([off(at(14, 8)), on(at(14, 13))])).toEqual([]);
  });
});

const night = (bed: number, wake: number, weekend = false): NightShape => ({
  bed,
  wake,
  hours: wake + 24 - bed,
  weekend,
});

describe('sleepPattern', () => {
  it('says nothing about healthy, steady nights', () => {
    expect(sleepPattern([1, 2, 3, 4, 5].map(() => night(23, 7)), 23)).toBeNull();
  });
  it('flags late nights and steps bedtime 15 minutes earlier, not straight to the target', () => {
    const p = sleepPattern([1, 2, 3, 4, 5].map(() => night(25.5, 9)), 23)!;
    expect(p.flag).toBe('late');
    expect(p.tonight).toBe(25.25);
  });
  it('flags short nights', () => {
    expect(sleepPattern([1, 2, 3, 4].map(() => night(24, 5.5)), 23)!.flag).toBe('short');
  });
  it('flags weekends drifting from weekdays', () => {
    const nights = [night(23, 7), night(23, 7), night(23, 7), night(26, 10, true), night(26, 10, true)];
    expect(sleepPattern(nights, 23)!.flag).toBe('drift');
  });
  it('needs at least four nights', () => {
    expect(sleepPattern([night(26, 6), night(26, 6), night(26, 6)], 23)).toBeNull();
  });
});

function ctx(hh: number, mm: number, over: Partial<PaContext> = {}, f: Partial<DayFacts> = {}): PaContext {
  const date = new Date(2026, 9, 14, hh, mm);
  const hour = hourOfDay(date);
  return {
    now: date.getTime(),
    day: '2026-10-14',
    hour,
    facts: {
      hour,
      goal: 'lose',
      mealsLogged: 3,
      loggedTypes: ['breakfast', 'lunch', 'dinner'],
      intake: { kcal: 2000, proteinG: 140, carbsG: 220, fatG: 65 },
      targets: { kcal: 2000, proteinG: 140, carbsG: 220, fatG: 65, waterMl: 2500, steps: 8000 },
      due: 1,
      dayFraction: 1,
      waterMl: 2500,
      steps: null,
      sleepHours: 7.5,
      sleepNeedHours: 7.5,
      dietScore: 90,
      ...f,
    },
    windows: DEFAULT_MEAL_WINDOWS,
    wake: { value: 9, source: 'estimated', via: 'screen' },
    prevNightHours: null,
    usualMeals: {},
    weighedToday: true,
    lastWeighDay: '2026-10-14',
    lastLogAt: null,
    history: [],
    ...over,
  };
}

const late = [1, 2, 3, 4, 5].map(() => night(25.5, 9));

describe('the PA and sleep', () => {
  it('sets a bedtime that can be met when nights run late', () => {
    // Healthy target for a 9 am wake is 01:00; usual lights-out 01:30 → tonight 01:15.
    expect(bedtimeOf(ctx(21, 0, { nights: late })).hour).toBe(1.25);
    expect(bedtimeOf(ctx(21, 0)).hour).toBe(1);
  });
  it('brings the pattern up in the evening, then leaves it for three days', () => {
    const b = brief(ctx(21, 0, { nights: late }));
    expect(b.insight.type).toBe('sleep_pattern');
    expect(b.insight.copy.line).toBe(
      'Lights out has been around 01:30. Try 01:15 tonight, then a little earlier every few days.',
    );
    const history = [
      {
        id: '2026-10-12:sleep_pattern',
        day: '2026-10-12',
        type: 'sleep_pattern' as const,
        state: 'shown' as const,
        severity: 35,
        shownAt: 1,
        actedAt: null,
        resolvedAt: null,
        expiresAt: null,
      },
    ];
    expect(brief(ctx(21, 0, { nights: late, history })).insight.type).not.toBe('sleep_pattern');
  });
  it('asks for Usage access only without Health Connect sleep, a few days at most', () => {
    const base = { sleepSource: 'none' as const, usageAccess: 'denied' as const };
    expect(brief(ctx(11, 0, base)).insight.type).toBe('usage_ask');
    expect(brief(ctx(11, 0, { ...base, usageAccess: 'granted' })).insight.type).not.toBe('usage_ask');
    expect(brief(ctx(11, 0, { ...base, sleepSource: 'health' })).insight.type).not.toBe('usage_ask');
    const asked = ['2026-10-11', '2026-10-12', '2026-10-13'].map((day) => ({
      id: `${day}:usage_ask`,
      day,
      type: 'usage_ask' as const,
      state: 'ignored' as const,
      severity: 32,
      shownAt: 1,
      actedAt: null,
      resolvedAt: null,
      expiresAt: null,
    }));
    expect(brief(ctx(11, 0, { ...base, history: asked })).insight.type).not.toBe('usage_ask');
  });
  it('skips the wake-time ask once the screen shows when you wake', () => {
    const b = brief(ctx(11, 0, { daysSinceInstall: 5 }));
    expect(b.insight.type).not.toBe('wake_ask');
    const screen = [7, 7.25, 7.5].map((hour) => ({ hour, weekend: false }));
    expect(learnWake({ measured: [], screen, asked: 9, firstOpens: [] }, false)).toEqual({
      value: 7.25,
      source: 'estimated',
      via: 'screen',
    });
  });
});
