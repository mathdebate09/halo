import type { ReactNode } from 'react';
import type { StyleProp, ViewProps, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  makeMutable,
  useAnimatedStyle,
  useReducedMotion,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

/**
 * 0 → 1 as the launch overlay clears (driven by LaunchSequence) or onboarding hands off to
 * Today (replayReveal). Stays at 1 otherwise, so Reveal is inert on later mounts.
 */
export const launchReveal = makeMutable(0);

/** Plays the staggered rise again (e.g. as onboarding hands off to Today). */
export function replayReveal(delayMs = 250) {
  launchReveal.set(0);
  launchReveal.set(
    withDelay(delayMs, withTiming(1, { duration: 900, easing: Easing.bezier(0.23, 1, 0.32, 1) })),
  );
}

const STAGGER = 0.09; // of the reveal progress (~80ms apart)
const SPAN = 0.55; // each element's share of the reveal (~500ms)
const RISE = 14;

type Props = {
  /** Position in the entrance order; later items start later. */
  index?: number;
  style?: StyleProp<ViewStyle>;
  className?: string;
  pointerEvents?: ViewProps['pointerEvents'];
  children: ReactNode;
};

/** Content that rises and fades in, staggered, as the launch sequence hands off to the app. */
export function Reveal({ index = 0, style, className, pointerEvents, children }: Props) {
  const reduced = useReducedMotion();
  const start = Math.min(index * STAGGER, 1 - SPAN);
  const animated = useAnimatedStyle(() => {
    const t = interpolate(launchReveal.get(), [start, start + SPAN], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: t,
      transform: [{ translateY: reduced ? 0 : (1 - t) * RISE }],
    };
  });
  return (
    <Animated.View style={[style, animated]} className={className} pointerEvents={pointerEvents}>
      {children}
    </Animated.View>
  );
}
