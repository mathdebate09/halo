import { and, count, desc, eq, isNull, sum } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/db/client';
import { deleteRecord, upsertRecord } from '@/db/mutate';
import { outbox, water } from '@/db/schema';
import { Btn, Row } from '@/dev/ui';
import { getDevice } from '@/lib/device';
import { dayKey } from '@/shared';

export function StoreRow() {
  const today = dayKey(new Date());
  const device = getDevice();
  const { data: pending } = useLiveQuery(db.select({ n: count() }).from(outbox));
  const { data: ops } = useLiveQuery(
    db
      .select({ entity: outbox.entity, op: outbox.op })
      .from(outbox)
      .orderBy(desc(outbox.seq))
      .limit(4),
  );
  const { data: todayWater } = useLiveQuery(
    db
      .select({ ml: sum(water.ml), n: count() })
      .from(water)
      .where(and(eq(water.day, today), isNull(water.deletedAt))),
    [today],
  );
  const last = () =>
    db
      .select({ id: water.id })
      .from(water)
      .where(and(eq(water.day, today), isNull(water.deletedAt)))
      .orderBy(desc(water.at))
      .get();

  return (
    <Row
      title="Local store (SQLite + outbox)"
      status={[
        `device ${device?.id.slice(0, 8) ?? '—'}… · app key ${process.env.EXPO_PUBLIC_APP_KEY ? '•'.repeat(4) + process.env.EXPO_PUBLIC_APP_KEY.slice(-4) : 'missing'}`,
        `today ${today}: ${todayWater[0]?.ml ?? 0} ml water in ${todayWater[0]?.n ?? 0} logs`,
        `outbox ${pending[0]?.n ?? 0} pending: ${ops.map((o) => `${o.op} ${o.entity}`).join(', ') || 'empty'}`,
      ].join('\n')}>
      <Btn
        label="+ 250 ml water"
        onPress={() => upsertRecord('water', { day: today, at: Date.now(), ml: 250 })}
      />
      <Btn
        label="Delete last water"
        onPress={() => {
          const row = last();
          if (row) deleteRecord('water', row.id);
        }}
      />
    </Row>
  );
}
