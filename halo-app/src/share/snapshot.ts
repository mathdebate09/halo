// The day as it was when the share icon was tapped. The composer lives outside the tabs (no dock),
// so it can't read TodayScoresProvider; Today hands it this frozen copy instead. A shared card is a
// moment, so it shouldn't shift under the user while they arrange it.

import { and, asc, count, eq, gte, isNull, lte } from 'drizzle-orm';

import { db } from '@/db/client';
import { meals } from '@/db/schema';
import { addDays, type DayFacts, type MealType } from '@/shared';
import { type Theme } from '@/theme/themes';
import type { TodayScores } from '@/today/today-scores';

export type ShareMeal = { title: string; mealType: MealType; kcal: number };

export type ShareSnapshot = {
  day: string;
  now: Date;
  overall: number;
  provisional: boolean;
  facts: DayFacts;
  tagline: string;
  theme: Theme;
  /** Today's logged meals, oldest first (the receipt's lines). */
  meals: ShareMeal[];
  /** Monday → Sunday of this week: whether any meal was logged that day (null = still to come). */
  week: { day: string; logged: boolean | null }[];
};

let current: ShareSnapshot | null = null;

/** Monday of the week holding `day` (a dayKey). */
function mondayOf(day: string) {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const weekday = (new Date(y, m - 1, d, 12).getDay() + 6) % 7; // Monday = 0
  return addDays(day, -weekday);
}

export function setShareSnapshot(scores: TodayScores, tagline: string, theme: Theme) {
  const logged = and(eq(meals.status, 'logged'), isNull(meals.deletedAt));
  // Small, local reads (a day's meals, a week's counts): synchronous, so the card never waits.
  const today = db
    .select({ title: meals.title, mealType: meals.mealType, kcal: meals.kcal })
    .from(meals)
    .where(and(eq(meals.day, scores.day), logged))
    .orderBy(asc(meals.eatenAt))
    .all();
  const monday = mondayOf(scores.day);
  const sunday = addDays(monday, 6);
  const counts = db
    .select({ day: meals.day, n: count() })
    .from(meals)
    .where(and(gte(meals.day, monday), lte(meals.day, sunday), logged))
    .groupBy(meals.day)
    .all();
  const loggedDays = new Set(counts.filter((c) => c.n > 0).map((c) => c.day));

  current = {
    day: scores.day,
    now: scores.now,
    overall: scores.overall,
    provisional: scores.provisional,
    facts: scores.facts,
    tagline,
    theme,
    meals: today.map((m) => ({
      title: m.title?.trim() || m.mealType,
      mealType: m.mealType,
      kcal: m.kcal ?? 0,
    })),
    week: Array.from({ length: 7 }, (_, i) => {
      const day = addDays(monday, i);
      return { day, logged: day > scores.day ? null : loggedDays.has(day) };
    }),
  };
}

/** Set before /share opens; null only if the route was reached some other way (dev reload). */
export function shareSnapshot(): ShareSnapshot | null {
  return current;
}
