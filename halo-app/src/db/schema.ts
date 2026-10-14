// Local SQLite schema: the source of truth for every log (SPEC "Speed principle").
// After changing this file run `npm run db:generate` and commit the new migration in drizzle/.

import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export type SyncState = 'pending' | 'synced' | 'failed';

/** Columns every synced record carries. Times are epoch ms (client clock). */
const synced = {
  id: text('id').primaryKey(), // client-generated uuid
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'), // tombstone; rows are never hard-deleted before sync
  syncState: text('sync_state').$type<SyncState>().notNull().default('pending'),
};

// ── Synced logs ────────────────────────────────────────────────────────────────

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type MealStatus = 'analysing' | 'draft' | 'logged' | 'failed';

export const meals = sqliteTable(
  'meals',
  {
    ...synced,
    day: text('day').notNull(), // dayKey (4 am rollover)
    eatenAt: integer('eaten_at').notNull(),
    mealType: text('meal_type').$type<MealType>().notNull(),
    source: text('source').$type<'photo' | 'text'>().notNull(),
    note: text('note'),
    photoUri: text('photo_uri'), // compressed copy in the document directory; never uploaded for storage
    status: text('status').$type<MealStatus>().notNull(),
    jobId: text('job_id'),
    kcal: real('kcal'),
    proteinG: real('protein_g'),
    carbsG: real('carbs_g'),
    fatG: real('fat_g'),
    confidence: real('confidence'),
  },
  (t) => [index('meals_day').on(t.day)],
);

export const mealItems = sqliteTable(
  'meal_items',
  {
    ...synced,
    mealId: text('meal_id').notNull(),
    name: text('name').notNull(),
    portion: text('portion'), // human text, e.g. "1 cup"
    grams: real('grams'),
    kcal: real('kcal').notNull(),
    proteinG: real('protein_g').notNull(),
    carbsG: real('carbs_g').notNull(),
    fatG: real('fat_g').notNull(),
    confidence: real('confidence'),
  },
  (t) => [index('meal_items_meal').on(t.mealId)],
);

export const water = sqliteTable(
  'water',
  {
    ...synced,
    day: text('day').notNull(),
    at: integer('at').notNull(),
    ml: integer('ml').notNull(),
  },
  (t) => [index('water_day').on(t.day)],
);

export const weights = sqliteTable(
  'weights',
  {
    ...synced,
    day: text('day').notNull(),
    at: integer('at').notNull(),
    kg: real('kg').notNull(),
    source: text('source').$type<'manual' | 'health-connect' | 'onboarding'>().notNull(),
  },
  (t) => [index('weights_day').on(t.day)],
);

export type ReadingSource = 'manual' | 'health-connect' | 'report';

export const vitalsReadings = sqliteTable(
  'vitals_readings',
  {
    ...synced,
    metric: text('metric').notNull(), // e.g. resting_hr, ldl, hba1c
    value: real('value').notNull(),
    unit: text('unit').notNull(),
    at: integer('at').notNull(),
    source: text('source').$type<ReadingSource>().notNull(),
    reportId: text('report_id'),
    /** Report values only count once the user confirms them. */
    confirmed: integer('confirmed', { mode: 'boolean' }).notNull().default(true),
  },
  (t) => [index('vitals_metric_at').on(t.metric, t.at)],
);

export const reports = sqliteTable('reports', {
  ...synced,
  pdfHash: text('pdf_hash').notNull(), // catches duplicate uploads; the file itself is never stored
  status: text('status')
    .$type<'rendering' | 'analysing' | 'review' | 'confirmed' | 'failed'>()
    .notNull(),
  reportDate: text('report_date'),
  pages: integer('pages'),
  extracted: text('extracted', { mode: 'json' }), // values awaiting the confirm step
});

export type InsightState = 'pending' | 'shown' | 'acted' | 'ignored' | 'resolved';

export const insights = sqliteTable(
  'insights',
  {
    ...synced,
    day: text('day').notNull(),
    type: text('type').notNull(),
    severity: integer('severity').notNull(),
    reason: text('reason').notNull(),
    action: text('action', { mode: 'json' }),
    expiresAt: integer('expires_at'),
    state: text('state').$type<InsightState>().notNull().default('pending'),
    segments: text('segments', { mode: 'json' }), // AI phrasing as structured segments
  },
  (t) => [index('insights_day').on(t.day)],
);

/** One row per day; id = day key. Synced so the advisor has context. */
export const dailyScores = sqliteTable('daily_scores', {
  ...synced,
  diet: real('diet'),
  activity: real('activity'),
  sleep: real('sleep'),
  vitals: real('vitals'),
  water: real('water'),
  overall: real('overall'),
  tier: text('tier').$type<'high' | 'mid' | 'low'>(),
  confidence: text('confidence', { mode: 'json' }),
  computedAt: integer('computed_at').notNull(),
});

export const advisorMessages = sqliteTable(
  'advisor_messages',
  {
    ...synced,
    threadId: text('thread_id').notNull(),
    role: text('role').$type<'user' | 'assistant'>().notNull(),
    content: text('content').notNull(),
    status: text('status').$type<'sending' | 'streaming' | 'done' | 'failed'>().notNull(),
  },
  (t) => [index('advisor_thread').on(t.threadId, t.createdAt)],
);

// ── Local only ─────────────────────────────────────────────────────────────────

/** Cache of Health Connect aggregates; re-read on foreground, never synced. */
export const hcDaily = sqliteTable('hc_daily', {
  day: text('day').primaryKey(),
  steps: integer('steps'),
  distanceM: real('distance_m'),
  activeKcal: real('active_kcal'),
  sleepStart: integer('sleep_start'),
  sleepEnd: integer('sleep_end'),
  fetchedAt: integer('fetched_at').notNull(),
});

/** Long AI jobs the client is polling (meal photo, PDF, plan copy). */
export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(), // server job id
  kind: text('kind').notNull(),
  entityId: text('entity_id'),
  status: text('status').$type<'queued' | 'running' | 'done' | 'failed'>().notNull(),
  attempts: integer('attempts').notNull().default(0),
  nextPollAt: integer('next_poll_at').notNull(),
  createdAt: integer('created_at').notNull(),
});

/** Ops waiting to be pushed, in order. opId is the server-side idempotency key. */
export const outbox = sqliteTable(
  'outbox',
  {
    seq: integer('seq').primaryKey({ autoIncrement: true }),
    opId: text('op_id').notNull().unique(),
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    op: text('op').$type<'upsert' | 'delete' | 'register'>().notNull(),
    payload: text('payload', { mode: 'json' }).notNull(),
    updatedAt: integer('updated_at').notNull(),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: integer('next_attempt_at').notNull(),
    lastError: text('last_error'),
  },
  (t) => [index('outbox_next').on(t.nextAttemptAt)],
);

/** Small persistent values that belong with the data (e.g. the sync cursor). */
export const kvTable = sqliteTable('kv', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
