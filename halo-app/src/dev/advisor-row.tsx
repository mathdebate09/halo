import { and, eq, isNull } from 'drizzle-orm';
import { router } from 'expo-router';
import { useMMKVBoolean } from 'react-native-mmkv';

import { POLL_ONLY_KEY } from '@/advisor/client';
import { db } from '@/db/client';
import { deleteRecord } from '@/db/mutate';
import { advisorMessages } from '@/db/schema';
import { Btn, Row } from '@/dev/ui';
import { kv } from '@/lib/kv';
import { dayKey } from '@/shared';

/** The Advisor's fallback: skip SSE and poll the turn, as a phone without streaming would. */
export function AdvisorRow() {
  const [pollOnly, setPollOnly] = useMMKVBoolean(POLL_ONLY_KEY, kv);
  return (
    <Row title="Advisor" status={pollOnly ? 'poll only (no SSE)' : 'SSE, poll as fallback'}>
      <Btn
        label={pollOnly ? 'Use SSE' : 'Poll only'}
        onPress={() => setPollOnly(pollOnly ? undefined : true)}
      />
      <Btn label="Open" onPress={() => router.push('/advisor')} />
      <Btn
        label="Clear today's thread"
        onPress={() => {
          const day = dayKey(new Date());
          const rows = db
            .select({ id: advisorMessages.id })
            .from(advisorMessages)
            .where(and(eq(advisorMessages.threadId, day), isNull(advisorMessages.deletedAt)))
            .all();
          for (const r of rows) deleteRecord('advisorMessage', r.id);
        }}
      />
    </Row>
  );
}
