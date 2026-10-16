import { describe, expect, it } from 'vitest';

import { FACTORS, labResults, type LabReading, surfaceFactors } from '../src/blood-work';
import { BANNED } from '../src/phrase';

let n = 0;
const reading = (over: Partial<LabReading> & Pick<LabReading, 'metric' | 'value'>): LabReading => ({
  id: `r${n++}`,
  label: null,
  unit: 'mg/dL',
  qualifier: null,
  refLo: null,
  refHi: null,
  day: '2026-10-16',
  reportId: 'rep',
  ...over,
});

describe('labResults', () => {
  it('keeps the latest result per test, with how it moved since the previous report', () => {
    const [ldl] = labResults([
      reading({ metric: 'ldl', value: 162, day: '2026-03-14', refHi: 100 }),
      reading({ metric: 'ldl', value: 128, day: '2026-10-16', refHi: 100 }),
    ]);
    expect(ldl).toMatchObject({ value: 128, day: '2026-10-16', state: 'above', far: false });
    expect(ldl).toMatchObject({ stateWord: 'Above range', expected: 'under 100', trend: 'was 162 in Mar' });
  });

  it('puts results outside their range first, then by name', () => {
    const results = labResults([
      reading({ metric: 'hdl', value: 52, refLo: 40 }),
      reading({ metric: 'lab:crp', label: 'CRP', value: 38, unit: 'mg/L', refHi: 5 }),
      reading({ metric: 'creatinine', value: 0.9, refLo: 0.7, refHi: 1.3 }),
    ]);
    expect(results.map((r) => r.label)).toEqual(['CRP', 'Creatinine', 'HDL cholesterol']);
    expect(results[0]).toMatchObject({ state: 'above', far: true });
  });

  it('uses the typical range when the report printed none, and names unknown tests by their label', () => {
    const results = labResults([
      reading({ metric: 'tsh', value: 2.05, unit: 'mIU/L' }),
      reading({ metric: 'lab:free_t4', label: 'Free T4', value: 1.24, unit: 'ng/dL' }),
    ]);
    const tsh = results.find((r) => r.metric === 'tsh');
    const other = results.find((r) => r.metric === 'lab:free_t4');
    expect(tsh).toMatchObject({ stateWord: 'In range', expected: '0.4–4.5', trend: null });
    expect(other).toMatchObject({ label: 'Free T4', range: null, state: null, stateWord: null, expected: null });
  });
});

describe('short words', () => {
  it('words the expected values and the trend without a sentence', async () => {
    const { rangeShort, trendShort } = await import('../src/blood-work');
    expect(rangeShort({ lo: 13, hi: 17 })).toBe('13–17');
    expect(rangeShort({ lo: null, hi: 100 })).toBe('under 100');
    expect(rangeShort({ lo: 40, hi: null })).toBe('over 40');
    expect(rangeShort(null)).toBeNull();
    const now = { value: 15.1, day: '2026-10-16' };
    expect(trendShort(now, { value: 12.6, day: '2026-03-16' })).toBe('was 12.6 in Mar');
    expect(trendShort(now, { value: 12.6, day: '2026-10-02' })).toBe('was 12.6 on 2 Oct');
    expect(trendShort(now, { value: 12.6, day: '2025-03-16' })).toBe('was 12.6 in Mar 2025');
    expect(trendShort(now, { value: 15.1, day: '2026-03-16' })).toBe('same as in Mar');
    expect(trendShort(now, null)).toBeNull();
  });
});

describe('surfaceFactors', () => {
  const results = (rs: Partial<LabReading>[]) =>
    labResults(rs.map((r) => reading(r as LabReading)));

  it('shows only the familiar factors the report covers, in a fixed order', () => {
    const factors = surfaceFactors(
      results([
        { metric: 'tsh', value: 2, unit: 'mIU/L' },
        { metric: 'lab:crp', label: 'CRP', value: 1, unit: 'mg/L' },
        { metric: 'ldl', value: 94, refHi: 100 },
        { metric: 'haemoglobin', value: 15, unit: 'g/dL', refLo: 13, refHi: 17 },
      ]),
    );
    expect(factors.map((f) => f.key)).toEqual(['cholesterol', 'haemoglobin', 'thyroid']);
    expect(factors.every((f) => f.advice == null)).toBe(true);
  });

  it('is led by the value that needs attention, with one step to improve it', () => {
    const [chol] = surfaceFactors(
      results([
        { metric: 'ldl', value: 94, refHi: 100 },
        { metric: 'triglycerides', value: 180, refHi: 150 },
        { metric: 'hdl', value: 52, refLo: 40 },
      ]),
    );
    expect(chol!.lead.metric).toBe('triglycerides');
    expect(chol!.advice).toBe('Fewer sugary drinks and late snacks bring it down.');
  });

  it('points to a doctor when far outside, or for thyroid', () => {
    const [hb, thyroid] = surfaceFactors(
      results([
        { metric: 'haemoglobin', value: 8, unit: 'g/dL', refLo: 13, refHi: 17 },
        { metric: 'tsh', value: 6, unit: 'mIU/L', refLo: 0.4, refHi: 4.5 },
      ]),
    );
    expect(hb!.advice).toBe('Worth showing your doctor.');
    expect(thyroid!.advice).toBe('Worth showing your doctor.');
    const [mild] = surfaceFactors(results([{ metric: 'haemoglobin', value: 12.6, unit: 'g/dL', refLo: 13, refHi: 17 }]));
    expect(mild!.advice).toMatch(/Lentils/);
  });

  it('words every step plainly: nothing banned, nothing diagnostic, no dosing', () => {
    const lines = Object.values(FACTORS).flatMap((f) =>
      Object.values(f.advice).flatMap((a) => [a?.above, a?.below]).filter((x): x is string => !!x),
    );
    lines.push('Worth showing your doctor.');
    for (const line of lines) {
      for (const re of BANNED) expect(line).not.toMatch(re);
      expect(line).not.toMatch(/\b(diabet|anaemi|anemi|deficien|disease|mg\b|mcg|IU\b|supplement|tablet|dose)/i);
      expect(line.length).toBeLessThanOrEqual(90);
    }
  });
});
