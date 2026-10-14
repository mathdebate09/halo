import type { ReactNode } from 'react';
import type { StyleProp, ViewProps, ViewStyle } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  makeMutable,
  useAnimatedStyle,
  useReducedMotion,
} from 'react-native-reanimated';

/**
 * 0 → 1 as the launch overlay clears (driven by LaunchSequence). Stays at 1 afterwards, so
 * Reveal is inert on every later mount.
 */
export const launchReveal = makeMutable(0);

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
