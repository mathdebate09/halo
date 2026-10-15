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

/** What a scheduled notification remembers about its brief (it outlives the render). */
export type NotifiedInsight = Pick<
  Insight,
  'id' | 'type' | 'severity' | 'reason' | 'action' | 'expiresAt'
> & { day: string };

/**
 * A delivered notification's outcome: acted (tapped or an action button), pending (still unseen
 * in the tray, i.e. missed) or ignored (swiped away). Creates the row if the brief never showed in
 * the app; never downgrades a row that's already further along.
 */
export function recordNotification(
  meta: NotifiedInsight,
  state: 'acted' | 'pending' | 'ignored',
  at: number,
  notificationId: string,
) {
  const row = findRow(meta.id);
  if (!row) {
    upsertRecord('insight', {
      id: meta.id,
      day: meta.day,
      type: meta.type,
      severity: Math.round(meta.severity),
      reason: meta.reason,
      action: meta.action,
      expiresAt: meta.expiresAt,
      state,
      channel: 'notification',
      shownAt: at,
      notificationId,
      ...(state === 'acted' ? { actedAt: at } : {}),
    });
    return;
  }
  if (row.state === 'resolved' || row.state === 'acted') return;
  if (state === 'pending' && row.state === 'shown') return; // already seen in the app
  writeState(row, {
    state,
    notificationId,
    ...(state === 'acted' ? { actedAt: at } : {}),
  });
}

/** The stored state of an insight, if it has a row. */
export const stateOf = (id: string) => findRow(id)?.state ?? null;

/** Dev screen, test phase: puts briefs back to how they were before a test tapped them. */
export function revertActed(ids: readonly string[], state: 'ignored' | 'shown') {
  for (const id of ids) {
    const row = findRow(id);
    if (row?.state === 'acted') writeState(row, { state, actedAt: null });
  }
}
