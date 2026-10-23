import { desc, gte } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { db } from '@/db/client';
import { hcDaily } from '@/db/schema';
import {
  healthConnectState,
  type HealthConnectState,
  type HourlyActivity,
  readHourly,
  refreshHealthData,
  useExerciseSessions,
} from '@/lib/health-connect';
import { addDays } from '@/shared';

/**
 * Everything Activity Analysis reads, kept apart from how it's drawn: Health Connect access, the
 * last week of hc_daily rows, recent sessions, and the selected day's hours (read on demand).
 */
export function useActivity(selected: string, today: string) {
  const sessions = useExerciseSessions();
  const [state, setState] = useState<HealthConnectState | null>(null);
  const [hourly, setHourly] = useState<{ day: string; data: HourlyActivity | null } | null>(null);

  // Re-check access and pull fresh numbers whenever the tab comes into view.
  useFocusEffect(
    useCallback(() => {
      healthConnectState().then(setState);
      refreshHealthData();
    }, []),
  );
  // The selected day's hours, read on demand (the bars wait; the rest of the page doesn't).
  useEffect(() => {
    if (state !== 'connected') return;
    let live = true;
    readHourly(selected).then((data) => {
      if (live) setHourly({ day: selected, data });
    });
    return () => {
      live = false;
    };
  }, [selected, state]);

  const { data: rows } = useLiveQuery(
    db
      .select()
      .from(hcDaily)
      .where(gte(hcDaily.day, addDays(today, -6)))
      .orderBy(desc(hcDaily.day)),
    [today],
  );

  const onConnected = () => {
    healthConnectState().then(setState);
    refreshHealthData(true);
  };

  return {
    state,
    onConnected,
    rows,
    sessions,
    hours: hourly?.day === selected ? (hourly.data ?? null) : null,
  };
}
