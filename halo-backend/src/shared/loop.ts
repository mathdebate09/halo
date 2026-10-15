// GENERATED from halo-shared/src/loop.ts by halo-shared/scripts/sync.mjs. Do not edit.

// Loop closure (SPEC §4): every insight that reached the user is stored as shown, then acted,
// resolved or ignored. The loop decides those transitions, backs off kinds the user keeps
// ignoring, and turns yesterday into one forward-looking line the next morning.

import { addDays } from './day.js';
import { behind } from './insights.js';
import type { InsightKind, InsightRecord, InsightState, PaContext } from './signals.js';
import { round } from './units.js';

/** Ignored this many times in a row, a kind stops being pushed for a while. */
export const IGNORE_LIMIT = 3;
/** After two ignored weigh-ins in a row, ask every third day until the next weigh-in. */
const WEIGH_IGNORE_LIMIT = 2;
const WEIGH_EVERY_DAYS = 3;

const newestFirst = (a: InsightRecord, b: InsightRecord) =>
  (b.shownAt ?? 0) - (a.shownAt ?? 0) || b.day.localeCompare(a.day);

/** How many times in a row (newest first) the user let this kind go without acting. */
export function ignoredStreak(history: readonly InsightRecord[], type: InsightKind): number {
  let streak = 0;
  for (const r of history.filter((h) => h.type === type).sort(newestFirst)) {
    if (r.state === 'ignored') streak += 1;
    else if (r.state === 'acted' || r.state === 'resolved') break;
  }
  return streak;
}

/** Daily, unless the last two asks were ignored: then every third day until they weigh in. */
export function weighInDue(
  history: readonly InsightRecord[],
  day: string,
  lastWeighDay: string | null,
): boolean {
  const since = history
    .filter((r) => r.type === 'weigh_in' && (lastWeighDay == null || r.day > lastWeighDay))
    .sort(newestFirst);
  let streak = 0;
  for (const r of since) {
    if (r.state !== 'ignored') break;
    streak += 1;
  }
  if (streak < WEIGH_IGNORE_LIMIT) return true;
  return since[0]!.day <= addDays(day, -WEIGH_EVERY_DAYS);
}

/** Whether the gap behind a stored insight has closed, judged on today's facts. */
export function isResolved(record: InsightRecord, ctx: PaContext): boolean {
  const f = ctx.facts;
  switch (record.type) {
    case 'meal_window': {
      const meal = record.id.split(':')[2];
      return f.loggedTypes.includes(meal as never);
    }
    case 'protein_pace':
      return !behind(f.intake.proteinG, f.targets.proteinG, f.due);
    case 'calorie_pace':
      return !behind(f.intake.kcal, f.targets.kcal, f.due);
    case 'water_pace':
      return !behind(f.waterMl, f.targets.waterMl, f.dayFraction);
    case 'weigh_in':
      return ctx.weighedToday;
    default:
      // Calories over can't un-happen; sleep is judged by the next night.
      return false;
  }
}

const isSleep = (type: InsightKind) => type === 'bedtime' || type === 'sleep_debt';
/** Slept within this much of need counts as caught up. */
const CAUGHT_UP = 0.25;

export type Transition = { id: string; state: InsightState; at: number };

/**
 * What changed since the stored states: today's open insights resolve when their gap closes and
 * are ignored once they expire untouched; anything still open from an earlier day is closed out
 * (sleep by how last night went).
 */
export function transitions(history: readonly InsightRecord[], ctx: PaContext): Transition[] {
  const out: Transition[] = [];
  const set = (r: InsightRecord, state: InsightState) => {
    if (r.state !== state) out.push({ id: r.id, state, at: ctx.now });
  };
  const sleptEnough =
    ctx.facts.sleepHours != null && ctx.facts.sleepHours >= ctx.facts.sleepNeedHours - CAUGHT_UP;
  for (const r of history) {
    if (r.state !== 'shown' && r.state !== 'acted') continue;
    if (r.day === ctx.day) {
      if (isResolved(r, ctx)) set(r, 'resolved');
      else if (r.state === 'shown' && r.expiresAt != null && ctx.now > r.expiresAt) set(r, 'ignored');
    } else if (r.day === addDays(ctx.day, -1) && isSleep(r.type)) {
      set(r, sleptEnough ? 'resolved' : r.state === 'acted' ? 'acted' : 'ignored');
    } else if (r.state === 'shown') {
      set(r, 'ignored');
    }
  }
  return out;
}

const NAMES: Partial<Record<InsightKind, string>> = {
  protein_pace: 'protein',
  calorie_pace: 'calories',
  water_pace: 'water',
};

/**
 * The next morning's one line about yesterday: what got closed, or what got closer. Ignored
 * insights say nothing (never shaming). Null when there's nothing worth reporting.
 */
export function outcomeLine(ctx: PaContext): string | null {
  const yesterday = addDays(ctx.day, -1);
  const rows = ctx.history
    .filter((r) => r.day === yesterday && (r.state === 'resolved' || r.state === 'acted'))
    .sort((a, b) => b.severity - a.severity);
  for (const r of rows) {
    if (isSleep(r.type)) {
      const now = ctx.facts.sleepHours;
      const before = ctx.prevNightHours;
      if (now != null && before != null && now - before >= 0.3) {
        return `${round(now, 1)} h last night, better than the night before.`;
      }
      continue;
    }
    const name = NAMES[r.type];
    if (!name) continue;
    if (r.state === 'resolved') {
      return name === 'protein'
        ? 'You closed the protein gap yesterday.'
        : `You caught up on ${name} yesterday.`;
    }
    return `You got closer on ${name} yesterday.`;
  }
  return null;
}
