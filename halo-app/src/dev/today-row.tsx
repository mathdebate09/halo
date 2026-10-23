import { useMMKVNumber, useMMKVString } from 'react-native-mmkv';

import { Btn, Row } from '@/dev/ui';
import { kv } from '@/lib/kv';
import { readDayTier, writeDayTier } from '@/today/tier';
import { DEV_SCORE_OVERRIDE_KEY } from '@/today/today-scores';

const OVERRIDES = [90, 75, 60, 40] as const;

/** Drives the Today tier from a fixed overall score, to check hysteresis and the hero crossfade. */
export function TodayRow() {
  const [override, setOverride] = useMMKVNumber(DEV_SCORE_OVERRIDE_KEY, kv);
  const record = useMMKVString('tier', kv)[0];
  return (
    <Row title="Today score" status={`override ${override ?? 'off'} · tier ${record ?? '—'}`}>
      {OVERRIDES.map((n) => (
        <Btn key={n} label={`${n}`} onPress={() => setOverride(n)} />
      ))}
      <Btn label="Off" onPress={() => setOverride(undefined)} />
      <Btn
        label="Unlock tier (clear changedAt)"
        onPress={() => {
          const current = readDayTier();
          if (current) writeDayTier({ ...current, changedAt: null });
        }}
      />
    </Row>
  );
}
