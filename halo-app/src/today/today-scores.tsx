// Live Today scores from the local store (SQLite logs + the MMKV plan) through halo-shared
// scoring. Mounted once around the tabs so the hero tier stays current on every tab.

import { and, count, desc, eq, gte, isNull, sum } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { createContext, type ReactNode, use, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useMMKVNumber } from 'react-native-mmkv';

import { useLearned, windowsOn } from '@/assistant/learned';
import { db } from '@/db/client';
import { hcDaily, meals, water } from '@/db/schema';
import { useClock24 } from '@/lib/clock';
import { refreshHealthData } from '@/lib/health-connect';
import { kv } from '@/lib/kv';
import { usePlan, useProfile } from '@/lib/plan';
import {
  activeKcalGoalFor,
  activityScore,
  addDays,
  dayKey,
  type DayFacts,
  dietScore,
  expectedDayFraction,
  expectedIntakeFraction,
  EXERCISE_GOAL_MIN,
  dayHour,
  overallScore,
  type Score,
  stepGoalFor,
  vitalsScore,
  waterScore,
} from '@/shared';
import { useHaloTheme } from '@/theme/theme-provider';

import { decideDayTier, readDayTier, themeIdFor, writeDayTier } from './tier';

/** Dev-screen override for the overall score (tests tiers without logging meals). */
export const DEV_SCORE_OVERRIDE_KEY = 'dev.scoreOverride';

export type TodayScores = {
  day: string;
  now: Date;
  diet: Score;
  activity: Score;
  vitals: Score;
  /** 0-100, always present. */
  overall: number;
  /** 0-100 once water has ever been logged, otherwise null (not rated yet). */
  water: number | null;
  /** Fewer than two components backed by real data: shown, but never moves the tier. */
  provisional: boolean;
  /** Today's logged intake against where it should be by now (meal reactions). */
  intake: { kcal: number; proteinG: number; expectedKcal: number; expectedProteinG: number };
  /** Everything Learn more's summary and panels are built from. */
  facts: DayFacts;
};

const TodayContext = createContext<TodayScores | null>(null);

/** Wall clock that ticks every minute and on return to the foreground (time-aware scores). */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      setNow(new Date());
      refreshHealthData();
    });
    refreshHealthData();
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);
  return now;
}

const num = (v: string | number | null | undefined) => (v == null ? 0 : Number(v));
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const VITALS_MAX_AGE_DAYS = 7;

type HcRow = typeof hcDaily.$inferSelect;

/** The most recent non-null value of a column within the last week (rows newest first). */
function latest<K extends keyof HcRow>(rows: HcRow[], key: K, since: string): HcRow[K] | null {
  for (const r of rows) {
    if (r.day < since) break;
    if (r[key] != null) return r[key];
  }
  return null;
}

export function TodayScoresProvider({ children }: { children: ReactNode }) {
  const now = useNow();
  const day = dayKey(now);
  const plan = usePlan();
  const profile = useProfile();
  const { setThemeId } = useHaloTheme();
  const [override] = useMMKVNumber(DEV_SCORE_OVERRIDE_KEY, kv);
  const clock24 = useClock24();
  // The user's own meal times (weekday or weekend) once learned, else the defaults.
  const windows = windowsOn(day, useLearned());

  const { data: mealRows } = useLiveQuery(
    db
      .select({
        mealType: meals.mealType,
        eatenAt: meals.eatenAt,
        kcal: meals.kcal,
        proteinG: meals.proteinG,
        carbsG: meals.carbsG,
        fatG: meals.fatG,
      })
      .from(meals)
      .where(and(eq(meals.day, day), eq(meals.status, 'logged'), isNull(meals.deletedAt))),
    [day],
  );
  const { data: waterRows } = useLiveQuery(
    db
      .select({ ml: sum(water.ml) })
      .from(water)
      .where(and(eq(water.day, day), isNull(water.deletedAt))),
    [day],
  );
  const { data: waterEver } = useLiveQuery(
    db.select({ n: count() }).from(water).where(isNull(water.deletedAt)),
  );
  // Newest first: today, then the last two weeks (activity history, HRV baseline).
  const { data: hcRows } = useLiveQuery(
    db
      .select()
      .from(hcDaily)
      .where(gte(hcDaily.day, addDays(day, -14)))
      .orderBy(desc(hcDaily.day)),
    [day],
  );

  // Hours carry on past midnight until the 4 am rollover (00:30 is 24.5 of the same day).
  const hour = dayHour(now);

  const targetKcal = plan?.targetKcal ?? 2000;
  const targetProteinG = plan?.proteinG ?? 100;
  // Once a meal is in, "by now" is at least a breakfast's share (matches dietScore's floor).
  const due = Math.max(expectedIntakeFraction(hour, windows), mealRows.length ? 0.25 : 0);

  const diet = dietScore({
    meals: mealRows.map((m) => ({
      mealType: m.mealType,
      hour: dayHour(new Date(m.eatenAt)),
      kcal: num(m.kcal),
      proteinG: num(m.proteinG),
      carbsG: num(m.carbsG),
      fatG: num(m.fatG),
    })),
    targets: {
      kcal: targetKcal,
      proteinG: targetProteinG,
      carbsG: plan?.carbsG ?? 250,
      fatG: plan?.fatG ?? 65,
    },
    hour,
    windows,
  });

  const todayRow = hcRows.find((r) => r.day === day);
  const recent = hcRows.filter((r) => r.day < day).slice(0, 7);
  const recentSteps = recent.map((r) => r.steps).filter((n): n is number => n != null);
  const stepGoal = stepGoalFor(recentSteps.length >= 3 ? mean(recentSteps) : null);
  const activity = activityScore({
    hour,
    today: todayRow ?? {},
    recent,
    goals: {
      steps: stepGoal,
      activeKcal: plan ? activeKcalGoalFor(plan.bmr, plan.tdee) : 300,
      exerciseMin: EXERCISE_GOAL_MIN,
    },
  });

  const since = addDays(day, -VITALS_MAX_AGE_DAYS);
  const hrvValues = hcRows.map((r) => r.hrvMs).filter((n): n is number => n != null);
  const vitals = vitalsScore({
    sleepHours: todayRow?.sleepMin == null ? null : todayRow.sleepMin / 60,
    restingHr: latest(hcRows, 'restingHr', since),
    hrvMs: latest(hcRows, 'hrvMs', since),
    hrvBaselineMs: hrvValues.length >= 4 ? mean(hrvValues.slice(1)) : null,
    spo2: latest(hcRows, 'spo2', since),
    systolic: latest(hcRows, 'systolic', since),
    diastolic: latest(hcRows, 'diastolic', since),
    glucoseMgDl: latest(hcRows, 'glucoseMgDl', since),
  });

  const waterValue = plan
    ? waterScore(num(waterRows[0]?.ml), plan.waterMl, hour, (waterEver[0]?.n ?? 0) > 0)
    : null;

  const result = overallScore({ diet, activity, vitals, water: waterValue });
  const rated = override ?? (result.provisional ? null : result.value);
  const overall = override ?? result.value;

  // Tier decisions: a new day, or a rated score clearing the hysteresis. Provisional never moves it.
  useEffect(() => {
    const next = decideDayTier(readDayTier(), rated, now);
    if (!next) return;
    writeDayTier(next);
    setThemeId(themeIdFor(next));
  }, [rated, now, setThemeId]);

  const value: TodayScores = {
    day,
    now,
    diet,
    activity,
    vitals,
    overall,
    water: waterValue,
    provisional: rated == null,
    facts: {
      hour,
      goal: profile?.goal ?? 'maintain',
      mealsLogged: mealRows.length,
      loggedTypes: [...new Set(mealRows.map((m) => m.mealType))],
      intake: {
        kcal: mealRows.reduce((a, m) => a + num(m.kcal), 0),
        proteinG: mealRows.reduce((a, m) => a + num(m.proteinG), 0),
        carbsG: mealRows.reduce((a, m) => a + num(m.carbsG), 0),
        fatG: mealRows.reduce((a, m) => a + num(m.fatG), 0),
      },
      targets: {
        kcal: targetKcal,
        proteinG: targetProteinG,
        carbsG: plan?.carbsG ?? 250,
        fatG: plan?.fatG ?? 65,
        waterMl: plan?.waterMl ?? 2500,
        steps: stepGoal,
      },
      due,
      dayFraction: expectedDayFraction(hour),
      waterMl: num(waterRows[0]?.ml),
      steps: todayRow?.steps ?? null,
      sleepHours: todayRow?.sleepMin == null ? null : todayRow.sleepMin / 60,
      sleepNeedHours: 7.5,
      dietScore: diet.value,
      clock24,
    },
    intake: {
      kcal: mealRows.reduce((a, m) => a + num(m.kcal), 0),
      proteinG: mealRows.reduce((a, m) => a + num(m.proteinG), 0),
      expectedKcal: targetKcal * due,
      expectedProteinG: targetProteinG * due,
    },
  };
  return <TodayContext value={value}>{children}</TodayContext>;
}

export function useTodayScores() {
  const ctx = use(TodayContext);
  if (!ctx) throw new Error('useTodayScores must be used inside TodayScoresProvider');
  return ctx;
}
