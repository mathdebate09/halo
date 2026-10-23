import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import type { Meal } from '@/meals/editor';
import { ScanLoader } from '@/meals/scan-loader';
import { useHaloTheme } from '@/theme/theme-provider';
import { tierGradients } from '@/theme/themes';

/** The logger's card while a meal is analysed: its photo (or its note) under the scan loader. */
export function AnalysingCard({ meal, radius }: { meal: Meal; radius: number }) {
  const { theme } = useHaloTheme();
  const [top, mid, bottom] = tierGradients[theme.tier];
  return (
    <View
      className="flex-1 overflow-hidden border border-hairline/10"
      style={{ borderRadius: radius }}>
      {meal.photoUri ? (
        <Image source={{ uri: meal.photoUri }} contentFit="cover" style={StyleSheet.absoluteFill} />
      ) : (
        <>
          <LinearGradient colors={[top, mid, bottom]} style={StyleSheet.absoluteFill} />
          <View className="flex-1 items-center justify-center px-8">
            <Text
              numberOfLines={5}
              className="text-center font-serif text-[30px] leading-[36px] text-text">
              “{meal.note}”
            </Text>
          </View>
        </>
      )}
      <ScanLoader radius={radius} />
    </View>
  );
}
