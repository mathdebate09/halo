// Anonymous identity (SPEC §2): a per-install UUID, no login. The 16-char key sent with every
// request is the shared app key (EXPO_PUBLIC_APP_KEY, see sync/api.ts), not per device.
// MMKV lives in app storage, which Android Auto Backup may restore on reinstall (best effort).

import { randomUUID } from 'expo-crypto';
import { Platform } from 'react-native';

import { db } from '@/db/client';
import { outbox } from '@/db/schema';
import { notifyOutboxChanged } from '@/sync/signal';

import { kv } from './kv';

const ID_KEY = 'device.id';

export type Device = { id: string };

export function getDevice(): Device | null {
  const id = kv.getString(ID_KEY);
  return id ? { id } : null;
}

/**
 * Creates the identity on first launch and queues its registration with the backend.
 * Never blocks: registration is just the first outbox op.
 */
export function ensureDevice(): Device {
  const existing = getDevice();
  if (existing) return existing;
  const device = { id: randomUUID() };
  kv.set(ID_KEY, device.id);
  const now = Date.now();
  db.insert(outbox)
    .values({
      opId: randomUUID(),
      entity: 'device',
      entityId: device.id,
      op: 'register',
      payload: { platform: Platform.OS, createdAt: now },
      updatedAt: now,
      nextAttemptAt: now,
    })
    .run();
  notifyOutboxChanged();
  return device;
}
