import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';

import { useAnimatedThemeBackground } from '@/theme/theme-provider';

/** Screen root whose background crossfades with the theme. Children should be transparent. */
export function ThemedScreen({ children }: { children: ReactNode }) {
  const background = useAnimatedThemeBackground('bg');
  return <Animated.View style={[styles.fill, background]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
