// The user's profile and computed plan (SPEC §7). Computed locally from onboarding answers so the
// plan exists the moment onboarding finishes, offline. AI-written copy can enrich it later.

import { useMMKVString } from 'react-native-mmkv';

import { upsertRecord } from '@/db/mutate';
import type { Answers } from '@/onboarding/state';
import { computePlan, dayKey, type Plan, type PlanInput } from '@/shared';

import { kv } from './kv';

const PROFILE_KEY = 'profile';
const PLAN_KEY = 'plan';

export type Profile = Omit<Answers, 'healthConnect'> & { savedAt: number };

/** Plan inputs from answers, or null while required answers are missing. */
export function planInputFrom(answers: Answers, now = new Date()): PlanInput | null {
  const { sex, birthDate, heightCm, weightKg, goal } = answers;
  if (!sex || !birthDate || !heightCm || !weightKg || !goal) return null;
  const [y, m, d] = birthDate.split('-').map(Number) as [number, number, number];
  return {
    sex,
    birthDate: new Date(y, m - 1, d),
    heightCm,
    weightKg,
    goal,
    goalWeightKg: answers.goalWeightKg,
    pace: answers.pace,
    averageSteps: answers.healthConnect?.averageSteps,
    now,
  };
}

export function previewPlan(answers: Answers): Plan | null {
  const input = planInputFrom(answers);
  return input ? computePlan(input) : null;
}

/** Saves profile + plan and logs the starting weight (synced like any other weight entry). */
export function savePlan(answers: Answers): Plan {
  const input = planInputFrom(answers);
  if (!input) throw new Error('Onboarding answers are incomplete');
  const plan = computePlan(input);
  const { healthConnect: _hc, ...profile } = answers;
  kv.set(PROFILE_KEY, JSON.stringify({ ...profile, savedAt: Date.now() } satisfies Profile));
  kv.set(PLAN_KEY, JSON.stringify(plan));
  const now = new Date();
  upsertRecord('weight', {
    day: dayKey(now),
    at: now.getTime(),
    kg: input.weightKg,
    source: 'onboarding',
  });
  return plan;
}

function revive(raw: string | undefined): Plan | null {
  if (!raw) return null;
  const parsed = JSON.parse(raw) as Plan & { goalDate: string | null };
  return { ...parsed, goalDate: parsed.goalDate ? new Date(parsed.goalDate) : null };
}

export function usePlan(): Plan | null {
  const [raw] = useMMKVString(PLAN_KEY, kv);
  return revive(raw);
}

/** The saved profile, outside React (background work). */
export function readProfile(): Profile | null {
  const raw = kv.getString(PROFILE_KEY);
  return raw ? (JSON.parse(raw) as Profile) : null;
}

export function useProfile(): Profile | null {
  const [raw] = useMMKVString(PROFILE_KEY, kv);
  return raw ? (JSON.parse(raw) as Profile) : null;
}
