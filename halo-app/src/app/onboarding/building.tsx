import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { kv } from '@/lib/kv';
import { savePlan } from '@/lib/plan';
import { dayKey, pickHeroVariant } from '@/shared';
import { goNext, useStepFocus } from '@/onboarding/navigation';
import { getOnboarding } from '@/onboarding/state';
import { useHaloTheme } from '@/theme/theme-provider';
import { tierGradients, withAlpha } from '@/theme/themes';

// scr 15: a deliberate ~2.2 s moment in the launch gradient, not a wait: the plan is computed
// locally in the first frame (SPEC scr 15 ▸). Replaced in history so Back never replays it.
const DURATION = 2200;

export default function BuildingStep() {
  useStepFocus('building');
  const { theme, setThemeId } = useHaloTheme();
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);
  const breathe = useSharedValue(0);

  useEffect(() => {
    savePlan(getOnboarding().answers);
    // Day one starts well scored: the high tier with a random variant, kept for the day. The
    // finale and Today share it.
    const variant = pickHeroVariant();
    kv.set(
      'tier',
      JSON.stringify({ tier: 'high', variant, day: dayKey(new Date()), changedAt: Date.now() }),
    );
    setThemeId(`high-${variant}`);
    progress.set(withTiming(1, { duration: DURATION, easing: Easing.inOut(Easing.quad) }));
    if (!reduced) {
      breathe.set(
        withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }), -1, true),
      );
    }
    const timer = setTimeout(() => goNext('building', { replace: true }), DURATION + 150);
    return () => clearTimeout(timer);
  }, [progress, breathe, reduced, setThemeId]);

  const glow = useAnimatedStyle(() => ({
    opacity: 0.55 + breathe.get() * 0.35,
    transform: [{ scale: 1 + breathe.get() * 0.06 }],
  }));
  // Absolute and childless: animating width is layout-safe.
  const bar = useAnimatedStyle(() => ({ width: `${progress.get() * 100}%` }));
  const [top, mid, bottom] = tierGradients[theme.tier];

  return (
    <View className="flex-1 items-center justify-center px-10">
      <LinearGradient
        colors={[top, mid, bottom]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View style={[StyleSheet.absoluteFill, glow]}>
        <LinearGradient
          colors={[withAlpha(theme.colors.accent, 0.35), withAlpha(theme.colors.accent, 0)]}
          start={{ x: 1, y: 0 }}
          end={{ x: 0.2, y: 0.8 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Text className="text-center font-serif text-[40px] leading-[46px] text-text">
        We’re setting everything up for you
      </Text>
      <Text className="mt-4 font-sans text-[16px] text-text/75">Customizing your health plan…</Text>
      <View className="mt-10 h-[3px] w-48 overflow-hidden rounded-pill bg-glass/20">
        <Animated.View style={bar} className="absolute inset-y-0 left-0 rounded-pill bg-text" />
      </View>
    </View>
  );
}
