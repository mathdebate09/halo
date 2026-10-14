import * as Haptics from 'expo-haptics';

import { showToast } from '@/components/toast';
import { deleteRecord, upsertRecord } from '@/db/mutate';
import { dayKey } from '@/shared';

export const DEFAULT_GLASS_ML = 250;

/** Logs water now, with a light haptic and an Undo toast. */
export function addWater(ml = DEFAULT_GLASS_ML) {
  const now = new Date();
  const id = upsertRecord('water', { day: dayKey(now), at: now.getTime(), ml });
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  showToast(`${ml} ml water`, { label: 'Undo', onPress: () => deleteRecord('water', id) });
}
