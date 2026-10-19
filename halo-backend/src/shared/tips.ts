// GENERATED from halo-shared/src/tips.ts by halo-shared/scripts/sync.mjs. Do not edit.

// The step behind each of Today's score bubbles (chunk 24a). Not a second opinion: the PA's own
// vetted, ranked signals for that area, worded the same way the brief is, with the numbers named
// against what they're compared with. One step per area, never a list.

import { briefCopy } from './brief-copy.js';
import { formatClock } from './day.js';
import { EARLY, nextMeal, roundGap, summaryPanel, SUGGESTIONS, type NextAction } from './insights.js';
import { type Brief, rankSignals } from './pa.js';
import { type Insight, type InsightKind, isLate, type PaContext, type Signal } from './signals.js';
import { type AreaKey, type VitalsReport, vitalsHeadline } from './vitals.js';

export type TipArea = 'diet' | 'activity' | 'vitals';

export type Tip = {
  area: TipArea;
  /** The step, in one line. */
  line: string;
  /** The numbers behind it and what they're compared with ("620 of 1,900 kcal · usually 900 by 13:00"). */
  facts: string | null;
  action: NextAction;
  actionLabel: string | null;
  /** The PA signal it came from, so acting on it closes the loop like the brief does. */
  briefId: string | null;
  /** That signal, worded (recorded as shown when the tip opens). */
  insight: Insight | null;
  /** Vitals only: the area the step is about (its numbers are worded by the app, in the user's units). */
  focus: AreaKey | null;
};

/** The PA kinds each bubble speaks for. */
const KINDS: Record<TipArea, readonly InsightKind[]> = {
  diet: ['meal_window', 'protein_pace', 'calorie_pace', 'calorie_over', 'water_pace'],
  activity: [],
  vitals: ['vital_alert', 'sleep_debt', 'bedtime', 'sleep_pattern', 'blood_work', 'usage_ask'],
};

const FOCUS: Partial<Record<InsightKind, AreaKey>> = {
  sleep_debt: 'sleep',
  bedtime: 'sleep',
  sleep_pattern: 'sleep',
  usage_ask: 'sleep',
  blood_work: 'blood',
};

const fmt = (n: number) => Math.round(n).toLocaleString('en-GB');

/** "620 of 1,900 kcal · usually 900 by 13:00", or without the pace when the day has barely started. */
function paceFacts(actual: number, target: number, share: number, unit: string, ctx: PaContext, noun = '') {
  const done = `${fmt(actual)} of ${fmt(target)} ${unit}${noun}`;
  if (share < EARLY) return done;
  const usual = fmt(roundGap(target * share, unit));
  return `${done} · usually ${usual} by ${formatClock(Math.floor(ctx.hour), ctx.facts.clock24)}`;
}

function dietFacts(type: InsightKind, ctx: PaContext): string {
  const f = ctx.facts;
  if (type === 'water_pace') return paceFacts(f.waterMl, f.targets.waterMl, f.dayFraction, 'ml', ctx);
  if (type === 'protein_pace') return paceFacts(f.intake.proteinG, f.targets.proteinG, f.due, 'g', ctx, ' protein');
  return paceFacts(f.intake.kcal, f.targets.kcal, f.due, 'kcal', ctx);
}

const fromSignal = (area: TipArea, s: Signal, ctx: PaContext): Tip => {
  const copy = briefCopy(s);
  return {
    area,
    line: copy.line,
    // A critical reading's line already names the reading and its range.
    facts: area === 'diet' ? dietFacts(s.type, ctx) : null,
    action: s.action,
    actionLabel: s.action ? copy.actionLabel : null,
    briefId: s.id,
    insight: { ...s, copy },
    // No focus for a critical reading: another row's numbers beside it would muddle it.
    focus: area === 'vitals' ? (FOCUS[s.type] ?? null) : null,
  };
};

/** The brief on screen if it speaks for this area, else the area's best signal that passed vetting. */
function pick(area: TipArea, ctx: PaContext, current: Brief | null): Signal | null {
  const kinds = KINDS[area];
  if (current && kinds.includes(current.insight.type)) return current.insight;
  return rankSignals(ctx).ranked.find((r) => kinds.includes(r.signal.type))?.signal ?? null;
}

function dietTip(ctx: PaContext, current: Brief | null): Tip {
  const s = pick('diet', ctx, current);
  if (s) return fromSignal('diet', s, ctx);
  const base = { area: 'diet' as const, briefId: null, insight: null, focus: null, facts: dietFacts('calorie_pace', ctx) };
  if (isLate(ctx)) return { ...base, line: 'Done for today. Tomorrow starts fresh.', action: null, actionLabel: null };
  if (ctx.facts.mealsLogged === 0) {
    const { note, label } = SUGGESTIONS[nextMeal(ctx.hour, ctx.facts.loggedTypes)];
    return { ...base, line: 'Your first meal starts the score.', action: { kind: 'log', note }, actionLabel: label };
  }
  // Nothing passed the PA: the day is where it should be.
  return { ...base, line: 'On pace. Nothing needed right now.', action: null, actionLabel: null };
}

function activityTip(ctx: PaContext): Tip {
  const f = ctx.facts;
  const panel = summaryPanel('activity', f);
  const base = { area: 'activity' as const, briefId: null, insight: null, focus: null };
  if (f.steps == null) {
    return { ...base, line: 'No step data yet.', facts: null, action: panel.next.action, actionLabel: panel.next.text };
  }
  return {
    ...base,
    line: panel.next.text,
    facts: paceFacts(f.steps, f.targets.steps, f.dayFraction, 'steps', ctx),
    action: panel.next.action,
    actionLabel: panel.next.action ? panel.next.text : null,
  };
}

function vitalsTip(ctx: PaContext, current: Brief | null, report: VitalsReport | null): Tip {
  const s = pick('vitals', ctx, current);
  if (s) return fromSignal('vitals', s, ctx);
  const { line, focus } = vitalsHeadline(report?.areas ?? []);
  return { area: 'vitals', line, facts: null, action: null, actionLabel: null, briefId: null, insight: null, focus };
}

/**
 * The one step for a bubble. `current` is the brief on screen (so the tip and the brief agree);
 * `vitals` is Today's Vitals report, for the area that most needs care.
 */
export function areaTip(
  area: TipArea,
  ctx: PaContext,
  current: Brief | null = null,
  vitals: VitalsReport | null = null,
): Tip {
  if (area === 'diet') return dietTip(ctx, current);
  if (area === 'activity') return activityTip(ctx);
  return vitalsTip(ctx, current, vitals);
}
