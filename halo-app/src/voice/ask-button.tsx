import { router } from 'expo-router';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { MicIcon } from '@/components/icons';
import { PressScale } from '@/components/press-scale';
import { useOverlayAccess } from '@/overlay/access';

import { useVoiceAccess } from './access';

/**
 * Today's top bar, once the ring is on screen but talking to it isn't allowed yet: a mic that
 * breathes like the overlay's ask before it (still under reduced motion) and opens the voice sheet.
 */
export function VoiceAskButton({ color }: { color: string }) {
  const overlay = useOverlayAccess();
  const access = useVoiceAccess();
  const reduced = useReducedMotion();
  if (overlay !== 'granted' || access !== 'needed') return null;
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel="Talk to Halo"
      accessibilityHint="Asks to use your voice"
      onPress={() => router.push('/voice-access')}
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
        <MicIcon size={26} color={color} />
      </Animated.View>
    </PressScale>
  );
}
