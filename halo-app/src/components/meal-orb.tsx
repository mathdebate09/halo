import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { useHaloTheme } from '@/theme/theme-provider';
import { withAlpha } from '@/theme/themes';

/**
 * The Meal Logger's blurred-camera look (references/logger-blur-example.png), drawn from the
 * theme's own colours. Used where there is no live camera to blur.
 */
export function MealOrb({ caption }: { caption?: string }) {
  const { theme } = useHaloTheme();
  const c = theme.colors;
  return (
    <View className="h-[280px] w-[280px] items-center justify-center overflow-hidden rounded-[96px]">
      <LinearGradient
        colors={[withAlpha(c.strength, 0.9), withAlpha(c.accent, 0.75), withAlpha(c.steady, 0.85)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[withAlpha(c.opportunity, 0.7), withAlpha(c.opportunity, 0)]}
        start={{ x: 0, y: 1 }}
        end={{ x: 0.7, y: 0.3 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[withAlpha(c.bg, 0), withAlpha(c.bg, 0.55)]}
        start={{ x: 0.2, y: 0.2 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Text className="font-serif text-[30px] text-text">Meal Logger</Text>
      {caption ? (
        <Text className="mt-2 px-10 text-center font-sans text-[14px] text-text/85">{caption}</Text>
      ) : null}
    </View>
  );
}
