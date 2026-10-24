import { ActivityIndicator, View } from 'react-native';

import { useHaloTheme } from '@/theme/theme-provider';

/** The spinner over a tile while its background is being prepared. */
export function BusyOverlay() {
  const { theme } = useHaloTheme();
  return (
    <View className="absolute inset-0 items-center justify-center bg-black/40">
      <ActivityIndicator color={theme.colors.text} />
    </View>
  );
}
