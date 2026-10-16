// A card under a reply does its step in one tap, through the same local writes as the rest of the
// app; corrections come after (Undo, or View to fix). Nothing waits on the network.

import { and, eq, isNull } from 'drizzle-orm';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';

import { runAction } from '@/assistant/actions';
import { showToast } from '@/components/toast';
import { db } from '@/db/client';
import { deleteRecord, upsertRecord } from '@/db/mutate';
import { weights } from '@/db/schema';
import { emitMealLogged } from '@/meals/events';
import { type AdvisorCard, dayKey, displayWeight, formatClock, round } from '@/shared';

import type { AdvisorMessage } from './thread';

export type StoredCard = AdvisorCard & { done?: boolean };

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

function markDone(message: AdvisorMessage, done: boolean) {
  const cards = (message.cards ?? []).map((c, i) => (i === 0 ? { ...c, done } : c));
  upsertRecord('advisorMessage', { ...message, cards });
}

/** Today's weigh-in, kept to one a day like the weigh-in sheet. */
function saveWeight(kg: number) {
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
  return () => {
    if (existing) {
      const { id: oldId, day: d, at, kg: oldKg, source } = existing;
      upsertRecord('weight', { id: oldId, day: d, at, kg: oldKg, source });
    } else deleteRecord('weight', id);
  };
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

/** Does the card's step, marks it done on its message, and offers the correction. */
export async function actOnCard(card: StoredCard, message: AdvisorMessage, clock24: boolean) {
  if (card.done) return;
  switch (card.kind) {
    case 'water': {
      const now = new Date();
      const id = upsertRecord('water', { day: dayKey(now), at: now.getTime(), ml: card.ml });
      markDone(message, true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      showToast(`${card.ml} ml water`, {
        label: 'Undo',
        onPress: () => {
          deleteRecord('water', id);
          markDone(message, false);
        },
      });
      return;
    }
    case 'weight': {
      const undo = saveWeight(card.kg);
      markDone(message, true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      showToast('Weight saved', {
        label: 'Undo',
        onPress: () => {
          undo();
          markDone(message, false);
        },
      });
      return;
    }
    case 'meal': {
      const id = logMeal(card);
      markDone(message, true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      showToast('Logged', {
        label: 'View',
        onPress: () => router.push({ pathname: '/meal/[id]', params: { id } }),
      });
      return;
    }
    case 'exercise': {
      const when = reminderAt(card.at);
      const nid = await Notifications.scheduleNotificationAsync({
        content: { title: card.title, body: `${card.minutes} min · ${card.moves.join(', ')}` },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: when,
          channelId: 'pace',
        },
      });
      markDone(message, true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      showToast(`Reminder at ${formatClock(when.getHours() + when.getMinutes() / 60, clock24)}`, {
        label: 'Undo',
        onPress: () => {
          Notifications.cancelScheduledNotificationAsync(nid);
          markDone(message, false);
        },
      });
      return;
    }
    case 'open':
      if (card.target === 'sleep_hours') router.push('/sleep-hours');
      else if (card.target === 'log') runAction({ kind: 'log', note: '' });
      else runAction({ kind: card.target });
      return;
  }
}
