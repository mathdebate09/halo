// One synced `daily_scores` row per day (id = day key): the day's scores as they stand, written
// at most hourly while the app is open and whenever it goes to the background, so the last write
// of a day is its final record. The outcome line, weekly review and advisor read these.

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { upsertRecord } from '@/db/mutate';
import { tierFor } from '@/shared';
import type { TodayScores } from '@/today/today-scores';

const EVERY_MS = 60 * 60_000;

function write(s: TodayScores) {
  upsertRecord('dailyScore', {
    id: s.day,
    diet: s.diet.value,
    activity: s.activity.value,
    vitals: s.vitals.value,
    sleep: s.vitalsReport.areas.find((a) => a.key === 'sleep')?.score ?? null,
    water: s.water,
    overall: s.overall,
    tier: s.provisional ? null : tierFor(s.overall),
    confidence: {
      diet: s.diet.dataBacked,
      activity: s.activity.dataBacked,
      vitals: s.vitals.dataBacked,
      provisional: s.provisional,
      // Each Vitals area's score and the best source behind it (the weekly review, the advisor).
      areas: Object.fromEntries(
        s.vitalsReport.areas.map((a) => [a.key, { score: a.score, source: a.source }]),
      ),
    },
    computedAt: Date.now(),
  });
}

export function useDailyScoreWriter(scores: TodayScores) {
  const latest = useRef(scores);
  latest.current = scores;
  const last = useRef<{ day: string; at: number; overall: number } | null>(null);

  // Hourly while open, and straight away on a new day or the first run.
  useEffect(() => {
    const prev = last.current;
    const now = Date.now();
    const due = !prev || prev.day !== scores.day || now - prev.at >= EVERY_MS;
    if (!due || (prev && prev.day === scores.day && prev.overall === scores.overall)) return;
    write(scores);
    last.current = { day: scores.day, at: now, overall: scores.overall };
  }, [scores.day, scores.overall, scores.now]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'background') return;
      const s = latest.current;
      write(s);
      last.current = { day: s.day, at: Date.now(), overall: s.overall };
    });
    return () => sub.remove();
  }, []);
}
