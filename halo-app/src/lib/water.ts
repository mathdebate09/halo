import * as Haptics from 'expo-haptics';

import { showToast } from '@/components/toast';
import { deleteRecord, upsertRecord } from '@/db/mutate';
import { dayKey } from '@/shared';

export const DEFAULT_GLASS_ML = 250;

/** Writes a glass (at a given time, with a given id when it came from elsewhere). */
export function recordWater(ml: number, at = Date.now(), id?: string) {
  return upsertRecord('water', { ...(id ? { id } : {}), day: dayKey(new Date(at)), at, ml });
}

/** Logs water now, with a light haptic and an Undo toast. */
export function addWater(ml = DEFAULT_GLASS_ML) {
  const id = recordWater(ml);
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  showToast(`${ml} ml water`, { label: 'Undo', onPress: () => deleteRecord('water', id) });
}
