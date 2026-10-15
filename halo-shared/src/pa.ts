// The PA (SPEC §4, the core engine). Signals never reach the user directly: the PA knows the
// plan, the learned meal times and bedtime, today's logs and what was already shown, acted on or
// ignored. It vets each signal, bundles the ones that belong together, ranks what's left and
// brings exactly one brief, worded and with its next step prepared.

import { briefCopy } from './brief-copy';
import { ignoredStreak, IGNORE_LIMIT, outcomeLine, weighInDue } from './loop';
import {
  detectSignals,
  type Insight,
  type InsightKind,
  isLate,
  onTrack,
  type PaContext,
  type Signal,
} from './signals';
import { round } from './units';

/** A challenger must beat the brief on screen by this much to replace it (no flip-flopping). */
export const HOLD_MARGIN = 15;
/** Yesterday's outcome leads the brief until this hour. */
const OUTCOME_UNTIL = 11;

const FOOD: readonly InsightKind[] = [
  'meal_window',
  'protein_pace',
  'calorie_pace',
  'calorie_over',
  'water_pace',
  'weigh_in',
];

export type Dropped = { id: string; type: InsightKind; reason: string };
export type Ranked = { id: string; type: InsightKind; score: number; note?: string };

/** How the PA got to its brief: what it saw, what it set aside and why, and the order. */
export type Trace = { signals: Signal[]; dropped: Dropped[]; ranked: Ranked[]; held: boolean };

export type Brief = {
  insight: Insight;
  /** Ranking score of the chosen insight (for the hold on the next pass). */
  score: number;
  /** Yesterday's outcome, said first in the morning. */
  lead: string | null;
  trace: Trace;
};

/** The brief currently on screen, so the next pass can keep it. */
export type Held = { id: string } | null;

/** Vet and bundle: the PA's "basics pass" before anything is ranked. */
function vet(ctx: PaContext, signals: Signal[]): { kept: Signal[]; dropped: Dropped[]; notes: Map<string, string> } {
  const dropped: Dropped[] = [];
  const notes = new Map<string, string>();
  let kept = signals.map((s) => ({ ...s, facts: { ...s.facts } }));
  const drop = (pred: (s: Signal) => boolean, reason: string) => {
    kept = kept.filter((s) => {
      if (!pred(s)) return true;
      dropped.push({ id: s.id, type: s.type, reason });
      return false;
    });
  };
  const find = (type: InsightKind) => kept.find((s) => s.type === type);

  // Can't be acted on now: bedtime is close (or they're asleep).
  if (isLate(ctx)) drop((s) => FOOD.includes(s.type), 'too late in the day for this');

  // The same thing said twice: one wins.
  const meal = find('meal_window');
  if (meal) drop((s) => s.type === 'calorie_pace', `the ${meal.facts.meal} reminder covers it`);
  if (find('bedtime')) drop((s) => s.type === 'sleep_debt', 'the bedtime reminder covers it');

  // Bundle: an open meal window carries the protein gap or the lighter-meal advice.
  const protein = find('protein_pace');
  const over = find('calorie_over');
  if (meal && meal.facts.status === 'open') {
    if (over) {
      meal.facts.light = 1;
      meal.facts.left = over.facts.left ?? 0;
      meal.severity = Math.max(meal.severity, over.severity) + 5;
      drop((s) => s === over, `folded into the ${meal.facts.meal} reminder`);
    } else if (protein) {
      meal.facts.proteinGap = protein.facts.gap ?? 0;
      meal.severity = Math.max(meal.severity, protein.severity) + 5;
      drop((s) => s === protein, `folded into the ${meal.facts.meal} reminder`);
    }
  }
  // Over on calories: any protein suggestion should be a lean one.
  if (over && protein && kept.includes(protein)) {
    protein.action = { kind: 'log', note: 'Grilled chicken with greens' };
  }

  // Back off what keeps getting ignored; go easy on what they already acted on today.
  for (const s of kept) {
    if (ignoredStreak(ctx.history, s.type) >= IGNORE_LIMIT) {
      s.severity *= 0.5;
      notes.set(s.id, `ignored ${IGNORE_LIMIT}+ times, demoted`);
    } else if (ctx.history.some((r) => r.id === s.id && r.state === 'acted')) {
      s.severity *= 0.6;
      notes.set(s.id, 'already acted on, demoted');
    }
  }
  return { kept, dropped, notes };
}

/** A prepared action is worth more than advice alone. */
const scoreOf = (s: Signal) => round(s.severity * (s.action ? 1 : 0.6), 1);

/** Every signal that passes the PA's vetting, best first, with the trace of how it got there. */
export function rankSignals(ctx: PaContext) {
  const weighDue = weighInDue(ctx.history, ctx.day, ctx.lastWeighDay);
  const signals = detectSignals(ctx, weighDue);
  const { kept, dropped, notes } = vet(ctx, signals);
  const ranked = kept
    .map((s) => ({ signal: s, score: scoreOf(s) }))
    .sort((a, b) => b.score - a.score);
  return { signals, dropped, notes, ranked };
}

/** The one brief for right now. `held` is the brief on screen, kept unless clearly beaten. */
export function brief(ctx: PaContext, held: Held = null): Brief {
  const { signals, dropped, notes, ranked } = rankSignals(ctx);
  let pick = ranked[0] ?? { signal: onTrack(ctx), score: scoreOf(onTrack(ctx)) };

  let isHeld = false;
  const current = held && ranked.find((r) => r.signal.id === held.id);
  if (current && current !== pick && pick.score < current.score + HOLD_MARGIN) {
    pick = current;
    isHeld = true;
  }

  const lead = ctx.hour < OUTCOME_UNTIL && !isLate(ctx) ? outcomeLine(ctx) : null;
  return {
    insight: { ...pick.signal, copy: briefCopy(pick.signal) },
    score: pick.score,
    lead,
    trace: {
      signals,
      dropped,
      ranked: ranked.map((r) => ({
        id: r.signal.id,
        type: r.signal.type,
        score: r.score,
        note: notes.get(r.signal.id),
      })),
      held: isHeld,
    },
  };
}
