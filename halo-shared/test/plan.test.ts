import { describe, expect, it } from 'vitest';

import { ageOn, bmr, computePlan, isAdult, macroShares, minHealthyWeightKg } from '../src/plan';

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
    expect(plan.proteinG).toBe(108); // 60 kg (lighter of current/goal) × 1.8
    expect(plan.fatG).toBe(43);
    expect(plan.carbsG).toBe(145);
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
