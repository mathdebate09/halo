// What each Vitals row is called, where it came from, and how it compares, in plain words: "Shorter
// than your usual 9.4–10.5 h", never a bare state word. Weight follows the user's unit; minutes
// past an hour read as hours.

import type { MetricKey, RowState, VitalRow, VitalsSource } from '@/shared';
import { kgToLb, round } from '@/shared';
import type { ThemeColors } from '@/theme/themes';

export type RowKey = MetricKey | 'body_fat';

export const METRIC_LABELS: Record<RowKey, string> = {
  sleep: 'Last night',
  sleep_avg: 'Sleep this week',
  sleep_regularity: 'Sleep timing',
  resting_hr: 'Resting heart rate',
  hrv: 'Heart rate variability',
  spo2: 'Blood oxygen',
  blood_pressure: 'Blood pressure',
  glucose: 'Glucose',
  resp_rate: 'Breathing rate',
  body_temp: 'Body temperature',
  vo2max: 'VO₂ max',
  week_activity: 'Steps a day this week',
  exercise_week: 'Exercise this week',
  steps_trend: 'Step trend',
  screen_late: 'After 11 pm last night',
  screen_daily: 'Screen time a day',
  weight_trend: 'Weight',
  body_fat: 'Body fat',
  blood_work: 'Blood work',
};

/** Where a row's number came from, in words the user knows. */
export function sourceText(row: VitalRow): string {
  if (row.manual) return 'Your entry';
  if (row.fromReport) return 'Lab report';
  if (row.key === 'sleep') {
    return row.source === 'estimated' ? 'Estimated from phone use' : 'Health Connect';
  }
  if (row.key === 'screen_daily' || row.key === 'screen_late') return 'Phone usage';
  if (row.key === 'weight_trend') return 'Latest weigh-in';
  return 'Health Connect';
}

export const SOURCE_LABELS: Record<VitalsSource, string> = {
  measured: 'Measured',
  estimated: 'Estimated',
  assumed: 'Not enough data yet',
};

/** The comparison words per reading: [under the band, over it]. */
const COMPARE: Partial<Record<RowKey, [string, string]>> = {
  sleep: ['Shorter than', 'Longer than'],
  week_activity: ['Fewer than', 'More than'],
  exercise_week: ['Less than', 'More than'],
  screen_daily: ['Less than', 'More than'],
  screen_late: ['Less than', 'More than'],
  resting_hr: ['Lower than', 'Higher than'],
  hrv: ['Lower than', 'Higher than'],
  spo2: ['Lower than', 'Higher than'],
  blood_pressure: ['Lower than', 'Higher than'],
  glucose: ['Lower than', 'Higher than'],
  resp_rate: ['Slower than', 'Faster than'],
  body_temp: ['Cooler than', 'Warmer than'],
  vo2max: ['Lower than', 'Higher than'],
  weight_trend: ['Lighter than', 'Heavier than'],
  body_fat: ['Lower than', 'Higher than'],
};

/** Typical ranges for readings whose band is usually the user's own, in the row's unit. */
const TYPICAL: Partial<Record<RowKey, [number, number]>> = {
  screen_daily: [0, 240],
  sleep: [7, 9],
  resting_hr: [50, 80],
};

/**
 * The band a row is shown against: its own, or the typical range when the reading is flagged
 * although it sits inside the user's own band (that's what flagged it). The slider and the words
 * both use this, so they never disagree.
 */
export function shownBand(row: VitalRow): VitalRow['band'] {
  const band = row.band;
  if (!band) return null;
  const inside = row.value >= band.lo && row.value <= band.hi;
  const typical = TYPICAL[row.key];
  if (row.state === 'outside' && band.own && inside && typical) {
    return { lo: typical[0], hi: typical[1], own: false };
  }
  return band;
}

/** "Shorter than your usual 9.4–10.5 h", "More than the typical 0–4 h", or null without a band. */
export function compareText(row: VitalRow, pounds: boolean): string | null {
  const band = shownBand(row);
  if (!band) return null;
  const whose = band.own ? 'your usual' : 'the typical';
  const range = rangeText(row, band.lo, band.hi, pounds);
  const [under, over] = COMPARE[row.key] ?? ['Below', 'Above'];
  if (row.value < band.lo) return `${under} ${whose} ${range}`;
  if (row.value > band.hi) return `${over} ${whose} ${range}`;
  return `Within ${whose} ${range}`;
}

/** A band as words in the row's unit: "9.4–10.5 h", "7,457–9,423 steps", "7.6–10.7 h". */
function rangeText(row: VitalRow, lo: number, hi: number, pounds: boolean): string {
  if (row.unit === 'min' && hi >= 60) return `${round(lo / 60, 1)}–${round(hi / 60, 1)} h`;
  const unit = displayValue({ ...row, value: hi, value2: undefined }, pounds).unit;
  const a = bandLabel(row.key, row.unit, lo, pounds);
  const b = bandLabel(row.key, row.unit, hi, pounds);
  return unit ? `${a}–${b} ${unit}` : `${a}–${b}`;
}

/** The tint for a row's state word (same family as the area states). */
export function rowColor(colors: ThemeColors, state: RowState): string {
  if (state === 'strong') return colors.strength;
  if (state === 'in_range') return colors.steady;
  return colors.opportunity;
}

/** A number in a row's own unit, as shown (weight converted when the user weighs in pounds). */
export function displayNumber(key: RowKey, value: number, pounds: boolean): number {
  if (key === 'weight_trend' && pounds) return round(kgToLb(value), 1);
  return value;
}

/** The big figure and its unit: "118/76" mmHg, "3 h 20" min, "7.4" h, "8,240" steps. */
export function displayValue(row: VitalRow, pounds: boolean): { figure: string; unit: string } {
  if (row.key === 'blood_pressure') return { figure: `${row.value}/${row.value2}`, unit: 'mmHg' };
  if (row.key === 'weight_trend') {
    return {
      figure: displayNumber(row.key, row.value, pounds).toFixed(1),
      unit: pounds ? 'lb' : 'kg',
    };
  }
  if (row.unit === 'min' && row.value >= 60) {
    const h = Math.floor(row.value / 60);
    const m = Math.round(row.value % 60);
    return { figure: m ? `${h} h ${m}` : `${h}`, unit: m ? 'min' : 'h' };
  }
  if (row.unit === 'steps') return { figure: row.value.toLocaleString('en-GB'), unit: 'steps' };
  if (row.unit === 'ml/kg/min') return { figure: String(row.value), unit: '' };
  return { figure: String(row.value), unit: row.unit };
}

/** A band edge as a short label ("61", "7.5", "2,000", "7.6 h" for minutes past an hour). */
export function bandLabel(key: RowKey, unit: string, value: number, pounds: boolean): string {
  if (unit === 'min' && value >= 60) return `${round(value / 60, 1)} h`;
  const v = displayNumber(key, value, pounds);
  if (Math.abs(v) >= 1000) return Math.round(v).toLocaleString('en-GB');
  return String(round(v, Math.abs(v) < 20 && !Number.isInteger(v) ? 1 : 0));
}
