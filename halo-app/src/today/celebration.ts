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

/** Returns a counter for ScoreArc's glow; bumps it (plus haptic and line) after each logged meal. */
export function useMealCelebration(scores: TodayScores) {
  const latest = useRef(scores);
  latest.current = scores;
  const [glow, setGlow] = useState(0);

  useEffect(
    () =>
      onMealLogged(() => {
        const before = latest.current;
        setTimeout(() => {
          const after = latest.current;
          setGlow((g) => g + 1);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          const line = mealReaction(before, after);
          if (line) showToast(line);
        }, SETTLE_MS);
      }),
    [],
  );

  return glow;
}
