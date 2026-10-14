// GENERATED from halo-shared/src/sync.ts by halo-shared/scripts/sync.mjs. Do not edit.

// The sync contract between halo-app and halo-backend (one source for both sides).
//
//   POST /device/register              idempotent; creates the device record for this install
//   POST /sync/push   { ops }          ≤ 100 ops; last-write-wins on updatedAt; opId makes replays idempotent
//   GET  /sync/pull?since=<seq>        changes after a server-side monotonic per-device sequence
//
// Every request carries X-App-Key (one 16-char key shared by the app and backend config: a gate,
// not real security, since it ships in the bundle) and X-Device-Id (the per-install UUID that
// is the identity and scopes all data).

import { z } from 'zod';

export const APP_KEY_HEADER = 'x-app-key';
export const DEVICE_ID_HEADER = 'x-device-id';

/** Entity names as they appear in ops; the app maps each to a SQLite table. */
export const SYNC_ENTITIES = [
  'meal',
  'mealItem',
  'water',
  'weight',
  'vitalReading',
  'report',
  'insight',
  'dailyScore',
  'advisorMessage',
] as const;
export type SyncEntity = (typeof SYNC_ENTITIES)[number];

export const MAX_PUSH_OPS = 100;
export const MAX_PULL_CHANGES = 500;

export const deviceIdSchema = z.uuid();
export const appKeySchema = z.string().regex(/^[A-Za-z0-9]{16}$/, 'must be 16 letters/digits');

export const registerBodySchema = z.object({
  platform: z.string().max(20).optional(),
});
export type RegisterBody = z.infer<typeof registerBodySchema>;

export const syncOpSchema = z.object({
  opId: z.uuid(),
  entity: z.enum(SYNC_ENTITIES),
  id: z.string().min(1).max(64),
  op: z.enum(['upsert', 'delete']),
  /** Client clock, epoch ms. Last write wins. */
  updatedAt: z.number().int().nonnegative(),
  /** Full record for upserts (sync columns are ignored server-side). */
  data: z.record(z.string(), z.unknown()).optional(),
});
export type SyncOp = z.infer<typeof syncOpSchema>;

export const pushBodySchema = z.object({
  ops: z.array(syncOpSchema).min(1).max(MAX_PUSH_OPS),
});
export type PushBody = z.infer<typeof pushBodySchema>;

/** applied: stored · stale: server already had a newer write (client should pull) · rejected: invalid. */
export type OpStatus = 'applied' | 'stale' | 'rejected';
export type PushResult = { results: { opId: string; status: OpStatus }[] };

export const pullQuerySchema = z.object({
  since: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(MAX_PULL_CHANGES).default(MAX_PULL_CHANGES),
});
export type PullQuery = z.infer<typeof pullQuerySchema>;

export type SyncChange = {
  entity: SyncEntity;
  id: string;
  updatedAt: number;
  deleted: boolean;
  data: Record<string, unknown> | null;
};
export type PullResult = { changes: SyncChange[]; cursor: number; hasMore: boolean };

/** Record fields owned by the sync layer, not by the entity. */
export const SYNC_ONLY_FIELDS = ['syncState'] as const;
