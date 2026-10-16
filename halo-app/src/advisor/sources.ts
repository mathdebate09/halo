// What the Advisor's snapshot is built from. The scores and the brief live in providers inside the
// tabs, which stay mounted under the Advisor screen; a publisher there keeps the latest values here,
// and the Advisor builds its snapshot from them when a message is sent.

import { useEffect, useSyncExternalStore } from 'react';

import { useAssistant } from '@/assistant/assistant';
import { wordsFor } from '@/assistant/phrasing';
import { useClock24 } from '@/lib/clock';
import { useExerciseSessions } from '@/lib/health-connect';
import { type Profile, useProfile, usePlan } from '@/lib/plan';
import { useUnits } from '@/lib/units';
import { useAddedReports, useLabResults } from '@/reports/lab-data';
import {
  dayKey,
  type ExerciseSessionInfo,
  type InsightCopy,
  type InsightFacts,
  type InsightKind,
  type LabResult,
  type Factor,
  type Plan,
} from '@/shared';
import { type TodayScores, useTodayScores } from '@/today/today-scores';

export type AdvisorSources = {
  scores: TodayScores;
  brief: InsightCopy | null;
  /** What the brief is about, for the one starter question. */
  briefSignal: { type: InsightKind; facts: InsightFacts } | null;
  lab: { results: LabResult[]; factors: Factor[]; addedDay: string | null };
  profile: Profile | null;
  plan: Plan | null;
  pounds: boolean;
  clock24: boolean;
  sessions: ExerciseSessionInfo[];
};

let current: AdvisorSources | null = null;
const listeners = new Set<() => void>();

export const readAdvisorSources = () => current;

export function useAdvisorSources(): AdvisorSources | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}

/** Mounted inside the tabs' providers: keeps the sources current while the app runs. */
export function AdvisorSourcesPublisher() {
  const scores = useTodayScores();
  const { brief, phrase } = useAssistant();
  const { results, factors } = useLabResults();
  const reports = useAddedReports();
  const profile = useProfile();
  const plan = usePlan();
  const [units] = useUnits();
  const clock24 = useClock24();
  const sessions = useExerciseSessions();

  const newest = reports[0];
  const addedDay = newest ? (newest.reportDate ?? dayKey(new Date(newest.createdAt))) : null;
  const words = brief.insight.type === 'on_track' ? null : wordsFor(brief.insight, phrase);

  useEffect(() => {
    current = {
      scores,
      brief: words,
      briefSignal: words ? { type: brief.insight.type, facts: brief.insight.facts } : null,
      lab: { results, factors, addedDay },
      profile,
      plan,
      pounds: units.weight === 'lb',
      clock24,
      sessions,
    };
    for (const listener of listeners) listener();
  });
  return null;
}
