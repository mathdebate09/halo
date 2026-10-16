// One plain sentence per area under its name, made of the actual numbers behind its state (never
// its internal 0-100 score, which only places the orb on the hero).

import {
  type Area,
  kgToLb,
  nightsOf,
  round,
  sleepSpread,
  type VitalRow,
  type VitalsInput,
  weightTrend,
} from '@/shared';

import { displayValue, METRIC_LABELS } from './metrics';

const said = (row: VitalRow | undefined, pounds: boolean) => {
  if (!row) return null;
  const { figure, unit } = displayValue(row, pounds);
  return unit ? `${figure} ${unit}` : figure;
};

const hours = (h: number) => `${round(h, 1)} h`;

export function areaSummary(
  area: Area,
  rows: readonly VitalRow[],
  input: VitalsInput,
  pounds: boolean,
): string {
  const row = (key: VitalRow['key']) => rows.find((r) => r.key === key);

  switch (area.key) {
    case 'sleep': {
      const need = input.sleepNeedHours ?? 7.5;
      const last = row('sleep');
      const spread = sleepSpread(nightsOf(input));
      const timing =
        spread != null && spread >= 1 ? ` Bedtimes move by about ${hours(spread)}.` : '';
      if (!last) return `No night recorded for last night yet.${timing}`;
      const gap = need - last.value;
      const versus =
        Math.abs(gap) < 0.25
          ? `right on the ${hours(need)} you need`
          : gap > 0
            ? `${hours(gap)} under the ${hours(need)} you need`
            : `${hours(-gap)} over the ${hours(need)} you need`;
      return `${hours(last.value)} last night, ${versus}.${timing}`;
    }
    case 'heart': {
      const parts = rows
        .slice(0, 2)
        .map((r) => `${METRIC_LABELS[r.key].toLowerCase()} ${said(r, pounds)}`);
      if (parts.length === 0) return 'No heart readings yet.';
      const text = parts.join(', ');
      return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
    }
    case 'movement': {
      const steps = said(row('week_activity'), pounds);
      const exercise = said(row('exercise_week'), pounds);
      if (!steps && !exercise) return 'No steps recorded this week yet.';
      if (steps && exercise) return `${steps} a day this week, and ${exercise} of exercise.`;
      return steps ? `${steps} a day this week.` : `${exercise} of exercise this week.`;
    }
    case 'screen': {
      const daily = said(row('screen_daily'), pounds);
      const late = said(row('screen_late'), pounds);
      if (daily && late) return `${daily} a day on your phone, ${late} after 11 pm last night.`;
      if (daily) return `${daily} a day on your phone.`;
      return late ? `${late} on your phone after 11 pm last night.` : 'No screen time read yet.';
    }
    case 'body': {
      const trend = weightTrend(input);
      if (trend == null) return 'Weigh in on three mornings to see your trend.';
      const perWeek = pounds ? kgToLb(Math.abs(trend)) : Math.abs(trend);
      const unit = pounds ? 'lb' : 'kg';
      if (perWeek < 0.15) return 'Holding steady.';
      return `${trend < 0 ? 'Down' : 'Up'} ${round(perWeek, 1)} ${unit} a week.`;
    }
    case 'blood': {
      // The familiar factors, named when outside their range: "Haemoglobin outside its range."
      const factors = (input.blood ?? []).filter((f) => f.lead.state);
      const outside = factors.filter((f) => f.lead.state !== 'inside').map((f) => f.label);
      if (outside.length === 0) return `All ${factors.length} in range.`;
      const later = (n: string) => n.charAt(0).toLowerCase() + n.slice(1);
      const names =
        outside.length === 1
          ? outside[0]!
          : `${[outside[0]!, ...outside.slice(1, -1).map(later)].join(', ')} and ${later(outside.at(-1)!)}`;
      return `${names} outside ${outside.length === 1 ? 'its range' : 'their ranges'}.`;
    }
  }
}
