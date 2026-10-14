// Anonymous identity (SPEC §2): a UUID plus a 16-char key sent with every request. No login.
// MMKV lives in app storage, which Android Auto Backup may restore on reinstall (best effort).

import { getRandomBytes, randomUUID } from 'expo-crypto';
import { Platform } from 'react-native';

import { db } from '@/db/client';
import { outbox } from '@/db/schema';
import { notifyOutboxChanged } from '@/sync/signal';

import { kv } from './kv';

const ID_KEY = 'device.id';
const SECRET_KEY = 'device.key';
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export type Device = { id: string; key: string };

/** 16 chars from 62 symbols; rejection sampling keeps the distribution uniform. */
function randomKey(length = 16) {
  let out = '';
  while (out.length < length) {
    for (const byte of getRandomBytes(32)) {
      if (byte < 248 && out.length < length) out += ALPHABET[byte % 62];
    }
  }
  return out;
}

export function getDevice(): Device | null {
  const id = kv.getString(ID_KEY);
  const key = kv.getString(SECRET_KEY);
  return id && key ? { id, key } : null;
}

/**
 * Creates the identity on first launch and queues its registration with the backend.
 * Never blocks: registration is just the first outbox op.
 */
export function ensureDevice(): Device {
  const existing = getDevice();
  if (existing) return existing;
  const device = { id: randomUUID(), key: randomKey() };
  kv.set(ID_KEY, device.id);
  kv.set(SECRET_KEY, device.key);
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
