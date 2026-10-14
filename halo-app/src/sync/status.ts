import { useSyncExternalStore } from 'react';

export type SyncStatus = {
  state: 'idle' | 'syncing' | 'offline' | 'error';
  lastSyncAt: number | null;
  lastError: string | null;
  lastPushed: number;
  lastPulled: number;
};

let status: SyncStatus = {
  state: 'idle',
  lastSyncAt: null,
  lastError: null,
  lastPushed: 0,
  lastPulled: 0,
};
const listeners = new Set<() => void>();

export function setSyncStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** For diagnostics only; product UI never waits on sync. */
export const useSyncStatus = () => useSyncExternalStore(subscribe, () => status);
