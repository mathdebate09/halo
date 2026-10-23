import { useMMKVString } from 'react-native-mmkv';

import { DEV_READING_KEY } from '@/assistant/assistant';
import { Btn, Row } from '@/dev/ui';
import { kv } from '@/lib/kv';

const FAKE_READINGS = [
  { label: 'SpO2 89%', reading: { spo2: 89 } },
  { label: 'BP 170/105', reading: { systolic: 170, diastolic: 105 } },
  { label: 'HR 112', reading: { restingHr: 112 } },
] as const;

/** A critical reading laid over today's (never written to the store), to see vital_alert end to end. */
export function FakeReadingRow() {
  const [raw, setRaw] = useMMKVString(DEV_READING_KEY, kv);
  return (
    <Row title="Critical reading (fake)" status={raw ?? 'off'}>
      {FAKE_READINGS.map((f) => (
        <Btn key={f.label} label={f.label} onPress={() => setRaw(JSON.stringify(f.reading))} />
      ))}
      <Btn label="Off" onPress={() => setRaw(undefined)} />
    </Row>
  );
}
