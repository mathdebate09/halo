import { describe, expect, it } from 'vitest';

import { briefCopy } from '../src/brief-copy';
import { hourOfDay } from '../src/day';
import type { DayFacts } from '../src/insights';
import { brief, type Brief } from '../src/pa';
import { DEFAULT_MEAL_WINDOWS } from '../src/scoring';
import type { PaContext, Signal } from '../src/signals';
import { areaTip } from '../src/tips';
import { AREA_STEPS, type Area, type VitalsReport } from '../src/vitals';

const DAY = '2026-10-14';

const facts = (over: Partial<DayFacts> = {}): DayFacts => ({
  hour: 13,
  goal: 'lose',
  mealsLogged: 0,
  loggedTypes: [],
  intake: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
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

function ctx(hh: number, mm: number, f: Partial<DayFacts> = {}): PaContext {
  const date = new Date(2026, 9, 14, hh, mm);
  const hour = hourOfDay(date);
  return {
    now: date.getTime(),
    day: DAY,
    hour,
    facts: facts({ hour, ...f }),
    windows: DEFAULT_MEAL_WINDOWS,
    wake: { value: 7, source: 'measured' },
    prevNightHours: null,
    usualMeals: {},
    weighedToday: true,
    lastWeighDay: DAY,
    lastLogAt: null,
    history: [],
  };
}

/** A brief on screen, as the provider holds it. */
function onScreen(signal: Omit<Signal, 'id' | 'expiresAt' | 'tab' | 'reason'>): Brief {
  const s: Signal = { id: `${DAY}:${signal.type}`, expiresAt: 0, tab: null, reason: '', ...signal };
  return { insight: { ...s, copy: briefCopy(s) }, score: s.severity, lead: null, trace: { signals: [], dropped: [], ranked: [], held: false } };
}

const area = (key: Area['key'], score: number, state: Area['state']): Area => ({
  key,
  score,
  state,
  confidence: 1,
  source: 'measured',
  signals: [],
});

describe('diet', () => {
  it('is the brief itself when the brief is about food, with the calories named against the usual pace', () => {
    const c = ctx(13, 0, { mealsLogged: 1, loggedTypes: ['breakfast'], intake: { kcal: 620, proteinG: 30, carbsG: 80, fatG: 20 } });
    const b = brief(c);
    expect(b.insight.type).toBe('meal_window');
    const tip = areaTip('diet', c, b);
    expect(tip.line).toBe(b.insight.copy.line);
    expect(tip.action).toEqual(b.insight.action);
    expect(tip.actionLabel).toBe(b.insight.copy.actionLabel);
    expect(tip.briefId).toBe(b.insight.id);
    expect(tip.facts).toBe('620 of 2,000 kcal · usually 1,000 by 13:00');
  });

  it('names protein when the step is about protein', () => {
    const c = ctx(13, 0, { mealsLogged: 1, intake: { kcal: 900, proteinG: 40, carbsG: 100, fatG: 30 } });
    const b = onScreen({ type: 'protein_pace', severity: 50, action: { kind: 'log', note: 'Greek yogurt with berries' }, facts: { gap: 30, at: '13:00' } });
    const tip = areaTip('diet', c, b);
    expect(tip.facts).toBe('40 of 140 g protein · usually 70 by 13:00');
    expect(tip.line).toBe(b.insight.copy.line);
  });

  it('finds its own step when the brief on screen is about something else', () => {
    const c = ctx(13, 0, { mealsLogged: 1, loggedTypes: ['breakfast'], intake: { kcal: 620, proteinG: 30, carbsG: 80, fatG: 20 } });
    const other = onScreen({ type: 'bedtime', severity: 99, action: null, facts: { at: '23:00', need: 7.5 } });
    const tip = areaTip('diet', c, other);
    expect(tip.briefId).toBe(`${DAY}:meal_window:lunch`);
    expect(tip.action?.kind).toBe('log');
  });

  it('asks for the first meal before any window opens, without judging the pace', () => {
    // An early riser: awake at 05:30, breakfast's window hasn't opened.
    const c = { ...ctx(5, 30, { due: 0, dayFraction: 0 }), wake: { value: 5, source: 'measured' as const } };
    const tip = areaTip('diet', c);
    expect(tip.line).toBe('Your first meal starts the score.');
    expect(tip.action).toEqual({ kind: 'log', note: 'Eggs on toast' });
    expect(tip.actionLabel).toBe('Log breakfast');
    expect(tip.facts).toBe('0 of 2,000 kcal');
  });

  it('asks for nothing once the day is over', () => {
    const tip = areaTip('diet', ctx(23, 30, { mealsLogged: 3, due: 1, dayFraction: 1, intake: { kcal: 1900, proteinG: 120, carbsG: 200, fatG: 60 } }));
    expect(tip.line).toBe('Done for today. Tomorrow starts fresh.');
    expect(tip.action).toBeNull();
  });
});

describe('activity', () => {
  it('turns the step gap into a walk, with the steps named against the usual pace', () => {
    const tip = areaTip('activity', ctx(13, 0, { steps: 2000 }));
    expect(tip.line).toBe('A 20-minute walk closes the gap.');
    expect(tip.facts).toBe('2,000 of 8,000 steps · usually 4,000 by 13:00');
    expect(tip.action).toBeNull();
  });

  it('offers the source when there are no steps', () => {
    const tip = areaTip('activity', ctx(13, 0, { steps: null }));
    expect(tip.line).toBe('No step data yet.');
    expect(tip.facts).toBeNull();
    expect(tip.action).toEqual({ kind: 'connect' });
  });
});

describe('vitals', () => {
  it('takes the sleep brief on screen and points at sleep', () => {
    const b = onScreen({ type: 'bedtime', severity: 60, action: null, facts: { at: '23:00', need: 7.5 } });
    const tip = areaTip('vitals', ctx(22, 30), b);
    expect(tip.line).toBe('Start winding down now to get your 7.5 h.');
    expect(tip.focus).toBe('sleep');
    expect(tip.briefId).toBe(b.insight.id);
  });

  it('otherwise gives the step for the area that needs care most', () => {
    const report: VitalsReport = {
      score: { value: 60, dataBacked: true },
      confidence: 1,
      areas: [area('sleep', 40, 'needs_care'), area('heart', 90, 'thriving')],
    };
    const tip = areaTip('vitals', ctx(13, 0), null, report);
    expect(tip.line).toBe(AREA_STEPS.sleep);
    expect(tip.focus).toBe('sleep');
    expect(tip.briefId).toBeNull();
  });
});
