import { describe, expect, it } from 'vitest';

import {
  activityFromSteps,
  ageOn,
  bmr,
  computeMacros,
  computePlan,
  isAdult,
  macroShares,
  minHealthyWeightKg,
} from '../src/plan';

const NOW = new Date(2026, 9, 14, 9, 0);
const born = (age: number) => new Date(NOW.getFullYear() - age, 0, 1);

describe('age', () => {
  it('counts birthdays', () => {
    expect(ageOn(new Date(2000, 9, 15), NOW)).toBe(25);
    expect(ageOn(new Date(2000, 9, 14), NOW)).toBe(26);
  });
  it('gates adults', () => {
    expect(isAdult(new Date(2008, 9, 15), NOW)).toBe(false);
    expect(isAdult(new Date(2008, 9, 14), NOW)).toBe(true);
  });
});

describe('bmr (Mifflin-St Jeor)', () => {
  it('matches the formula', () => {
    expect(bmr('female', 70, 165, 30)).toBeCloseTo(1420.25);
    expect(bmr('male', 70, 180, 25)).toBeCloseTo(1705);
  });
});

describe('computePlan', () => {
  it('builds a steady loss plan', () => {
    const plan = computePlan({
      sex: 'female',
      birthDate: born(30),
      heightCm: 165,
      weightKg: 70,
      goal: 'lose',
      goalWeightKg: 60,
      pace: 'steady',
      now: NOW,
    });
    // TDEE 1420.25 × 1.375 = 1952.8; − 0.5 × 7700 / 7 = 1402.8 → 1400
    expect(plan.tdee).toBe(1953);
    expect(plan.targetKcal).toBe(1400);
    // Reference weight = BMI-25 weight at 165 cm = 68.1 kg; × 1.8 = 122.5 g (also the 35 % cap).
    expect(plan.referenceWeightKg).toBe(68.1);
    expect(plan.proteinG).toBe(122);
    // Fat starts at 30 % (46.7 g) and gives way to keep carbs at the 130 g minimum.
    expect(plan.fatG).toBe(43);
    expect(plan.carbsG).toBe(130);
    expect(plan.fiberG).toBe(25); // 14 g/1000 kcal = 19.6, female minimum 25
    expect(plan.waterMl).toBe(2450); // 35 ml × 70 kg
    expect(plan.activitySource).toBe('default');
    expect(plan.rateKgPerWeek).toBe(-0.5);
    expect(plan.weeksToGoal).toBe(20);
    expect(plan.floorApplied).toBe(false);
    expect(plan.goalDate?.getTime()).toBe(NOW.getTime() + 20 * 7 * 86_400_000);
  });

  it('caps loss at 1% of body weight and stretches the timeline at the calorie floor', () => {
    const plan = computePlan({
      sex: 'female',
      birthDate: born(50),
      heightCm: 155,
      weightKg: 55,
      goal: 'lose',
      goalWeightKg: 50,
      pace: 'faster',
      now: NOW,
    });
    expect(plan.rateCapped).toBe(true);
    expect(plan.floorApplied).toBe(true);
    expect(plan.targetKcal).toBe(1200);
    // (1523.2 − 1200) × 7 / 7700 = 0.29 kg/week → 5 kg in 17 weeks
    expect(plan.rateKgPerWeek).toBe(-0.29);
    expect(plan.weeksToGoal).toBe(17);
  });

  it('builds a muscle-gain plan above TDEE', () => {
    const plan = computePlan({
      sex: 'male',
      birthDate: born(25),
      heightCm: 180,
      weightKg: 70,
      goal: 'gain',
      goalWeightKg: 75,
      pace: 'steady',
      now: NOW,
    });
    expect(plan.targetKcal).toBe(2620);
    expect(plan.proteinG).toBe(140);
    expect(plan.rateKgPerWeek).toBe(0.25);
    expect(plan.weeksToGoal).toBe(20);
  });

  it('maintain has no goal weight or timeline', () => {
    const plan = computePlan({
      sex: 'male',
      birthDate: born(40),
      heightCm: 175,
      weightKg: 80,
      goal: 'maintain',
      now: NOW,
    });
    expect(plan.targetKcal).toBe(Math.round(plan.tdee / 10) * 10);
    expect(plan.goalWeightKg).toBeNull();
    expect(plan.weeksToGoal).toBeNull();
    expect(plan.rateKgPerWeek).toBe(0);
  });

  it('raises a goal weight that would mean a BMI under 18.5', () => {
    expect(minHealthyWeightKg(160)).toBeCloseTo(47.36);
    const plan = computePlan({
      sex: 'female',
      birthDate: born(28),
      heightCm: 160,
      weightKg: 55,
      goal: 'lose',
      goalWeightKg: 45,
      now: NOW,
    });
    expect(plan.goalWeightRaised).toBe(true);
    expect(plan.goalWeightKg).toBe(47.4);
  });

  it('treats a goal on the wrong side of the current weight as maintain', () => {
    const plan = computePlan({
      sex: 'female',
      birthDate: born(28),
      heightCm: 165,
      weightKg: 60,
      goal: 'lose',
      goalWeightKg: 62,
      now: NOW,
    });
    expect(plan.rateKgPerWeek).toBe(0);
    expect(plan.weeksToGoal).toBeNull();
  });

  it('macro shares add up to about 1', () => {
    const shares = macroShares({ targetKcal: 1400, proteinG: 108, fatG: 43, carbsG: 145 });
    expect(shares.protein + shares.fat + shares.carbs).toBeCloseTo(1, 1);
  });
});

describe('activity', () => {
  it('maps average steps to a level and uses it for TDEE', () => {
    expect([2000, 6000, 8000, 12000].map(activityFromSteps)).toEqual([
      'sedentary',
      'light',
      'moderate',
      'active',
    ]);
    const base = {
      sex: 'male' as const,
      birthDate: born(35),
      heightCm: 180,
      weightKg: 80,
      goal: 'maintain' as const,
      now: NOW,
    };
    const walker = computePlan({ ...base, averageSteps: 11000 });
    const sitter = computePlan({ ...base, averageSteps: 3000 });
    expect(walker.activitySource).toBe('steps');
    expect(walker.tdee / sitter.tdee).toBeCloseTo(1.725 / 1.2, 2);
  });
});

describe('macro rules hold across bodies and goals', () => {
  const people: Parameters<typeof computeMacros>[0][] = [];
  for (const sex of ['female', 'male'] as const)
    for (const age of [20, 45, 70])
      for (const heightCm of [155, 175, 195])
        for (const weightKg of [50, 75, 110, 150])
          for (const goal of ['lose', 'maintain', 'gain'] as const)
            for (const targetKcal of [1200, 1800, 2600, 3400])
              people.push({
                sex,
                age,
                heightCm,
                weightKg,
                goal,
                targetKcal,
                pace: 'steady' as const,
              });

  it('adds up to the calorie target and respects every bound', () => {
    for (const p of people) {
      const m = computeMacros(p);
      const kcal = m.proteinG * 4 + m.carbsG * 4 + m.fatG * 9;
      expect(Math.abs(kcal - p.targetKcal), JSON.stringify(p)).toBeLessThanOrEqual(15);
      expect(m.proteinG * 4).toBeLessThanOrEqual(p.targetKcal * 0.35 + 2);
      expect(m.fatG * 9).toBeLessThanOrEqual(p.targetKcal * 0.35 + 5);
      expect(m.fatG * 9).toBeGreaterThanOrEqual(p.targetKcal * 0.2 - 5);
      // 0.6 g/kg holds whenever the 35 % cap leaves room for it (the cap wins otherwise).
      if (m.referenceWeightKg * 0.6 * 9 <= p.targetKcal * 0.35)
        expect(m.fatG).toBeGreaterThanOrEqual(Math.round(m.referenceWeightKg * 0.6) - 1);
      expect(m.fiberG).toBeGreaterThanOrEqual(25);
      // Carbs keep 130 g whenever the calories leave room for it.
      if (p.targetKcal >= 1800) expect(m.carbsG, JSON.stringify(p)).toBeGreaterThanOrEqual(129);
    }
  });

  it('scales protein to a BMI-25 reference weight unless gaining', () => {
    const big = {
      sex: 'male' as const,
      age: 40,
      heightCm: 175,
      weightKg: 130,
      targetKcal: 2600,
      pace: 'steady' as const,
    };
    expect(computeMacros({ ...big, goal: 'lose' }).referenceWeightKg).toBeCloseTo(76.6, 1);
    expect(computeMacros({ ...big, goal: 'gain' }).referenceWeightKg).toBe(130);
  });

  it('raises protein for faster loss and from age 60', () => {
    const base = {
      sex: 'female' as const,
      heightCm: 165,
      weightKg: 62,
      goal: 'lose' as const,
      targetKcal: 2200,
    };
    const steady = computeMacros({ ...base, age: 40, pace: 'steady' }).proteinG;
    expect(computeMacros({ ...base, age: 40, pace: 'faster' }).proteinG).toBeGreaterThan(steady);
    expect(computeMacros({ ...base, age: 65, pace: 'steady' }).proteinG).toBeGreaterThan(steady);
  });
});
