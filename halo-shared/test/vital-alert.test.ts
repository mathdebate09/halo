import { describe, expect, it } from 'vitest';

import { starterQuestion } from '../src/advisor';
import { hourOfDay } from '../src/day';
import type { DayFacts } from '../src/insights';
import { isResolved } from '../src/loop';
import { type Delivered, planDay } from '../src/moments';
import { brief } from '../src/pa';
import { DEFAULT_MEAL_WINDOWS } from '../src/scoring';
import type { InsightRecord, PaContext, VitalReadings } from '../src/signals';
import { areaTip } from '../src/tips';

const DAY = '2026-10-14';

const facts = (over: Partial<DayFacts> = {}): DayFacts => ({
  hour: 13,
  goal: 'lose',
  mealsLogged: 1,
  loggedTypes: ['breakfast'],
  intake: { kcal: 500, proteinG: 30, carbsG: 60, fatG: 15 },
  targets: { kcal: 2000, proteinG: 140, carbsG: 220, fatG: 65, waterMl: 2500, steps: 8000 },
  due: 0.5,
  dayFraction: 0.5,
  waterMl: 1200,
  steps: 4000,
  sleepHours: 7.5,
  sleepNeedHours: 7.5,
  dietScore: 70,
  ...over,
});

function ctx(hh: number, mm: number, readings: VitalReadings | null, over: Partial<PaContext> = {}): PaContext {
  const date = new Date(2026, 9, 14, hh, mm);
  const hour = hourOfDay(date);
  return {
    now: date.getTime(),
    day: DAY,
    hour,
    facts: facts({ hour }),
    windows: DEFAULT_MEAL_WINDOWS,
    wake: { value: 7, source: 'measured' },
    prevNightHours: null,
    usualMeals: {},
    weighedToday: true,
    lastWeighDay: DAY,
    lastLogAt: null,
    history: [],
    readings,
    ...over,
  };
}

const ignored = (n: number): InsightRecord[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `2026-10-1${i}:vital_alert:spo2`,
    day: `2026-10-1${i}`,
    type: 'vital_alert' as const,
    state: 'ignored' as const,
    severity: 95,
    shownAt: 1,
    actedAt: null,
    resolvedAt: null,
    expiresAt: null,
  }));

describe('vital_alert', () => {
  it('stays quiet for normal or missing readings', () => {
    expect(brief(ctx(13, 0, null)).insight.type).not.toBe('vital_alert');
    const normal = { restingHr: 62, spo2: 97, systolic: 118, diastolic: 76, glucoseMgDl: 95, bodyTempC: 36.7 };
    expect(brief(ctx(13, 0, normal)).insight.type).not.toBe('vital_alert');
  });

  it('leads ahead of an open meal window, with the reading against its typical range', () => {
    const b = brief(ctx(13, 0, { spo2: 89 }));
    expect(b.insight.type).toBe('vital_alert');
    expect(b.insight.id).toBe(`${DAY}:vital_alert:spo2`);
    expect(b.insight.copy.line).toBe(
      'Blood oxygen read 89%, below the typical 95–100%. Measure again, and see a doctor if it stays there.',
    );
    expect(b.insight.action).toEqual({ kind: 'advisor' });
  });

  it('is never held behind the brief on screen, said late at night, or backed off', () => {
    const c = ctx(13, 0, { spo2: 89 });
    expect(brief(c, { id: `${DAY}:meal_window:lunch` }).insight.type).toBe('vital_alert');
    expect(brief(ctx(23, 30, { spo2: 89 })).insight.type).toBe('vital_alert');
    expect(brief(ctx(13, 0, { spo2: 89 }, { history: ignored(4) })).score).toBe(95);
  });

  it('says the most urgent one when several are out', () => {
    const b = brief(ctx(13, 0, { restingHr: 115, systolic: 170, diastolic: 95 }));
    expect(b.insight.facts).toMatchObject({ metric: 'blood_pressure', reading: '170/95', side: 'above' });
  });

  it('flags low glucose and high temperature, but never an edge value', () => {
    expect(brief(ctx(13, 0, { glucoseMgDl: 62 })).insight.facts).toMatchObject({ reading: '62 mg/dL', side: 'below' });
    expect(brief(ctx(13, 0, { bodyTempC: 38.4 })).insight.facts).toMatchObject({ reading: '38.4 °C' });
    expect(brief(ctx(13, 0, { spo2: 92, restingHr: 100, glucoseMgDl: 199 })).insight.type).not.toBe('vital_alert');
  });

  it('goes out right away, past the day cap and a recent log', () => {
    const c = ctx(13, 0, { spo2: 89 }, { lastLogAt: new Date(2026, 9, 14, 12, 55).getTime() });
    const delivered: Delivered[] = [7, 8, 9, 10, 11, 12].map((h) => ({
      at: new Date(2026, 9, 14, h, 0).getTime(),
      day: DAY,
      id: `${DAY}:x${h}`,
      type: 'water_pace',
    }));
    const [first] = planDay(c, delivered);
    expect(first?.insight.type).toBe('vital_alert');
    expect(first?.channel).toBe('readings');
    expect(first!.at - c.now).toBe(2 * 60_000);
    // Once sent, it isn't sent again.
    const again = planDay(c, [...delivered, { at: c.now, day: DAY, id: first!.insight.id, type: 'vital_alert' }]);
    expect(again.some((m) => m.insight.type === 'vital_alert')).toBe(false);
  });

  it('waits for the usual wake time in quiet hours', () => {
    const c = ctx(2, 0, { spo2: 89 });
    const alert = planDay(c).find((m) => m.insight.type === 'vital_alert')!;
    expect(new Date(alert.at).getHours()).toBe(7);
  });

  it('resolves once the reading is back in range', () => {
    const record: InsightRecord = { ...ignored(1)[0]!, id: `${DAY}:vital_alert:spo2`, day: DAY, state: 'shown' };
    expect(isResolved(record, ctx(15, 0, { spo2: 89 }))).toBe(false);
    expect(isResolved(record, ctx(15, 0, { spo2: 96 }))).toBe(true);
  });

  it('is the Vitals bubble step, and the Advisor starts from it', () => {
    const c = ctx(13, 0, { spo2: 89 });
    const b = brief(c);
    const tip = areaTip('vitals', c, b);
    expect(tip.line).toBe(b.insight.copy.line);
    // The line already names the reading and its range: no second facts line, no other row.
    expect(tip.facts).toBeNull();
    expect(tip.focus).toBeNull();
    expect(tip.actionLabel).toBe('Ask the Advisor');
    expect(starterQuestion(b.insight)).toBe('What does my blood oxygen reading mean?');
  });
});
