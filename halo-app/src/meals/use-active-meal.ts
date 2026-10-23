import { and, asc, desc, eq, gte, inArray, isNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { db } from '@/db/client';
import { mealItems, meals } from '@/db/schema';

/** A pending meal this recent is picked back up when the logger opens. */
const RESUME_WITHIN_MS = 12 * 3600 * 1000;

export type LoggerMode = 'capture' | 'analysing' | 'result';

/**
 * The meal the logger's card is showing, if any: picked from Today's card (the `meal` param),
 * resumed when a recent one is still in flight, or set by the logger after a send. The card's
 * mode follows from it.
 */
export function useActiveMeal(focused: boolean) {
  const params = useLocalSearchParams<{ meal?: string }>();
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data: activeRows } = useLiveQuery(
    db
      .select()
      .from(meals)
      .where(and(eq(meals.id, activeId ?? ''), isNull(meals.deletedAt))),
    [activeId],
  );
  const { data: items } = useLiveQuery(
    db
      .select()
      .from(mealItems)
      .where(and(eq(mealItems.mealId, activeId ?? ''), isNull(mealItems.deletedAt)))
      .orderBy(asc(mealItems.createdAt)),
    [activeId],
  );
  const meal = activeId ? activeRows[0] : undefined;
  const mode: LoggerMode = !meal ? 'capture' : meal.status === 'analysing' ? 'analysing' : 'result';

  // Opened from Today's card: show that meal in the card.
  useEffect(() => {
    if (!params.meal) return;
    setActiveId(params.meal);
    router.setParams({ meal: undefined });
  }, [params.meal]);

  // Coming back to the logger with a meal still in flight (or waiting for review): resume it.
  useEffect(() => {
    if (!focused || activeId) return;
    const pending = db
      .select({ id: meals.id })
      .from(meals)
      .where(
        and(
          inArray(meals.status, ['analysing', 'draft', 'failed']),
          isNull(meals.deletedAt),
          gte(meals.createdAt, Date.now() - RESUME_WITHIN_MS),
        ),
      )
      .orderBy(desc(meals.createdAt))
      .limit(1)
      .get();
    if (pending) setActiveId(pending.id);
  }, [focused, activeId]);

  return { activeId, setActiveId, meal, items, mode };
}
