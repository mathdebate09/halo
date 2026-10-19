// What was logged on the floating overlay, put into Halo's own store (chunk 24f). The overlay
// queues each entry natively, so nothing is lost while Halo is closed; Halo drains the queue on
// open, on every return to the foreground, and the moment something is queued while it's alive.
// Each entry keeps its client id as the record id: draining twice can't log anything twice.

import { eq } from 'drizzle-orm';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { markActed } from '@/assistant/loop-store';
import { db } from '@/db/client';
import { meals, water } from '@/db/schema';
import { recordWater } from '@/lib/water';
import { logOnceRead } from '@/meals/analysis';
import { saveMeal } from '@/meals/capture';

import Overlay, { type OverlayQueued } from '../../modules/overlay/src/OverlayModule';

/** Already written (or since deleted, which must stay deleted). */
const exists = (table: typeof meals | typeof water, id: string) =>
  !!db.select({ id: table.id }).from(table).where(eq(table.id, id)).get();

function apply(entry: OverlayQueued) {
  switch (entry.kind) {
    case 'meal_text': {
      if (!entry.text?.trim() || exists(meals, entry.clientId)) return;
      // They pressed Log on the overlay: once read, it's logged without a second tap.
      logOnceRead(entry.clientId);
      saveMeal({ note: entry.text, id: entry.clientId, at: entry.at });
      return;
    }
    case 'water':
      if (!exists(water, entry.clientId)) recordWater(entry.ml, entry.at, entry.clientId);
      if (entry.briefId) markActed(entry.briefId);
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
