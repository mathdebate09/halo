// The day as it was when the share icon was tapped. The composer lives outside the tabs (no dock),
// so it can't read TodayScoresProvider; Today hands it this frozen copy instead. A shared card is a
// moment, so it shouldn't shift under the user while they arrange it.

import type { DayFacts } from '@/shared';
import { type Theme } from '@/theme/themes';
import type { TodayScores } from '@/today/today-scores';

export type ShareSnapshot = {
  day: string;
  now: Date;
  overall: number;
  provisional: boolean;
  facts: DayFacts;
  tagline: string;
  theme: Theme;
};

let current: ShareSnapshot | null = null;

export function setShareSnapshot(scores: TodayScores, tagline: string, theme: Theme) {
  current = {
    day: scores.day,
    now: scores.now,
    overall: scores.overall,
    provisional: scores.provisional,
    facts: scores.facts,
    tagline,
    theme,
  };
}

/** Set before /share opens; null only if the route was reached some other way (dev reload). */
export function shareSnapshot(): ShareSnapshot | null {
  return current;
}
