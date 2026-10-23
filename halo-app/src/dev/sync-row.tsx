import { count, eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/db/client';
import { water } from '@/db/schema';
import { Btn, Row } from '@/dev/ui';
import { API_URL } from '@/sync/api';
import { useSyncStatus } from '@/sync/status';
import { runSync } from '@/sync/worker';

export function SyncRow() {
  const sync = useSyncStatus();
  const { data: synced } = useLiveQuery(
    db.select({ n: count() }).from(water).where(eq(water.syncState, 'synced')),
  );
  const ago = sync.lastSyncAt
    ? `${Math.round((Date.now() - sync.lastSyncAt) / 1000)}s ago`
    : 'never';
  return (
    <Row
      title="Sync"
      status={[
        `${API_URL} · ${sync.state} · last ${ago}`,
        `last run pushed ${sync.lastPushed}, pulled ${sync.lastPulled} · ${synced[0]?.n ?? 0} water rows synced`,
        sync.lastError ? `error: ${sync.lastError}` : null,
      ]
        .filter(Boolean)
        .join('\n')}>
      <Btn label="Sync now" onPress={() => void runSync()} />
    </Row>
  );
}
