import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { type ColorValue, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { motion } from '@/theme/motion';
import { useHaloTheme } from '@/theme/theme-provider';
import { type ThemeId, tierGradients, withAlpha, zones } from '@/theme/themes';

type Stops = readonly [ColorValue, ColorValue, ...ColorValue[]];

const smoothstep = (t: number) => t * t * (3 - 2 * t);
const FADE_STEPS = [0, 0.25, 0.5, 0.75, 1];

/**
 * Full-bleed hero image with the tier veil and the fade into the theme background, layered
 * exactly as scripts/build-themes.mjs verified text contrast. Crossfades on theme change.
 */
const DRIFT_FROM = 1.06;
const DRIFT_MS = 6000;
/** The image scrolls at 65 % of the page's speed. */
const PARALLAX = 0.35;

/**
 * `drift`: the image settles slowly from 1.06× to exactly 1× (the onboarding finale), so when it
 * hands off to Today, whose hero sits at 1×, the crossfade between the two is seamless.
 */
export function HeroBackdrop({
  drift = false,
  scrollY,
}: {
  drift?: boolean;
  /** Today's scroll offset: the image moves at a fraction of it (a gentle parallax). */
  scrollY?: SharedValue<number>;
}) {
  const { theme, target } = useHaloTheme();
  const [failedId, setFailedId] = useState<ThemeId | null>(null);
  const reduced = useReducedMotion();
  const scale = useSharedValue(drift && !reduced ? DRIFT_FROM : 1);
  useEffect(() => {
    if (drift && !reduced) {
      scale.set(withTiming(1, { duration: DRIFT_MS, easing: Easing.bezier(0.23, 1, 0.32, 1) }));
    }
  }, [drift, reduced, scale]);
  const driftStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: scrollY ? Math.max(0, scrollY.get()) * PARALLAX : 0 },
      { scale: scale.get() },
    ],
  }));

  const veilColors = theme.veil.stops.map((s) =>
    withAlpha(theme.colors.veil, s.alpha),
  ) as unknown as Stops;
  const veilLocations = theme.veil.stops.map((s) => s.at) as unknown as readonly [
    number,
    number,
    ...number[],
  ];

  const fadeAt = FADE_STEPS.map((t) => zones.fadeStart + (zones.fadeEnd - zones.fadeStart) * t);
  const fadeColors = [
    withAlpha(theme.colors.bg, 0),
    ...FADE_STEPS.map((t) => withAlpha(theme.colors.bg, smoothstep(t))),
    withAlpha(theme.colors.bg, 1),
  ] as unknown as Stops;
  const fadeLocations = [0, ...fadeAt, 1] as unknown as readonly [number, number, ...number[]];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {failedId === target.id ? (
        <LinearGradient colors={tierGradients[target.tier]} style={StyleSheet.absoluteFill} />
      ) : (
        <Animated.View style={[StyleSheet.absoluteFill, driftStyle]}>
          <Image
            source={{ uri: target.image }}
            placeholder={{ blurhash: target.blurhash }}
            contentFit="cover"
            // Memory too: the hero must not flash its placeholder when another screen redraws it.
            cachePolicy="memory-disk"
            transition={{ duration: motion.themeFade, effect: 'cross-dissolve' }}
            onError={() => setFailedId(target.id)}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
      <LinearGradient
        colors={veilColors}
        locations={veilLocations}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={fadeColors}
        locations={fadeLocations}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
