// The PA's push path (SPEC §4 "Mechanics", chunk 17a). Local notifications only: halo-shared's
// `planDay` decides what goes out and when; this file schedules it, re-plans after every log and
// return to the app, and reads back what happened. A notification that was tapped (or answered
// with a button) counts as acted, one still in the tray as missed, and one that left the tray
// untouched as ignored. Imported once at startup: the action task must be defined globally.

import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import * as TaskManager from 'expo-task-manager';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { upsertRecord } from '@/db/mutate';
import { kv } from '@/lib/kv';
import {
  bedtimeOf,
  dayKey,
  type Delivered,
  type Goal,
  hourOfDay,
  inSpan,
  keepUnits,
  type NotifyChannel,
  NOTIFY_CHANNELS,
  type NextAction,
  type PaContext,
  planDay,
  type Tier,
} from '@/shared';

import { type NotifiedInsight, recordNotification, stateOf } from './loop-store';
import { phraseItemFor, requestPhrases, wordsFor } from './phrasing';

const TASK = 'halo-notification-actions';
const SCHEDULED_KEY = 'notify.scheduled';
const DELIVERED_KEY = 'notify.delivered';
const TAPPED_KEY = 'notify.tapped';
const SNOOZED_KEY = 'notify.snoozed';
const SUPPRESSED_KEY = 'notify.suppressed';
const HANDLED_KEY = 'notify.handled';
/** The latest dev test response, for the dev screen. */
export const LAST_RESPONSE_KEY = 'notify.lastResponse';

/** Button actions that never open the app: only the background task handles them. */
const BACKGROUND_ACTIONS = new Set(['water', 'later']);

const HOUR_MS = 3_600_000;
const KEEP_DELIVERED_MS = 3 * 24 * HOUR_MS;
const KEEP_IDS = 60;

/** Everything a notification carries, so a response can act without the app's state. */
type Payload = {
  halo: 1;
  insight: NotifiedInsight;
  channel: NotifyChannel;
  /** Quiet hours as [from, to) clock hours, for snoozing without the app. */
  quiet: [number, number];
  /** Dev-screen test: responses are only recorded, never acted on. */
  dev?: boolean;
};

export type Scheduled = {
  nid: string;
  at: number;
  title: string;
  body: string;
  insight: NotifiedInsight;
  channel: NotifyChannel;
  snooze?: boolean;
};

type DeliveredEntry = Delivered & { nid: string; insight: NotifiedInsight; inTray: boolean };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = kv.getString(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
const write = (key: string, value: unknown) => kv.set(key, JSON.stringify(value));
const remember = (key: string, id: string) =>
  write(key, [id, ...read<string[]>(key, []).filter((x) => x !== id)].slice(0, KEEP_IDS));

const CATEGORIES = {
  log: 'halo-log',
  water: 'halo-water',
  weigh: 'halo-weigh',
  plain: 'halo-plain',
} as const;

function categoryFor(action: NextAction) {
  if (action?.kind === 'water') return CATEGORIES.water;
  if (action?.kind === 'log') return CATEGORIES.log;
  if (action?.kind === 'weigh') return CATEGORIES.weigh;
  return CATEGORIES.plain;
}

function payloadOf(content: Notifications.NotificationContent): Payload | null {
  let data = content.data as unknown;
  // Background responses on Android can carry the data as a JSON string.
  const raw = (content as { dataString?: string }).dataString;
  if ((!data || !Object.keys(data as object).length) && raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return data && (data as Payload).halo === 1 ? (data as Payload) : null;
}

// Never in the foreground (SPEC §4): Today's brief already says the same thing.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const payload = payloadOf(notification.request.content);
    if (payload && !payload.dev && AppState.currentState === 'active') {
      remember(SUPPRESSED_KEY, notification.request.identifier);
      return {
        shouldShowBanner: false,
        shouldShowList: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
      };
    }
    return {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    };
  },
});

// Button taps while the app is backgrounded or closed (Android runs this task for them).
TaskManager.defineTask<Notifications.NotificationTaskPayload>(TASK, async ({ data, error }) => {
  if (error || !data || !('actionIdentifier' in data)) return;
  await handleResponse(data as Notifications.NotificationResponse, false);
});

/** Channels, action buttons and the background task. Safe to call more than once. */
export async function setupNotifications() {
  for (const [id, name] of Object.entries(NOTIFY_CHANNELS)) {
    await Notifications.setNotificationChannelAsync(id, {
      name,
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const later = {
    identifier: 'later',
    buttonTitle: 'Later',
    options: { opensAppToForeground: false },
  };
  const open = (title: string) => ({
    identifier: 'open',
    buttonTitle: title,
    options: { opensAppToForeground: true },
  });
  await Notifications.setNotificationCategoryAsync(CATEGORIES.log, [open('Log it'), later]);
  await Notifications.setNotificationCategoryAsync(CATEGORIES.weigh, [open('Weigh in'), later]);
  await Notifications.setNotificationCategoryAsync(CATEGORIES.water, [
    { identifier: 'water', buttonTitle: 'Add a glass', options: { opensAppToForeground: false } },
    later,
  ]);
  await Notifications.setNotificationCategoryAsync(CATEGORIES.plain, [later]);
  await Notifications.registerTaskAsync(TASK);
}

/** Opens what the brief prepared: the logger pre-filled, the weigh-in sheet, or Today. */
function openFor(action: NextAction) {
  // On a cold start the navigator mounts a moment after the response arrives.
  setTimeout(() => {
    if (action?.kind === 'log')
      router.navigate({ pathname: '/log', params: { note: action.note } });
    else if (action?.kind === 'weigh') router.push('/weigh-in');
    else router.navigate('/');
  }, 300);
}

/** "Later": the same words again in an hour (15 minutes for bedtime), unless that's quiet time. */
async function snooze(content: Notifications.NotificationContent, payload: Payload) {
  const minutes = payload.insight.type === 'bedtime' ? 15 : 60;
  const at = Date.now() + minutes * 60_000;
  if (inSpan(hourOfDay(new Date(at)), payload.quiet[0], payload.quiet[1])) return;
  const nid = await Notifications.scheduleNotificationAsync({
    content: {
      title: content.title ?? '',
      body: content.body ?? '',
      data: payload,
      categoryIdentifier: categoryFor(payload.insight.action),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(at),
      channelId: payload.channel,
    },
  });
  const entry: Scheduled = {
    nid,
    at,
    title: content.title ?? '',
    body: content.body ?? '',
    insight: payload.insight,
    channel: payload.channel,
    snooze: true,
  };
  write(SCHEDULED_KEY, [...read<Scheduled[]>(SCHEDULED_KEY, []), entry]);
}

/** A tap or a button, from the app (foreground) or the background task. Each is handled once. */
export async function handleResponse(
  response: Notifications.NotificationResponse,
  foreground: boolean,
) {
  const { identifier: nid, content } = response.notification.request;
  const payload = payloadOf(content);
  if (!payload) return;
  const action = response.actionIdentifier;
  const key = `${nid}:${action}`;
  if (read<string[]>(HANDLED_KEY, []).includes(key)) return;
  remember(HANDLED_KEY, key);

  if (payload.dev) {
    write(LAST_RESPONSE_KEY, { action, foreground, at: Date.now() });
    if (action !== Notifications.DEFAULT_ACTION_IDENTIFIER)
      await Notifications.dismissNotificationAsync(nid);
    return;
  }

  const now = Date.now();
  if (action === 'later') {
    remember(SNOOZED_KEY, nid);
    await Notifications.dismissNotificationAsync(nid);
    await snooze(content, payload);
    return;
  }
  remember(TAPPED_KEY, nid);
  recordNotification(payload.insight, 'acted', now, nid);
  if (action === 'water') {
    const ml = payload.insight.action?.kind === 'water' ? payload.insight.action.ml : 250;
    upsertRecord('water', { day: dayKey(new Date(now)), at: now, ml });
    await Notifications.dismissNotificationAsync(nid);
    return;
  }
  if (foreground) openFor(payload.insight.action);
}

/** Taps and buttons that open the app (including the one that launched it). Root layout only. */
export function useNotificationResponses() {
  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    // Buttons that don't open the app run in the background task, in another process whose
    // "handled" note this one can't see; handling them here too would log water twice.
    if (last && !BACKGROUND_ACTIONS.has(last.actionIdentifier)) void handleResponse(last, true);
  }, [last]);
}

/**
 * Reads back what happened to the notifications that came due: acted, missed (still in the tray)
 * or ignored (gone untouched). Clears stale ones from the tray. Returns what's still scheduled.
 */
async function reconcile(now: number): Promise<Scheduled[]> {
  const scheduled = read<Scheduled[]>(SCHEDULED_KEY, []);
  const tray = new Set(
    (await Notifications.getPresentedNotificationsAsync()).map((n) => n.request.identifier),
  );
  const tapped = new Set(read<string[]>(TAPPED_KEY, []));
  const snoozed = new Set(read<string[]>(SNOOZED_KEY, []));
  const suppressed = new Set(read<string[]>(SUPPRESSED_KEY, []));
  let delivered = read<DeliveredEntry[]>(DELIVERED_KEY, []);

  for (const s of scheduled.filter((x) => x.at <= now)) {
    // Fired while the app was open: never shown, so it never counts.
    if (suppressed.has(s.nid)) continue;
    delivered.push({
      at: s.at,
      day: s.insight.day,
      id: s.insight.id,
      type: s.insight.type,
      nid: s.nid,
      insight: s.insight,
      inTray: true,
    });
  }

  for (const d of delivered) {
    if (!d.inTray) continue;
    if (tapped.has(d.nid)) {
      d.inTray = false;
      recordNotification(d.insight, 'acted', d.at, d.nid);
    } else if (snoozed.has(d.nid)) {
      d.inTray = false;
    } else if (tray.has(d.nid)) {
      // Missed so far. A brief that's closed or out of date leaves the tray quietly.
      const state = stateOf(d.insight.id);
      if (state === 'resolved' || (d.insight.expiresAt != null && now > d.insight.expiresAt)) {
        await Notifications.dismissNotificationAsync(d.nid);
        d.inTray = false;
      } else {
        recordNotification(d.insight, 'pending', d.at, d.nid);
      }
    } else {
      d.inTray = false;
      recordNotification(d.insight, 'ignored', d.at, d.nid);
    }
  }

  delivered = delivered.filter((d) => now - d.at < KEEP_DELIVERED_MS);
  write(DELIVERED_KEY, delivered);
  return scheduled.filter((s) => s.at > now);
}

let running = false;
let again: (() => void) | null = null;

/**
 * Re-plans the notifications from the PA's current view: reads back what happened, cancels what
 * was planned, and schedules the new plan in the brief's words (reworded when cached). Runs one
 * at a time; a call during a run is replayed once it ends.
 */
export async function reschedule(ctx: PaContext, tier: Tier, goal: Goal) {
  if (running) {
    again = () => void reschedule(ctx, tier, goal);
    return;
  }
  running = true;
  try {
    const { granted } = await Notifications.getPermissionsAsync();
    if (!granted) return;
    const now = Date.now();
    const pending = await reconcile(now);
    for (const s of pending.filter((x) => !x.snooze)) {
      await Notifications.cancelScheduledNotificationAsync(s.nid);
    }
    const snoozes = pending.filter((x) => x.snooze);

    const delivered: Delivered[] = [
      ...read<DeliveredEntry[]>(DELIVERED_KEY, []),
      ...snoozes.map((s) => ({
        at: s.at,
        day: s.insight.day,
        id: s.insight.id,
        type: s.insight.type,
      })),
    ];
    const plan = planDay(ctx, delivered);
    const quiet: [number, number] = [bedtimeOf(ctx).hour, ctx.wake.value];

    const next: Scheduled[] = [...snoozes];
    const items = [];
    for (const m of plan) {
      const item = phraseItemFor(m.insight, tier, hourOfDay(new Date(m.at)), goal);
      if (item) items.push(item);
      const words = wordsFor(m.insight, item?.key ?? null);
      const title = keepUnits(words.tagline);
      const body = keepUnits(m.lead ? `${m.lead} ${words.line}` : words.line);
      const insight: NotifiedInsight = {
        id: m.insight.id,
        day: m.day,
        type: m.insight.type,
        severity: m.insight.severity,
        reason: m.insight.reason,
        action: m.insight.action,
        expiresAt: m.insight.expiresAt,
      };
      const payload: Payload = { halo: 1, insight, channel: m.channel, quiet };
      const nid = await Notifications.scheduleNotificationAsync({
        content: { title, body, data: payload, categoryIdentifier: categoryFor(m.insight.action) },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(m.at),
          channelId: m.channel,
        },
      });
      next.push({ nid, at: m.at, title, body, insight, channel: m.channel });
    }
    write(SCHEDULED_KEY, next);
    // Word the planned briefs now, so the next re-plan can use them.
    requestPhrases(items);
  } finally {
    running = false;
    const replay = again;
    again = null;
    replay?.();
  }
}

/** What's planned, for the dev screen. */
export const readScheduled = () => read<Scheduled[]>(SCHEDULED_KEY, []);

/** Dev screen: sends the next planned notification in 10 seconds, marked so it changes nothing. */
export async function sendTestOfNext(): Promise<string> {
  const next = readScheduled().find((s) => s.at > Date.now());
  if (!next) return 'nothing planned';
  const payload: Payload = {
    halo: 1,
    insight: next.insight,
    channel: next.channel,
    quiet: [0, 0],
    dev: true,
  };
  await Notifications.scheduleNotificationAsync({
    content: {
      title: next.title,
      body: next.body,
      data: payload,
      categoryIdentifier: categoryFor(next.insight.action),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 10,
      channelId: next.channel,
    },
  });
  return `in 10 s: ${next.title}`;
}
