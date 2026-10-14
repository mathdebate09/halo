// Optimistic local writes. Each write lands in SQLite immediately (the UI reacts through live
// queries) and appends an outbox op for the sync worker, in one transaction.

import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';

import { notifyOutboxChanged } from '@/sync/signal';

import { db } from './client';
import {
  advisorMessages,
  dailyScores,
  insights,
  mealItems,
  meals,
  outbox,
  reports,
  vitalsReadings,
  water,
  weights,
} from './schema';

/** Entity names as they appear in sync ops and on the server. */
export const syncedTables = {
  meal: meals,
  mealItem: mealItems,
  water,
  weight: weights,
  vitalReading: vitalsReadings,
  report: reports,
  insight: insights,
  dailyScore: dailyScores,
  advisorMessage: advisorMessages,
} as const;

export type SyncedEntity = keyof typeof syncedTables;
type Table<E extends SyncedEntity> = (typeof syncedTables)[E];
type SyncColumns = 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'syncState';
export type RecordFields<E extends SyncedEntity> = Omit<Table<E>['$inferInsert'], SyncColumns> & {
  id?: string;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function enqueue(
  tx: Tx,
  entity: SyncedEntity,
  entityId: string,
  op: 'upsert' | 'delete',
  payload: unknown,
  now: number,
) {
  // Collapse unsent ops for the same record: only the latest state needs to reach the server.
  tx.delete(outbox)
    .where(and(eq(outbox.entity, entity), eq(outbox.entityId, entityId), eq(outbox.attempts, 0)))
    .run();
  tx.insert(outbox)
    .values({
      opId: randomUUID(),
      entity,
      entityId,
      op,
      payload,
      updatedAt: now,
      nextAttemptAt: now,
    })
    .run();
}

/** Creates or updates a synced record. Returns its id. */
export function upsertRecord<E extends SyncedEntity>(entity: E, fields: RecordFields<E>): string {
  // Drizzle can't narrow a union of tables generically; the public signature carries the types.
  const table = syncedTables[entity] as typeof meals;
  const now = Date.now();
  const id = fields.id ?? randomUUID();
  db.transaction((tx) => {
    const existing = tx
      .select({ createdAt: table.createdAt })
      .from(table)
      .where(eq(table.id, id))
      .get();
    const row = {
      ...(fields as object),
      id,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
      syncState: 'pending' as const,
    } as typeof meals.$inferInsert;
    tx.insert(table).values(row).onConflictDoUpdate({ target: table.id, set: row }).run();
    enqueue(tx, entity, id, 'upsert', row, now);
  });
  notifyOutboxChanged();
  return id;
}

/** Tombstones a synced record (kept until the server has the delete). */
export function deleteRecord(entity: SyncedEntity, id: string) {
  const table = syncedTables[entity] as typeof meals;
  const now = Date.now();
  db.transaction((tx) => {
    tx.update(table)
      .set({ deletedAt: now, updatedAt: now, syncState: 'pending' })
      .where(eq(table.id, id))
      .run();
    enqueue(tx, entity, id, 'delete', { id, deletedAt: now }, now);
  });
  notifyOutboxChanged();
}
