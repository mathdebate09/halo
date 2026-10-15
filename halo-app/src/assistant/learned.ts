// What Halo has learned about the user (meal windows, usual meals, wake time), recomputed from
// local history on launch, on foreground and after meals are logged, and kept in MMKV so scoring
// and the assistant read it synchronously.

import { and, desc, eq, gte, isNotNull, isNull } from 'drizzle-orm';
import { useMemo } from 'react';
import { useMMKVString } from 'react-native-mmkv';

import { db } from '@/db/client';
import { hcDaily, meals } from '@/db/schema';
import { kv } from '@/lib/kv';
import {
  addDays,
  dayKey,
  dayStart,
  DEFAULT_MEAL_WINDOWS,
  hourOfDay,
  type Learned,
  learnMealWindows,
  type LearnedWindows,
  learnWake,
  type MealType,
  type MealWindows,
  usualMeals,
  type WakeSample,
} from '@/shared';

import { readScreenNights } from './screen';

const LEARNED_KEY = 'assistant.learned';
const FIRST_OPENS_KEY = 'assistant.firstOpens';
/** The user's answer to the day-3 wake-time ask (chunk 17b), as an hour. */
export const WAKE_ASKED_KEY = 'assistant.wakeAsked';
/** Set once the wake-time ask is answered or waved off: it's asked only once. */
export const WAKE_ASK_DONE_KEY = 'assistant.wakeAskDone';
const INSTALL_DAY_KEY = 'assistant.installDay';

const LOOKBACK_DAYS = 28;
const FIRST_OPENS_KEPT = 14;

export type LearnedState = {
  windows: LearnedWindows;
  usualMeals: Partial<Record<MealType, string>>;
  wake: { weekday: Learned<number>; weekend: Learned<number> };
  updatedAt: number;
};

/** Saturday and Sunday (by day key, so a 1 am Saturday snack is still Friday). */
export function isWeekend(day: string) {
  const weekday = dayStart(day).getDay();
  return weekday === 0 || weekday === 6;
}

function readJson<T>(key: string): T | null {
  const raw = kv.getString(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Records the day's first app open (a wake-time estimate until Health Connect or the user says
 * otherwise) and the install day. Called on launch and on every return to the foreground.
 */
export function noteAppOpen(now = new Date()) {
  const day = dayKey(now);
  if (!kv.getString(INSTALL_DAY_KEY)) kv.set(INSTALL_DAY_KEY, day);
  const opens = readJson<{ day: string; hour: number }[]>(FIRST_OPENS_KEY) ?? [];
  if (opens[0]?.day === day) return;
  const hour = hourOfDay(now);
  kv.set(FIRST_OPENS_KEY, JSON.stringify([{ day, hour }, ...opens].slice(0, FIRST_OPENS_KEPT)));
}

export const installDay = () => kv.getString(INSTALL_DAY_KEY) ?? null;

/** Re-learns everything from local history (synchronous: a few dozen rows). */
export function refreshLearned(now = new Date()) {
  const day = dayKey(now);
  const mealRows = db
    .select({
      mealType: meals.mealType,
      eatenAt: meals.eatenAt,
      title: meals.title,
      day: meals.day,
    })
    .from(meals)
    .where(
      and(
        eq(meals.status, 'logged'),
        isNull(meals.deletedAt),
        gte(meals.day, addDays(day, -LOOKBACK_DAYS)),
      ),
    )
    .orderBy(desc(meals.eatenAt))
    .all();
  const samples = mealRows.map((m) => ({
    mealType: m.mealType,
    hour: hourOfDay(new Date(m.eatenAt)),
    weekend: isWeekend(m.day),
    title: m.title,
  }));

  const nights = db
    .select({ day: hcDaily.day, sleepEnd: hcDaily.sleepEnd })
    .from(hcDaily)
    .where(and(isNotNull(hcDaily.sleepEnd), gte(hcDaily.day, addDays(day, -14))))
    .orderBy(desc(hcDaily.day))
    .all();
  const measured: WakeSample[] = nights.map((n) => ({
    hour: hourOfDay(new Date(n.sleepEnd!)),
    weekend: isWeekend(n.day),
  }));
  const firstOpens: WakeSample[] = (
    readJson<{ day: string; hour: number }[]>(FIRST_OPENS_KEY) ?? []
  ).map((o) => ({ hour: o.hour, weekend: isWeekend(o.day) }));
  const screen: WakeSample[] = readScreenNights().map((n) => ({
    hour: hourOfDay(new Date(n.end)),
    weekend: isWeekend(n.day),
  }));
  const asked = kv.getNumber(WAKE_ASKED_KEY) ?? null;
  const wakeInput = { measured, screen, asked, firstOpens };

  const state: LearnedState = {
    windows: learnMealWindows(samples),
    usualMeals: usualMeals(samples),
    wake: { weekday: learnWake(wakeInput, false), weekend: learnWake(wakeInput, true) },
    updatedAt: now.getTime(),
  };
  kv.set(LEARNED_KEY, JSON.stringify(state));
}

export const readLearned = () => readJson<LearnedState>(LEARNED_KEY);

/** The meal windows that apply on a day: learned (weekday or weekend) or the defaults. */
export function windowsOn(day: string, learned: LearnedState | null = readLearned()): MealWindows {
  if (!learned) return DEFAULT_MEAL_WINDOWS;
  return isWeekend(day) ? learned.windows.weekend : learned.windows.weekday;
}

/** Live learned state (re-renders when it's recomputed). */
export function useLearned(): LearnedState | null {
  const [raw] = useMMKVString(LEARNED_KEY, kv);
  return useMemo(() => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as LearnedState;
    } catch {
      return null;
    }
  }, [raw]);
}
