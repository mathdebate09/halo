import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { type ColorValue, StyleSheet, View } from 'react-native';

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
export function HeroBackdrop() {
  const { theme, target } = useHaloTheme();
  const [failedId, setFailedId] = useState<ThemeId | null>(null);

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
        <Image
          source={{ uri: target.image }}
          placeholder={{ blurhash: target.blurhash }}
          contentFit="cover"
          cachePolicy="disk"
          transition={{ duration: motion.themeFade, effect: 'cross-dissolve' }}
          onError={() => setFailedId(target.id)}
          style={StyleSheet.absoluteFill}
        />
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
