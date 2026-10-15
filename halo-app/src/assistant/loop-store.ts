// The assistant's memory of what reached the user: one synced `insights` row per brief per day,
// moved through shown → acted / resolved / ignored (SPEC §4 "Loop closure"). Writes happen only
// on a change of state, so a day produces a handful of rows.

import { and, desc, eq, gte, isNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/db/client';
import { upsertRecord } from '@/db/mutate';
import { insights } from '@/db/schema';
import {
  addDays,
  type Insight,
  type InsightChannel,
  type InsightRecord,
  type Transition,
} from '@/shared';

const HISTORY_DAYS = 14;

type Row = typeof insights.$inferSelect;

const toRecord = (r: Row): InsightRecord => ({
  id: r.id,
  day: r.day,
  type: r.type as InsightRecord['type'],
  state: r.state,
  severity: r.severity,
  shownAt: r.shownAt,
  actedAt: r.actedAt,
  resolvedAt: r.resolvedAt,
  expiresAt: r.expiresAt,
});

/** The last two weeks of stored insights, live. */
export function useInsightHistory(day: string): { rows: Row[]; records: InsightRecord[] } {
  const { data } = useLiveQuery(
    db
      .select()
      .from(insights)
      .where(and(gte(insights.day, addDays(day, -HISTORY_DAYS)), isNull(insights.deletedAt)))
      .orderBy(desc(insights.day)),
    [day],
  );
  return { rows: data, records: data.map(toRecord) };
}

const findRow = (id: string) => db.select().from(insights).where(eq(insights.id, id)).get();

/** The first time a brief reaches the user. Later sightings don't write again. */
export function recordShown(insight: Insight, day: string, channel: InsightChannel) {
  if (insight.type === 'on_track') return;
  if (findRow(insight.id)) return;
  upsertRecord('insight', {
    id: insight.id,
    day,
    type: insight.type,
    severity: Math.round(insight.severity),
    reason: insight.reason,
    action: insight.action,
    expiresAt: insight.expiresAt,
    state: 'shown',
    channel,
    shownAt: Date.now(),
  });
}

function writeState(row: Row, patch: Partial<Row>) {
  const { id, createdAt, updatedAt, deletedAt, syncState, ...fields } = row;
  upsertRecord('insight', { ...fields, ...patch, id });
}

/** The user took the prepared step (a Next tap, a notification action). */
export function markActed(id: string) {
  const row = findRow(id);
  if (!row || row.state === 'acted' || row.state === 'resolved') return;
  writeState(row, { state: 'acted', actedAt: Date.now() });
}

/** Applies the loop's transitions (resolved, ignored) to the stored rows. */
export function applyTransitions(list: readonly Transition[]) {
  for (const t of list) {
    const row = findRow(t.id);
    if (!row || row.state === t.state) continue;
    writeState(row, {
      state: t.state,
      ...(t.state === 'resolved' ? { resolvedAt: t.at } : {}),
    });
  }
}
