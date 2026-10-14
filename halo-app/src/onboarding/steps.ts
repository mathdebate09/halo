// Onboarding order (SPEC §2). Steps are added here as they're built; each step is a route at
// /onboarding/<id>. `skip` hides a step for answers that make it meaningless.

import type { Answers } from './state';

export const STEPS = [
  { id: 'intro' },
  { id: 'health' },
  { id: 'logging' },
  { id: 'insights' },
  { id: 'goal' },
  { id: 'interests' },
  { id: 'sex' },
  { id: 'birth' },
  { id: 'height' },
  { id: 'weight' },
  // A target weight is meaningless when the goal is to eat better at the same weight.
  { id: 'goal-weight', skip: (a) => a.goal === 'maintain' || !a.goal },
  { id: 'pace', skip: (a) => a.goal === 'maintain' || !a.goal },
  { id: 'name' },
  // Full-screen moments: no progress header.
  { id: 'building', chrome: false },
  { id: 'result' },
  { id: 'target' },
  { id: 'ready', chrome: false },
] as const satisfies readonly { id: string; skip?: (a: Answers) => boolean; chrome?: false }[];

export type StepId = (typeof STEPS)[number]['id'];
export const FIRST_STEP: StepId = STEPS[0].id;

type Step = { id: StepId; skip?: (a: Answers) => boolean; chrome?: false };

/** Whether the step shows the progress header. */
export const hasChrome = (id: StepId) =>
  (STEPS as readonly Step[]).find((s) => s.id === id)?.chrome !== false;
const visible = (answers: Answers) => (STEPS as readonly Step[]).filter((s) => !s.skip?.(answers));

export function nextStep(current: StepId, answers: Answers): StepId | null {
  const steps = visible(answers);
  const i = steps.findIndex((s) => s.id === current);
  return steps[i + 1]?.id ?? null;
}

export function previousStep(current: StepId, answers: Answers): StepId | null {
  const steps = visible(answers);
  const i = steps.findIndex((s) => s.id === current);
  return i > 0 ? steps[i - 1]!.id : null;
}

/** 0-1 position for the progress bar. */
export function progressOf(current: StepId, answers: Answers): number {
  const steps = visible(answers);
  const i = steps.findIndex((s) => s.id === current);
  return i < 0 ? 0 : (i + 1) / steps.length;
}

export const isStepId = (value: string): value is StepId => STEPS.some((s) => s.id === value);
