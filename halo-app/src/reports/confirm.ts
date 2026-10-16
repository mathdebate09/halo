// The confirm step's writes. A report's values count only once the user adds them: each kept value
// becomes a confirmed vital reading (source "report") on its own test date, and the report is
// marked confirmed. Removing a confirmed report takes its readings with it.

import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/db/client';
import { deleteRecord, upsertRecord } from '@/db/mutate';
import { reports, vitalsReadings } from '@/db/schema';
import { dayKey, dayStart, type ReportValue } from '@/shared';

/** A value as the user left it on the confirm screen. */
export type KeptValue = ReportValue & { date: string };

/** Same test, same day, same value already stored (another PDF of the same visit). */
function alreadyThere(v: KeptValue): boolean {
  const day = dayStart(v.date, 12).getTime();
  return db
    .select({ at: vitalsReadings.at, value: vitalsReadings.value })
    .from(vitalsReadings)
    .where(and(eq(vitalsReadings.metric, v.metric), isNull(vitalsReadings.deletedAt)))
    .all()
    .some(
      (r) => dayKey(new Date(r.at)) === dayKey(new Date(day)) && Math.abs(r.value - v.value) < 1e-6,
    );
}

/** Writes the kept values and marks the report confirmed. Returns how many were added. */
export function confirmReport(reportId: string, kept: readonly KeptValue[]): number {
  const report = db.select().from(reports).where(eq(reports.id, reportId)).get();
  if (!report || report.deletedAt != null || report.status !== 'review') return 0;
  let added = 0;
  for (const v of kept) {
    if (alreadyThere(v)) continue;
    upsertRecord('vitalReading', {
      metric: v.metric,
      value: v.value,
      unit: v.unit ?? '',
      // Midday of the test date, so it lands on that day whatever the time zone of the read.
      at: dayStart(v.date, 12).getTime(),
      source: 'report',
      reportId,
      confirmed: true,
      label: v.label,
      qualifier: v.qualifier,
      refLo: v.refLo,
      refHi: v.refHi,
      refText: v.refText,
      raw: v.raw,
    });
    added++;
  }
  const dates = kept.map((v) => v.date).sort();
  const { createdAt: _c, updatedAt: _u, deletedAt: _d, syncState: _s, ...fields } = report;
  upsertRecord('report', {
    ...fields,
    status: 'confirmed',
    // The most recent test date names the report; the values themselves are readings now.
    reportDate: dates.at(-1) ?? report.reportDate,
    extracted: null,
    error: null,
  });
  return added;
}

/** Deletes a confirmed report and every reading it added. */
export function removeReport(reportId: string) {
  const readings = db
    .select({ id: vitalsReadings.id })
    .from(vitalsReadings)
    .where(and(eq(vitalsReadings.reportId, reportId), isNull(vitalsReadings.deletedAt)))
    .all();
  for (const r of readings) deleteRecord('vitalReading', r.id);
  deleteRecord('report', reportId);
}
