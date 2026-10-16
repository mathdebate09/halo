// GENERATED from halo-shared/src/blood-work.ts by halo-shared/scripts/sync.mjs. Do not edit.

// Blood work from confirmed report readings, for any analyte: each test's latest result in plain
// words (against the report's range, or the typical one) with how it moved since the previous
// report; and the few factors people know (cholesterol, blood sugar, haemoglobin, vitamin D, B12,
// thyroid), each led by the value that most needs attention, with one way to improve it when it's
// outside its range. Never diagnostic: no condition names, no dosing; far outside, or where the
// fix isn't a habit (thyroid), it points to a doctor.

import type { Sex } from './plan.js';
import {
  ANALYTES,
  type AnalyteKey,
  formatLabNumber,
  isAnalyteKey,
  rangeFor,
  type RangeState,
  rangeWords,
  type ShownRange,
} from './reports.js';

/** A confirmed report reading, as the app stores it (`day` = YYYY-MM-DD of the test). */
export type LabReading = {
  id: string;
  metric: string;
  label: string | null;
  value: number;
  unit: string;
  qualifier: '<' | '>' | null;
  refLo: number | null;
  refHi: number | null;
  day: string;
  reportId: string | null;
};

/** A test's latest result, ready to show. */
export type LabResult = {
  metric: string;
  label: string;
  value: number;
  unit: string | null;
  qualifier: '<' | '>' | null;
  day: string;
  reportId: string | null;
  range: ShownRange | null;
  state: RangeState | null;
  /** "In range", "Below range", "Above range"; null without a range to compare with. */
  stateWord: string | null;
  /** The expected values, short: "13–17", "under 100", "over 40". */
  expected: string | null;
  /** The previous report's value, short: "was 162 in Mar". */
  trend: string | null;
  /** Well past its range (or, for thyroid, outside it at all): a doctor, not a habit. */
  far: boolean;
  previous: { value: number; day: string } | null;
};

/** Past the range by this share of the bound reads as far outside. */
const FAR = 0.3;

function isFar(value: number, range: ShownRange | null, state: RangeState | null): boolean {
  if (!range || !state || state === 'inside') return false;
  if (state === 'above' && range.hi != null) return value > range.hi * (1 + FAR);
  if (state === 'below' && range.lo != null) return value < range.lo * (1 - FAR);
  return false;
}

export const STATE_WORDS: Record<RangeState, string> = {
  inside: 'In range',
  below: 'Below range',
  above: 'Above range',
};

/** The expected values without a sentence: "13–17", "under 100", "over 40". */
export function rangeShort(range: Pick<ShownRange, 'lo' | 'hi'> | null): string | null {
  if (!range) return null;
  const n = formatLabNumber;
  if (range.lo != null && range.hi != null) return `${n(range.lo)}–${n(range.hi)}`;
  if (range.hi != null) return `under ${n(range.hi)}`;
  if (range.lo != null) return `over ${n(range.lo)}`;
  return null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "was 162 in Mar", "was 162 on 3 Oct" (same month), "was 162 in Mar 2025"; the same → "same as in Mar". */
export function trendShort(
  current: { value: number; day: string },
  previous: { value: number; day: string } | null,
): string | null {
  if (!previous) return null;
  const [y, m, d] = previous.day.split('-').map(Number) as [number, number, number];
  const [ny, nm] = current.day.split('-').map(Number) as [number, number];
  const month = MONTHS[m - 1]!;
  const when = y === ny && m === nm ? `on ${d} ${month}` : y === ny ? `in ${month}` : `in ${month} ${y}`;
  const same = Math.abs(current.value - previous.value) <= Math.abs(previous.value) * 0.01;
  return same ? `same as ${when}` : `was ${formatLabNumber(previous.value)} ${when}`;
}

const outsideFirst = (a: LabResult, b: LabResult) =>
  Number(!a.state || a.state === 'inside') - Number(!b.state || b.state === 'inside') ||
  a.label.localeCompare(b.label);

/** Every test's latest result (newest report wins), the ones outside their range first. */
export function labResults(readings: readonly LabReading[], sex?: Sex | null): LabResult[] {
  const byMetric = new Map<string, LabReading[]>();
  for (const r of readings) byMetric.set(r.metric, [...(byMetric.get(r.metric) ?? []), r]);
  const results: LabResult[] = [];
  for (const [metric, list] of byMetric) {
    const sorted = [...list].sort((a, b) => b.day.localeCompare(a.day));
    const latest = sorted[0]!;
    const before = sorted.find((r) => r.day < latest.day);
    const previous = before ? { value: before.value, day: before.day } : null;
    const range = rangeFor(latest, sex);
    const words = rangeWords(latest.value, latest.qualifier, range, latest.unit || null);
    const state = words?.state ?? null;
    results.push({
      metric,
      label: isAnalyteKey(metric) ? ANALYTES[metric].label : (latest.label ?? metric),
      value: latest.value,
      unit: latest.unit || null,
      qualifier: latest.qualifier,
      day: latest.day,
      reportId: latest.reportId,
      range,
      state,
      stateWord: state ? STATE_WORDS[state] : null,
      expected: rangeShort(range),
      trend: trendShort({ value: latest.value, day: latest.day }, previous),
      far: isFar(latest.value, range, state),
      previous,
    });
  }
  return results.sort(outsideFirst);
}

// ── The familiar factors ────────────────────────────────────────────────────────

export type FactorKey = 'cholesterol' | 'blood_sugar' | 'haemoglobin' | 'vitamin_d' | 'b12' | 'thyroid';

type Advice = { above?: string; below?: string };

const SEE_DOCTOR = 'Worth showing your doctor.';

type FactorDef = {
  label: string;
  /** Its analytes, in the order they lead when none is outside its range. */
  analytes: readonly AnalyteKey[];
  /** How to improve it, per analyte and side; missing → see a doctor. */
  advice: Partial<Record<AnalyteKey, Advice>>;
};

export const FACTORS: Record<FactorKey, FactorDef> = {
  cholesterol: {
    label: 'Cholesterol',
    analytes: ['ldl', 'triglycerides', 'hdl', 'total_cholesterol'],
    advice: {
      ldl: { above: 'More fibre and fewer fried foods bring it down. Oats at breakfast is an easy start.' },
      total_cholesterol: { above: 'More fibre and fewer fried foods bring it down. Oats at breakfast is an easy start.' },
      triglycerides: { above: 'Fewer sugary drinks and late snacks bring it down.' },
      hdl: { below: 'Brisk walks most days lift HDL.' },
    },
  },
  blood_sugar: {
    label: 'Blood sugar',
    analytes: ['hba1c', 'glucose_fasting', 'glucose_random'],
    advice: {
      hba1c: { above: 'A 10-minute walk after meals and fewer sugary drinks bring it down.' },
      glucose_fasting: {
        above: 'A 10-minute walk after meals and fewer sugary drinks bring it down.',
        below: 'Regular meals keep it from dipping.',
      },
      glucose_random: {
        above: 'A 10-minute walk after meals and fewer sugary drinks bring it down.',
        below: 'Regular meals keep it from dipping.',
      },
    },
  },
  haemoglobin: {
    label: 'Haemoglobin',
    analytes: ['haemoglobin'],
    advice: { haemoglobin: { below: 'Lentils, spinach and eggs help, with a squeeze of lemon alongside.' } },
  },
  vitamin_d: {
    label: 'Vitamin D',
    analytes: ['vitamin_d'],
    advice: { vitamin_d: { below: 'Fifteen minutes of midday sun most days helps.' } },
  },
  b12: {
    label: 'Vitamin B12',
    analytes: ['b12'],
    advice: { b12: { below: 'Eggs, milk, curd and fish help.' } },
  },
  thyroid: {
    label: 'Thyroid',
    analytes: ['tsh'],
    // Not a habit to change: outside its range at all goes to a doctor.
    advice: {},
  },
};

export const FACTOR_ORDER: readonly FactorKey[] = [
  'cholesterol',
  'blood_sugar',
  'haemoglobin',
  'vitamin_d',
  'b12',
  'thyroid',
];

/** A familiar factor as Vitals shows it: its leading result and, when it needs care, one step. */
export type Factor = { key: FactorKey; label: string; lead: LabResult; advice: string | null };

const isOutside = (r: LabResult) => r.state === 'above' || r.state === 'below';

/**
 * The familiar factors the results cover, in a fixed order. Each is led by its first result outside
 * its range (in the factor's order), else its first result; the step is for that result.
 */
export function surfaceFactors(results: readonly LabResult[]): Factor[] {
  const byMetric = new Map(results.map((r) => [r.metric, r]));
  const factors: Factor[] = [];
  for (const key of FACTOR_ORDER) {
    const def = FACTORS[key];
    const present = def.analytes.map((a) => byMetric.get(a)).filter((r): r is LabResult => r != null);
    if (present.length === 0) continue;
    const lead = present.find(isOutside) ?? present[0]!;
    let advice: string | null = null;
    if (isOutside(lead)) {
      const side = def.advice[lead.metric as AnalyteKey]?.[lead.state as 'above' | 'below'];
      advice = lead.far || !side ? SEE_DOCTOR : side;
    }
    factors.push({ key, label: def.label, lead, advice });
  }
  return factors;
}
