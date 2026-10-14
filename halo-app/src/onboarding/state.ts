// Onboarding answers and position, persisted in MMKV after every change so a half-finished
// onboarding resumes exactly where it stopped. Synchronous reads: no flash on cold start.

import { useSyncExternalStore } from 'react';

import { kv } from '@/lib/kv';
import type { Goal, Pace, Sex } from '@/shared';

import { FIRST_STEP, type StepId } from './steps';

export const INTERESTS = [
  { id: 'energy', label: 'More daily energy' },
  { id: 'mood', label: 'Stabilize my mood' },
  { id: 'clothes', label: 'Better fitting clothes' },
  { id: 'structure', label: 'Create better structure' },
  { id: 'cooking', label: 'Learn to cook great food' },
  { id: 'sharp', label: 'Feel mentally sharp' },
] as const;
export type Interest = (typeof INTERESTS)[number]['id'];

export type HealthConnectAnswer = {
  status: 'connected' | 'denied' | 'unavailable' | 'skipped';
  weightKg?: number;
  heightCm?: number;
  /** 14-day average, refines the activity level in the plan. */
  averageSteps?: number;
  at: number;
};

export type Answers = {
  goal?: Goal;
  interests: Interest[];
  sex?: Sex;
  birthDate?: string; // YYYY-MM-DD
  heightCm?: number;
  weightKg?: number;
  goalWeightKg?: number;
  pace?: Pace;
  name?: string;
  healthConnect?: HealthConnectAnswer;
};

const VERSION = 1;
type Stored = { v: typeof VERSION; step: StepId; answers: Answers; completedAt: number | null };

const KEY = 'onboarding';
const initial = (): Stored => ({
  v: VERSION,
  step: FIRST_STEP,
  answers: { interests: [] },
  completedAt: null,
});

function read(): Stored {
  const raw = kv.getString(KEY);
  if (!raw) return initial();
  try {
    const parsed = JSON.parse(raw) as Stored;
    // Older shapes aren't migrated: answers are cheap to give again before launch.
    return parsed.v === VERSION ? parsed : initial();
  } catch {
    return initial();
  }
}

let snapshot = read();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

// Writes update the snapshot synchronously: MMKV's change listener isn't guaranteed to fire
// before the next screen mounts, and that screen must see the answer just given.
function write(next: Stored) {
  snapshot = next;
  kv.set(KEY, JSON.stringify(next));
  notify();
}

// Changes made elsewhere (e.g. a reset from another module) still flow in.
kv.addOnValueChangedListener((key) => {
  if (key !== KEY) return;
  const fresh = read();
  if (JSON.stringify(fresh) === JSON.stringify(snapshot)) return;
  snapshot = fresh;
  notify();
});

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getOnboarding = () => snapshot;
export const useOnboarding = () => useSyncExternalStore(subscribe, getOnboarding);
export const useOnboarded = () => useOnboarding().completedAt != null;

/**
 * Merges answers. Changing the goal clears what depended on the old goal (target weight, pace),
 * so a "lose → maintain" switch can't leave a stale goal weight behind.
 */
export function setAnswers(patch: Partial<Answers>) {
  const current = snapshot.answers;
  const next: Answers = { ...current, ...patch };
  if (patch.goal && patch.goal !== current.goal) {
    delete next.goalWeightKg;
    delete next.pace;
  }
  write({ ...snapshot, answers: next });
}

export function setStep(step: StepId) {
  if (snapshot.step !== step) write({ ...snapshot, step });
}

export function completeOnboarding() {
  write({ ...snapshot, completedAt: Date.now() });
}

export function resetOnboarding() {
  write(initial());
}
