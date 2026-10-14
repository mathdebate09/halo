import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useHaloTheme } from '@/theme/theme-provider';
import { tierGradients, withAlpha } from '@/theme/themes';

import { launchReveal } from './reveal';

// Must match the expo-splash-screen plugin in app.json so the native → JS handoff is invisible.
const SPLASH_COLOR = '#101716';
const WORDMARK = require('@/assets/images/splash-wordmark.png');
const WORDMARK_WIDTH = 120;
const WORDMARK_HEIGHT = (WORDMARK_WIDTH * 187) / 484;

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

// Timeline (ms from the native splash hiding).
const BLOOM_AT = 200;
const BLOOM = 900;
const WORDMARK_OUT_AT = 1500;
const WORDMARK_OUT = 500;
const OVERLAY_OUT_AT = 1750;
const OVERLAY_OUT = 700;
const APP_IN_AT = 1850;
const APP_IN = 900;
const SKIP = 300;

/**
 * Every cold start: the flat splash colour with the wordmark (continuing the native splash),
 * a calm gradient from the current tier blooming in, the wordmark lifting away, then the scene
 * opening up to reveal the app, whose content rises in (see Reveal). The app has already
 * painted from local data underneath. About 2.5 s; tap to skip.
 */
export function LaunchSequence() {
  const { theme } = useHaloTheme();
  const reduced = useReducedMotion();
  const [done, setDone] = useState(false);
  const bloom = useSharedValue(0);
  const wordmark = useSharedValue(1);
  const overlay = useSharedValue(1);

  // After a hot reload of reveal.tsx the shared value resets; keep the app visible.
  useEffect(() => {
    if (done) launchReveal.set(1);
  }, [done]);

  const finish = (finished?: boolean) => {
    'worklet';
    if (finished) scheduleOnRN(setDone, true);
  };

  const start = () => {
    if (reduced) {
      // Fewer and gentler: no bloom, no movement, just fades.
      overlay.set(withDelay(600, withTiming(0, { duration: 400 }, finish)));
      launchReveal.set(withDelay(600, withTiming(1, { duration: 500 })));
      return;
    }
    bloom.set(withDelay(BLOOM_AT, withTiming(1, { duration: BLOOM, easing: EASE_OUT })));
    wordmark.set(
      withDelay(WORDMARK_OUT_AT, withTiming(0, { duration: WORDMARK_OUT, easing: EASE_OUT })),
    );
    overlay.set(
      withDelay(OVERLAY_OUT_AT, withTiming(0, { duration: OVERLAY_OUT, easing: EASE_OUT }, finish)),
    );
    launchReveal.set(withDelay(APP_IN_AT, withTiming(1, { duration: APP_IN, easing: EASE_OUT })));
  };

  const skip = () => {
    [bloom, wordmark, overlay, launchReveal].forEach((v) => cancelAnimation(v));
    wordmark.set(withTiming(0, { duration: SKIP, easing: EASE_OUT }));
    overlay.set(withTiming(0, { duration: SKIP, easing: EASE_OUT }, finish));
    launchReveal.set(withTiming(1, { duration: SKIP + 200, easing: EASE_OUT }));
  };

  // The scene "opens up": the overlay fades while expanding slightly.
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlay.get(),
    transform: [{ scale: reduced ? 1 : 1 + (1 - overlay.get()) * 0.04 }],
  }));
  const bloomStyle = useAnimatedStyle(() => ({ opacity: bloom.get() }));
  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmark.get(),
    transform: [{ translateY: reduced ? 0 : (1 - wordmark.get()) * -10 }],
  }));

  if (done) return null;

  const [top, mid, bottom] = tierGradients[theme.tier];

  return (
    <Animated.View style={[StyleSheet.absoluteFill, overlayStyle]}>
      <Pressable
        accessibilityLabel="Skip intro"
        onPress={skip}
        onLayout={() => {
          SplashScreen.hideAsync().finally(start);
        }}
        style={[styles.fill, styles.center, { backgroundColor: SPLASH_COLOR }]}>
        <Animated.View style={[StyleSheet.absoluteFill, bloomStyle]}>
          <LinearGradient
            colors={[top, mid, bottom]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {/* A soft light from one corner gives the flat gradient its glassy depth. */}
          <LinearGradient
            colors={[withAlpha(theme.colors.accent, 0.28), withAlpha(theme.colors.accent, 0)]}
            start={{ x: 1, y: 0 }}
            end={{ x: 0.2, y: 0.7 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={[withAlpha(SPLASH_COLOR, 0), withAlpha(SPLASH_COLOR, 0.45)]}
            start={{ x: 0, y: 0.4 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <Animated.View style={wordmarkStyle}>
          <Image source={WORDMARK} style={styles.wordmark} contentFit="contain" />
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  wordmark: { width: WORDMARK_WIDTH, height: WORDMARK_HEIGHT },
});
