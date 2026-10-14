import { describe, expect, it } from 'vitest';

import {
  activeKcalGoalFor,
  activityScore,
  dietScore,
  expectedIntakeFraction,
  mealTypeAt,
  nextTier,
  overallScore,
  pickHeroVariant,
  sleepScore,
  stepGoalFor,
  tierFor,
  vitalsScore,
  waterScore,
  type MealLog,
} from '../src/scoring';

const at = (h: number, m = 0) => new Date(2026, 9, 14, h, m);

describe('expected intake curve', () => {
  it('is 0 before breakfast and 1 after dinner', () => {
    expect(expectedIntakeFraction(6)).toBe(0);
    expect(expectedIntakeFraction(23)).toBe(1);
  });
  it('rises monotonically through the day', () => {
    let last = 0;
    for (let h = 6; h <= 23; h += 0.5) {
      const f = expectedIntakeFraction(h);
      expect(f).toBeGreaterThanOrEqual(last);
      last = f;
    }
  });
});

const meal = (mealType: MealLog['mealType'], hour: number, kcal: number, share = 1): MealLog => ({
  mealType,
  hour,
  kcal,
  proteinG: 120 * share,
  carbsG: 250 * share,
  fatG: 65 * share,
});

describe('diet score uses every logged value, relative to the time of day', () => {
  const targets = { kcal: 2000, proteinG: 120, carbsG: 250, fatG: 65 };
  it('is a time-only estimate with nothing logged: full early, gentle later', () => {
    expect(dietScore({ meals: [], targets, hour: 6 })).toEqual({ value: 100, dataBacked: false });
    const late = dietScore({ meals: [], targets, hour: 23 });
    expect(late).toEqual({ value: 55, dataBacked: false });
  });
  it('scores an on-pace, on-time day at 100', () => {
    // A full breakfast and a full lunch logged: "by now" is their 60 % share, not the curve's.
    const score = dietScore({
      meals: [meal('breakfast', 8, 500, 0.25), meal('lunch', 13, 700, 0.35)],
      targets,
      hour: 13.5,
    });
    expect(score.dataBacked).toBe(true);
    expect(score.value).toBeGreaterThanOrEqual(95);
  });
  it('does not treat an early breakfast as overeating', () => {
    const score = dietScore({ meals: [meal('breakfast', 6.5, 500, 0.25)], targets, hour: 6.5 });
    expect(score.value).toBe(100);
  });
  it('drops when far behind in the evening, and for off-window meals', () => {
    expect(dietScore({ meals: [meal('lunch', 13, 400, 0.15)], targets, hour: 21 }).value).toBeLessThan(40);
    const onTime = dietScore({ meals: [meal('lunch', 13, 700, 0.35)], targets, hour: 15 }).value;
    const late = dietScore({ meals: [meal('lunch', 17, 700, 0.35)], targets, hour: 17.5 }).value;
    expect(late).toBeLessThan(onTime);
  });
  it('drops when overeating', () => {
    expect(dietScore({ meals: [meal('dinner', 20, 3800, 1.4)], targets, hour: 23 }).value).toBeLessThan(60);
  });
});

describe('activity blends today with the last week', () => {
  const goals = { steps: 8000, activeKcal: 300, exerciseMin: 30 };
  it('falls back to the prior with no data at all', () => {
    expect(activityScore({ hour: 14, today: {}, recent: [], goals })).toEqual({
      value: 70,
      dataBacked: false,
    });
  });
  it('leans on the week before the day starts', () => {
    const recent = [{ steps: 8000, activeKcal: 300, exerciseMin: 30 }, { steps: 4000 }];
    expect(activityScore({ hour: 6, today: { steps: 0 }, recent, goals })).toEqual({
      value: 75,
      dataBacked: true,
    });
  });
  it('is all today by the evening, against pace', () => {
    const today = { steps: 4000, activeKcal: 150, exerciseMin: 15 };
    expect(activityScore({ hour: 14, today, recent: [], goals }).value).toBe(100);
    expect(activityScore({ hour: 21, today, recent: [{ steps: 20000 }], goals }).value).toBe(50);
  });
  it('derives goals from the plan and history', () => {
    expect(stepGoalFor()).toBe(8000);
    expect(stepGoalFor(5000)).toBe(8000);
    expect(stepGoalFor(10000)).toBe(11000);
    expect(activeKcalGoalFor(1600, 1920)).toBe(250);
    expect(activeKcalGoalFor(1600, 2200)).toBe(440);
  });
});

describe('vitals, water, sleep', () => {
  it('scores sleep against need', () => {
    expect(sleepScore(null)).toBeNull();
    expect(sleepScore(7.5)).toBe(100);
    expect(sleepScore(5.5)).toBe(50);
    expect(sleepScore(3.5)).toBe(0);
    expect(sleepScore(11.5)).toBe(80);
  });
  it('blends sleep with whichever readings exist', () => {
    expect(vitalsScore({})).toEqual({ value: 70, dataBacked: false });
    expect(vitalsScore({ sleepHours: 7.5, restingHr: 58, spo2: 97 }).value).toBe(100);
    const rough = vitalsScore({ sleepHours: 5.5, restingHr: 90, systolic: 150, diastolic: 95 });
    expect(rough.value).toBeLessThan(60);
  });
  it('only reads HRV against a baseline', () => {
    expect(vitalsScore({ hrvMs: 30 }).dataBacked).toBe(false);
    expect(vitalsScore({ hrvMs: 30, hrvBaselineMs: 50 }).value).toBe(40);
  });
  it('does not score water until it has been logged once', () => {
    expect(waterScore(0, 2000, 15, false)).toBeNull();
    expect(waterScore(500, 2000, 14, true)).toBe(50);
  });
});

describe('overall score', () => {
  const prior = { value: 70, dataBacked: false };
  it('is provisional with fewer than two data-backed components', () => {
    expect(overallScore({ diet: prior, activity: prior, vitals: prior, water: null })).toEqual({
      value: 70,
      rated: 0,
      provisional: true,
    });
    const one = overallScore({ diet: { value: 100, dataBacked: true }, activity: prior, vitals: prior, water: null });
    expect(one.provisional).toBe(true);
    expect(one.value).toBeGreaterThan(70);
  });
  it('weights by importance and confidence, renormalized', () => {
    const result = overallScore({
      diet: { value: 80, dataBacked: true }, // 40
      activity: { value: 40, dataBacked: true }, // 25
      vitals: prior, // 25 × 0.3 = 7.5
      water: null,
    });
    expect(result).toEqual({ value: 65, rated: 2, provisional: false }); // (3200 + 1000 + 525) / 72.5
  });
});

describe('tiers', () => {
  it('maps boundaries', () => {
    expect([tierFor(80), tierFor(79), tierFor(50), tierFor(49)]).toEqual([
      'high',
      'mid',
      'mid',
      'low',
    ]);
  });
  it('needs 3 points past the boundary to change', () => {
    expect(nextTier('mid', 81, null, at(12))).toBe('mid');
    expect(nextTier('mid', 83, null, at(12))).toBe('high');
    expect(nextTier('high', 78, null, at(12))).toBe('high');
    expect(nextTier('high', 76, null, at(12))).toBe('mid');
  });
  it('waits 30 minutes between changes', () => {
    expect(nextTier('mid', 90, at(12, 0), at(12, 20))).toBe('mid');
    expect(nextTier('mid', 90, at(12, 0), at(12, 31))).toBe('high');
  });
  it('picks a random hero variant, never repeating the previous one', () => {
    expect(pickHeroVariant(undefined, () => 0)).toBe(1);
    expect(pickHeroVariant(undefined, () => 0.99)).toBe(3);
    for (let i = 0; i < 50; i++) expect(pickHeroVariant(2)).not.toBe(2);
    const seen = new Set(Array.from({ length: 200 }, () => pickHeroVariant()));
    expect(seen).toEqual(new Set([1, 2, 3]));
  });
});

describe('meal type by time', () => {
  it('maps windows (±1 h) to meals and the gaps to snacks', () => {
    expect([6.5, 10.9, 12, 15.4, 16.5, 18.5, 22.9, 23.5, 2].map((h) => mealTypeAt(h))).toEqual([
      'breakfast',
      'breakfast',
      'lunch',
      'lunch',
      'snack',
      'dinner',
      'dinner',
      'snack',
      'snack',
    ]);
  });
});
