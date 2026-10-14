// Background sync: register → push outbox → pull changes. The UI never waits on any of it.

import NetInfo from '@react-native-community/netinfo';
import { and, asc, eq, inArray, lte, ne } from 'drizzle-orm';
import { AppState, Platform } from 'react-native';

import { db } from '@/db/client';
import { syncedTables } from '@/db/mutate';
import { kvTable, outbox } from '@/db/schema';
import { getDevice } from '@/lib/device';
import {
  MAX_PUSH_OPS,
  type OpStatus,
  type PullResult,
  type PushResult,
  type SyncEntity,
  type SyncOp,
} from '@/shared';

import { api, ApiError } from './api';
import { onOutboxChanged } from './signal';
import { setSyncStatus } from './status';

const CURSOR_KEY = 'sync.cursor';
const WRITE_DEBOUNCE_MS = 1_000;
const BACKOFF_BASE_MS = 2_000;
const BACKOFF_MAX_MS = 5 * 60_000;

/** Exponential backoff with ±50 % jitter, capped at 5 minutes. */
const backoff = (attempts: number) =>
  Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempts) * (0.5 + Math.random());

let running: Promise<void> | null = null;
let rerun = false;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Runs a sync after `delayMs`; later requests reset the timer (debounce). */
export function requestSync(delayMs = 0) {
  clearTimeout(timer);
  timer = setTimeout(() => void runSync(), delayMs);
}

/** One sync at a time; a request during a run queues exactly one more. */
export function runSync(): Promise<void> {
  if (running) {
    rerun = true;
    return running;
  }
  running = syncOnce().finally(() => {
    running = null;
    if (rerun) {
      rerun = false;
      requestSync(0);
    }
  });
  return running;
}

async function syncOnce() {
  if (!getDevice()) return;
  setSyncStatus({ state: 'syncing' });
  try {
    await registerIfNeeded();
    const lastPushed = await pushAll();
    const lastPulled = await pullAll();
    setSyncStatus({
      state: 'idle',
      lastSyncAt: Date.now(),
      lastError: null,
      lastPushed,
      lastPulled,
    });
  } catch (error) {
    const offline = !(error instanceof ApiError);
    setSyncStatus({ state: offline ? 'offline' : 'error', lastError: String(error) });
    scheduleRetry();
  }
}

/** Wakes at the earliest op that is waiting out its backoff. */
function scheduleRetry() {
  const next = db
    .select({ at: outbox.nextAttemptAt })
    .from(outbox)
    .orderBy(asc(outbox.nextAttemptAt))
    .limit(1)
    .get();
  requestSync(Math.max(BACKOFF_BASE_MS, (next?.at ?? Date.now() + BACKOFF_BASE_MS) - Date.now()));
}

function deferOps(seqs: number[], error: unknown) {
  if (!seqs.length) return;
  const rows = db.select().from(outbox).where(inArray(outbox.seq, seqs)).all();
  const now = Date.now();
  db.transaction((tx) => {
    for (const row of rows) {
      tx.update(outbox)
        .set({
          attempts: row.attempts + 1,
          nextAttemptAt: now + backoff(row.attempts),
          lastError: String(error),
        })
        .where(eq(outbox.seq, row.seq))
        .run();
    }
  });
}

async function registerIfNeeded() {
  const ops = db.select().from(outbox).where(eq(outbox.op, 'register')).all();
  if (!ops.length) return;
  try {
    await api('/device/register', { method: 'POST', body: { platform: Platform.OS } });
  } catch (error) {
    deferOps(
      ops.map((o) => o.seq),
      error,
    );
    throw error;
  }
  db.delete(outbox).where(eq(outbox.op, 'register')).run();
}

/** Pushes every due op in order, batch by batch. Returns how many were sent. */
async function pushAll(): Promise<number> {
  let sent = 0;
  for (;;) {
    const batch = db
      .select()
      .from(outbox)
      .where(and(ne(outbox.op, 'register'), lte(outbox.nextAttemptAt, Date.now())))
      .orderBy(asc(outbox.seq))
      .limit(MAX_PUSH_OPS)
      .all();
    if (!batch.length) return sent;

    const ops: SyncOp[] = batch.map((row) => ({
      opId: row.opId,
      entity: row.entity as SyncEntity,
      id: row.entityId,
      op: row.op as 'upsert' | 'delete',
      updatedAt: row.updatedAt,
      data: row.op === 'upsert' ? (row.payload as Record<string, unknown>) : undefined,
    }));

    let result: PushResult;
    try {
      result = await api<PushResult>('/sync/push', { method: 'POST', body: { ops } });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        // Server forgot this device (e.g. a reset dev database): register again, then retry.
        await api('/device/register', { method: 'POST', body: { platform: Platform.OS } });
        continue;
      }
      deferOps(
        batch.map((o) => o.seq),
        error,
      );
      throw error;
    }

    const statusById = new Map(result.results.map((r) => [r.opId, r.status]));
    db.transaction((tx) => {
      for (const row of batch) {
        const status: OpStatus | undefined = statusById.get(row.opId);
        if (!status) continue;
        tx.delete(outbox).where(eq(outbox.seq, row.seq)).run();
        const table = syncedTables[row.entity as SyncEntity] as (typeof syncedTables)['meal'];
        // Only mark the row if it hasn't been edited since this op was queued.
        tx.update(table)
          .set({ syncState: status === 'rejected' ? 'failed' : 'synced' })
          .where(and(eq(table.id, row.entityId), eq(table.updatedAt, row.updatedAt)))
          .run();
      }
    });
    sent += batch.length;
  }
}

/** Applies server changes after the stored cursor. Local pending edits always win. */
async function pullAll(): Promise<number> {
  let pulled = 0;
  for (;;) {
    const since = Number(
      db.select().from(kvTable).where(eq(kvTable.key, CURSOR_KEY)).get()?.value ?? 0,
    );
    const page = await api<PullResult>(`/sync/pull?since=${since}`);

    db.transaction((tx) => {
      for (const change of page.changes) {
        const table = syncedTables[change.entity] as (typeof syncedTables)['meal'];
        if (!table) continue;
        const local = tx
          .select({ updatedAt: table.updatedAt, syncState: table.syncState })
          .from(table)
          .where(eq(table.id, change.id))
          .get();
        if (local?.syncState === 'pending') continue;
        if (local && local.updatedAt >= change.updatedAt) continue;

        if (change.deleted) {
          if (local) {
            tx.update(table)
              .set({
                deletedAt: change.updatedAt,
                updatedAt: change.updatedAt,
                syncState: 'synced',
              })
              .where(eq(table.id, change.id))
              .run();
          }
          continue;
        }
        const row = {
          ...(change.data ?? {}),
          id: change.id,
          createdAt: Number(change.data?.createdAt ?? change.updatedAt),
          updatedAt: change.updatedAt,
          deletedAt: null,
          syncState: 'synced' as const,
        } as typeof table.$inferInsert;
        tx.insert(table).values(row).onConflictDoUpdate({ target: table.id, set: row }).run();
      }
      tx.insert(kvTable)
        .values({ key: CURSOR_KEY, value: String(page.cursor) })
        .onConflictDoUpdate({ target: kvTable.key, set: { value: String(page.cursor) } })
        .run();
    });

    pulled += page.changes.length;
    if (!page.hasMore) return pulled;
  }
}

/**
 * Starts the triggers: app start, every local write (debounced), foreground, and reconnect.
 * Also pings /health so a sleeping Heroku dyno wakes while the launch sequence plays.
 */
export function startSyncWorker() {
  void api('/health').catch(() => undefined);
  requestSync(0);

  const offWrite = onOutboxChanged(() => requestSync(WRITE_DEBOUNCE_MS));
  const appState = AppState.addEventListener('change', (state) => {
    if (state === 'active') requestSync(0);
  });
  let wasConnected = true;
  const offNet = NetInfo.addEventListener((net) => {
    const connected = !!net.isConnected;
    if (connected && !wasConnected) requestSync(0);
    wasConnected = connected;
  });

  return () => {
    offWrite();
    appState.remove();
    offNet();
    clearTimeout(timer);
  };
}
