// Reads a report's pages in the background, the way meals/analysis.ts reads meal photos: each page
// becomes a job on the server (text layer or tiles, see pages.ts), polled with backoff, up to four
// at once. Page results are kept on the device as they land, so a restart picks up the missing
// pages. When every page is in, the pages merge into one report and its values go straight into
// Vitals, each on the date the report printed (a wrong number is fixed later on the report's
// screen). The picked file is deleted at the end and never leaves the phone; a password lives only
// in memory.

import NetInfo from '@react-native-community/netinfo';
import { and, eq, inArray, isNull, like, lte } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { AppState } from 'react-native';

import { showToast } from '@/components/toast';
import { db } from '@/db/client';
import { deleteRecord, upsertRecord } from '@/db/mutate';
import { jobs, type ReportProgress, reports } from '@/db/schema';
import { kv } from '@/lib/kv';
import { readProfile } from '@/lib/plan';
import {
  dayKey,
  type JobView,
  mergeReport,
  REPORT_LIMITS,
  type ReportPage,
  reportPageSchema,
  tidyPage,
} from '@/shared';
import { api, ApiError } from '@/sync/api';

import { writeValues } from './confirm';
import { discard, preparePage, type ReportSource, tilesBase64 } from './pages';

type Report = typeof reports.$inferSelect;

/** Why a report couldn't be read; the card words each one. */
export type ReportError =
  | 'no_results' // nothing on any page looked like a test result
  | 'daily_limit' // the server's pages-per-day cap
  | 'unavailable' // reading is switched off on the server (503)
  | 'locked' // a locked PDF after a restart (the password isn't kept)
  | 'source_lost' // the picked file is gone from the cache
  | 'error';

/** Failures worth a Retry: the file is still there and trying later can work. */
export const RETRYABLE: readonly ReportError[] = ['daily_limit', 'unavailable', 'error'];

const KIND = 'report-page';
const POLL_FIRST_MS = 2_000;
const POLL_MAX_MS = 15_000;
const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 5 * 60_000;
/** A page whose job fails (not interrupted) is sent again this many times. */
const PAGE_ATTEMPTS = 2;

/** What a report needs to keep reading after a restart. Local only (MMKV), never synced. */
type Run = {
  source:
    | Omit<Extract<ReportSource, { kind: 'pdf' }>, 'password'>
    | Extract<ReportSource, { kind: 'images' }>;
  locked: boolean;
  total: number;
  /** Page number → its result, or 'skip' (no results on it, or past the image-page cap). */
  pages: Record<number, ReportPage | 'skip'>;
  attempts: Record<number, number>;
  imagePages: number;
  capped: boolean;
};

const runKey = (id: string) => `reports.run.${id}`;
const readRun = (id: string): Run | null => {
  const raw = kv.getString(runKey(id));
  return raw ? (JSON.parse(raw) as Run) : null;
};
const writeRun = (id: string, run: Run) => kv.set(runKey(id), JSON.stringify(run));

/** Passwords of locked PDFs being read, by report id. Never stored. */
const passwords = new Map<string, string>();
/** Per-report retry schedule after transient failures (offline, server busy). */
const retryAt = new Map<string, { at: number; attempts: number }>();
/** Pages being prepared or posted right now (so a rerun doesn't send them twice). */
const sending = new Set<string>();

let running: Promise<void> | null = null;
let rerun = false;
let timer: ReturnType<typeof setTimeout> | undefined;

const pageKey = (id: string, page: number) => `${id}:p${page}`;

function currentReport(id: string): Report | undefined {
  return db
    .select()
    .from(reports)
    .where(and(eq(reports.id, id), isNull(reports.deletedAt)))
    .get();
}

/** Writes a patch onto a report, keeping every other field (upserts replace the whole row). */
function patchReport(report: Report, patch: Partial<Report>) {
  const { createdAt: _c, updatedAt: _u, deletedAt: _d, syncState: _s, ...fields } = report;
  upsertRecord('report', { ...fields, ...patch });
}

function sourceUris(run: Run): string[] {
  return run.source.kind === 'pdf' ? [run.source.uri] : run.source.uris;
}

/** Drops everything local about a report's reading: its file copy, page results, jobs. */
function cleanUp(id: string, run: Run | null) {
  if (run) discard(sourceUris(run));
  kv.remove(runKey(id));
  passwords.delete(id);
  retryAt.delete(id);
  db.delete(jobs)
    .where(like(jobs.entityId, `${id}:p%`))
    .run();
}

function fail(id: string, error: ReportError) {
  const report = currentReport(id);
  if (report?.status === 'analysing') patchReport(report, { status: 'failed', error });
  // A retryable failure keeps the file and the pages already read.
  if (!RETRYABLE.includes(error)) cleanUp(id, readRun(id));
  else
    db.delete(jobs)
      .where(like(jobs.entityId, `${id}:p%`))
      .run();
}

function scheduleRetry(id: string) {
  const prev = retryAt.get(id)?.attempts ?? 0;
  const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** prev) * (0.5 + Math.random());
  retryAt.set(id, { at: Date.now() + delay, attempts: prev + 1 });
}

/** Starts reading a picked report (the file is a cache copy this module now owns). */
export function startReport(source: ReportSource, hash: string, total: number) {
  const id = randomUUID();
  const { password, ...rest } = source.kind === 'pdf' ? source : { ...source, password: null };
  if (password) passwords.set(id, password);
  const run: Run = {
    source: rest as Run['source'],
    locked: !!password,
    total,
    pages: {},
    attempts: {},
    imagePages: 0,
    capped: false,
  };
  writeRun(id, run);
  upsertRecord('report', {
    id,
    pdfHash: hash,
    status: 'analysing',
    pages: total,
    progress: { done: 0, total },
    reportDate: null,
    extracted: null,
    error: null,
  });
  requestReports();
  return id;
}

/** Tries a failed report again from the pages it still needs. */
export function retryReport(id: string) {
  const report = currentReport(id);
  if (!report || report.status !== 'failed' || !readRun(id)) return;
  retryAt.delete(id);
  patchReport(report, { status: 'analysing', error: null });
  requestReports();
}

/** Removes a report that's being read, failed or waiting to be checked, and its local files. */
export function dismissReport(id: string) {
  cleanUp(id, readRun(id));
  deleteRecord('report', id);
}

function record(id: string, run: Run, page: number, result: ReportPage | 'skip') {
  run.pages[page] = result;
  writeRun(id, run);
}

/** Prepares and sends one page; records it at once when there's nothing to send. */
async function send(report: Report, run: Run, page: number) {
  const key = pageKey(report.id, page);
  sending.add(key);
  let tiles: string[] = [];
  try {
    const source: ReportSource =
      run.source.kind === 'pdf'
        ? { ...run.source, password: passwords.get(report.id) ?? null }
        : run.source;
    const prepared = await preparePage(source, page - 1);
    if (prepared.kind === 'skip') return record(report.id, run, page, 'skip');
    if (prepared.kind === 'tiles') {
      tiles = prepared.uris;
      if (run.imagePages >= REPORT_LIMITS.maxImagePages) {
        run.capped = true;
        return record(report.id, run, page, 'skip');
      }
    }
    const body =
      prepared.kind === 'text'
        ? { text: prepared.text }
        : { tiles: await tilesBase64(prepared.uris) };
    const job = await api<JobView>('/reports/pages', {
      method: 'POST',
      body: { key, page, of: run.total, ...body },
      timeoutMs: 30_000,
    });
    if (prepared.kind === 'tiles') {
      run.imagePages++;
      writeRun(report.id, run);
    }
    retryAt.delete(report.id);
    if (job.status === 'done') return accept(report.id, run, page, job.result);
    db.insert(jobs)
      .values({
        id: job.id,
        kind: KIND,
        entityId: key,
        status: job.status,
        nextPollAt: Date.now() + POLL_FIRST_MS,
        createdAt: Date.now(),
      })
      .onConflictDoNothing()
      .run();
  } catch (error) {
    handleError(report.id, error);
  } finally {
    discard(tiles);
    sending.delete(key);
  }
}

/** A finished page: checked and tidied again here (the phone doesn't take the server's word). */
function accept(id: string, run: Run, page: number, raw: unknown) {
  const parsed = reportPageSchema.safeParse(raw);
  record(id, run, page, parsed.success ? tidyPage(parsed.data) : 'skip');
}

function handleError(id: string, error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'ERR_PDF_LOCKED') return fail(id, 'locked');
  if (code === 'ERR_PDF_UNREADABLE' || code === 'ERR_PDF_PAGE') return fail(id, 'source_lost');
  if (error instanceof ApiError) {
    if (error.status === 429 && error.detail === 'Daily limit reached')
      return fail(id, 'daily_limit');
    if (error.status === 503) return fail(id, 'unavailable');
    if (error.status !== 429 && error.status < 500) return fail(id, 'error');
  }
  scheduleRetry(id);
}

async function poll(job: typeof jobs.$inferSelect) {
  const [id, p] = job.entityId!.split(':p') as [string, string];
  const page = Number(p);
  const run = readRun(id);
  try {
    const view = await api<JobView>(`/jobs/${job.id}`);
    if (view.status === 'done' || view.status === 'failed') {
      db.delete(jobs).where(eq(jobs.id, job.id)).run();
      if (!run) return;
      if (view.status === 'done') return accept(id, run, page, view.result);
      // A restart lost the work, not the page: send it again (same key, retried in place).
      if (view.error === 'interrupted') return;
      run.attempts[page] = (run.attempts[page] ?? 0) + 1;
      writeRun(id, run);
      if (run.attempts[page] >= PAGE_ATTEMPTS)
        fail(id, view.error === 'ai_unavailable' ? 'unavailable' : 'error');
      return;
    }
    const attempts = job.attempts + 1;
    db.update(jobs)
      .set({
        status: view.status,
        attempts,
        nextPollAt: Date.now() + Math.min(POLL_MAX_MS, POLL_FIRST_MS * 1.5 ** attempts),
      })
      .where(eq(jobs.id, job.id))
      .run();
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      // Expired or unknown: send the page again.
      db.delete(jobs).where(eq(jobs.id, job.id)).run();
    } else {
      db.update(jobs)
        .set({ attempts: job.attempts + 1, nextPollAt: Date.now() + POLL_MAX_MS })
        .where(eq(jobs.id, job.id))
        .run();
    }
  }
}

/** Every page in: merge them for the confirm step, or fail when none had a result. */
/**
 * Every page in: the values go into Vitals on the dates the report printed (a value without its
 * own date takes the report's; a report with no date at all, the day it was added). Where one
 * test was read two ways, the surer reading counts.
 */
function finish(report: Report, run: Run) {
  const pages = Object.values(run.pages).filter((p): p is ReportPage => p !== 'skip');
  const merged = mergeReport(pages, readProfile()?.sex ?? null);
  const values = merged.values.filter((v) => v.include);
  if (values.length === 0) return fail(report.id, 'no_results');
  const fallback = merged.reportDate ?? dayKey(new Date());
  const added = writeValues(
    report.id,
    values.map((v) => ({ ...v, date: v.date ?? fallback })),
  );
  cleanUp(report.id, run);
  // Every value was already there (the same visit added before): nothing new to keep a report for.
  if (added === 0) {
    deleteRecord('report', report.id);
    showToast('This report is already in Vitals');
    return;
  }
  patchReport(report, {
    status: 'confirmed',
    extracted: null,
    reportDate: merged.dates[0] ?? fallback,
    progress: { done: run.total, total: run.total, ...(run.capped ? { capped: true } : {}) },
    error: null,
  });
  showToast('Report added to Vitals', {
    label: 'View',
    onPress: () => router.push('/reports'),
  });
}

const filesThere = (run: Run) => sourceUris(run).every((uri) => new File(uri).exists);

async function runOnce() {
  const now = Date.now();
  const active = db
    .select()
    .from(reports)
    .where(and(eq(reports.status, 'analysing'), isNull(reports.deletedAt)))
    .all();
  const ids = new Set(active.map((r) => r.id));

  // Jobs whose report is gone or no longer being read are dropped.
  const waiting = db.select().from(jobs).where(eq(jobs.kind, KIND)).all();
  for (const job of waiting) {
    if (!ids.has(job.entityId!.split(':p')[0]!)) db.delete(jobs).where(eq(jobs.id, job.id)).run();
  }

  const due = db
    .select()
    .from(jobs)
    .where(and(eq(jobs.kind, KIND), lte(jobs.nextPollAt, now)))
    .all();
  await Promise.all(due.map(poll));

  let slots =
    REPORT_LIMITS.pagesInFlight -
    db.select().from(jobs).where(eq(jobs.kind, KIND)).all().length -
    sending.size;
  for (const report of active) {
    const run = readRun(report.id);
    if (!run || !filesThere(run)) {
      fail(report.id, 'source_lost');
      continue;
    }
    if (run.locked && !passwords.has(report.id)) {
      fail(report.id, 'locked');
      continue;
    }
    const inFlight = new Set(
      db
        .select({ key: jobs.entityId })
        .from(jobs)
        .where(like(jobs.entityId, `${report.id}:p%`))
        .all()
        .map((j) => j.key),
    );
    const todo: number[] = [];
    for (let page = 1; page <= run.total; page++) {
      const key = pageKey(report.id, page);
      if (run.pages[page] == null && !inFlight.has(key) && !sending.has(key)) todo.push(page);
    }
    if (todo.length === 0 && inFlight.size === 0) {
      if (Object.keys(run.pages).length >= run.total) finish(report, run);
      continue;
    }
    // Progress shown on the card, written only when it moved.
    const done = Object.keys(run.pages).length;
    const progress: ReportProgress = {
      done,
      total: run.total,
      ...(run.capped ? { capped: true } : {}),
    };
    if (report.progress?.done !== done || !!report.progress?.capped !== run.capped)
      patchReport(report, { progress });
    if ((retryAt.get(report.id)?.at ?? 0) > now) continue;
    // Pages go one after another (the PDF opens one page at a time); the server reads up to
    // four at once.
    for (const page of todo) {
      if (slots <= 0) break;
      slots--;
      await send(report, run, page);
      if (currentReport(report.id)?.status !== 'analysing') break;
    }
  }
}

/** When the next piece of work is due, or null when nothing is pending. */
function nextDue(): number | null {
  const times = db
    .select({ at: jobs.nextPollAt })
    .from(jobs)
    .where(eq(jobs.kind, KIND))
    .all()
    .map((j) => j.at);
  const analysing = db
    .select({ id: reports.id })
    .from(reports)
    .where(and(eq(reports.status, 'analysing'), isNull(reports.deletedAt)))
    .all();
  for (const r of analysing) times.push(retryAt.get(r.id)?.at ?? Date.now() + 1_000);
  return times.length ? Math.min(...times) : null;
}

/** Runs the reading loop now (after a pick, on foreground, on reconnect). */
export function requestReports() {
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
        requestReports();
        return;
      }
      const due = nextDue();
      if (due != null) timer = setTimeout(requestReports, Math.max(500, due - Date.now()));
    });
}

export function startReportReading() {
  requestReports();
  const appState = AppState.addEventListener('change', (state) => {
    if (state === 'active') requestReports();
  });
  let wasConnected = true;
  const offNet = NetInfo.addEventListener((net) => {
    const connected = !!net.isConnected;
    if (connected && !wasConnected) {
      retryAt.clear();
      requestReports();
    }
    wasConnected = connected;
  });
  return () => {
    appState.remove();
    offNet();
    clearTimeout(timer);
  };
}

/** Reports the card shows. */
export const CARD_STATUSES = ['analysing', 'failed'] as const;

/** Whether a report with this file is already here (being read, waiting or confirmed). */
export function existingReport(hash: string): Report | undefined {
  return db
    .select()
    .from(reports)
    .where(
      and(
        eq(reports.pdfHash, hash),
        inArray(reports.status, ['analysing', 'confirmed']),
        isNull(reports.deletedAt),
      ),
    )
    .get();
}
