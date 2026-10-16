// A card under a reply does its step in one tap, through the same local writes as the rest of the
// app; the correction stays on the card (Undo, or View to fix), never in a toast: the Advisor is a
// chat. What an Undo needs (the record, the weigh-in it replaced, the reminder) is kept on the
// card, so it still works after a restart. Nothing waits on the network.

import { and, eq, isNull } from 'drizzle-orm';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';

import { runAction } from '@/assistant/actions';
import { db } from '@/db/client';
import { deleteRecord, upsertRecord } from '@/db/mutate';
import { type StoredAdvisorCard as StoredCard, weights } from '@/db/schema';
import { emitMealLogged } from '@/meals/events';
import { type AdvisorCard, dayKey, displayWeight, formatClock, round } from '@/shared';

import type { AdvisorMessage } from './thread';

export type { StoredAdvisorCard as StoredCard } from '@/db/schema';

const OPEN_TITLES: Record<Extract<AdvisorCard, { kind: 'open' }>['target'], string> = {
  log: 'Log a meal',
  weigh: 'Weigh in',
  sleep_hours: "Fix last night's sleep",
  ask_wake: 'Set your wake time',
  usage_access: 'Allow screen time',
  connect: 'Connect Health Connect',
  blood_work: 'All lab results',
};

const sum = (card: Extract<AdvisorCard, { kind: 'meal' }>, key: 'kcal' | 'proteinG') =>
  Math.round(card.items.reduce((t, i) => t + i[key], 0));

const hourOf = (at: string) => {
  const [h, m] = at.split(':').map(Number) as [number, number];
  return h + m / 60;
};

/** What a card says: a title, one short line of numbers, and its button. */
export function cardWords(
  card: AdvisorCard,
  units: { pounds: boolean; clock24: boolean },
): { title: string; line: string | null; button: string; done: string | null } {
  switch (card.kind) {
    case 'meal':
      return {
        title: card.title,
        line: `${sum(card, 'kcal')} kcal · ${sum(card, 'proteinG')} g protein`,
        button: 'Log',
        done: 'Logged',
      };
    case 'water':
      return { title: `${card.ml} ml water`, line: null, button: 'Add', done: 'Added' };
    case 'weight': {
      const unit = units.pounds ? 'lb' : 'kg';
      const value = displayWeight(card.kg, unit).toFixed(1);
      return { title: 'Weigh-in', line: `${value} ${unit}`, button: 'Save', done: 'Saved' };
    }
    case 'exercise':
      return {
        title: card.title,
        line: `${card.minutes} min · ${card.moves.join(', ')}`,
        button: card.at
          ? `Remind me at ${formatClock(hourOf(card.at), units.clock24)}`
          : 'Remind me',
        done: 'Reminder set',
      };
    case 'open':
      return { title: OPEN_TITLES[card.target], line: null, button: 'Open', done: null };
  }
}

/** Rewrites the message's card (there's at most one). */
function setCard(message: AdvisorMessage, card: StoredCard) {
  upsertRecord('advisorMessage', { ...message, cards: [card] });
}

/** Today's weigh-in, kept to one a day like the weigh-in sheet. */
function saveWeight(kg: number): { id: string; prev: StoredCard['prev'] } {
  const now = new Date();
  const day = dayKey(now);
  const existing = db
    .select()
    .from(weights)
    .where(and(eq(weights.day, day), isNull(weights.deletedAt)))
    .get();
  const id = upsertRecord('weight', {
    id: existing?.id,
    day,
    at: existing?.at ?? now.getTime(),
    kg: round(kg, 1),
    source: 'manual',
  });
  const prev = existing
    ? {
        id: existing.id,
        day: existing.day,
        at: existing.at,
        kg: existing.kg,
        source: existing.source,
      }
    : null;
  return { id, prev };
}

/** A logged meal with its items, eaten now. */
function logMeal(card: Extract<AdvisorCard, { kind: 'meal' }>): string {
  const now = new Date();
  const total = (key: 'kcal' | 'proteinG' | 'carbsG' | 'fatG') =>
    round(
      card.items.reduce((t, i) => t + i[key], 0),
      1,
    );
  const id = upsertRecord('meal', {
    day: dayKey(now),
    eatenAt: now.getTime(),
    mealType: card.mealType,
    source: 'text',
    status: 'logged',
    title: card.title,
    kcal: total('kcal'),
    proteinG: total('proteinG'),
    carbsG: total('carbsG'),
    fatG: total('fatG'),
  });
  for (const item of card.items) {
    upsertRecord('mealItem', {
      mealId: id,
      name: item.name,
      portion: item.portion || null,
      grams: item.grams,
      kcal: item.kcal,
      proteinG: item.proteinG,
      carbsG: item.carbsG,
      fatG: item.fatG,
      confidence: null,
    });
  }
  emitMealLogged();
  return id;
}

/** The next quarter hour at least an hour away, as "HH:MM", when the card named no time. */
function reminderAt(at: string | null, now = new Date()): Date {
  if (at) {
    const [h, m] = at.split(':').map(Number) as [number, number];
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    if (d.getTime() > now.getTime() + 60_000) return d;
  }
  const d = new Date(now.getTime() + 60 * 60_000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return d;
}

/** Does the card's step and marks it done on its message, keeping what an Undo needs. */
export async function actOnCard(card: StoredCard, message: AdvisorMessage) {
  if (card.done) return;
  const done = (fields: Partial<StoredCard>) => {
    setCard(message, { ...card, ...fields, done: true } as StoredCard);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };
  switch (card.kind) {
    case 'water': {
      const now = new Date();
      done({ ref: upsertRecord('water', { day: dayKey(now), at: now.getTime(), ml: card.ml }) });
      return;
    }
    case 'weight': {
      const { id, prev } = saveWeight(card.kg);
      done({ ref: id, prev });
      return;
    }
    case 'meal':
      done({ ref: logMeal(card) });
      return;
    case 'exercise': {
      const ref = await Notifications.scheduleNotificationAsync({
        content: { title: card.title, body: `${card.minutes} min · ${card.moves.join(', ')}` },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: reminderAt(card.at),
          channelId: 'pace',
        },
      });
      done({ ref });
      return;
    }
    case 'open':
      if (card.target === 'sleep_hours') router.push('/sleep-hours');
      else if (card.target === 'log') runAction({ kind: 'log', note: '' });
      else runAction({ kind: card.target });
      return;
  }
}

/** The correction a done card offers in place: Undo, or View for a logged meal (fixed there). */
export function cardCorrection(card: StoredCard): 'Undo' | 'View' | null {
  if (!card.done || !card.ref) return null;
  return card.kind === 'meal' ? 'View' : card.kind === 'open' ? null : 'Undo';
}

export function correctCard(card: StoredCard, message: AdvisorMessage) {
  if (!card.done || !card.ref) return;
  switch (card.kind) {
    case 'meal':
      router.push({ pathname: '/meal/[id]', params: { id: card.ref } });
      return;
    case 'water':
      deleteRecord('water', card.ref);
      break;
    case 'weight':
      if (card.prev) upsertRecord('weight', card.prev);
      else deleteRecord('weight', card.ref);
      break;
    case 'exercise':
      Notifications.cancelScheduledNotificationAsync(card.ref);
      break;
    case 'open':
      return;
  }
  setCard(message, { ...card, done: false, ref: null, prev: undefined } as StoredCard);
}
