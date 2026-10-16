// Blood work as the app reads it: every confirmed report reading (any age, unlike the 14 days the
// Vitals model reads), turned into each test's latest result and the familiar factors.

import { and, desc, eq, isNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { db } from '@/db/client';
import { reports, vitalsReadings } from '@/db/schema';
import { useProfile } from '@/lib/plan';
import { dayKey, labResults, type LabReading, surfaceFactors } from '@/shared';

export function useLabResults() {
  const profile = useProfile();
  const sex = profile?.sex ?? null;
  const { data } = useLiveQuery(
    db
      .select()
      .from(vitalsReadings)
      .where(
        and(
          eq(vitalsReadings.source, 'report'),
          eq(vitalsReadings.confirmed, true),
          isNull(vitalsReadings.deletedAt),
        ),
      ),
  );
  return useMemo(() => {
    const readings: LabReading[] = data.map((r) => ({
      id: r.id,
      metric: r.metric,
      label: r.label,
      value: r.value,
      unit: r.unit,
      qualifier: r.qualifier,
      refLo: r.refLo,
      refHi: r.refHi,
      // Stored at noon of the test date.
      day: dayKey(new Date(r.at)),
      reportId: r.reportId,
    }));
    const results = labResults(readings, sex);
    const counts = new Map<string, number>();
    for (const r of readings)
      if (r.reportId) counts.set(r.reportId, (counts.get(r.reportId) ?? 0) + 1);
    return { results, factors: surfaceFactors(results), counts };
  }, [data, sex]);
}

/** Reports already added, newest first. */
export function useAddedReports() {
  const { data } = useLiveQuery(
    db
      .select({ id: reports.id, reportDate: reports.reportDate, createdAt: reports.createdAt })
      .from(reports)
      .where(and(eq(reports.status, 'confirmed'), isNull(reports.deletedAt)))
      .orderBy(desc(reports.reportDate), desc(reports.createdAt)),
  );
  return data;
}

/** "16 Oct", or "Mar 2025" for another year. */
export function shortDate(day: string, today = dayKey(new Date())): string {
  const d = new Date(`${day}T12:00:00`);
  return day.slice(0, 4) === today.slice(0, 4)
    ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    : d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}
