// Everything the Vitals model reads, gathered from the local store: Health Connect's day cache,
// the screen's nights and minutes, manual readings and weigh-ins. Manual entries win for their day
// (the user typed them on purpose); Health Connect fills the rest.

import { and, desc, eq, gte, isNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { useScreenDays, useScreenNights } from '@/assistant/screen';
import { db } from '@/db/client';
import { type hcDaily, vitalsReadings, weights } from '@/db/schema';
import type { Profile } from '@/lib/plan';
import { useLabResults } from '@/reports/lab-data';
import {
  type ActivityGoals,
  addDays,
  dayKey,
  dayStart,
  type Plan,
  type VitalsDay,
  type VitalsInput,
} from '@/shared';

export const VITALS_DAYS = 14;
/** `vitals_readings.metric` of a night's hours the user corrected (value in hours). */
export const SLEEP_METRIC = 'sleep_hours';

type HcRow = typeof hcDaily.$inferSelect;
type NumericField = Exclude<
  {
    [K in keyof VitalsDay]-?: NonNullable<VitalsDay[K]> extends number ? K : never;
  }[keyof VitalsDay],
  undefined
>;

/** `vitals_readings.metric` → the day field it fills (and how to convert its unit). */
const METRIC_FIELDS: Record<
  string,
  { field: NumericField; convert?: (v: number, unit: string) => number }
> = {
  resting_hr: { field: 'restingHr' },
  hrv: { field: 'hrvMs' },
  spo2: { field: 'spo2' },
  systolic: { field: 'systolic' },
  diastolic: { field: 'diastolic' },
  glucose: {
    field: 'glucoseMgDl',
    convert: (v, unit) => (unit === 'mmol/L' ? Math.round(v * 18) : v),
  },
  // A report's glucose is stored in mg/dL; it counts for Heart like a meter reading.
  glucose_fasting: { field: 'glucoseMgDl' },
  glucose_random: { field: 'glucoseMgDl' },
  resp_rate: { field: 'respRate' },
  body_temp: { field: 'bodyTempC', convert: (v, unit) => (unit === '°F' ? ((v - 32) * 5) / 9 : v) },
  body_fat: { field: 'bodyFatPct' },
  vo2max: { field: 'vo2max' },
};

/** Whole years between a YYYY-MM-DD birth date and `now`. */
function ageOn(birthDate: string | undefined, now: Date): number | null {
  if (!birthDate) return null;
  const [y, m, d] = birthDate.split('-').map(Number) as [number, number, number];
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age;
}

/**
 * The model's input for `day`. `hcRows` are the provider's Health Connect rows (newest first,
 * two weeks), passed in so Today and Vitals read the same query.
 */
export function useVitalsInput(
  day: string,
  hcRows: readonly HcRow[],
  goals: ActivityGoals,
  plan: Plan | null,
  profile: Profile | null,
  now: Date,
): VitalsInput {
  const since = addDays(day, -(VITALS_DAYS - 1));
  const sinceMs = dayStart(since).getTime();
  const { data: readings } = useLiveQuery(
    db
      .select()
      .from(vitalsReadings)
      .where(
        and(
          gte(vitalsReadings.at, sinceMs),
          eq(vitalsReadings.confirmed, true),
          isNull(vitalsReadings.deletedAt),
        ),
      )
      .orderBy(vitalsReadings.at),
    [sinceMs],
  );
  const { data: weighIns } = useLiveQuery(
    db
      .select({ day: weights.day, at: weights.at, kg: weights.kg })
      .from(weights)
      .where(and(gte(weights.day, since), isNull(weights.deletedAt)))
      .orderBy(desc(weights.at)),
    [since],
  );
  const nights = useScreenNights();
  // Blood work reads every report, whatever its age (the area decides what still counts).
  const { factors: blood } = useLabResults();
  const screen = useScreenDays();
  const age = ageOn(profile?.birthDate, now);

  // Cheap (14 rows), so it's rebuilt on each render rather than memoised on unstable inputs.
  const rows = new Map<string, VitalsDay>();
  for (let i = 0; i < VITALS_DAYS; i++) {
    const d = addDays(day, -i);
    rows.set(d, { day: d });
  }
  for (const r of hcRows) {
    const row = rows.get(r.day);
    if (!row) continue;
    // Hydration and nutrition from other apps are Advisor context only, never body signals.
    const { day: _day, fetchedAt: _at, hydrationMl: _ml, nutritionKcal: _kcal, ...values } = r;
    Object.assign(row, values);
  }
  // The screen's night belongs to the calendar day it ended on, like Health Connect's wake day.
  for (const n of nights) {
    const row = rows.get(n.day);
    if (row) row.screenNight = { start: n.start, end: n.end, hours: n.hours };
  }
  for (const s of screen) {
    const row = rows.get(s.day);
    if (row) {
      row.screenOnMin = s.onMin;
      row.screenLateMin = s.lateMin;
    }
  }
  // Oldest first, so the day's latest manual reading is the one left standing.
  for (const r of readings) {
    const row = rows.get(dayKey(new Date(r.at)));
    if (!row) continue;
    if (r.metric === SLEEP_METRIC) {
      // A corrected night: the user's hours, with the screen's bed and wake times kept for timing.
      row.sleepMin = Math.round(r.value * 60);
      row.sleepManual = true;
      row.sleepStart ??= row.screenNight?.start ?? null;
      row.sleepEnd ??= row.screenNight?.end ?? null;
      continue;
    }
    const target = METRIC_FIELDS[r.metric];
    if (!target) continue;
    (row as Record<NumericField, number | null | undefined>)[target.field] = target.convert
      ? target.convert(r.value, r.unit)
      : r.value;
    // Its row says where it came from: a lab report, not a device.
    const others = (row.fromReport ?? []).filter((f) => f !== target.field);
    row.fromReport = r.source === 'report' ? [...others, target.field] : others;
  }
  // Newest first: the first weigh-in seen for a day is its latest.
  const weighed = new Set<string>();
  for (const w of weighIns) {
    const row = rows.get(w.day);
    if (!row || weighed.has(w.day)) continue;
    row.weightKg = w.kg;
    weighed.add(w.day);
  }
  return {
    today: day,
    days: [...rows.values()],
    sleepNeedHours: 7.5,
    goals,
    profile: {
      age: age ?? plan?.age ?? null,
      sex: profile?.sex ?? null,
      goal: profile?.goal ?? null,
      rateKgPerWeek: plan?.rateKgPerWeek ?? null,
    },
    blood,
  };
}
