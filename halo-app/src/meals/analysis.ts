// Turns pending meals into analyses, in the background. A photo meal becomes a job on the server
// (POST, then poll GET /jobs/:id with backoff); a text-only meal is one short request. The result
// lands in SQLite as a "draft" with its items, and the UI reacts through live queries. Offline or
// failing calls retry with backoff; the AI being unavailable marks the meal "failed" so the user
// can fill it in by hand.

import NetInfo from '@react-native-community/netinfo';
import { and, eq, isNull, lte } from 'drizzle-orm';
import { File } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import { AppState } from 'react-native';

import { db } from '@/db/client';
import { deleteRecord, upsertRecord } from '@/db/mutate';
import { jobs, mealItems, meals } from '@/db/schema';
import { kv } from '@/lib/kv';
import {
  hourOfDay,
  type JobView,
  MAX_MEAL_NOTE,
  type MealAnalysis,
  mealAnalysisSchema,
} from '@/shared';
import { api, ApiError } from '@/sync/api';

import { emitMealLogged } from './events';

type Meal = typeof meals.$inferSelect;

const POLL_FIRST_MS = 2_000;
const POLL_MAX_MS = 15_000;
const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 5 * 60_000;
/** Server-side the text parse may take two 12 s attempts. */
const PARSE_TIMEOUT_MS = 30_000;

/** In-memory retry schedule for submissions that failed for transient reasons. */
const retryAt = new Map<string, { at: number; attempts: number }>();

let running: Promise<void> | null = null;
let rerun = false;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Writes a patch onto a meal, keeping every other field (upserts replace the whole row). */
export function patchMeal(meal: Meal, patch: Partial<Meal>) {
  const { createdAt: _c, updatedAt: _u, deletedAt: _d, syncState: _s, ...fields } = meal;
  upsertRecord('meal', { ...fields, ...patch });
}

function currentMeal(id: string): Meal | undefined {
  return db
    .select()
    .from(meals)
    .where(and(eq(meals.id, id), isNull(meals.deletedAt)))
    .get();
}

const AUTO_LOG_KEY = 'meals.autoLog';
const autoLog = (): string[] => {
  try {
    return JSON.parse(kv.getString(AUTO_LOG_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
};

/**
 * A meal the user already pressed Log on elsewhere (the overlay): once read, it's logged without
 * the confirm step. One that can't be read stays a draft to fix, like any other.
 */
export function logOnceRead(mealId: string) {
  kv.set(
    AUTO_LOG_KEY,
    JSON.stringify([...autoLog().filter((id) => id !== mealId), mealId].slice(-20)),
  );
}

/** Writes an analysis as a draft (items + totals) for the confirm sheet. */
function applyAnalysis(mealId: string, raw: unknown) {
  const meal = currentMeal(mealId);
  if (!meal || meal.status !== 'analysing') return; // deleted or already edited
  const parsed = mealAnalysisSchema.safeParse(raw);
  if (!parsed.success) {
    patchMeal(meal, { status: 'failed' });
    return;
  }
  const analysis: MealAnalysis = parsed.data;
  const items = analysis.isFood ? analysis.items : [];
  // A re-analysis replaces the previous result's items.
  const previous = db
    .select({ id: mealItems.id })
    .from(mealItems)
    .where(and(eq(mealItems.mealId, mealId), isNull(mealItems.deletedAt)))
    .all();
  for (const old of previous) deleteRecord('mealItem', old.id);
  for (const item of items) upsertRecord('mealItem', { mealId, ...item });
  const sum = (key: 'kcal' | 'proteinG' | 'carbsG' | 'fatG') =>
    items.reduce((a, i) => a + i[key], 0);
  const auto = autoLog().includes(mealId);
  if (auto) kv.set(AUTO_LOG_KEY, JSON.stringify(autoLog().filter((id) => id !== mealId)));
  const logged = auto && items.length > 0;
  patchMeal(meal, {
    status: logged ? 'logged' : 'draft',
    title: analysis.title || null,
    kcal: sum('kcal'),
    proteinG: sum('proteinG'),
    carbsG: sum('carbsG'),
    fatG: sum('fatG'),
    confidence: items.length ? analysis.confidence : 0,
  });
  if (logged) emitMealLogged();
}

function fail(mealId: string) {
  const meal = currentMeal(mealId);
  if (meal?.status === 'analysing') patchMeal(meal, { status: 'failed' });
}

function scheduleRetry(mealId: string) {
  const prev = retryAt.get(mealId)?.attempts ?? 0;
  const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** prev) * (0.5 + Math.random());
  retryAt.set(mealId, { at: Date.now() + delay, attempts: prev + 1 });
}

/** 503 = AI unavailable (manual entry); 4xx = this request will never work; else transient. */
function handleError(mealId: string, error: unknown) {
  if (error instanceof ApiError && error.status !== 429 && error.status < 500) fail(mealId);
  else if (error instanceof ApiError && error.status === 503) fail(mealId);
  else scheduleRetry(mealId);
}

async function submit(meal: Meal) {
  const context = { hour: hourOfDay(new Date(meal.eatenAt)), mealType: meal.mealType };
  try {
    if (meal.photoUri) {
      const image = await new File(meal.photoUri).base64();
      const job = await api<JobView>('/meals/analyse-photo', {
        method: 'POST',
        // Each attempt has its own key (jobId, set on re-analysis): the server returns the same job
        // for a repeated key.
        body: { key: meal.jobId ?? meal.id, image, note: meal.note ?? undefined, ...context },
        timeoutMs: 30_000,
      });
      retryAt.delete(meal.id);
      if (job.status === 'done') return applyAnalysis(meal.id, job.result);
      db.insert(jobs)
        .values({
          id: job.id,
          kind: 'meal-photo',
          entityId: meal.id,
          status: job.status,
          nextPollAt: Date.now() + POLL_FIRST_MS,
          createdAt: Date.now(),
        })
        .onConflictDoNothing()
        .run();
    } else if (meal.note) {
      const result = await api<MealAnalysis>('/meals/parse-text', {
        method: 'POST',
        body: { note: meal.note, ...context },
        timeoutMs: PARSE_TIMEOUT_MS,
      });
      retryAt.delete(meal.id);
      applyAnalysis(meal.id, result);
    } else {
      fail(meal.id);
    }
  } catch (error) {
    handleError(meal.id, error);
  }
}

async function poll(job: typeof jobs.$inferSelect) {
  const mealId = job.entityId!;
  try {
    const view = await api<JobView>(`/jobs/${job.id}`);
    if (view.status === 'done') {
      db.delete(jobs).where(eq(jobs.id, job.id)).run();
      applyAnalysis(mealId, view.result);
    } else if (view.status === 'failed') {
      db.delete(jobs).where(eq(jobs.id, job.id)).run();
      // A restart lost the work, not the meal: resubmit (same key, retried in place).
      if (view.error !== 'interrupted') fail(mealId);
    } else {
      const attempts = job.attempts + 1;
      db.update(jobs)
        .set({
          status: view.status,
          attempts,
          nextPollAt: Date.now() + Math.min(POLL_MAX_MS, POLL_FIRST_MS * 1.5 ** attempts),
        })
        .where(eq(jobs.id, job.id))
        .run();
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      // Expired or unknown: submit again.
      db.delete(jobs).where(eq(jobs.id, job.id)).run();
    } else {
      db.update(jobs)
        .set({ attempts: job.attempts + 1, nextPollAt: Date.now() + POLL_MAX_MS })
        .where(eq(jobs.id, job.id))
        .run();
    }
  }
}

async function runOnce() {
  const now = Date.now();
  const waitingJobs = db.select().from(jobs).where(eq(jobs.kind, 'meal-photo')).all();
  const jobMeals = new Set(waitingJobs.map((j) => j.entityId));

  // Jobs whose meal is gone (deleted, or edited by hand) are dropped.
  for (const job of waitingJobs) {
    const meal = currentMeal(job.entityId!);
    if (!meal || meal.status !== 'analysing') db.delete(jobs).where(eq(jobs.id, job.id)).run();
  }

  const pending = db
    .select()
    .from(meals)
    .where(and(eq(meals.status, 'analysing'), isNull(meals.deletedAt)))
    .all()
    .filter((m) => !jobMeals.has(m.id) && (retryAt.get(m.id)?.at ?? 0) <= now);
  // The server allows two jobs in flight per device; text parses are quick.
  for (const meal of pending.slice(0, 2)) await submit(meal);

  const due = db
    .select()
    .from(jobs)
    .where(and(eq(jobs.kind, 'meal-photo'), lte(jobs.nextPollAt, now)))
    .all();
  await Promise.all(due.map(poll));
}

/** When the next piece of work is due, or null when nothing is pending. */
function nextDue(): number | null {
  const times: number[] = db
    .select({ at: jobs.nextPollAt })
    .from(jobs)
    .where(eq(jobs.kind, 'meal-photo'))
    .all()
    .map((j) => j.at);
  const jobMeals = new Set(
    db
      .select({ id: jobs.entityId })
      .from(jobs)
      .all()
      .map((j) => j.id),
  );
  const analysing = db
    .select({ id: meals.id })
    .from(meals)
    .where(and(eq(meals.status, 'analysing'), isNull(meals.deletedAt)))
    .all();
  for (const m of analysing) {
    if (!jobMeals.has(m.id)) times.push(retryAt.get(m.id)?.at ?? Date.now());
  }
  return times.length ? Math.min(...times) : null;
}

/** Runs the analysis loop now (after a capture, on foreground, on reconnect). */
export function requestAnalysis() {
  if (running) {
    rerun = true;
    return;
  }
  clearTimeout(timer);
  running = runOnce()
    .catch(() => undefined)
    .finally(() => {
      running = null;
      if (rerun) {
        rerun = false;
        requestAnalysis();
        return;
      }
      const due = nextDue();
      if (due != null) timer = setTimeout(requestAnalysis, Math.max(500, due - Date.now()));
    });
}

/**
 * Re-runs a meal's analysis with the user's correction ("half portion, no oil"): the instruction
 * joins the note (kept within the note limit), a fresh attempt key is issued, and the new result
 * replaces the items.
 */
export function reanalyse(mealId: string, instruction: string) {
  const meal = currentMeal(mealId);
  const text = instruction.trim();
  if (!meal || !text) return;
  const base = meal.note?.trim();
  const note = (base ? `${base}. Correction: ${text}` : text).slice(-MAX_MEAL_NOTE);
  db.delete(jobs).where(eq(jobs.entityId, mealId)).run();
  retryAt.delete(mealId);
  patchMeal(meal, { status: 'analysing', note, jobId: randomUUID() });
  requestAnalysis();
}

/** Retries a failed meal's analysis (from the confirm sheet). */
export function retryAnalysis(mealId: string) {
  const meal = currentMeal(mealId);
  if (!meal || (meal.status !== 'failed' && meal.status !== 'analysing')) return;
  retryAt.delete(mealId);
  patchMeal(meal, { status: 'analysing' });
  requestAnalysis();
}

export function startMealAnalysis() {
  requestAnalysis();
  const appState = AppState.addEventListener('change', (state) => {
    if (state === 'active') requestAnalysis();
  });
  let wasConnected = true;
  const offNet = NetInfo.addEventListener((net) => {
    const connected = !!net.isConnected;
    if (connected && !wasConnected) {
      retryAt.clear();
      requestAnalysis();
    }
    wasConnected = connected;
  });
  return () => {
    appState.remove();
    offNet();
    clearTimeout(timer);
  };
}

/** Meals the pending card shows. */
export const PENDING_STATUSES = ['analysing', 'draft', 'failed'] as const;
