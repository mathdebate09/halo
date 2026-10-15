import { describe, expect, it } from 'vitest';

import { addDays } from '../src/day';
import { BANNED } from '../src/phrase';
import { type ScreenEvent, screenDays } from '../src/sleep';
import {
  AREA_STATE_LABELS,
  AREA_STEPS,
  type Area,
  type AreaKey,
  areaState,
  bandedState,
  bandFor,
  ON_TRACK_STEP,
  pickBands,
  rowStateLabel,
  sleepSpread,
  type VitalsDay,
  vitalsDetail,
  type VitalsInput,
  vitalsHeadline,
  vitalsReport,
  vo2maxScore,
  weightTrend,
  weightTrendScore,
} from '../src/vitals';

const TODAY = '2026-10-16';
const goals = { steps: 8000, activeKcal: 300, exerciseMin: 30 };
/** Days newest first: index 0 is today. */
const days = (n: number, make: (i: number) => Partial<VitalsDay>): VitalsDay[] =>
  Array.from({ length: n }, (_, i) => ({ day: addDays(TODAY, -i), ...make(i) }));
const input = (d: VitalsDay[], extra: Partial<VitalsInput> = {}): VitalsInput => ({
  today: TODAY,
  days: d,
  goals,
  ...extra,
});
const at = (day: string, h: number, m = 0) => {
  const [y, mo, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(y, mo - 1, d, h, m).getTime();
};
const areaOf = (key: AreaKey, d: VitalsDay[], extra?: Partial<VitalsInput>) =>
  vitalsReport(input(d, extra)).areas.find((a) => a.key === key);

describe('vitalsReport', () => {
  it('is never empty: no data gives the medium prior, not data-backed', () => {
    const r = vitalsReport(input([]));
    expect(r.score).toEqual({ value: 70, dataBacked: false });
    // Sleep, movement and body fall back to assumed; heart and screen are never assumed.
    expect(r.areas.map((a) => a.key)).toEqual(['sleep', 'movement', 'body']);
    expect(r.areas.every((a) => a.source === 'assumed')).toBe(true);
  });

  it('uses Health Connect sleep as measured and the screen night as estimated', () => {
    const hc = areaOf('sleep', days(1, () => ({ sleepMin: 450 })))!;
    expect(hc.source).toBe('measured');
    expect(hc.confidence).toBe(1);
    const screen = areaOf('sleep', days(1, () => ({ screenNight: { start: 0, end: 0, hours: 7.5 } })))!;
    expect(screen.source).toBe('estimated');
    expect(screen.confidence).toBe(0.6);
    expect(screen.score).toBe(100);
  });

  it('takes a corrected night over the screen estimate, as measured and marked as entered', () => {
    const d = days(1, () => ({
      sleepMin: 420,
      sleepManual: true,
      screenNight: { start: 0, end: 0, hours: 9.5 },
    }));
    expect(areaOf('sleep', d)!.source).toBe('measured');
    const row = vitalsDetail(input(d), vitalsReport(input(d))).rows[0]!;
    expect(row).toMatchObject({ key: 'sleep', value: 7, source: 'measured', manual: true });
  });

  it('prefers Health Connect over the screen for the same night', () => {
    const a = areaOf('sleep', days(1, () => ({ sleepMin: 330, screenNight: { start: 0, end: 0, hours: 8 } })))!;
    expect(a.source).toBe('measured');
    expect(a.score).toBe(50);
  });

  it('weights an estimated area less than a measured one in the blend', () => {
    // Short estimated sleep, perfect measured heart readings.
    const d = days(1, () => ({ screenNight: { start: 0, end: 0, hours: 4 }, restingHr: 55, spo2: 98 }));
    const r = vitalsReport(input(d));
    const sleep = r.areas.find((a) => a.key === 'sleep')!;
    const heart = r.areas.find((a) => a.key === 'heart')!;
    const plain = (sleep.score * 3 + heart.score * 2) / 5;
    // Confidence pulls the blend toward the measured heart.
    expect(r.score.value).toBeGreaterThan(plain);
    expect(r.score.dataBacked).toBe(true);
  });

  it('never estimates heart readings: no reading, no heart area', () => {
    expect(areaOf('heart', days(14, () => ({ steps: 9000, sleepMin: 450 })))).toBeUndefined();
  });

  it('only reads HRV against at least four days of baseline', () => {
    expect(areaOf('heart', days(1, () => ({ hrvMs: 30 })))).toBeUndefined();
    const withBase = areaOf('heart', days(5, (i) => ({ hrvMs: i === 0 ? 30 : 50 })))!;
    expect(withBase.signals.find((s) => s.key === 'hrv')!.score).toBe(40);
  });

  it('ignores readings older than a week', () => {
    expect(areaOf('heart', days(10, (i) => (i === 9 ? { restingHr: 60 } : {})))).toBeUndefined();
  });

  it('reads resting heart rate against the user’s own baseline', () => {
    const steady = areaOf('heart', days(6, () => ({ restingHr: 60 })))!;
    const up = areaOf('heart', days(6, (i) => ({ restingHr: i === 0 ? 75 : 60 })))!;
    expect(steady.score).toBe(100);
    expect(up.score).toBeLessThan(steady.score);
  });

  it('scores movement from the week, not today', () => {
    const today0 = days(8, (i) => ({ steps: i === 0 ? 0 : 9000, activeKcal: 300, exerciseMin: 30 }));
    const m = areaOf('movement', today0)!;
    expect(m.source).toBe('measured');
    expect(m.score).toBe(100);
  });

  it('counts weekly exercise against 150 minutes', () => {
    const m = areaOf('movement', days(8, (i) => (i === 0 ? {} : { exerciseMin: 10 })))!;
    expect(m.signals.find((s) => s.key === 'exercise_week')!.score).toBeCloseTo((70 / 150) * 100, 0);
  });

  it('scores screen time only with screen data, and late use from last evening', () => {
    expect(areaOf('screen', days(3, () => ({})))).toBeUndefined();
    const calm = areaOf('screen', days(2, (i) => (i === 1 ? { screenLateMin: 0 } : {})))!;
    const late = areaOf('screen', days(2, (i) => (i === 1 ? { screenLateMin: 120 } : {})))!;
    expect(calm.score).toBe(100);
    expect(late.score).toBe(30);
  });

  it('reads the weight trend against the goal', () => {
    const losing = days(10, (i) => ({ weightKg: 80 + i * 0.1 })); // ~0.7 kg/week down
    expect(weightTrend(input(losing))).toBeCloseTo(-0.7, 1);
    expect(areaOf('body', losing, { profile: { goal: 'lose' } })!.score).toBe(100);
    expect(areaOf('body', losing, { profile: { goal: 'gain' } })!.score).toBeLessThan(50);
    expect(weightTrendScore(0, 'maintain')).toBe(100);
    // Too few weigh-ins: no trend, assumed.
    expect(areaOf('body', days(2, () => ({ weightKg: 80 })))!.source).toBe('assumed');
  });
});

describe('sleep regularity', () => {
  it('needs four timed nights and widens with a scattered schedule', () => {
    const night = (day: string, bed: number, wake: number) => ({
      day,
      hours: 7,
      start: at(addDays(day, -1), bed),
      end: at(day, wake),
      source: 'measured' as const,
      manual: false,
    });
    const regular = [0, 1, 2, 3].map((i) => night(addDays(TODAY, -i), 23, 7));
    expect(sleepSpread(regular.slice(0, 3))).toBeNull();
    expect(sleepSpread(regular)).toBe(0);
    const scattered = [22, 1, 23, 2].map((bed, i) => night(addDays(TODAY, -i), bed, 7));
    expect(sleepSpread(scattered)!).toBeGreaterThan(0.5);
  });
});

describe('states, bands and words', () => {
  it('maps scores to area states', () => {
    expect(areaState(80)).toBe('thriving');
    expect(areaState(79)).toBe('steady');
    expect(areaState(59)).toBe('needs_care');
  });

  it('uses the user’s own band with four or more days, otherwise the typical range', () => {
    expect(bandFor([60, 62, 64, 66], [50, 80])).toEqual({ lo: 61.5, hi: 64.5, own: true });
    expect(bandFor([60], [50, 80])).toEqual({ lo: 50, hi: 80, own: false });
    expect(bandFor([], null)).toBeNull();
    const own = { lo: 453, hi: 641, own: true };
    expect(rowStateLabel({ state: 'outside', value: 700, band: own })).toBe('Outside your usual range');
    // A low score inside the user's own band is outside the typical range, not their usual one.
    expect(rowStateLabel({ state: 'outside', value: 605, band: own })).toBe('Outside the typical range');
  });

  it('never lets the state word disagree with the slider', () => {
    const band = { lo: 9.4, hi: 10.5, own: true };
    // Short night under the usual band: outside, even though the score against need is fine.
    expect(bandedState({ key: 'sleep', value: 6.6, state: 'in_range', band })).toBe('outside');
    // Past the band on the better side keeps its word.
    expect(bandedState({ key: 'exercise_week', value: 397, state: 'strong', band: { lo: 150, hi: 300, own: false } })).toBe('strong');
    expect(bandedState({ key: 'resting_hr', value: 52, state: 'strong', band: { lo: 58, hi: 64, own: true } })).toBe('strong');
    expect(bandedState({ key: 'screen_daily', value: 605, state: 'in_range', band: { lo: 453, hi: 541, own: true } })).toBe('outside');
    // Weight follows its trend, not the band.
    expect(bandedState({ key: 'weight_trend', value: 78, state: 'strong', band: { lo: 79, hi: 80, own: true } })).toBe('strong');
  });

  it('places VO2 max against age and sex', () => {
    expect(vo2maxScore(44, 25, 'male')).toBe(85);
    expect(vo2maxScore(44, 25, 'male')).toBeLessThan(vo2maxScore(44, 55, 'male'));
  });

  it('asks for heart readings it doesn’t have instead of guessing them', () => {
    const d = days(3, () => ({ sleepMin: 420 }));
    const detail = vitalsDetail(input(d), vitalsReport(input(d)));
    expect(detail.rows.map((r) => r.key)).toEqual(['sleep']);
    expect(detail.stubs.map((s) => s.key)).toEqual([
      'resting_hr',
      'hrv',
      'spo2',
      'blood_pressure',
      'glucose',
      'screen_late',
    ]);
    expect(detail.stubs.find((s) => s.key === 'hrv')!.action).toBe('connect');
    expect(detail.stubs.find((s) => s.key === 'screen_late')!.action).toBe('usage_access');
  });

  it('labels a screen-estimated night as estimated in its row', () => {
    const d = days(1, () => ({ screenNight: { start: 0, end: 0, hours: 6.2 } }));
    const row = vitalsDetail(input(d), vitalsReport(input(d))).rows[0]!;
    expect(row).toMatchObject({ key: 'sleep', value: 6.2, source: 'estimated' });
  });
});

const fake = (key: AreaKey, score: number, source: Area['source'] = 'measured'): Area => ({
  key,
  score,
  state: areaState(score),
  confidence: source === 'measured' ? 1 : source === 'estimated' ? 0.6 : 0.3,
  source,
  signals: [],
});

describe('pickBands', () => {
  it('takes the first three areas with data, in priority order', () => {
    const areas = [fake('sleep', 85), fake('heart', 90), fake('movement', 70), fake('screen', 75), fake('body', 80)];
    expect(pickBands(areas)).toEqual(['sleep', 'heart', 'movement']);
  });

  it('always shows the weakest area when it needs care', () => {
    const areas = [fake('sleep', 85), fake('heart', 90), fake('movement', 70), fake('screen', 40)];
    expect(pickBands(areas)).toEqual(['sleep', 'heart', 'screen']);
  });

  it('fills from assumed areas when fewer than three have data', () => {
    const areas = [fake('sleep', 70, 'assumed'), fake('heart', 88), fake('movement', 70, 'assumed'), fake('body', 70, 'assumed')];
    expect(pickBands(areas)).toEqual(['sleep', 'heart', 'movement']);
  });

  it('shows every area with data before any assumed one, assumed ones by priority', () => {
    const areas = [fake('sleep', 70, 'assumed'), fake('movement', 70, 'assumed'), fake('screen', 82), fake('body', 75)];
    expect(pickBands(areas)).toEqual(['sleep', 'screen', 'body']);
  });

  it('drops a held pick when an area that needs care isn’t on it', () => {
    const areas = [fake('sleep', 74), fake('movement', 84), fake('screen', 18), fake('body', 70, 'assumed')];
    expect(pickBands(areas, ['sleep', 'movement', 'body'])).toEqual(['sleep', 'movement', 'screen']);
  });

  it('keeps a held pick for the day while its areas exist', () => {
    const areas = [fake('sleep', 85), fake('heart', 65), fake('movement', 70), fake('screen', 75)];
    expect(pickBands(areas, ['sleep', 'movement', 'screen'])).toEqual(['sleep', 'movement', 'screen']);
    expect(pickBands(areas.filter((a) => a.key !== 'screen'), ['sleep', 'movement', 'screen'])).toEqual([
      'sleep',
      'heart',
      'movement',
    ]);
  });
});

describe('vitalsHeadline', () => {
  it('names the strong area and the one with room', () => {
    const h = vitalsHeadline([fake('sleep', 88), fake('heart', 75), fake('movement', 45)]);
    expect(h).toEqual({
      headline: 'Strong sleep, with room in movement',
      line: AREA_STEPS.movement,
      focus: 'movement',
    });
  });

  it('never puts an assumed area in the words', () => {
    const h = vitalsHeadline([fake('sleep', 74), fake('movement', 84), fake('body', 70, 'assumed')]);
    expect(h).toEqual({ headline: 'Strong movement, steady sleep', line: AREA_STEPS.sleep, focus: 'sleep' });
  });

  it('says when everything is in a good place', () => {
    expect(vitalsHeadline([fake('sleep', 90), fake('heart', 85)]).line).toBe(ON_TRACK_STEP);
  });

  it('never uses diagnostic words or the banned habits, and never numbers', () => {
    const diagnostic = /\b(abnormal|disease|disorder|diagnos\w*|hypertension|hypotension|diabetes|diabetic|arrhythmia|apnea|insomnia|obes\w*|risk|danger\w*|warning|condition|symptom\w*|high|low)\b/i;
    const keys: AreaKey[] = ['sleep', 'heart', 'movement', 'screen', 'body'];
    const texts = new Set<string>([
      ...Object.values(AREA_STEPS),
      ...Object.values(AREA_STATE_LABELS),
      ON_TRACK_STEP,
      ...(['strong', 'in_range', 'outside'] as const).flatMap((state) =>
        [0, 50].map((value) => rowStateLabel({ state, value, band: { lo: 10, hi: 20, own: true } })),
      ),
    ]);
    const scores = [30, 65, 90];
    for (const a of keys) {
      for (const b of keys) {
        if (a === b) continue;
        for (const sa of scores) {
          for (const sb of scores) {
            const h = vitalsHeadline([fake(a, sa), fake(b, sb)]);
            texts.add(h.headline);
            texts.add(h.line);
          }
        }
      }
    }
    for (const t of texts) {
      expect(t, t).not.toMatch(diagnostic);
      expect(t, t).not.toMatch(/\d/);
      for (const rule of BANNED) expect(t, `${t} ~ ${rule.source}`).not.toMatch(rule);
    }
  });
});

describe('screenDays', () => {
  const ev = (t: number, on: boolean): ScreenEvent => ({ at: t, on });
  it('totals on-minutes per 4 am day and the late share after 23:00, dropping the partial first day', () => {
    const d1 = '2026-10-14';
    const d2 = '2026-10-15';
    const result = screenDays([
      ev(at(d1, 12), true),
      ev(at(d1, 12, 30), false),
      ev(at(d2, 9), true),
      ev(at(d2, 10), false),
      // 23:30 → 00:30 counts for the 15th, all of it late
      ev(at(d2, 23, 30), true),
      ev(at('2026-10-16', 0, 30), false),
    ]);
    expect(result).toEqual([{ day: d2, onMin: 120, lateMin: 60 }]);
  });
});
