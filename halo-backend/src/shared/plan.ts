// GENERATED from halo-shared/src/plan.ts by halo-shared/scripts/sync.mjs. Do not edit.

// Deterministic plan maths (SPEC §7). Starting points to tune, not medical advice.

import { clamp, round } from './units.js';

export type Sex = 'female' | 'male';
export type Goal = 'lose' | 'maintain' | 'gain';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active';
export type Pace = 'gentle' | 'steady' | 'faster';

export const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375, // default until step data refines it
  moderate: 1.55,
  active: 1.725,
};

/** kg per week for each pace. Loss is further capped at 1% of body weight per week. */
export const PACE_RATE: Record<Exclude<Goal, 'maintain'>, Record<Pace, number>> = {
  lose: { gentle: 0.25, steady: 0.5, faster: 0.75 },
  gain: { gentle: 0.1, steady: 0.25, faster: 0.4 },
};

export const PACE_LABEL: Record<Pace, string> = {
  gentle: 'Gentle',
  steady: 'Steady momentum',
  faster: 'Faster',
};

export const KCAL_PER_KG = 7700;
export const CALORIE_FLOOR: Record<Sex, number> = { female: 1200, male: 1500 };
export const MIN_BMI = 18.5;
const MAX_LOSS_FRACTION_PER_WEEK = 0.01;
const FAT_SHARE = 0.275;
const PROTEIN_G_PER_KG: Record<Goal, number> = { lose: 1.8, maintain: 1.6, gain: 2.0 };

export type PlanInput = {
  sex: Sex;
  birthDate: Date;
  heightCm: number;
  weightKg: number;
  goal: Goal;
  /** Ignored when goal is 'maintain'. */
  goalWeightKg?: number;
  pace?: Pace;
  activity?: ActivityLevel;
  now?: Date;
};

export type Plan = {
  age: number;
  bmr: number;
  tdee: number;
  targetKcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  /** Signed kg/week actually planned (negative = loss). 0 for maintain. */
  rateKgPerWeek: number;
  goalWeightKg: number | null;
  weeksToGoal: number | null;
  goalDate: Date | null;
  /** The calorie floor was hit, so the timeline was stretched instead. */
  floorApplied: boolean;
  /** The pace was reduced to stay within 1% of body weight per week. */
  rateCapped: boolean;
  /** The requested goal weight implied a BMI under 18.5 and was raised. */
  goalWeightRaised: boolean;
};

export function ageOn(birthDate: Date, now: Date): number {
  let age = now.getFullYear() - birthDate.getFullYear();
  const beforeBirthday =
    now.getMonth() < birthDate.getMonth() ||
    (now.getMonth() === birthDate.getMonth() && now.getDate() < birthDate.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export const isAdult = (birthDate: Date, now = new Date()) => ageOn(birthDate, now) >= 18;

/** Mifflin-St Jeor. */
export function bmr(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
}

export const bmi = (weightKg: number, heightCm: number) => weightKg / (heightCm / 100) ** 2;

/** Lowest goal weight that keeps BMI at 18.5. */
export const minHealthyWeightKg = (heightCm: number) => MIN_BMI * (heightCm / 100) ** 2;

export function computePlan(input: PlanInput): Plan {
  const now = input.now ?? new Date();
  const age = ageOn(input.birthDate, now);
  const base = bmr(input.sex, input.weightKg, input.heightCm, age);
  const tdee = base * ACTIVITY_MULTIPLIER[input.activity ?? 'light'];
  const floor = CALORIE_FLOOR[input.sex];

  let goal = input.goal;
  let goalWeightKg: number | null = null;
  let goalWeightRaised = false;
  if (goal !== 'maintain' && input.goalWeightKg != null) {
    goalWeightKg = input.goalWeightKg;
    const minWeight = minHealthyWeightKg(input.heightCm);
    if (goal === 'lose' && goalWeightKg < minWeight) {
      goalWeightKg = round(minWeight, 1);
      goalWeightRaised = true;
    }
    // A goal on the wrong side of the current weight (or equal) has nothing to plan.
    if ((goal === 'lose' && goalWeightKg >= input.weightKg) || (goal === 'gain' && goalWeightKg <= input.weightKg)) {
      goal = 'maintain';
    }
  }

  let rate = 0; // kg/week, positive magnitude
  let rateCapped = false;
  if (goal !== 'maintain') {
    rate = PACE_RATE[goal][input.pace ?? 'steady'];
    if (goal === 'lose') {
      const cap = input.weightKg * MAX_LOSS_FRACTION_PER_WEEK;
      if (rate > cap) {
        rate = cap;
        rateCapped = true;
      }
    }
  }

  const dailyDelta = (rate * KCAL_PER_KG) / 7;
  let target = goal === 'lose' ? tdee - dailyDelta : goal === 'gain' ? tdee + dailyDelta : tdee;
  let floorApplied = false;
  if (target < floor) {
    // Never go below the floor: keep eating at the floor and stretch the timeline instead.
    target = floor;
    floorApplied = true;
    rate = goal === 'lose' ? Math.max(0, ((tdee - floor) * 7) / KCAL_PER_KG) : rate;
  }

  const targetKcal = Math.round(target / 10) * 10;
  // Protein per kg of the lighter of current and goal weight when losing, so large bodies
  // don't get an unreachable target.
  const proteinBasis = goal === 'lose' && goalWeightKg != null ? Math.min(input.weightKg, goalWeightKg) : input.weightKg;
  const proteinG = Math.round(proteinBasis * PROTEIN_G_PER_KG[goal]);
  const fatG = Math.round((targetKcal * FAT_SHARE) / 9);
  const carbsG = Math.max(0, Math.round((targetKcal - proteinG * 4 - fatG * 9) / 4));

  let weeksToGoal: number | null = null;
  let goalDate: Date | null = null;
  if (goal !== 'maintain' && goalWeightKg != null && rate > 0) {
    weeksToGoal = round(Math.abs(input.weightKg - goalWeightKg) / rate, 1);
    goalDate = new Date(now.getTime() + weeksToGoal * 7 * 24 * 3600 * 1000);
  }

  return {
    age,
    bmr: Math.round(base),
    tdee: Math.round(tdee),
    targetKcal,
    proteinG,
    fatG,
    carbsG,
    rateKgPerWeek: goal === 'lose' ? -round(rate, 2) : goal === 'gain' ? round(rate, 2) : 0,
    goalWeightKg: goal === 'maintain' ? null : goalWeightKg,
    weeksToGoal,
    goalDate,
    floorApplied,
    rateCapped,
    goalWeightRaised,
  };
}

/** Macro split as fractions of calories (for the nutrition target screen). */
export function macroShares(plan: Pick<Plan, 'targetKcal' | 'proteinG' | 'fatG' | 'carbsG'>) {
  const kcal = Math.max(1, plan.targetKcal);
  return {
    protein: clamp((plan.proteinG * 4) / kcal, 0, 1),
    fat: clamp((plan.fatG * 9) / kcal, 0, 1),
    carbs: clamp((plan.carbsG * 4) / kcal, 0, 1),
  };
}
