import { describe, expect, it } from 'vitest';

import {
  activityScore,
  CONFIDENCE,
  dietScore,
  expectedIntakeFraction,
  nextTier,
  overallScore,
  pickHeroVariant,
  sleepScore,
  tierFor,
  waterScore,
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

describe('diet score is time-aware', () => {
  const base = { targetKcal: 2000, targetProteinG: 120 };
  it('is not rated before the first window opens', () => {
    expect(dietScore({ ...base, kcal: 0, proteinG: 0, hour: 7 })).toBeNull();
  });
  it('does not punish an empty morning that is on pace', () => {
    const expected = expectedIntakeFraction(10.5);
    const score = dietScore({
      ...base,
      kcal: 2000 * expected,
      proteinG: 120 * expected,
      hour: 10.5,
    });
    expect(score).toBe(100);
  });
  it('drops when far behind pace in the evening', () => {
    expect(dietScore({ ...base, kcal: 400, proteinG: 20, hour: 21 })!).toBeLessThan(30);
  });
  it('drops when overeating', () => {
    expect(dietScore({ ...base, kcal: 3800, proteinG: 150, hour: 23 })!).toBeLessThan(60);
  });
});

describe('activity, water, sleep', () => {
  it('rates steps against pace, never above 100', () => {
    expect(activityScore(0, 8000, 7.2)).toBeNull();
    expect(activityScore(4000, 8000, 14)).toBe(100);
    expect(activityScore(9000, 8000, 21)).toBe(100);
    expect(activityScore(2000, 8000, 21)).toBe(25);
  });
  it('does not score water until it has been logged once', () => {
    expect(waterScore(0, 2000, 15, false)).toBeNull();
    expect(waterScore(500, 2000, 14, true)).toBe(50);
  });
  it('scores sleep against need', () => {
    expect(sleepScore(null)).toBeNull();
    expect(sleepScore(7.5)).toBe(100);
    expect(sleepScore(5.5)).toBe(50);
    expect(sleepScore(3.5)).toBe(0);
    expect(sleepScore(11.5)).toBe(80);
  });
});

describe('overall score', () => {
  it('needs two rated components', () => {
    expect(overallScore({ diet: { value: 90, confidence: CONFIDENCE.measured } })).toEqual({
      status: 'getting-started',
      rated: 1,
    });
  });
  it('weights by importance and confidence, renormalized', () => {
    const result = overallScore({
      diet: { value: 80, confidence: CONFIDENCE.measured }, // weight 40
      activity: { value: 40, confidence: CONFIDENCE.assumed }, // weight 25 × 0.3 = 7.5
      water: { value: null, confidence: CONFIDENCE.measured },
    });
    expect(result).toEqual({ status: 'rated', value: 74, rated: 2 }); // (3200 + 300) / 47.5
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
