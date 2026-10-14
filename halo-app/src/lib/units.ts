import { getLocales } from 'expo-localization';
import { useMMKVString } from 'react-native-mmkv';

import { defaultUnits, type Units } from '@/shared';

import { kv } from './kv';

// One unit setting app-wide (SPEC: ruler inputs). Stored metric everywhere; this is display only.
const KEY = 'units';

const fallback = () => defaultUnits(getLocales()[0]?.measurementSystem);

export function useUnits(): [Units, (patch: Partial<Units>) => void] {
  const [raw, setRaw] = useMMKVString(KEY, kv);
  let units: Units = fallback();
  if (raw) {
    try {
      units = { ...units, ...(JSON.parse(raw) as Partial<Units>) };
    } catch {
      // keep the locale default
    }
  }
  return [units, (patch) => setRaw(JSON.stringify({ ...units, ...patch }))];
}
