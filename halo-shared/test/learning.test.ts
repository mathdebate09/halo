import { describe, expect, it } from 'vitest';

import {
  bedtimeFor,
  clockLabel,
  inQuietHours,
  inSpan,
  learnMealWindows,
  learnWake,
  type MealSample,
  median,
  usualMeals,
} from '../src/learning';
import { DEFAULT_MEAL_WINDOWS } from '../src/scoring';

const lunch = (hour: number, weekend = false, title?: string): MealSample => ({
  mealType: 'lunch',
  hour,
  weekend,
  title,
});

describe('median', () => {
  it('handles odd, even and empty', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe('meal windows', () => {
  it('keeps the default with fewer than 3 logs', () => {
    const learned = learnMealWindows([lunch(13), lunch(13.5)]);
    expect(learned.weekday.lunch).toEqual(DEFAULT_MEAL_WINDOWS.lunch);
  });
  it('centres the window on the median of recent logs', () => {
    const learned = learnMealWindows([lunch(13), lunch(13.5), lunch(14), lunch(13.5)]);
    expect(learned.weekday.lunch).toEqual({ start: 12.5, end: 14.5 });
  });
  it('learns weekdays and weekends apart when both have enough logs', () => {
    const samples = [
      lunch(12.5),
      lunch(12.5),
      lunch(12.5),
      lunch(15, true),
      lunch(15, true),
      lunch(15, true),
    ];
    const learned = learnMealWindows(samples);
    expect(learned.weekday.lunch.start).toBe(11.5);
    expect(learned.weekend.lunch.start).toBe(14);
  });
  it('borrows from both when one side is thin', () => {
    const learned = learnMealWindows([lunch(13), lunch(13), lunch(13), lunch(16, true)]);
    expect(learned.weekend.lunch).toEqual({ start: 12, end: 14 });
  });
  it('only uses the last 14 logs (newest first)', () => {
    const recent = Array.from({ length: 14 }, () => lunch(12));
    const old = Array.from({ length: 10 }, () => lunch(15));
    expect(learnMealWindows([...recent, ...old]).weekday.lunch.start).toBe(11);
  });
  it('clamps to sane bounds', () => {
    const late = [1, 2, 3].map(() => ({ mealType: 'dinner' as const, hour: 23.5, weekend: false }));
    expect(learnMealWindows(late).weekday.dinner).toEqual({ start: 21, end: 23 });
  });
});

describe('usual meals', () => {
  it('suggests a title logged at least twice', () => {
    const meals = usualMeals([lunch(13, false, 'Chicken rice bowl'), lunch(13, false, 'chicken rice bowl'), lunch(13, false, 'Soup')]);
    expect(meals.lunch).toBe('Chicken rice bowl');
  });
  it('says nothing for one-offs', () => {
    expect(usualMeals([lunch(13, false, 'Soup'), lunch(13, false, 'Salad')]).lunch).toBeUndefined();
  });
});

describe('wake chain', () => {
  const sample = (hour: number, weekend = false) => ({ hour, weekend });
  it('prefers Health Connect', () => {
    const wake = learnWake(
      { measured: [sample(6.5), sample(6.75), sample(7)], asked: 8, firstOpens: [] },
      false,
    );
    expect(wake).toEqual({ value: 6.75, source: 'measured' });
  });
  it('then the user’s answer, then first app opens, then 07:00', () => {
    expect(learnWake({ measured: [], asked: 8, firstOpens: [] }, false).source).toBe('asked');
    const opens = [sample(7.5), sample(8), sample(8.5), sample(2)];
    expect(learnWake({ measured: [], firstOpens: opens }, false)).toEqual({ value: 8, source: 'estimated', via: 'app' });
    expect(learnWake({ measured: [], firstOpens: [] }, false)).toEqual({ value: 7, source: 'assumed' });
  });
});

describe('bedtime and quiet hours', () => {
  it('is wake minus need minus wind-down, across midnight', () => {
    expect(bedtimeFor(7)).toEqual({ hour: 23, pulled: false });
    expect(bedtimeFor(6)).toEqual({ hour: 22, pulled: false });
    expect(bedtimeFor(9.5).hour).toBe(1.5);
  });
  it('moves 30 min earlier after a short night', () => {
    expect(bedtimeFor(7, 7.5, 5.6)).toEqual({ hour: 22.5, pulled: true });
    expect(bedtimeFor(7, 7.5, 7)).toEqual({ hour: 23, pulled: false });
  });
  it('quiet hours run from bedtime to wake', () => {
    const bed = bedtimeFor(7);
    expect(inQuietHours(23.5, bed, 7)).toBe(true);
    expect(inQuietHours(3, bed, 7)).toBe(true);
    expect(inQuietHours(7, bed, 7)).toBe(false);
    expect(inQuietHours(22, bed, 7)).toBe(false);
  });
  it('spans wrap both ways', () => {
    expect(inSpan(0.5, -0.5, 2)).toBe(true);
    expect(inSpan(23, 22, 25)).toBe(true);
    expect(inSpan(12, 22, 25)).toBe(false);
  });
  it('labels times to the half hour', () => {
    expect(clockLabel(13)).toBe('13:00');
    expect(clockLabel(8.2)).toBe('08:00');
    expect(clockLabel(22.5)).toBe('22:30');
    expect(clockLabel(23.9)).toBe('00:00');
  });
});
