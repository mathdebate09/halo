// A read report's writes. Its values go straight into Vitals: each becomes a confirmed reading
// (source "report") on the date the report printed for it. A wrong number is fixed afterwards on
// the report's own screen; removing a report takes its readings with it.

import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/db/client';
import { deleteRecord, upsertRecord } from '@/db/mutate';
import { vitalsReadings } from '@/db/schema';
import { dayKey, dayStart, type ReportValue } from '@/shared';

/** A value with the date it lands on. */
export type DatedValue = ReportValue & { date: string };

/** Same test, same day, same value already stored (another PDF of the same visit). */
function alreadyThere(v: DatedValue): boolean {
  const day = dayKey(dayStart(v.date, 12));
  return db
    .select({ at: vitalsReadings.at, value: vitalsReadings.value })
    .from(vitalsReadings)
    .where(and(eq(vitalsReadings.metric, v.metric), isNull(vitalsReadings.deletedAt)))
    .all()
    .some((r) => dayKey(new Date(r.at)) === day && Math.abs(r.value - v.value) < 1e-6);
}

/** Writes a report's values as readings; returns how many were new. */
export function writeValues(reportId: string, values: readonly DatedValue[]): number {
  let added = 0;
  for (const v of values) {
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
  return added;
}

/** A number the report was read wrong on, fixed by the user (in the stored unit). */
export function fixReading(id: string, value: number) {
  const row = db.select().from(vitalsReadings).where(eq(vitalsReadings.id, id)).get();
  if (!row || row.deletedAt != null) return;
  const { createdAt: _c, updatedAt: _u, deletedAt: _d, syncState: _s, ...fields } = row;
  upsertRecord('vitalReading', {
    ...fields,
    value,
    qualifier: null,
    raw: [String(value), row.unit].filter(Boolean).join(' '),
  });
}

/** Deletes a report and every reading it added. */
export function removeReport(reportId: string) {
  const readings = db
    .select({ id: vitalsReadings.id })
    .from(vitalsReadings)
    .where(and(eq(vitalsReadings.reportId, reportId), isNull(vitalsReadings.deletedAt)))
    .all();
  for (const r of readings) deleteRecord('vitalReading', r.id);
  deleteRecord('report', reportId);
}
