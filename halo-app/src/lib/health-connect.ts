// Health Connect access. Never throws to the UI: a missing app, a denial or an empty store are
// normal states (SPEC §6), returned as values.

import { sql } from 'drizzle-orm';
import {
  aggregateGroupByDuration,
  aggregateGroupByPeriod,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  type Permission,
  readRecords,
  requestPermission,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';

import { db } from '@/db/client';
import { hcDaily } from '@/db/schema';
import { addDays, dayKey, dayStart } from '@/shared';

/** Everything Halo reads; mirrors android.permissions in app.json. One system dialog. */
const READ_TYPES = [
  'Weight',
  'Height',
  'Steps',
  'Distance',
  'Speed',
  'ActiveCaloriesBurned',
  'TotalCaloriesBurned',
  'ExerciseSession',
  'SleepSession',
  'HeartRate',
  'RestingHeartRate',
  'HeartRateVariabilityRmssd',
  'OxygenSaturation',
  'BloodPressure',
  'BloodGlucose',
] as const;

export type HealthConnectStatus = 'connected' | 'denied' | 'unavailable';

async function ready(): Promise<boolean> {
  try {
    if ((await getSdkStatus()) !== SdkAvailabilityStatus.SDK_AVAILABLE) return false;
    return await initialize();
  } catch {
    return false;
  }
}

/** Shows the permission dialog. Connected means at least one read permission was granted. */
export async function connectHealthConnect(): Promise<HealthConnectStatus> {
  if (!(await ready())) return 'unavailable';
  try {
    const granted = await requestPermission(
      READ_TYPES.map((recordType) => ({ accessType: 'read', recordType }) as Permission),
    );
    return granted.length > 0 ? 'connected' : 'denied';
  } catch {
    return 'denied';
  }
}

async function isGranted(recordType: string) {
  const granted = await getGrantedPermissions();
  return granted.some((p) => p.accessType === 'read' && p.recordType === recordType);
}

const YEAR_MS = 365 * 24 * 3600 * 1000;

async function latest<T extends 'Weight' | 'Height'>(recordType: T) {
  if (!(await isGranted(recordType))) return null;
  const { records } = await readRecords(recordType, {
    timeRangeFilter: {
      operator: 'after',
      startTime: new Date(Date.now() - 2 * YEAR_MS).toISOString(),
    },
    ascendingOrder: false,
    pageSize: 1,
  });
  return records[0] ?? null;
}

/** Latest weight (kg) and height (cm) from the last two years, for onboarding prefill. */
export async function readBodyMeasurements(): Promise<{ weightKg?: number; heightCm?: number }> {
  if (!(await ready())) return {};
  try {
    const [weight, height] = await Promise.all([latest('Weight'), latest('Height')]);
    return {
      weightKg: weight ? Math.round(weight.weight.inKilograms * 10) / 10 : undefined,
      heightCm: height ? Math.round(height.height.inMeters * 100) : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Average daily steps over the last `days` full days, counting only days with data (a phone left
 * at home shouldn't read as a sedentary day). Null with fewer than 3 days of data.
 */
export async function readAverageSteps(days = 14): Promise<number | null> {
  if (!(await ready()) || !(await isGranted('Steps'))) return null;
  try {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end.getTime() - days * 24 * 3600 * 1000);
    const groups = await aggregateGroupByPeriod({
      recordType: 'Steps',
      timeRangeFilter: {
        operator: 'between',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
      timeRangeSlicer: { period: 'DAYS', length: 1 },
    });
    const counted = groups.map((g) => g.result.COUNT_TOTAL).filter((n) => n > 0);
    if (counted.length < 3) return null;
    return Math.round(counted.reduce((a, b) => a + b, 0) / counted.length);
  } catch {
    return null;
  }
}

const HISTORY_DAYS = 14;
const MIN_REFRESH_MS = 2 * 60_000;
// Sleep stages that aren't sleep (Health Connect: awake, out of bed, awake in bed).
const AWAKE_STAGES = new Set([1, 3, 7]);

type DayRow = Omit<typeof hcDaily.$inferInsert, 'day' | 'fetchedAt'>;

let refreshing = false;
let lastRefresh = 0;

/**
 * Pulls the last two weeks from Health Connect into the local `hc_daily` cache, which Today's live
 * scores read: steps, distance, active calories and exercise per 4 am day, last night's sleep, and
 * the latest resting HR, HRV, SpO2, blood pressure and glucose per day. Fire-and-forget and
 * throttled; silent when Health Connect is missing, and each type only when it is granted.
 */
export async function refreshHealthData(force = false): Promise<void> {
  if (refreshing || (!force && Date.now() - lastRefresh < MIN_REFRESH_MS)) return;
  refreshing = true;
  try {
    if (!(await ready())) return;
    const granted = new Set(
      (await getGrantedPermissions())
        .filter((p) => p.accessType === 'read')
        .map((p) => p.recordType),
    );
    if (granted.size === 0) return;

    const now = new Date();
    const today = dayKey(now);
    const first = addDays(today, -(HISTORY_DAYS - 1));
    const range = {
      operator: 'between' as const,
      startTime: dayStart(first).toISOString(),
      endTime: now.toISOString(),
    };
    const rows = new Map<string, DayRow>();
    const row = (day: string) => {
      let r = rows.get(day);
      if (!r) rows.set(day, (r = {}));
      return r;
    };
    for (let i = 0; i < HISTORY_DAYS; i++) row(addDays(first, i));
    const dayOf = (iso: string) => dayKey(new Date(iso));

    // Per-day totals on 4 am boundaries (24 h slices from the first day's rollover).
    const daily = async <
      T extends 'Steps' | 'Distance' | 'ActiveCaloriesBurned' | 'ExerciseSession',
    >(
      recordType: T,
      apply: (
        r: DayRow,
        result: Awaited<ReturnType<typeof aggregateGroupByDuration<T>>>[number]['result'],
        day: string,
      ) => void,
    ) => {
      if (!granted.has(recordType)) return;
      const groups = await aggregateGroupByDuration({
        recordType,
        timeRangeFilter: range,
        timeRangeSlicer: { duration: 'DAYS', length: 1 },
      });
      for (const g of groups) {
        const day = dayOf(g.startTime);
        if (rows.has(day)) apply(row(day), g.result, day);
      }
    };
    // A past day with 0 steps means the phone wasn't carried, not a sedentary day.
    await daily('Steps', (r, res, day) => {
      const n = (res as { COUNT_TOTAL: number }).COUNT_TOTAL;
      r.steps = n > 0 || day === today ? n : null;
    });
    await daily('Distance', (r, res) => {
      r.distanceM = (res as { DISTANCE: { inMeters: number } }).DISTANCE.inMeters || null;
    });
    await daily('ActiveCaloriesBurned', (r, res) => {
      const kcal = (res as { ACTIVE_CALORIES_TOTAL: { inKilocalories: number } })
        .ACTIVE_CALORIES_TOTAL.inKilocalories;
      r.activeKcal = kcal > 0 ? Math.round(kcal) : null;
    });
    await daily('ExerciseSession', (r, res) => {
      const seconds = (res as { EXERCISE_DURATION_TOTAL: { inSeconds: number } })
        .EXERCISE_DURATION_TOTAL.inSeconds;
      r.exerciseMin = Math.round(seconds / 60);
    });

    // Instantaneous readings: the day's latest one wins (records come oldest first).
    const readings = async <
      T extends
        | 'RestingHeartRate'
        | 'HeartRateVariabilityRmssd'
        | 'OxygenSaturation'
        | 'BloodPressure'
        | 'BloodGlucose'
        | 'SleepSession',
    >(
      recordType: T,
    ) => {
      if (!granted.has(recordType)) return [];
      const { records } = await readRecords(recordType, {
        timeRangeFilter: range,
        ascendingOrder: true,
        pageSize: 1000,
      });
      return records;
    };
    for (const r of await readings('RestingHeartRate')) {
      if (rows.has(dayOf(r.time))) row(dayOf(r.time)).restingHr = r.beatsPerMinute;
    }
    for (const r of await readings('HeartRateVariabilityRmssd')) {
      if (rows.has(dayOf(r.time))) row(dayOf(r.time)).hrvMs = r.heartRateVariabilityMillis;
    }
    for (const r of await readings('OxygenSaturation')) {
      if (rows.has(dayOf(r.time))) row(dayOf(r.time)).spo2 = r.percentage;
    }
    for (const r of await readings('BloodPressure')) {
      if (!rows.has(dayOf(r.time))) continue;
      const d = row(dayOf(r.time));
      d.systolic = r.systolic.inMillimetersOfMercury;
      d.diastolic = r.diastolic.inMillimetersOfMercury;
    }
    for (const r of await readings('BloodGlucose')) {
      if (!rows.has(dayOf(r.time))) continue;
      const level = r.level as { value?: number; unit?: string; inMilligramsPerDeciliter?: number };
      const mgDl =
        level.inMilligramsPerDeciliter ??
        (level.unit === 'millimolesPerLiter' ? (level.value ?? 0) * 18 : level.value);
      if (mgDl) row(dayOf(r.time)).glucoseMgDl = Math.round(mgDl);
    }
    // Sleep belongs to the day it ended on (last night → today), naps included.
    const asleep = new Map<string, number>();
    for (const r of await readings('SleepSession')) {
      const day = dayOf(r.endTime);
      if (!rows.has(day)) continue;
      const total = Date.parse(r.endTime) - Date.parse(r.startTime);
      const awake = (r.stages ?? [])
        .filter((st) => AWAKE_STAGES.has(st.stage))
        .reduce((a, st) => a + Date.parse(st.endTime) - Date.parse(st.startTime), 0);
      asleep.set(day, (asleep.get(day) ?? 0) + Math.max(0, total - awake));
    }
    for (const [day, ms] of asleep) row(day).sleepMin = Math.round(ms / 60_000);

    const fetchedAt = now.getTime();
    const values = [...rows].map(([day, r]) => ({ ...r, day, fetchedAt }));
    await db
      .insert(hcDaily)
      .values(values)
      .onConflictDoUpdate({
        target: hcDaily.day,
        set: Object.fromEntries(
          [
            'steps',
            'distance_m',
            'active_kcal',
            'sleep_min',
            'exercise_min',
            'resting_hr',
            'hrv_ms',
            'spo2',
            'systolic',
            'diastolic',
            'glucose_mg_dl',
            'fetched_at',
          ].map((column) => [toCamel(column), sql.raw(`excluded.${column}`)]),
        ),
      });
    lastRefresh = Date.now();
  } catch {
    // A missed refresh just leaves the last cached values.
  } finally {
    refreshing = false;
  }
}

const toCamel = (column: string) => column.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());
