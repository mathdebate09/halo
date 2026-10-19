// What was logged on the floating overlay, put into Halo's own store (chunk 24f). The overlay
// queues each entry natively, so nothing is lost while Halo is closed; Halo drains the queue on
// open, on every return to the foreground, and the moment something is queued while it's alive.
// Each entry keeps its client id as the record id: draining twice can't log anything twice.
// Voice replies (chunk 27) add a weigh-in, an Undo of an earlier entry, and the exchange itself for
// today's Advisor thread.

import { and, eq, isNull } from 'drizzle-orm';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { saveWeight } from '@/advisor/act';
import { markActed } from '@/assistant/loop-store';
import { db } from '@/db/client';
import { deleteRecord, upsertRecord } from '@/db/mutate';
import { advisorMessages, meals, type StoredAdvisorCard, water, weights } from '@/db/schema';
import { kv } from '@/lib/kv';
import { recordWater } from '@/lib/water';
import { logOnceRead } from '@/meals/analysis';
import { saveMeal } from '@/meals/capture';

import Overlay, { type OverlayQueued } from '../../modules/overlay/src/OverlayModule';

/** Already written (or since deleted, which must stay deleted). */
const exists = (table: typeof meals | typeof water, id: string) =>
  !!db.select({ id: table.id }).from(table).where(eq(table.id, id)).get();

// What an Undo from the overlay takes back, by the entry's client id: the record it wrote, and for
// a weigh-in the one it replaced (one a day). The last 20 are kept.
const UNDO_KEY = 'overlay.undo';
type Undo =
  | { kind: 'meal_text'; ref: string }
  | { kind: 'water'; ref: string }
  | { kind: 'weight'; ref: string; prev: StoredAdvisorCard['prev'] };

const readUndo = (): Record<string, Undo> => {
  try {
    return JSON.parse(kv.getString(UNDO_KEY) ?? '{}') as Record<string, Undo>;
  } catch {
    return {};
  }
};

function remember(clientId: string, undo: Undo) {
  const all = Object.entries({ ...readUndo(), [clientId]: undo }).slice(-20);
  kv.set(UNDO_KEY, JSON.stringify(Object.fromEntries(all)));
}

function takeBack(targetId: string) {
  const all = readUndo();
  const undo = all[targetId];
  if (!undo) return;
  if (undo.kind === 'meal_text') deleteRecord('meal', undo.ref);
  else if (undo.kind === 'water') deleteRecord('water', undo.ref);
  else if (undo.prev) upsertRecord('weight', undo.prev);
  else deleteRecord('weight', undo.ref);
  delete all[targetId];
  kv.set(UNDO_KEY, JSON.stringify(all));
  // The thread's card for it goes back to undone, so its Undo isn't offered twice.
  for (const m of db
    .select()
    .from(advisorMessages)
    .where(and(eq(advisorMessages.role, 'assistant'), isNull(advisorMessages.deletedAt)))
    .all()) {
    if (!m.cards?.some((c) => c.ref === undo.ref)) continue;
    const cards = m.cards.map((c) =>
      c.ref === undo.ref
        ? ({ ...c, done: false, ref: null, prev: undefined } as StoredAdvisorCard)
        : c,
    );
    upsertRecord('advisorMessage', { ...m, cards });
  }
}

/** A voice exchange into today's Advisor thread; water and weigh-ins keep their card (and Undo). */
function voiceTurn(entry: Extract<OverlayQueued, { kind: 'voice_turn' }>) {
  const seen = db
    .select({ id: advisorMessages.id })
    .from(advisorMessages)
    .where(eq(advisorMessages.turnId, entry.turnId))
    .get();
  if (seen) return;
  const undo = readUndo();
  const cards: StoredAdvisorCard[] = [];
  for (const log of entry.logs) {
    const u = undo[log.clientId];
    if (!u || u.kind === 'meal_text') continue;
    if (u.kind === 'water') {
      const row = db.select({ ml: water.ml }).from(water).where(eq(water.id, u.ref)).get();
      if (row) cards.push({ kind: 'water', ml: row.ml, done: true, ref: u.ref });
    } else {
      const row = db.select({ kg: weights.kg }).from(weights).where(eq(weights.id, u.ref)).get();
      if (row) cards.push({ kind: 'weight', kg: row.kg, done: true, ref: u.ref, prev: u.prev });
    }
  }
  upsertRecord('advisorMessage', {
    threadId: entry.threadId,
    role: 'user',
    content: entry.heard,
    status: 'done',
    turnId: entry.turnId,
  });
  upsertRecord('advisorMessage', {
    threadId: entry.threadId,
    role: 'assistant',
    content: entry.reply,
    status: 'done',
    turnId: entry.turnId,
    cards: cards.slice(0, 1),
  });
}

function apply(entry: OverlayQueued) {
  switch (entry.kind) {
    case 'meal_text': {
      if (!entry.text?.trim() || exists(meals, entry.clientId)) return;
      // They pressed Log on the overlay (or said it): once read, it's logged without a second tap.
      logOnceRead(entry.clientId);
      saveMeal({ note: entry.text, id: entry.clientId, at: entry.at, mealType: entry.mealType });
      remember(entry.clientId, { kind: 'meal_text', ref: entry.clientId });
      if (entry.briefId) markActed(entry.briefId);
      return;
    }
    case 'water':
      if (!exists(water, entry.clientId)) {
        recordWater(entry.ml, entry.at, entry.clientId);
        remember(entry.clientId, { kind: 'water', ref: entry.clientId });
      }
      if (entry.briefId) markActed(entry.briefId);
      return;
    case 'weight': {
      if (readUndo()[entry.clientId]) return;
      const { id, prev } = saveWeight(entry.kg);
      remember(entry.clientId, { kind: 'weight', ref: id, prev });
      if (entry.briefId) markActed(entry.briefId);
      return;
    }
    case 'undo':
      takeBack(entry.targetId);
      return;
    case 'voice_turn':
      voiceTurn(entry);
      return;
    case 'acted':
      if (entry.briefId) markActed(entry.briefId);
      return;
  }
}

/** Takes everything queued on the overlay and writes it locally (the outbox syncs it). */
export function drainOverlayQueue() {
  if (!Overlay) return;
  let entries: OverlayQueued[];
  try {
    entries = JSON.parse(Overlay.takeQueue()) as OverlayQueued[];
  } catch {
    return;
  }
  applyQueued(entries);
}

/** Writes queued entries in order (also the dev screen's fake voice turn). */
export function applyQueued(entries: OverlayQueued[]) {
  for (const entry of entries) {
    try {
      apply(entry);
    } catch {
      // One bad entry never blocks the rest.
    }
  }
}

/** Drains on open, on return to the foreground, and as soon as the overlay queues something. */
export function useOverlayDrain() {
  useEffect(() => {
    if (!Overlay) return;
    drainOverlayQueue();
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') drainOverlayQueue();
    });
    const queued = Overlay.addListener('onQueued', drainOverlayQueue);
    return () => {
      app.remove();
      queued.remove();
    };
  }, []);
}
