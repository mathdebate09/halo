// The PA, live: builds what it knows about the user (scores' facts, learned habits, today's logs,
// stored insight history), asks halo-shared's `brief` for the one thing worth saying, and keeps
// the loop closed (shown → acted / resolved / ignored). Mounted inside TodayScoresProvider.

import { and, desc, eq, gte, isNotNull, isNull, max } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { createContext, type ReactNode, use, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useMMKVBoolean } from 'react-native-mmkv';

import { db } from '@/db/client';
import { dailyScores, hcDaily, meals, water, weights } from '@/db/schema';
import { kv } from '@/lib/kv';
import {
  addDays,
  bedtimeOf,
  brief,
  type Brief,
  dayHour,
  dayKey,
  dayStart,
  nightShape,
  type PaContext,
  transitions,
  weighInDue,
  type WeekStats,
} from '@/shared';
import { useHaloTheme } from '@/theme/theme-provider';
import { useAddedReports, useLabResults } from '@/reports/lab-data';
import { useTodayScores } from '@/today/today-scores';

import { useDailyScoreWriter } from './daily-score';
import {
  installDay,
  isWeekend,
  noteAppOpen,
  refreshLearned,
  useLearned,
  WAKE_ASK_DONE_KEY,
  windowsOn,
} from './learned';
import { applyTransitions, useInsightHistory } from './loop-store';
import { reschedule } from './notify';
import { refreshScreenNights, type UsageAccess, usageAccess, useScreenNights } from './screen';
import { phraseItemFor, readPhrase, requestPhrases } from './phrasing';

/** The brief on screen, kept across renders and restarts so it doesn't flip (PA hold). */
const HELD_KEY = 'assistant.held';
/** The latest PA trace, for the dev screen. */
export const TRACE_KEY = 'assistant.trace';
/** The current brief, shaped for a notification (dev screen's real test). */
export const CURRENT_BRIEF_KEY = 'assistant.currentBrief';

export type Assistant = {
  brief: Brief;
  context: PaContext;
  /** Cache key of the brief's reworded words (null when the tier's lines speak). */
  phrase: string | null;
};

const AssistantContext = createContext<Assistant | null>(null);

/** Whole days from one day key to another. */
const daysBetween = (from: string, to: string) =>
  Math.round((dayStart(to, 12).getTime() - dayStart(from, 12).getTime()) / 86_400_000);

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

/** The last seven days' average overall score (today included) and the seven before it. */
function weekStats(rows: { day: string; overall: number | null }[], day: string): WeekStats | null {
  const cut = addDays(day, -6);
  const scored = rows.filter((r): r is { day: string; overall: number } => r.overall != null);
  const week = scored.filter((r) => r.day >= cut).map((r) => r.overall);
  const prev = scored.filter((r) => r.day < cut).map((r) => r.overall);
  if (!week.length) return null;
  return { days: week.length, avg: mean(week), prevAvg: prev.length >= 3 ? mean(prev) : null };
}

const num = (v: string | number | null | undefined) => (v == null ? null : Number(v));

export function AssistantProvider({ children }: { children: ReactNode }) {
  const scores = useTodayScores();
  const { day, now, facts } = scores;
  const learned = useLearned();
  const { target } = useHaloTheme();
  useDailyScoreWriter(scores);

  // Learn on launch, on every return to the foreground, and when meals come in.
  // Usage access can change in Settings while Halo is away, so it's re-read on every return.
  const [access, setAccess] = useState<UsageAccess>(usageAccess);
  useEffect(() => {
    const learn = () => {
      noteAppOpen();
      refreshLearned();
      setAccess(usageAccess());
      refreshScreenNights().then(
        () => refreshLearned(),
        () => {},
      );
    };
    learn();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') learn();
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
  // Nights: Health Connect where it has them, the screen's estimate for the rest.
  const { data: hcNights } = useLiveQuery(
    db
      .select({
        day: hcDaily.day,
        start: hcDaily.sleepStart,
        end: hcDaily.sleepEnd,
        minutes: hcDaily.sleepMin,
      })
      .from(hcDaily)
      .where(and(gte(hcDaily.day, addDays(day, -14)), isNotNull(hcDaily.sleepEnd))),
    [day],
  );
  const screenNights = useScreenNights();
  const nightsByDay = new Map<string, { start: number; end: number; hours: number }>();
  for (const n of hcNights) {
    if (n.start == null || n.end == null || n.minutes == null) continue;
    nightsByDay.set(n.day, { start: n.start, end: n.end, hours: n.minutes / 60 });
  }
  for (const n of screenNights) if (!nightsByDay.has(n.day)) nightsByDay.set(n.day, n);
  const nights = [...nightsByDay.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 14)
    .map(([d, n]) => nightShape(n, isWeekend(d)));

  // The last two weeks of daily scores (ids are day keys): this week against the one before.
  const { data: scoreRows } = useLiveQuery(
    db
      .select({ day: dailyScores.id, overall: dailyScores.overall })
      .from(dailyScores)
      .where(and(gte(dailyScores.id, addDays(day, -13)), isNull(dailyScores.deletedAt))),
    [day],
  );
  const [wakeAskDone] = useMMKVBoolean(WAKE_ASK_DONE_KEY, kv);
  // The newest report added, for its one brief while it's new.
  const { factors: bloodFactors } = useLabResults();
  const newestReport = useAddedReports().reduce<{ id: string; createdAt: number } | null>(
    (n, r) => (n == null || r.createdAt > n.createdAt ? r : n),
    null,
  );
  const installed = installDay();

  const weekend = isWeekend(day);
  const lastWeighDay = lastWeigh[0]?.day ?? null;
  const logTimes = [num(lastMeal[0]?.at), num(lastWater[0]?.at)].filter(
    (n): n is number => n != null,
  );
  const prevNightHours = nightsByDay.get(addDays(day, -1))?.hours ?? null;

  const context: PaContext = {
    now: now.getTime(),
    day,
    hour: dayHour(now),
    // Last night from Health Connect, else the screen's estimate (the PA only; scores wait for 18).
    facts: { ...facts, sleepHours: facts.sleepHours ?? nightsByDay.get(day)?.hours ?? null },
    windows: windowsOn(day, learned),
    wake: learned
      ? weekend
        ? learned.wake.weekend
        : learned.wake.weekday
      : { value: 7, source: 'assumed' },
    prevNightHours,
    usualMeals: learned?.usualMeals ?? {},
    weighedToday: lastWeighDay === day,
    lastWeighDay,
    lastLogAt: logTimes.length ? Math.max(...logTimes) : null,
    history: records,
    daysSinceInstall: installed ? daysBetween(installed, day) : 0,
    wakeAsked: !!wakeAskDone,
    week: weekStats(scoreRows, day),
    nights,
    sleepSource: hcNights.length ? 'health' : screenNights.length ? 'screen' : 'none',
    usageAccess: access,
    bloodWork: newestReport
      ? {
          reportId: newestReport.id,
          addedDay: dayKey(new Date(newestReport.createdAt)),
          factors: bloodFactors,
        }
      : null,
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
    wakeAskDone,
    access,
    screenNights.length,
    // Outcomes and back-off read the stored states, so a state change re-plans too.
    records.map((r) => `${r.id}:${r.state}`).join(','),
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
    // The brief as a notification would carry it (dev screen's real test).
    kv.set(
      CURRENT_BRIEF_KEY,
      JSON.stringify({
        insight: {
          id: result.insight.id,
          day,
          type: result.insight.type,
          severity: result.insight.severity,
          reason: result.insight.reason,
          action: result.insight.action,
          expiresAt: result.insight.expiresAt,
        },
        title: result.insight.copy.tagline,
        body: result.insight.copy.line,
      }),
    );
  }, [trace]);

  return <AssistantContext value={{ brief: result, context, phrase }}>{children}</AssistantContext>;
}

export function useAssistant() {
  const ctx = use(AssistantContext);
  if (!ctx) throw new Error('useAssistant must be used inside AssistantProvider');
  return ctx;
}
