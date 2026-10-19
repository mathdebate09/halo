// "Display over other apps", the one permission the floating overlay needs. Only the user can
// grant it, in Settings, so it's re-read on every return to Halo.

import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import Overlay from '../../modules/overlay/src/OverlayModule';

export type OverlayAccess = 'granted' | 'denied' | 'unavailable';

export const overlayAccess = (): OverlayAccess =>
  !Overlay ? 'unavailable' : Overlay.canDraw() ? 'granted' : 'denied';

/** Opens Halo's "Display over other apps" page in Settings. */
export const askOverlayAccess = () => Overlay?.openSettings();

export function useOverlayAccess(): OverlayAccess {
  const [access, setAccess] = useState(overlayAccess);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setAccess(overlayAccess());
    });
    return () => sub.remove();
  }, []);
  return access;
}
