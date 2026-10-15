import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useHaloTheme } from '@/theme/theme-provider';
import { withAlpha } from '@/theme/themes';

const SWEEP_MS = 2400;
const BREATHE_MS = 1600;
const EASE_IN_OUT = Easing.bezier(0.45, 0, 0.55, 1);

/**
 * The "looking at your meal" state over the card: the tier veil dims the photo, a soft band of
 * light sweeps slowly from top to bottom, and the card's edge breathes in the accent colour.
 * Built from gradients only (no assets). Reduced motion keeps the dim and a still edge.
 */
export function ScanLoader({ radius }: { radius: number }) {
  const { theme } = useHaloTheme();
  const reduced = useReducedMotion();
  const [height, setHeight] = useState(0);
  const sweep = useSharedValue(0);
  const breathe = useSharedValue(0.5);

  useEffect(() => {
    if (reduced) return;
    sweep.set(withRepeat(withTiming(1, { duration: SWEEP_MS, easing: EASE_IN_OUT }), -1, false));
    breathe.set(withRepeat(withTiming(1, { duration: BREATHE_MS, easing: EASE_IN_OUT }), -1, true));
  }, [reduced, sweep, breathe]);

  const band = height * 0.45;
  const bandStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -band + sweep.get() * (height + band) }],
  }));
  const edgeStyle = useAnimatedStyle(() => ({ opacity: 0.25 + breathe.get() * 0.6 }));
  const light = theme.colors.arc;

  return (
    <Animated.View
      entering={FadeIn.duration(400)}
      exiting={FadeOut.duration(300)}
      pointerEvents="none"
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
      style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(theme.colors.veil, 0.45) }]}
      />
      {height > 0 && !reduced ? (
        <Animated.View style={[styles.band, { height: band }, bandStyle]}>
          <LinearGradient
            colors={[withAlpha(light, 0), withAlpha(light, 0.22), withAlpha(light, 0)]}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: radius, borderWidth: 1.5, borderColor: theme.colors.accent },
          edgeStyle,
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  band: { position: 'absolute', left: 0, right: 0, top: 0 },
});
