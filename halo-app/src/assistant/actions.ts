// The prepared steps a brief can carry, run from anywhere (the hero pill, Learn more's Next).

import { router } from 'expo-router';

import { connectHealthConnect, refreshHealthData } from '@/lib/health-connect';
import { addWater } from '@/lib/water';
import type { NextAction } from '@/shared';

import { markActed } from './loop-store';
import { openUsageAccess } from './screen';

/**
 * Does the step: logs water now (its toast carries Undo), opens the logger pre-filled, opens the
 * weigh-in sheet at the last weight, asks the wake time, opens Usage access, connects a
 * missing source, opens the blood work from a new report, or opens the Advisor. Marks the
 * brief acted when it came from one.
 */
export async function runAction(action: NextAction, briefId?: string | null) {
  if (!action) return;
  if (briefId) markActed(briefId);
  switch (action.kind) {
    case 'water':
      addWater(action.ml);
      return;
    case 'log':
      router.navigate({ pathname: '/log', params: action.note ? { note: action.note } : {} });
      return;
    case 'weigh':
      router.push('/weigh-in');
      return;
    case 'ask_wake':
      router.push('/wake-time');
      return;
    case 'usage_access':
      openUsageAccess();
      return;
    case 'connect':
      await connectHealthConnect();
      refreshHealthData(true);
      return;
    case 'blood_work':
      router.push('/reports');
      return;
    case 'advisor':
      router.push('/advisor');
      return;
  }
}
