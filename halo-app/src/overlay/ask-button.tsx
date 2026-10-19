import Animated, { useReducedMotion } from 'react-native-reanimated';

import { RingIcon } from '@/components/icons';
import { PressScale } from '@/components/press-scale';

import { askOverlayAccess, useOverlayAccess } from './access';

/**
 * Today's top bar, while the overlay isn't allowed: the halo ring breathes slowly (a loop on the
 * UI thread; still under reduced motion) and opens the Settings page. Gone once it's allowed.
 */
export function OverlayAskButton({ color }: { color: string }) {
  const access = useOverlayAccess();
  const reduced = useReducedMotion();
  if (access !== 'denied') return null;
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel="Keep Halo on screen"
      accessibilityHint="Opens Display over other apps in Settings"
      onPress={askOverlayAccess}
      hitSlop={4}
      className="h-11 w-11 items-center justify-center">
      <Animated.View
        style={
          reduced
            ? undefined
            : {
                animationName: { from: { opacity: 1 }, to: { opacity: 0.45 } },
                animationDuration: '1600ms',
                animationIterationCount: 'infinite',
                animationDirection: 'alternate',
                animationTimingFunction: 'ease-in-out',
              }
        }>
        <RingIcon size={30} color={color} />
      </Animated.View>
    </PressScale>
  );
}
