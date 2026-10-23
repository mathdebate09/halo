import { useState } from 'react';
import { useMMKVString } from 'react-native-mmkv';

import { revertActed } from '@/assistant/loop-store';
import {
  cancelSnoozes,
  LAST_RESPONSE_KEY,
  playDay,
  readScheduled,
  sendRealTest,
  sendTestOfNext,
} from '@/assistant/notify';
import { Btn, errorText, Row } from '@/dev/ui';
import { formatTime } from '@/lib/clock';
import { kv } from '@/lib/kv';
import { dayKey } from '@/shared';

/** The notification plan (read-only) and a test send that changes nothing when answered. */
export function NotifyPlanRow() {
  const [status, setStatus] = useState('');
  const [lastResponse] = useMMKVString(LAST_RESPONSE_KEY, kv);
  const plan = readScheduled()
    .filter((s) => s.at > Date.now())
    .map(
      (s) =>
        `${formatTime(new Date(s.at))}${s.snooze ? ' (snoozed)' : ''} · ${s.title} / ${s.body}`,
    );
  return (
    <Row
      title="Notification plan"
      status={[
        plan.join('\n') || 'nothing planned',
        lastResponse ? `last test response: ${lastResponse}` : '',
        status,
      ]
        .filter(Boolean)
        .join('\n')}>
      <Btn
        label="Play the day"
        onPress={() => playDay().then(setStatus, (e) => setStatus(errorText(e)))}
      />
      <Btn
        label="Test next in 10 s"
        onPress={() => sendTestOfNext().then(setStatus, (e) => setStatus(errorText(e)))}
      />
      <Btn
        label="Real test: brief in 10 s"
        onPress={() => sendRealTest().then(setStatus, (e) => setStatus(errorText(e)))}
      />
      <Btn
        label="Revert test taps"
        onPress={() => {
          const day = dayKey(new Date());
          revertActed([`${day}:water_pace`, `${day}:calorie_pace`], 'ignored');
          setStatus('reverted water and calorie briefs to ignored');
        }}
      />
      <Btn
        label="Cancel snoozes"
        onPress={() => cancelSnoozes().then(setStatus, (e) => setStatus(errorText(e)))}
      />
    </Row>
  );
}
