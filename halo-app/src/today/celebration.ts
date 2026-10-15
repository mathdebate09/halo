// The ~1 s reaction to a logged meal (SPEC "Celebration on submit"): restrained, in Oura's
// language. The arc already tweens to the new score; this adds the glow, one light haptic and,
// when the meal moved something, one line.

import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';

import { showToast } from '@/components/toast';
import { onMealLogged } from '@/meals/events';

import type { TodayScores } from './today-scores';

/** Long enough for the sheet to fade and the live query to land the logged meal. */
const SETTLE_MS = 450;

const onPace = (actual: number, expected: number) =>
  expected > 0 && Math.abs(actual / expected - 1) <= 0.1;

/** One line about what the meal changed, or null when nothing notable moved. */
export function mealReaction(before: TodayScores, after: TodayScores): string | null {
  const b = before.intake;
  const a = after.intake;
  if (
    b.proteinG < b.expectedProteinG &&
    a.proteinG >= a.expectedProteinG &&
    a.expectedProteinG > 0
  ) {
    return 'Protein is on track';
  }
  if (!onPace(b.kcal, b.expectedKcal) && onPace(a.kcal, a.expectedKcal)) {
    return 'Calories are right on pace';
  }
  if (after.overall > before.overall) return `Score up to ${after.overall}`;
  return null;
}

/**
 * Returns a counter for ScoreArc's glow; bumps it after each logged meal. When Today is the
 * screen in view (`announce`) it also adds the haptic and the reaction line as a toast; a meal
 * logged in the Meal Logger shows its line there instead.
 */
export function useMealCelebration(scores: TodayScores, announce: boolean) {
  const latest = useRef(scores);
  latest.current = scores;
  const announcing = useRef(announce);
  announcing.current = announce;
  const [glow, setGlow] = useState(0);

  useEffect(
    () =>
      onMealLogged(() => {
        const before = latest.current;
        setTimeout(() => {
          setGlow((g) => g + 1);
          if (!announcing.current) return;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          const line = mealReaction(before, latest.current);
          if (line) showToast(line);
        }, SETTLE_MS);
      }),
    [],
  );

  return glow;
}

/**
 * The reaction line for a meal just logged where the user is (the Meal Logger's check), or null.
 * `reset` clears it for the next meal.
 */
export function useMealReaction(scores: TodayScores) {
  const latest = useRef(scores);
  latest.current = scores;
  const [reaction, setReaction] = useState<string | null>(null);

  useEffect(
    () =>
      onMealLogged(() => {
        const before = latest.current;
        setTimeout(() => setReaction(mealReaction(before, latest.current)), SETTLE_MS);
      }),
    [],
  );

  return { reaction, reset: () => setReaction(null) };
}
