import { usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronLeftIcon } from '@/components/icons';
import { useHaloTheme } from '@/theme/theme-provider';

import { goBack } from './navigation';
import { useOnboarding } from './state';
import { FIRST_STEP, hasChrome, isStepId, progressOf } from './steps';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/**
 * Persistent across onboarding screens (it lives outside the stack, so it doesn't slide with
 * them): a back chevron and a slim progress bar whose fill eases to the new position.
 */
export function ProgressHeader() {
  const insets = useSafeAreaInsets();
  const { theme } = useHaloTheme();
  const reduced = useReducedMotion();
  const { answers } = useOnboarding();
  const segment = usePathname().split('/').pop() ?? '';
  const inFlow = isStepId(segment);
  const step = inFlow ? segment : FIRST_STEP;
  const progress = progressOf(step, answers);

  const [trackWidth, setTrackWidth] = useState(0);
  const fill = useSharedValue(0);
  useEffect(() => {
    // Absolute, childless fill: animating width is layout-safe and keeps the rounded end crisp.
    fill.set(withTiming(progress * trackWidth, { duration: reduced ? 0 : 400, easing: EASE_OUT }));
  }, [fill, progress, trackWidth, reduced]);
  const fillStyle = useAnimatedStyle(() => ({ width: fill.get() }));

  const canGoBack = step !== FIRST_STEP;
  // Off-flow screens (the adult gate) and full-screen moments have no header.
  if (!inFlow || !hasChrome(step)) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{ paddingTop: insets.top + 8 }}
      className="absolute inset-x-0 top-0 flex-row items-center px-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        disabled={!canGoBack}
        onPress={() => goBack(step)}
        hitSlop={8}
        className={`h-11 w-11 items-center justify-center ${canGoBack ? '' : 'opacity-0'}`}>
        <ChevronLeftIcon size={26} color={theme.colors.text} />
      </Pressable>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        className="mx-3 h-[3px] flex-1 overflow-hidden rounded-pill bg-glass/15">
        <Animated.View
          style={fillStyle}
          className="absolute inset-y-0 left-0 rounded-pill bg-text"
        />
      </View>
      {/* Mirrors the back button so the bar stays centred. */}
      <View className="h-11 w-11" />
    </View>
  );
}
