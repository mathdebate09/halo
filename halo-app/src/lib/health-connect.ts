// Health Connect access. Never throws to the UI: a missing app, a denial or an empty store are
// normal states (SPEC §6), returned as values.

import {
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  type Permission,
  readRecords,
  requestPermission,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';

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
