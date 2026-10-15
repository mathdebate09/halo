// The PA, live: builds what it knows about the user (scores' facts, learned habits, today's logs,
// stored insight history), asks halo-shared's `brief` for the one thing worth saying, and keeps
// the loop closed (shown → acted / resolved / ignored). Mounted inside TodayScoresProvider.

import { and, desc, eq, isNull, max } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { createContext, type ReactNode, use, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { db } from '@/db/client';
import { hcDaily, meals, water, weights } from '@/db/schema';
import { kv } from '@/lib/kv';
import {
  addDays,
  bedtimeOf,
  brief,
  type Brief,
  hourOfDay,
  type PaContext,
  transitions,
  weighInDue,
} from '@/shared';
import { useHaloTheme } from '@/theme/theme-provider';
import { useTodayScores } from '@/today/today-scores';

import { useDailyScoreWriter } from './daily-score';
import { isWeekend, noteAppOpen, refreshLearned, useLearned, windowsOn } from './learned';
import { applyTransitions, useInsightHistory } from './loop-store';
import { reschedule } from './notify';
import { phraseItemFor, readPhrase, requestPhrases } from './phrasing';

/** The brief on screen, kept across renders and restarts so it doesn't flip (PA hold). */
const HELD_KEY = 'assistant.held';
/** The latest PA trace, for the dev screen. */
export const TRACE_KEY = 'assistant.trace';

export type Assistant = {
  brief: Brief;
  context: PaContext;
  /** Cache key of the brief's reworded words (null when the tier's lines speak). */
  phrase: string | null;
};

const AssistantContext = createContext<Assistant | null>(null);

const num = (v: string | number | null | undefined) => (v == null ? null : Number(v));

export function AssistantProvider({ children }: { children: ReactNode }) {
  const scores = useTodayScores();
  const { day, now, facts } = scores;
  const learned = useLearned();
  const { target } = useHaloTheme();
  useDailyScoreWriter(scores);

  // Learn on launch, on every return to the foreground, and when meals come in.
  useEffect(() => {
    noteAppOpen();
    refreshLearned();
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      noteAppOpen();
      refreshLearned();
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    refreshLearned();
  }, [facts.mealsLogged, day]);

  const { records } = useInsightHistory(day);
  const { data: lastWeigh } = useLiveQuery(
    db
      .select({ day: weights.day })
      .from(weights)
      .where(isNull(weights.deletedAt))
      .orderBy(desc(weights.day))
      .limit(1),
  );
  const { data: lastMeal } = useLiveQuery(
    db
      .select({ at: max(meals.createdAt) })
      .from(meals)
      .where(and(eq(meals.day, day), isNull(meals.deletedAt))),
    [day],
  );
  const { data: lastWater } = useLiveQuery(
    db
      .select({ at: max(water.at) })
      .from(water)
      .where(and(eq(water.day, day), isNull(water.deletedAt))),
    [day],
  );
  const { data: prevNight } = useLiveQuery(
    db
      .select({ sleepMin: hcDaily.sleepMin })
      .from(hcDaily)
      .where(eq(hcDaily.day, addDays(day, -1))),
    [day],
  );

  const weekend = isWeekend(day);
  const lastWeighDay = lastWeigh[0]?.day ?? null;
  const logTimes = [num(lastMeal[0]?.at), num(lastWater[0]?.at)].filter(
    (n): n is number => n != null,
  );
  const prevMin = prevNight[0]?.sleepMin;

  const context: PaContext = {
    now: now.getTime(),
    day,
    hour: hourOfDay(now),
    facts,
    windows: windowsOn(day, learned),
    wake: learned
      ? weekend
        ? learned.wake.weekend
        : learned.wake.weekday
      : { value: 7, source: 'assumed' },
    prevNightHours: prevMin == null ? null : prevMin / 60,
    usualMeals: learned?.usualMeals ?? {},
    weighedToday: lastWeighDay === day,
    lastWeighDay,
    lastLogAt: logTimes.length ? Math.max(...logTimes) : null,
    history: records,
  };

  const heldId = kv.getString(HELD_KEY) ?? null;
  const result = brief(context, heldId ? { id: heldId } : null);
  const briefId = result.insight.id;

  useEffect(() => {
    if (kv.getString(HELD_KEY) !== briefId) kv.set(HELD_KEY, briefId);
  }, [briefId]);

  // Pre-compute the brief's words in the background whenever its situation changes.
  const phraseItem = phraseItemFor(result.insight, target.tier, context.hour, facts.goal);
  const phrase = phraseItem?.key ?? null;
  useEffect(() => {
    if (phraseItem) requestPhrases([phraseItem]);
    // Keyed on the phrase key: the item is rebuilt every render.
  }, [phrase]);

  // Re-plan notifications after every log, weigh-in or return to the app (learning refreshes on
  // foreground, which changes `learned`), a moment after things settle.
  const latest = useRef({ context, tier: target.tier });
  latest.current = { context, tier: target.tier };
  const planKey = [
    day,
    facts.mealsLogged,
    facts.waterMl,
    context.weighedToday,
    context.lastLogAt,
    learned?.updatedAt,
  ].join('|');
  useEffect(() => {
    const timer = setTimeout(() => {
      const { context: c, tier } = latest.current;
      reschedule(c, tier, c.facts.goal).catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, [planKey]);

  // Close the loop: gaps that closed resolve, untouched briefs past their time are ignored.
  const pending = transitions(records, context);
  const pendingKey = pending.map((t) => `${t.id}>${t.state}`).join('|');
  useEffect(() => {
    // Keyed on the transitions' content, not the array (a new one every render).
    if (pending.length) applyTransitions(pending);
  }, [pendingKey]);

  // A readable trace for the dev screen, written only when it changes.
  const trace = JSON.stringify({
    at: context.hour.toFixed(2),
    wake: context.wake,
    bedtime: bedtimeOf(context),
    windows: context.windows,
    usualMeals: context.usualMeals,
    weighDue: weighInDue(records, day, lastWeighDay),
    lastLogAt: context.lastLogAt,
    stored: records.filter((r) => r.day === day).map((r) => `${r.type}:${r.state}`),
    signals: result.trace.signals.map((s) => `${s.type} ${Math.round(s.severity)}`),
    dropped: result.trace.dropped.map((d) => `${d.type}: ${d.reason}`),
    ranked: result.trace.ranked.map((r) => `${r.type} ${r.score}${r.note ? ` (${r.note})` : ''}`),
    held: result.trace.held,
    brief: { ...result.insight.copy, lead: result.lead },
    phrase: phrase ? `${phrase} ${readPhrase(phrase) ? 'reworded' : 'template'}` : 'tier lines',
  });
  useEffect(() => {
    if (kv.getString(TRACE_KEY) !== trace) kv.set(TRACE_KEY, trace);
  }, [trace]);

  return <AssistantContext value={{ brief: result, context, phrase }}>{children}</AssistantContext>;
}

export function useAssistant() {
  const ctx = use(AssistantContext);
  if (!ctx) throw new Error('useAssistant must be used inside AssistantProvider');
  return ctx;
}
