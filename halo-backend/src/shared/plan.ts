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

/** Average daily steps → activity level (refines the "lightly active" default when known). */
export function activityFromSteps(averageSteps: number): ActivityLevel {
  if (averageSteps < 5000) return 'sedentary';
  if (averageSteps < 7500) return 'light';
  if (averageSteps < 10000) return 'moderate';
  return 'active';
}

// Macro rules. Protein protects muscle (more in a deficit, when gaining, and from 60), fat stays
// in a hormone-safe band, carbs keep the brain's ~130 g/day minimum, fiber scales with intake.
const PROTEIN_G_PER_KG: Record<Goal, number> = { lose: 1.8, maintain: 1.4, gain: 2.0 };
const PROTEIN_FASTER_LOSS = 2.0;
const PROTEIN_OLDER_BONUS = 0.2; // age ≥ 60: anabolic resistance
const PROTEIN_MIN_G_PER_KG: Record<Goal, number> = { lose: 1.6, maintain: 1.2, gain: 1.6 };
const PROTEIN_MAX_SHARE = 0.35;
const FAT_SHARE: Record<Goal, number> = { lose: 0.3, maintain: 0.3, gain: 0.25 };
const FAT_MIN_SHARE = 0.2;
const FAT_MAX_SHARE = 0.35;
const FAT_MIN_G_PER_KG = 0.6;
const CARBS_MIN_G = 130;
const FIBER_G_PER_1000_KCAL = 14;
const FIBER_MIN_G: Record<Sex, number> = { female: 25, male: 30 };
const WATER_ML_PER_KG = 35;
const REFERENCE_BMI = 25;

export type PlanInput = {
  sex: Sex;
  birthDate: Date;
  heightCm: number;
  weightKg: number;
  goal: Goal;
  /** Ignored when goal is 'maintain'. */
  goalWeightKg?: number;
  pace?: Pace;
  /** Explicit level; otherwise derived from averageSteps; otherwise 'light'. */
  activity?: ActivityLevel;
  /** 14-day average from Health Connect, when connected. */
  averageSteps?: number;
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
  fiberG: number;
  waterMl: number;
  /** Activity level the TDEE used, and where it came from. */
  activity: ActivityLevel;
  activitySource: 'input' | 'steps' | 'default';
  /** Weight protein and fat are scaled to (current, capped at BMI 25 unless gaining). */
  referenceWeightKg: number;
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
  const activity =
    input.activity ??
    (input.averageSteps != null ? activityFromSteps(input.averageSteps) : 'light');
  const activitySource = input.activity
    ? 'input'
    : input.averageSteps != null
      ? 'steps'
      : 'default';
  const tdee = base * ACTIVITY_MULTIPLIER[activity];
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
    if (
      (goal === 'lose' && goalWeightKg >= input.weightKg) ||
      (goal === 'gain' && goalWeightKg <= input.weightKg)
    ) {
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
  const macros = computeMacros({
    targetKcal,
    goal,
    pace: input.pace ?? 'steady',
    sex: input.sex,
    age,
    weightKg: input.weightKg,
    heightCm: input.heightCm,
  });

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
    ...macros,
    activity,
    activitySource,
    rateKgPerWeek: goal === 'lose' ? -round(rate, 2) : goal === 'gain' ? round(rate, 2) : 0,
    goalWeightKg: goal === 'maintain' ? null : goalWeightKg,
    weeksToGoal,
    goalDate,
    floorApplied,
    rateCapped,
    goalWeightRaised,
  };
}

type MacroInput = {
  targetKcal: number;
  goal: Goal;
  pace: Pace;
  sex: Sex;
  age: number;
  weightKg: number;
  heightCm: number;
};

/**
 * Protein → fat → carbs, each within physiological bounds:
 * - protein per kg of a reference weight (current, capped at the BMI-25 weight unless gaining, so
 *   a large body doesn't get an unreachable target), higher for faster loss and from age 60,
 *   capped at 35 % of calories
 * - fat at 30 % (25 % when gaining), never under 0.6 g/kg nor over 35 % (the 35 % cap wins when a
 *   low budget can't hold both)
 * - carbs take the rest but keep 130 g: fat gives way first (to 20 %), then protein (to its minimum)
 */
export function computeMacros(m: MacroInput) {
  const kcal = m.targetKcal;
  const referenceWeightKg =
    m.goal === 'gain' ? m.weightKg : Math.min(m.weightKg, REFERENCE_BMI * (m.heightCm / 100) ** 2);

  let perKg =
    m.goal === 'lose' && m.pace === 'faster' ? PROTEIN_FASTER_LOSS : PROTEIN_G_PER_KG[m.goal];
  if (m.age >= 60) perKg += PROTEIN_OLDER_BONUS;
  let protein = Math.min(referenceWeightKg * perKg, (kcal * PROTEIN_MAX_SHARE) / 4);

  const fatFloor = Math.max((kcal * FAT_MIN_SHARE) / 9, referenceWeightKg * FAT_MIN_G_PER_KG);
  let fat = Math.max((kcal * FAT_SHARE[m.goal]) / 9, referenceWeightKg * FAT_MIN_G_PER_KG);
  fat = Math.min(fat, (kcal * FAT_MAX_SHARE) / 9);

  const carbsFor = () => (kcal - protein * 4 - fat * 9) / 4;
  let carbs = carbsFor();
  if (carbs < CARBS_MIN_G) {
    fat -= Math.min(Math.max(0, fat - fatFloor), ((CARBS_MIN_G - carbs) * 4) / 9);
    carbs = carbsFor();
  }
  if (carbs < CARBS_MIN_G) {
    const proteinFloor = referenceWeightKg * PROTEIN_MIN_G_PER_KG[m.goal];
    protein -= Math.min(Math.max(0, protein - proteinFloor), CARBS_MIN_G - carbs);
    carbs = carbsFor();
  }

  return {
    proteinG: Math.round(protein),
    fatG: Math.round(fat),
    carbsG: Math.max(0, Math.round(carbs)),
    fiberG: Math.round(Math.max((kcal / 1000) * FIBER_G_PER_1000_KCAL, FIBER_MIN_G[m.sex])),
    waterMl: clamp(Math.round((m.weightKg * WATER_ML_PER_KG) / 50) * 50, 1500, 4000),
    referenceWeightKg: round(referenceWeightKg, 1),
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
