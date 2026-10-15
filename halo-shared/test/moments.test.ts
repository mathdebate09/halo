import { describe, expect, it } from 'vitest';

import { formatClock, hourOfDay } from '../src/day';
import type { DayFacts } from '../src/insights';
import { type Delivered, MAX_PER_DAY, planDay } from '../src/moments';
import { DEFAULT_MEAL_WINDOWS } from '../src/scoring';
import type { InsightRecord, PaContext } from '../src/signals';

const DAY = '2026-10-14';

function ctx(hh: number, mm: number, over: Partial<PaContext> = {}, f: Partial<DayFacts> = {}): PaContext {
  const date = new Date(2026, 9, 14, hh, mm);
  const hour = hourOfDay(date);
  return {
    now: date.getTime(),
    day: DAY,
    hour,
    facts: {
      hour,
      goal: 'lose',
      mealsLogged: 0,
      loggedTypes: [],
      intake: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
      targets: { kcal: 2000, proteinG: 140, carbsG: 220, fatG: 65, waterMl: 2500, steps: 8000 },
      due: 0,
      dayFraction: 0,
      waterMl: 0,
      steps: null,
      sleepHours: 7.5,
      sleepNeedHours: 7.5,
      dietScore: 100,
      ...f,
    },
    windows: DEFAULT_MEAL_WINDOWS,
    wake: { value: 7, source: 'measured' },
    prevNightHours: null,
    usualMeals: {},
    weighedToday: false,
    lastWeighDay: '2026-10-13',
    lastLogAt: null,
    history: [],
    ...over,
  };
}

const clock = (at: number) => formatClock(hourOfDay(new Date(at)));
const summary = (c: PaContext, delivered: Delivered[] = []) =>
  planDay(c, delivered)
    .filter((m) => m.moment !== 'quiet_days')
    .map((m) => `${clock(m.at)} ${m.moment}:${m.insight.type}`);

describe('planDay', () => {
  it('plans a whole day from a 6 am start, spaced and capped', () => {
    expect(summary(ctx(6, 0))).toEqual([
      '07:15 weigh_in:weigh_in',
      '08:45 breakfast:meal_window',
      '13:00 lunch:meal_window',
      '15:00 pace:water_pace',
      '20:15 dinner:meal_window',
      '22:30 bedtime:bedtime',
    ]);
  });

  it('slides a meal reminder to keep 90 minutes from the weigh-in, within its window', () => {
    const [weigh, breakfast] = planDay(ctx(6, 0));
    expect(breakfast!.at - weigh!.at).toBe(90 * 60_000);
  });

  it('counts what was already sent toward the six and their spacing', () => {
    const at = (h: number) => new Date(2026, 9, 14, h, 0).getTime();
    const delivered: Delivered[] = [7, 9, 11, 13, 15].map((h) => ({
      at: at(h),
      day: DAY,
      id: `${DAY}:x${h}`,
      type: 'water_pace',
    }));
    const today = planDay(ctx(16, 0), delivered).filter((m) => m.day === DAY);
    expect(today.length).toBe(MAX_PER_DAY - delivered.length);
  });

  it('never sends the same brief twice', () => {
    const delivered: Delivered[] = [
      { at: new Date(2026, 9, 14, 13, 0).getTime(), day: DAY, id: `${DAY}:meal_window:lunch`, type: 'meal_window' },
    ];
    expect(summary(ctx(14, 0), delivered)).not.toContain('14:15 lunch:meal_window');
    expect(summary(ctx(14, 0), delivered).some((s) => s.includes('lunch'))).toBe(false);
  });

  it('waits 30 minutes after a log', () => {
    const plan = summary(ctx(14, 50, { lastLogAt: new Date(2026, 9, 14, 14, 50).getTime() }));
    expect(plan[0]).toBe('15:30 pace:water_pace');
  });

  it('skips logged meals and closed gaps', () => {
    const plan = summary(
      ctx(12, 0, {}, { mealsLogged: 2, loggedTypes: ['breakfast', 'lunch'], waterMl: 2000 }),
    );
    expect(plan.some((s) => s.includes('lunch') || s.includes('water'))).toBe(false);
  });

  it('keeps quiet hours: nothing after bedtime, tomorrow’s weigh-in only', () => {
    expect(summary(ctx(23, 30))).toEqual(['07:15 weigh_in:weigh_in']);
    expect(planDay(ctx(23, 30)).find((m) => m.moment === 'weigh_in')!.day).toBe('2026-10-15');
  });

  it('leads tomorrow’s weigh-in with today’s outcome', () => {
    const history: InsightRecord[] = [
      {
        id: `${DAY}:protein_pace`,
        day: DAY,
        type: 'protein_pace',
        state: 'resolved',
        severity: 60,
        shownAt: 1,
        actedAt: null,
        resolvedAt: 2,
        expiresAt: null,
      },
    ];
    const weigh = planDay(ctx(23, 30, { history })).find((m) => m.moment === 'weigh_in')!;
    expect(weigh.lead).toBe('You closed the protein gap yesterday.');
  });

  it('stops pushing a kind swiped away three times in a row', () => {
    const history: InsightRecord[] = [11, 12, 13].map((d) => ({
      id: `2026-10-${d}:water_pace`,
      day: `2026-10-${d}`,
      type: 'water_pace',
      state: 'ignored',
      severity: 40,
      shownAt: d,
      actedAt: null,
      resolvedAt: null,
      expiresAt: null,
    }));
    expect(summary(ctx(14, 0, { history })).some((s) => s.includes('water'))).toBe(false);
  });

  it('pulls the bedtime reminder earlier after a short night', () => {
    expect(summary(ctx(21, 0, {}, { sleepHours: 5.6, mealsLogged: 3, loggedTypes: ['breakfast', 'lunch', 'dinner'], waterMl: 2500 }))).toContain(
      '22:00 bedtime:bedtime',
    );
  });

  it('always leaves a quiet-days nudge two days out, at the usual lunch time', () => {
    const quiet = planDay(ctx(20, 0)).find((m) => m.moment === 'quiet_days')!;
    expect(quiet.day).toBe('2026-10-16');
    expect(new Date(quiet.at).getDate()).toBe(16);
    expect(clock(quiet.at)).toBe('13:00');
    expect(quiet.insight.copy.tagline).toBe('Pick it back up');
  });

  it('sends the weekly review on Sunday evening', () => {
    const sunday = new Date(2026, 9, 18, 17, 0);
    const c = {
      ...ctx(17, 0, {
        day: '2026-10-18',
        week: { days: 7, avg: 74.4, prevAvg: 68 },
      }, { mealsLogged: 3, loggedTypes: ['breakfast', 'lunch', 'dinner'], waterMl: 2500 }),
      now: sunday.getTime(),
    };
    const review = planDay(c).find((m) => m.moment === 'weekly_review')!;
    expect(clock(review.at)).toBe('19:00');
    expect(review.insight.copy.line).toBe('You averaged 74 over 7 days, 6 up on last week.');
  });
});
