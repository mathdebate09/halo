// GENERATED from halo-shared/src/moments.ts by halo-shared/scripts/sync.mjs. Do not edit.

// When the PA reaches out (SPEC §4 "Moments", chunk 17a). The rest of today is projected forward,
// assuming nothing more gets logged; at each candidate moment the PA ranks what it would say then,
// and only a brief that suits the moment goes out. Every log and every return to the app re-plans,
// so the projection never goes stale. The user's caps hold throughout: at most six a day, at least
// 90 minutes apart, never in quiet hours, never within 30 minutes of a log, nothing they keep
// swiping away, and nothing already sent.

import { briefCopy } from './brief-copy';
import { addDays, dayStart } from './day';
import { inQuietHours, usualHour, wrapHour } from './learning';
import { IGNORE_LIMIT, ignoredStreak, outcomeLine } from './loop';
import { rankSignals } from './pa';
import { expectedDayFraction, expectedIntakeFraction } from './scoring';
import { bedtimeOf, type Insight, type InsightKind, type PaContext, quietDays } from './signals';

export const MAX_PER_DAY = 6;
const HOUR_MS = 3_600_000;
export const MIN_GAP_MS = 1.5 * HOUR_MS;
export const AFTER_LOG_MS = 0.5 * HOUR_MS;
/** Nothing is scheduled closer than this to now. */
const MIN_LEAD_MS = 2 * 60_000;
/** A kind ignored three times in a row stays quiet as a push for this many days. */
const MUTE_DAYS = 3;
/** Moments slide later in these steps to keep their distance, up to their latest time. */
const STEP_HOURS = 0.25;

/** One Android channel per kind of moment, so the user can mute any of them on their own. */
export type NotifyChannel = 'meals' | 'pace' | 'weight' | 'sleep' | 'review';
export const NOTIFY_CHANNELS: Record<NotifyChannel, string> = {
  meals: 'Meal times',
  pace: 'Daily pace',
  weight: 'Weigh-in',
  sleep: 'Bedtime',
  review: 'Reviews',
};
export const CHANNEL_OF: Record<InsightKind, NotifyChannel> = {
  meal_window: 'meals',
  protein_pace: 'pace',
  calorie_pace: 'pace',
  calorie_over: 'pace',
  water_pace: 'pace',
  weigh_in: 'weight',
  sleep_debt: 'sleep',
  bedtime: 'sleep',
  wake_ask: 'review',
  usage_ask: 'review',
  sleep_pattern: 'sleep',
  weekly_review: 'review',
  quiet_days: 'review',
  on_track: 'review',
};

export type MomentKind =
  | 'weigh_in'
  | 'breakfast'
  | 'lunch'
  | 'dinner'
  | 'pace'
  | 'wrap_up'
  | 'bedtime'
  | 'weekly_review'
  | 'quiet_days';

/** What each moment may carry: a meal moment only its meal, the pace check only a gap, etc. */
const CARRIES: Record<MomentKind, readonly InsightKind[]> = {
  weigh_in: ['weigh_in'],
  breakfast: ['meal_window'],
  lunch: ['meal_window'],
  dinner: ['meal_window'],
  pace: ['protein_pace', 'calorie_pace', 'water_pace', 'calorie_over'],
  wrap_up: ['protein_pace', 'water_pace', 'calorie_pace'],
  bedtime: ['bedtime'],
  weekly_review: ['weekly_review'],
  quiet_days: ['quiet_days'],
};

/** A notification the PA has decided to send. */
export type Moment = {
  at: number;
  day: string;
  moment: MomentKind;
  insight: Insight;
  /** Yesterday's outcome, said first (morning weigh-in only). */
  lead: string | null;
  channel: NotifyChannel;
};

/** A notification that already reached the tray (or was due to). */
export type Delivered = { at: number; day: string; id: string; type: InsightKind };

/** The PA's view at a later moment today, assuming nothing more gets logged. */
export function projectAt(ctx: PaContext, at: number): PaContext {
  const clock = ctx.hour + (at - ctx.now) / HOUR_MS;
  const capped = Math.min(clock, 24);
  const f = ctx.facts;
  const hour = wrapHour(clock);
  return {
    ...ctx,
    now: at,
    hour,
    facts: {
      ...f,
      hour,
      due: Math.max(expectedIntakeFraction(capped, ctx.windows), f.mealsLogged ? 0.25 : 0),
      dayFraction: expectedDayFraction(capped),
    },
  };
}

/** Tomorrow morning as the PA will find it: nothing logged yet, today's insights now "yesterday". */
function projectTomorrow(ctx: PaContext, at: number): PaContext {
  const hour = wrapHour(ctx.hour + (at - ctx.now) / HOUR_MS);
  return {
    ...ctx,
    now: at,
    hour,
    day: addDays(ctx.day, 1),
    prevNightHours: ctx.facts.sleepHours,
    weighedToday: false,
    lastLogAt: null,
    facts: {
      ...ctx.facts,
      hour,
      mealsLogged: 0,
      loggedTypes: [],
      intake: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
      due: 0,
      dayFraction: expectedDayFraction(hour),
      waterMl: 0,
      steps: null,
      sleepHours: null,
    },
  };
}

/** Swiped away three times in a row, recently: this kind stays out of the tray for now. */
function muted(ctx: PaContext, type: InsightKind): boolean {
  if (ignoredStreak(ctx.history, type) < IGNORE_LIMIT) return false;
  const last = ctx.history
    .filter((r) => r.type === type && r.state === 'ignored')
    .reduce((a, r) => (r.day > a ? r.day : a), '');
  return last > addDays(ctx.day, -MUTE_DAYS);
}

type Candidate = {
  moment: MomentKind;
  /** Earliest and latest clock hour (may pass 24 for after midnight). */
  from: number;
  until: number;
};

/** Which moment wins a clash: the ones tied to a time of day first, then the checks. */
const PRIORITY: readonly MomentKind[] = [
  'bedtime',
  'weigh_in',
  'breakfast',
  'lunch',
  'dinner',
  'weekly_review',
  'pace',
  'wrap_up',
];

/**
 * The notifications to schedule from now on: the rest of today and tomorrow's weigh-in.
 * `delivered` is what already went out (it counts toward today's six and their spacing).
 */
export function planDay(ctx: PaContext, delivered: readonly Delivered[] = []): Moment[] {
  const wake = ctx.wake.value;
  const bed = bedtimeOf(ctx);
  // Bedtime as a clock hour after this morning (00:30 is 24.5).
  const bedClock = bed.hour < 12 ? bed.hour + 24 : bed.hour;
  const inDay = ctx.hour >= 4;

  const candidates: Candidate[] = [];
  if (inDay) {
    for (const meal of ['breakfast', 'lunch', 'dinner'] as const) {
      if (ctx.facts.loggedTypes.includes(meal)) continue;
      const usual = usualHour(ctx.windows, meal);
      candidates.push({ moment: meal, from: usual - 0.25, until: ctx.windows[meal].end });
    }
    candidates.push({ moment: 'pace', from: 15, until: 16.5 });
    candidates.push({ moment: 'wrap_up', from: 20.5, until: 21.5 });
    candidates.push({ moment: 'bedtime', from: bedClock - 0.5, until: bedClock - 0.5 });
    if (dayStart(ctx.day).getDay() === 0) {
      candidates.push({ moment: 'weekly_review', from: 19, until: 20.5 });
    }
    if (ctx.hour < wake + 0.25) {
      candidates.push({ moment: 'weigh_in', from: wake + 0.25, until: wake + 2 });
    }
  }
  candidates.sort((a, b) => PRIORITY.indexOf(a.moment) - PRIORITY.indexOf(b.moment) || a.from - b.from);

  const today = delivered.filter((d) => d.day === ctx.day);
  const taken: number[] = today.map((d) => d.at);
  const sent = new Set(delivered.map((d) => d.id));
  const planned: Moment[] = [];

  const atClock = (h: number) => ctx.now + (h - ctx.hour) * HOUR_MS;
  const fits = (at: number) =>
    at >= ctx.now + MIN_LEAD_MS &&
    (ctx.lastLogAt == null || at - ctx.lastLogAt >= AFTER_LOG_MS) &&
    taken.every((t) => Math.abs(t - at) >= MIN_GAP_MS);

  for (const c of candidates) {
    if (today.length + planned.length >= MAX_PER_DAY) break;
    let hour = c.from;
    while (hour <= c.until && !fits(atClock(hour))) hour += STEP_HOURS;
    if (hour > c.until) continue;
    if (inQuietHours(hour, bed, wake)) continue;
    const at = atClock(hour);
    const view = projectAt(ctx, at);
    const pick = rankSignals(view).ranked.find(
      ({ signal }) =>
        CARRIES[c.moment].includes(signal.type) &&
        (c.moment === 'breakfast' || c.moment === 'lunch' || c.moment === 'dinner'
          ? signal.facts.meal === c.moment
          : true) &&
        !sent.has(signal.id) &&
        !planned.some((p) => p.insight.id === signal.id) &&
        !muted(ctx, signal.type),
    );
    if (!pick) continue;
    planned.push({
      at,
      day: ctx.day,
      moment: c.moment,
      insight: { ...pick.signal, copy: briefCopy(pick.signal) },
      lead: c.moment === 'weigh_in' ? outcomeLine(view) : null,
      channel: CHANNEL_OF[pick.signal.type],
    });
    taken.push(at);
  }

  // Tomorrow's weigh-in (or this morning's, before the 4 am rollover), led by how today went.
  const weighClock = wake + 0.25;
  if (!inDay || ctx.hour >= weighClock) {
    const at = ctx.now + wrapHour(weighClock - ctx.hour) * HOUR_MS;
    const view = projectTomorrow(ctx, at);
    const pick = rankSignals(view).ranked.find(({ signal }) => signal.type === 'weigh_in');
    if (pick && !muted(view, 'weigh_in')) {
      planned.push({
        at,
        day: view.day,
        moment: 'weigh_in',
        insight: { ...pick.signal, copy: briefCopy(pick.signal) },
        lead: outcomeLine(view),
        channel: 'weight',
      });
    }
  }
  // Two quiet days from now: every open re-plans, so this only goes out if the app stays closed.
  const quietAt = atClock(48 + usualHour(ctx.windows, 'lunch') - 0.25 - (inDay ? 0 : 24));
  const quietDay = addDays(ctx.day, 2);
  if (!muted(ctx, 'quiet_days')) {
    const signal = quietDays(ctx, quietDay, quietAt);
    planned.push({
      at: quietAt,
      day: quietDay,
      moment: 'quiet_days',
      insight: { ...signal, copy: briefCopy(signal) },
      lead: null,
      channel: 'review',
    });
  }
  return planned.sort((a, b) => a.at - b.at);
}
