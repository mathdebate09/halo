import { describe, expect, it } from 'vitest';

import { labResults, type LabReading, surfaceFactors } from '../src/blood-work';
import { briefCopy } from '../src/brief-copy';
import { hourOfDay } from '../src/day';
import type { DayFacts } from '../src/insights';
import { BANNED } from '../src/phrase';
import { DEFAULT_MEAL_WINDOWS } from '../src/scoring';
import { detectSignals, type InsightRecord, type PaContext } from '../src/signals';

const DAY = '2026-10-16';
const REPORT = '7f2c1d9e-4b3a-4c8e-9d1f-2a6b5c4d3e2f';

const factors = (rs: { metric: string; value: number; refLo?: number; refHi?: number }[]) =>
  surfaceFactors(
    labResults(
      rs.map(
        (r, i): LabReading => ({
          id: `r${i}`,
          metric: r.metric,
          label: null,
          value: r.value,
          unit: 'mg/dL',
          qualifier: null,
          refLo: r.refLo ?? null,
          refHi: r.refHi ?? null,
          day: DAY,
          reportId: REPORT,
        }),
      ),
    ),
  );

const MIXED = [
  { metric: 'haemoglobin', value: 12.6, refLo: 13, refHi: 17 },
  { metric: 'hba1c', value: 6.1, refLo: 4, refHi: 5.6 },
  { metric: 'ldl', value: 94, refHi: 100 },
];

function ctx(over: Partial<PaContext> = {}, goal: DayFacts['goal'] = 'maintain'): PaContext {
  const date = new Date(2026, 9, 16, 13, 0);
  return {
    now: date.getTime(),
    day: DAY,
    hour: hourOfDay(date),
    facts: {
      hour: 13,
      goal,
      mealsLogged: 1,
      loggedTypes: ['breakfast'],
      intake: { kcal: 900, proteinG: 70, carbsG: 100, fatG: 30 },
      targets: { kcal: 2000, proteinG: 140, carbsG: 220, fatG: 65, waterMl: 2500, steps: 8000 },
      due: 0.5,
      dayFraction: 0.4,
      waterMl: 1200,
      steps: 4000,
      sleepHours: 7.5,
      sleepNeedHours: 7.5,
      dietScore: 70,
    },
    windows: DEFAULT_MEAL_WINDOWS,
    wake: { value: 7, source: 'measured' },
    prevNightHours: null,
    usualMeals: {},
    weighedToday: true,
    lastWeighDay: DAY,
    lastLogAt: null,
    history: [],
    ...over,
  };
}

const briefOf = (c: PaContext) => detectSignals(c, false).find((s) => s.type === 'blood_work');
const withReport = (rs = MIXED, addedDay = DAY) => ({ bloodWork: { reportId: REPORT, addedDay, factors: factors(rs) } });

describe('blood work brief', () => {
  it('says nothing without a new report', () => {
    expect(briefOf(ctx())).toBeUndefined();
    expect(briefOf(ctx(withReport(MIXED, '2026-10-13')))).toBeUndefined();
    expect(briefOf(ctx(withReport(MIXED, '2026-10-14')))).toBeDefined();
  });

  it('speaks about one factor: the one that moves with the plan first', () => {
    const lose = briefOf(ctx(withReport(), 'lose'))!;
    expect(lose.facts).toMatchObject({ focus: 'care', name: 'Blood sugar' });
    const gain = briefOf(ctx(withReport(), 'gain'))!;
    expect(gain.facts).toMatchObject({ focus: 'care', name: 'Haemoglobin' });
    expect(briefCopy(gain)).toEqual({
      tagline: 'Haemoglobin needs care',
      line: 'Lentils, spinach and eggs help, with a squeeze of lemon alongside.',
      actionLabel: 'See blood work',
    });
  });

  it('puts a value far outside its range first, as a doctor visit', () => {
    const far = briefOf(ctx(withReport([...MIXED, { metric: 'triglycerides', value: 300, refHi: 150 }]), 'gain'))!;
    expect(far.facts).toMatchObject({ focus: 'far', name: 'Cholesterol' });
    expect(far.severity).toBe(60);
    expect(briefCopy(far).line).toBe('Worth showing your doctor. Take this report along.');
  });

  it('says so when everything is in range', () => {
    const fine = briefOf(ctx(withReport([{ metric: 'ldl', value: 94, refHi: 100 }])))!;
    expect(briefCopy(fine)).toMatchObject({ tagline: 'Blood work in range', line: 'Everything on your report is in range. The same routine keeps it there.' });
  });

  it('stops once acted on or passed over', () => {
    const seen = (state: InsightRecord['state']): InsightRecord => ({
      id: `2026-10-15:blood_work:${REPORT.slice(0, 8)}`,
      day: '2026-10-15',
      type: 'blood_work',
      state,
      severity: 45,
      shownAt: 1,
      actedAt: null,
      resolvedAt: null,
      expiresAt: null,
    });
    expect(briefOf(ctx({ ...withReport(), history: [seen('acted')] }))).toBeUndefined();
    expect(briefOf(ctx({ ...withReport(), history: [seen('ignored')] }))).toBeUndefined();
    expect(briefOf(ctx({ ...withReport(), history: [seen('shown')] }))).toBeDefined();
  });

  it('words every variant plainly', () => {
    const variants = [
      briefOf(ctx(withReport(), 'gain'))!,
      briefOf(ctx(withReport([{ metric: 'triglycerides', value: 300, refHi: 150 }])))!,
      briefOf(ctx(withReport([{ metric: 'ldl', value: 94, refHi: 100 }])))!,
    ];
    for (const v of variants) {
      const { tagline, line, actionLabel } = briefCopy(v);
      for (const text of [tagline, line, actionLabel ?? '']) for (const re of BANNED) expect(text).not.toMatch(re);
    }
  });
});
